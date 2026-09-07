/* eslint-disable no-console */
// Flip the article Template metadata cell from the legacy `news-article` to the
// Figma redesign template, per-article, directly on the `uoa-figma` DA source
// (the source of truth — images already fixed there). Resumable, gentle on the
// DA/admin APIs (low concurrency + 429 backoff, done log). Full pipeline:
//   read DA source -> rewrite Template cell -> POST DA source -> preview -> live
//
// Variant rule:
//   article has any image  -> news-article-figma        (default: title block + 2-col body)
//   image-less article     -> news-article-figma-no-hero (tag chips under title)
//
// Only rewrites when the current Template value is exactly `news-article`
// (idempotent — already-flipped or other templates are skipped).
//
// Usage:
//   node tools/importer/flip-template.mjs <relPath> [<relPath> ...]   # explicit article(s)
//   node tools/importer/flip-template.mjs --all [--limit=N] [--offset=N] [--concurrency=4]
//   node tools/importer/flip-template.mjs --all --dry-run             # detect only, no writes
//   node tools/importer/flip-template.mjs --no-publish <relPath>      # source + preview only
//
// relPath is the extensionless DA path under the site, e.g.
//   nz/en/news/2024/08/08/soaring-food-costs-take-toll-on-kids
//
// Progress: tools/importer/.progress/flip-done.txt   (flipped rel paths)
//           tools/importer/.progress/flip-failed.tsv (rel<TAB>error)
//           tools/importer/.progress/flip-skip.tsv   (rel<TAB>reason)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const ORG = 'wfranksadobe';
const SITE = 'uoa-figma';
const CONTENT = path.join(REPO_ROOT, 'content/nz/en/news');
const PROG = path.join(__dirname, '.progress');
const DONE = path.join(PROG, 'flip-done.txt');
const FAIL = path.join(PROG, 'flip-failed.tsv');
const SKIP = path.join(PROG, 'flip-skip.tsv');

const args = process.argv.slice(2);
const all = args.includes('--all');
const dryRun = args.includes('--dry-run');
const noPublish = args.includes('--no-publish');
const concurrency = Number((args.find((a) => a.startsWith('--concurrency=')) || '').split('=')[1] || 4);
const limit = Number((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0);
const offset = Number((args.find((a) => a.startsWith('--offset=')) || '').split('=')[1] || 0);
const explicit = args.filter((a) => !a.startsWith('--'));

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const ok2xx = (c) => /^20\d$/.test(c);

fs.mkdirSync(PROG, { recursive: true });
const done = new Set(fs.existsSync(DONE) ? fs.readFileSync(DONE, 'utf8').split('\n').filter(Boolean) : []);

// --- build the work list -----------------------------------------------------
const normSlug = (s) => s
  .toLowerCase().replace(/[^a-z0-9/-]+/g, '-').replace(/-+/g, '-')
  .replace(/(^-|-$)/g, '').replace(/-\//g, '/').replace(/\/-/g, '/');

function collectFromLocal() {
  const rels = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp);
      else if (e.name.endsWith('.plain.html')) {
        const rel = path.relative(CONTENT, fp).replace(/\.plain\.html$/, '');
        const parts = rel.split('/');
        const date = parts.slice(0, 3).join('/');
        rels.push(`nz/en/news/${date}/${normSlug(parts.slice(3).join('/'))}`);
      }
    }
  };
  ['2024', '2025', '2026'].forEach((y) => fs.existsSync(path.join(CONTENT, y)) && walk(path.join(CONTENT, y)));
  return [...new Set(rels)].sort();
}

let work = all ? collectFromLocal() : explicit;
if (offset) work = work.slice(offset);
if (limit) work = work.slice(0, limit);
if (!work.length) {
  console.error('Nothing to do. Pass explicit rel paths or --all.');
  process.exit(1);
}

// --- curl helpers (credential injection handled by the environment) ----------
function curl(cargs) {
  return new Promise((resolve) => {
    const c = spawn('curl', ['-s', ...cargs]);
    let out = ''; let err = '';
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { err += d; });
    c.on('close', (code) => resolve({ code, out, err }));
    c.on('error', (e) => resolve({ code: 1, out: '', err: e.message }));
  });
}
function curlCode(cargs) {
  return new Promise((resolve) => {
    const c = spawn('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', ...cargs]);
    let out = ''; c.stdout.on('data', (d) => { out += d; });
    c.on('close', () => resolve(out.trim())); c.on('error', () => resolve('000'));
  });
}
async function retryCode(cargs, attempt = 0) {
  const code = await curlCode(cargs);
  if (code === '429' && attempt < 6) { await sleep(1000 * (2 ** attempt)); return retryCode(cargs, attempt + 1); }
  return code;
}

