/* eslint-disable no-console */
// Download published news articles that are missing from the local content
// tree, from the `uoa-figma` DA source. Writes them as local `.plain.html`
// fragments (DA source minus the <body>/<main> wrapper) under
// content/nz/en/news/YYYY/MM/DD/<slug>.plain.html.
//
// Work list: published query-index paths that have no local file.
// Resumable, gentle on the DA API (low concurrency + 429 backoff, done log).
//
// Usage:
//   node tools/importer/download-missing.mjs [--concurrency=4] [--limit=N] [--dry-run]
//
// Progress: tools/importer/.progress/download-done.txt   (downloaded rel paths)
//           tools/importer/.progress/download-failed.tsv (rel<TAB>error)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const ORG = 'wfranksadobe';
const SITE = 'uoa-figma';
const CONTENT = path.join(REPO_ROOT, 'content/nz/en/news');
const PROG = path.join(__dirname, '.progress');
const DONE = path.join(PROG, 'download-done.txt');
const FAIL = path.join(PROG, 'download-failed.tsv');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const concurrency = Number((args.find((a) => a.startsWith('--concurrency=')) || '').split('=')[1] || 4);
const limit = Number((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0);

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

fs.mkdirSync(PROG, { recursive: true });
const done = new Set(fs.existsSync(DONE) ? fs.readFileSync(DONE, 'utf8').split('\n').filter(Boolean) : []);

const normSlug = (s) => s
  .toLowerCase().replace(/[^a-z0-9/-]+/g, '-').replace(/-+/g, '-')
  .replace(/(^-|-$)/g, '').replace(/-\//g, '/').replace(/\/-/g, '/');

// --- current local set --------------------------------------------------------
function localSet() {
  const set = new Set();
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp);
      else if (e.name.endsWith('.plain.html') && e.name !== 'index.plain.html') {
        const rel = path.relative(CONTENT, fp).replace(/\.plain\.html$/, '');
        const parts = rel.split('/');
        const date = parts.slice(0, 3).join('/');
        set.add(`nz/en/news/${date}/${normSlug(parts.slice(3).join('/'))}`);
      }
    }
  };
  ['2024', '2025', '2026'].forEach((y) => walk(path.join(CONTENT, y)));
  return set;
}

// --- published set (authoritative) --------------------------------------------
function publishedList() {
  const url = `https://main--${SITE}--${ORG}.aem.live/nz/en/news/query-index.json?limit=100000`;
  const out = spawnSync('curl', ['-s', '--compressed', url], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout;
  return (JSON.parse(out).data || [])
    .map((r) => (r.path || '').replace(/^\//, '').replace(/\.html$/, ''))
    .filter((p) => /^nz\/en\/news\/\d{4}\/\d{2}\/\d{2}\//.test(p));
}

const local = localSet();
const missing = [...new Set(publishedList())].filter((p) => !local.has(p)).sort();
let work = missing;
if (limit) work = work.slice(0, limit);
console.error(`published-missing-locally: ${missing.length}${limit ? ` (limited to ${work.length})` : ''}`);

// --- curl helpers -------------------------------------------------------------
function curlBody(url) {
  return new Promise((resolve) => {
    const c = spawn('curl', ['-s', '-w', '\n%{http_code}', url]);
    let out = ''; c.stdout.on('data', (d) => { out += d; });
    c.on('close', () => {
      const nl = out.lastIndexOf('\n');
      resolve({ code: out.slice(nl + 1).trim(), body: out.slice(0, nl) });
    });
    c.on('error', () => resolve({ code: '000', body: '' }));
  });
}
async function retryBody(url, attempt = 0) {
  const r = await curlBody(url);
  if (r.code === '429' && attempt < 6) { await sleep(1000 * (2 ** attempt)); return retryBody(url, attempt + 1); }
  return r;
}

// Strip the outer <body>/<main> wrapper to match the local .plain.html fragment.
function toFragment(html) {
  let s = html;
  s = s.replace(/^\s*<body>\s*/i, '').replace(/\s*<\/body>\s*$/i, '');
  s = s.replace(/^\s*<main>\s*/i, '').replace(/\s*<\/main>\s*$/i, '');
  return s.trim();
}

async function run(rel) {
  const src = `https://admin.da.live/source/${ORG}/${SITE}/${rel}.html`;
  const { code, body } = await retryBody(src);
  if (code !== '200') throw new Error(`read ${code}`);
  if (!/<main>/i.test(body) && !/<div/i.test(body)) throw new Error('unexpected body');
  const fragment = toFragment(body);
  if (!fragment) throw new Error('empty fragment');
  if (dryRun) return;
  const dest = path.join(CONTENT, `${rel.replace(/^nz\/en\/news\//, '')}.plain.html`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, `${fragment}\n`);
}

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
      await run(rel);
      okN += 1;
      if (!dryRun) fs.appendFileSync(DONE, `${rel}\n`);
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
