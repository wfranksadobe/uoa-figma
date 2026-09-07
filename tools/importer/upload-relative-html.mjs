/* eslint-disable no-console */
// Upload the local (relative-`./`-form) article HTML to Document Authoring,
// then preview + publish, so the DA editor and rendered site both use the `./`
// image convention. Images are assumed already co-located in DA (they are for
// the migrated corpus); this only rewrites the page HTML.
//
// Reads each local .plain.html, wraps it as <body><main>…</main></body> (the DA
// source shape), POSTs to the DA source API, previews, publishes. Resumable,
// low concurrency + 429 backoff.
//
// Usage:
//   node tools/importer/upload-relative-html.mjs <relPath> [<relPath> ...]   # explicit
//   node tools/importer/upload-relative-html.mjs --all [--limit=N] [--offset=N] [--concurrency=4]
//   node tools/importer/upload-relative-html.mjs --all --no-publish          # source + preview only
//
// relPath is the extensionless site path, e.g.
//   nz/en/news/2024/11/04/what-sir-john-said-about-donald-trump
//
// Progress: tools/importer/.progress/upload-rel-done.txt / upload-rel-failed.tsv

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
const DONE = path.join(PROG, 'upload-rel-done.txt');
const FAIL = path.join(PROG, 'upload-rel-failed.tsv');

const args = process.argv.slice(2);
const all = args.includes('--all');
const noPublish = args.includes('--no-publish');
const concurrency = Number((args.find((a) => a.startsWith('--concurrency=')) || '').split('=')[1] || 4);
const limit = Number((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0);
const offset = Number((args.find((a) => a.startsWith('--offset=')) || '').split('=')[1] || 0);
const explicit = args.filter((a) => !a.startsWith('--'));

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const ok2xx = (c) => /^20\d$/.test(c);

fs.mkdirSync(PROG, { recursive: true });
const done = new Set(fs.existsSync(DONE) ? fs.readFileSync(DONE, 'utf8').split('\n').filter(Boolean) : []);

// map a site relPath -> local .plain.html file
function localFile(rel) {
  return path.join(CONTENT, `${rel.replace(/^nz\/en\/news\//, '')}.plain.html`);
}

function collectAll() {
  const rels = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp);
      else if (e.name.endsWith('.plain.html') && e.name !== 'index.plain.html') {
        rels.push(`nz/en/news/${path.relative(CONTENT, fp).replace(/\.plain\.html$/, '')}`);
      }
    }
  };
  ['2024', '2025', '2026'].forEach((y) => walk(path.join(CONTENT, y)));
  return rels.sort();
}

let work = all ? collectAll() : explicit;
if (offset) work = work.slice(offset);
if (limit) work = work.slice(0, limit);
if (!work.length) { console.error('Nothing to do. Pass rel paths or --all.'); process.exit(1); }

function curlCode(cargs) {
  return new Promise((resolve) => {
    const c = spawn('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', ...cargs]);
    let out = ''; c.stdout.on('data', (d) => { out += d; });
    c.on('close', () => resolve(out.trim())); c.on('error', () => resolve('000'));
  });
}
async function retry(cargs, attempt = 0) {
  const code = await curlCode(cargs);
  if (code === '429' && attempt < 6) { await sleep(1000 * (2 ** attempt)); return retry(cargs, attempt + 1); }
  return code;
}

async function run(rel) {
  const src = localFile(rel);
  if (!fs.existsSync(src)) throw new Error('local source missing');
  const body = fs.readFileSync(src, 'utf8');
  // guard: only upload files that actually use the relative form
  if (/src="(https:\/\/content\.da\.live\/wfranksadobe\/uoa-figma\/|\/media-da\/)/.test(body)) {
    throw new Error('still has non-relative img src');
  }
  const tmp = path.join(os.tmpdir(), `rel-${rel.replace(/\//g, '_')}.html`);
  fs.writeFileSync(tmp, `<body>\n<main>\n${body}\n</main>\n</body>\n`);
  try {
    const up = await retry(['-X', 'POST', '-F', `data=@${tmp};type=text/html`,
      `https://admin.da.live/source/${ORG}/${SITE}/${rel}.html`]);
    if (!ok2xx(up)) throw new Error(`upload ${up}`);
  } finally { fs.rmSync(tmp, { force: true }); }
  const pv = await retry(['-X', 'POST', `https://admin.hlx.page/preview/${ORG}/${SITE}/main/${rel}`]);
  if (!ok2xx(pv)) throw new Error(`preview ${pv}`);
  if (!noPublish) {
    const li = await retry(['-X', 'POST', `https://admin.hlx.page/live/${ORG}/${SITE}/main/${rel}`]);
    if (!ok2xx(li)) throw new Error(`publish ${li}`);
  }
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
    if (done.has(rel)) { skipN += 1; processed += 1; continue; }
    try { await run(rel); okN += 1; done.add(rel); fs.appendFileSync(DONE, `${rel}\n`); }
    catch (e) { failN += 1; fs.appendFileSync(FAIL, `${rel}\t${e.message}\n`); console.error(`ERR ${rel} :: ${e.message}`); }
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
