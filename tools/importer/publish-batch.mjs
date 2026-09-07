/* eslint-disable no-console */
// Full pipeline for the migrated news corpus: for every local article, upload
// to Document Authoring at its AEM-normalized path, preview it, then publish
// (live). Uses curl (credential injection), gentle concurrency + 429 backoff,
// resumable via a done log.
//
// Source of article list: all content/nz/en/news/{2024,2025,2026}/**.plain.html
// Usage: node tools/importer/publish-batch.mjs
//   [--concurrency=N] [--limit=N] [--offset=N] [--no-upload]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const ORG = 'wfranksadobe';
const SITE = 'aem-boilerplate-commerce';
const CONTENT = path.join(REPO_ROOT, 'content/nz/en/news');
const PROG = path.join(__dirname, '.progress');
const DONE = path.join(PROG, 'published.txt');
const FAIL = path.join(PROG, 'publish-failed.tsv');

const args = process.argv.slice(2);
const concurrency = Number((args.find((a) => a.startsWith('--concurrency=')) || '').split('=')[1] || 4);
const limit = Number((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0);
const offset = Number((args.find((a) => a.startsWith('--offset=')) || '').split('=')[1] || 0);
const noUpload = args.includes('--no-upload');
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

const normSlug = (s) => s
  .toLowerCase().replace(/[^a-z0-9/-]+/g, '-').replace(/-+/g, '-')
  .replace(/(^-|-$)/g, '')
  .replace(/-\//g, '/')
  .replace(/\/-/g, '/');

// collect article rels from local files (already normalized on disk, but
// normalize again defensively for the remote path)
const rels = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const fp = path.join(d, e.name);
    if (e.isDirectory()) walk(fp);
    else if (e.name.endsWith('.plain.html')) rels.push(path.relative(CONTENT, fp).replace(/\.plain\.html$/, ''));
  }
};
['2024', '2025', '2026'].forEach((y) => fs.existsSync(path.join(CONTENT, y)) && walk(path.join(CONTENT, y)));
rels.sort();
let work = rels;
if (offset) work = work.slice(offset);
if (limit) work = work.slice(0, limit);

fs.mkdirSync(PROG, { recursive: true });
const done = new Set(fs.existsSync(DONE) ? fs.readFileSync(DONE, 'utf8').split('\n').filter(Boolean) : []);

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
const ok2xx = (c) => /^20\d$/.test(c);

const total = work.length;
let ok = 0; let fail = 0; let skip = 0; let processed = 0;
const t0 = Date.now();

async function run(rel) {
  const parts = rel.split('/');
  const date = parts.slice(0, 3).join('/');
  const norm = `${date}/${normSlug(parts.slice(3).join('/'))}`;
  const remote = `nz/en/news/${norm}`;
  const src = path.join(CONTENT, `${rel}.plain.html`);
  if (!fs.existsSync(src)) throw new Error('local source missing');

  if (!noUpload) {
    const tmp = path.join(os.tmpdir(), `pub-${norm.replace(/\//g, '_')}.html`);
    fs.writeFileSync(tmp, `<body>\n<main>\n${fs.readFileSync(src, 'utf8')}\n</main>\n</body>\n`);
    try {
      const up = await retry(['-X', 'POST', '-F', `data=@${tmp};type=text/html`,
        `https://admin.da.live/source/${ORG}/${SITE}/${remote}.html`]);
      if (!ok2xx(up)) throw new Error(`upload ${up}`);
    } finally { fs.rmSync(tmp, { force: true }); }
  }
  const pv = await retry(['-X', 'POST', `https://admin.hlx.page/preview/${ORG}/${SITE}/main/${remote}`]);
  if (!ok2xx(pv)) throw new Error(`preview ${pv}`);
  const li = await retry(['-X', 'POST', `https://admin.hlx.page/live/${ORG}/${SITE}/main/${remote}`]);
  if (!ok2xx(li)) throw new Error(`publish ${li}`);
}

let i = 0;
const worker = async () => {
  for (;;) {
    const idx = i; i += 1;
    if (idx >= work.length) return;
    const rel = work[idx];
    if (done.has(rel)) { skip += 1; processed += 1; continue; }
    try { await run(rel); ok += 1; done.add(rel); fs.appendFileSync(DONE, `${rel}\n`); } catch (e) { fail += 1; fs.appendFileSync(FAIL, `${rel}\t${e.message}\n`); }
    processed += 1;
    await sleep(50);
    if (processed % 50 === 0 || processed === total) {
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      console.error(`[${processed}/${total}] ok=${ok} fail=${fail} skip=${skip} (${secs}s)`);
    }
  }
};
await Promise.all(Array.from({ length: concurrency }, () => worker()));
console.log(`DONE. ok=${ok} failed=${fail} skipped=${skip} of ${total}`);
if (fail) console.log(`Failures: ${path.relative(REPO_ROOT, FAIL)}`);