// --- the rewrite --------------------------------------------------------------
// Replace ONLY the Template metadata cell value `news-article` (exact) with the
// chosen variant. The metadata block renders as
//   <div>\n<div>Template</div>\n<div>news-article</div>\n</div>
const TEMPLATE_CELL = /(<div>\s*Template\s*<\/div>\s*<div>\s*)news-article(\s*<\/div>)/i;

function chooseVariant(html) {
  // Any image anywhere in the article body => default figma (has a lead image);
  // otherwise the no-hero variant. Images use content.da.live URLs.
  const hasImage = /<img\b/i.test(html);
  return hasImage ? 'news-article-figma' : 'news-article-figma-no-hero';
}

async function run(rel) {
  const srcUrl = `https://admin.da.live/source/${ORG}/${SITE}/${rel}.html`;
  const { out: html, err } = await curl([srcUrl]);
  if (!html || err) throw new Error(`read failed: ${err || 'empty'}`);
  if (!/<div>\s*Template\s*<\/div>/i.test(html)) throw new Error('no Template cell found');

  const m = html.match(/<div>\s*Template\s*<\/div>\s*<div>\s*([^<]*?)\s*<\/div>/i);
  const current = (m && m[1] ? m[1].trim() : '').toLowerCase();
  if (current !== 'news-article') {
    return { skipped: true, reason: `template already "${current}"` };
  }

  const variant = chooseVariant(html);
  const next = html.replace(TEMPLATE_CELL, `$1${variant}$2`);
  if (next === html) throw new Error('rewrite produced no change');

  if (dryRun) return { skipped: true, reason: `dry-run -> ${variant}` };

  // write back to DA source
  const tmp = path.join(os.tmpdir(), `flip-${rel.replace(/\//g, '_')}.html`);
  fs.writeFileSync(tmp, next);
  try {
    const up = await retryCode(['-X', 'POST', '-F', `data=@${tmp};type=text/html`, srcUrl]);
    if (!ok2xx(up)) throw new Error(`upload ${up}`);
  } finally { fs.rmSync(tmp, { force: true }); }

  const pv = await retryCode(['-X', 'POST', `https://admin.hlx.page/preview/${ORG}/${SITE}/main/${rel}`]);
  if (!ok2xx(pv)) throw new Error(`preview ${pv}`);
  if (!noPublish) {
    const li = await retryCode(['-X', 'POST', `https://admin.hlx.page/live/${ORG}/${SITE}/main/${rel}`]);
    if (!ok2xx(li)) throw new Error(`publish ${li}`);
  }
  return { variant };
}

// --- driver -------------------------------------------------------------------
const total = work.length;
let okN = 0; let failN = 0; let skipN = 0; let processed = 0;
const t0 = Date.now();
let i = 0;

const worker = async () => {
  for (;;) {
    const idx = i; i += 1;
    if (idx >= work.length) return;
    const rel = work[idx];
    if (!dryRun && done.has(rel)) { skipN += 1; processed += 1; continue; }
    try {
      const r = await run(rel);
      if (r.skipped) {
        skipN += 1;
        fs.appendFileSync(SKIP, `${rel}\t${r.reason}\n`);
      } else {
        okN += 1;
        fs.appendFileSync(DONE, `${rel}\n`);
        console.log(`OK  ${rel} -> ${r.variant}`);
      }
    } catch (e) {
      failN += 1;
      fs.appendFileSync(FAIL, `${rel}\t${e.message}\n`);
      console.error(`ERR ${rel} :: ${e.message}`);
    }
    processed += 1;
    await sleep(50);
    if (processed % 50 === 0 || processed === total) {
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      console.error(`[${processed}/${total}] ok=${okN} fail=${failN} skip=${skipN} (${secs}s)`);
    }
  }
};
await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
console.log(`DONE. ok=${okN} failed=${failN} skipped=${skipN} of ${total}`);
if (failN) console.log(`Failures: ${path.relative(REPO_ROOT, FAIL)}`);
