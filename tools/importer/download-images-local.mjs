/* eslint-disable no-console */
// Download the co-located image binaries for every news article into the LOCAL
// content tree, beside each page (…/YYYY/MM/DD/<slug>-image-N.jpg). Without
// these bytes the relative `./` image refs cannot resolve locally.
//
// Source of bytes: admin.da.live/source (credentials injected — 200 with bytes;
// content.da.live is NOT usable here, it 401s without an Authorization header).
//
// Work list: every distinct image asset referenced by the local .plain.html
// files, resolved to its DA path. Handles all three src conventions:
//   ./<file>                                                  (relative)
//   https://content.da.live/wfranksadobe/uoa-figma/<datedir>/<file>
//   /media-da/<datedir>/<file>
// The asset is written to the page's own date folder as <file>.
//
// Resumable (done log), low concurrency + 429 backoff. --dry-run to preview.
// Usage: node tools/importer/download-images-local.mjs [--concurrency=4] [--limit=N] [--dry-run]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const ORG = 'wfranksadobe';
const SITE = 'uoa-figma';
const CONTENT = path.join(REPO_ROOT, 'content/nz/en/news');
const PROG = path.join(__dirname, '.progress');
const DONE = path.join(PROG, 'images-local-done.txt');
const FAIL = path.join(PROG, 'images-local-failed.tsv');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const concurrency = Number((args.find((a) => a.startsWith('--concurrency=')) || '').split('=')[1] || 4);
const limit = Number((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0);
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

fs.mkdirSync(PROG, { recursive: true });
const done = new Set(fs.existsSync(DONE) ? fs.readFileSync(DONE, 'utf8').split('\n').filter(Boolean) : []);

// --- build the asset work list from local HTML --------------------------------
// Each entry: { daPath: 'nz/en/news/YYYY/MM/DD/<file>', localPath: absolute }
const IMG_RE = /src="((?:https:\/\/content\.da\.live\/wfranksadobe\/uoa-figma\/|\/media-da\/|\.\/)[^"]+?\.(?:jpg|jpeg|png|webp|gif|svg))"/gi;
const assets = new Map();
const walk = (d) => {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const fp = path.join(d, e.name);
    if (e.isDirectory()) walk(fp);
    else if (e.name.endsWith('.plain.html') && e.name !== 'index.plain.html') collect(fp);
  }
};
function collect(fp) {
  const rel = path.relative(CONTENT, fp); // YYYY/MM/DD/<slug...>.plain.html
  const dateParts = rel.split('/').slice(0, 3);
  const dateDir = dateParts.join('/'); // YYYY/MM/DD
  const html = fs.readFileSync(fp, 'utf8');
  let m;
  // eslint-disable-next-line no-cond-assign
  while ((m = IMG_RE.exec(html)) !== null) {
    const raw = m[1];
    let tail; // path relative to nz/en/news
    if (raw.startsWith('./')) {
      tail = `${dateDir}/${raw.slice(2)}`;
    } else if (raw.startsWith('/media-da/')) {
      tail = raw.replace('/media-da/nz/en/news/', '');
    } else {
      // content.da.live full URL
      tail = raw.replace('https://content.da.live/wfranksadobe/uoa-figma/nz/en/news/', '');
      // (old-repo refs won't match uoa-figma prefix — skip those, they are junk dupes)
      if (raw.includes('/aem-boilerplate-commerce/')) continue;
    }
    const daPath = `nz/en/news/${tail}`;
    const localPath = path.join(CONTENT, tail);
    assets.set(daPath, localPath);
  }
}
walk(path.join(CONTENT, '2024'));
walk(path.join(CONTENT, '2025'));
walk(path.join(CONTENT, '2026'));

let work = [...assets.entries()].map(([daPath, localPath]) => ({ daPath, localPath }));
// skip ones already present on disk
work = work.filter(({ localPath }) => !fs.existsSync(localPath));
if (limit) work = work.slice(0, limit);
console.error(`distinct images referenced: ${assets.size}; missing locally: ${work.length}`);

// --- curl helpers -------------------------------------------------------------
function curlToFile(url, dest) {
  return new Promise((resolve) => {
    const c = spawn('curl', ['-s', '-o', dest, '-w', '%{http_code}', url]);
    let out = ''; c.stdout.on('data', (d) => { out += d; });
    c.on('close', () => resolve(out.trim())); c.on('error', () => resolve('000'));
  });
}
async function retryToFile(url, dest, attempt = 0) {
  const code = await curlToFile(url, dest);
  if (code === '429' && attempt < 6) { await sleep(1000 * (2 ** attempt)); return retryToFile(url, dest, attempt + 1); }
  return code;
}

async function run(item) {
  const url = `https://admin.da.live/source/${ORG}/${SITE}/${item.daPath}`;
  if (dryRun) return;
  fs.mkdirSync(path.dirname(item.localPath), { recursive: true });
  const tmp = `${item.localPath}.part`;
  const code = await retryToFile(url, tmp);
  if (!/^20\d$/.test(code)) { fs.rmSync(tmp, { force: true }); throw new Error(`http ${code}`); }
  const sz = fs.statSync(tmp).size;
  if (sz < 100) { fs.rmSync(tmp, { force: true }); throw new Error(`too small (${sz}b)`); }
  fs.renameSync(tmp, item.localPath);
}

const total = work.length;
let okN = 0; let failN = 0; let processed = 0;
const t0 = Date.now();
let i = 0;
const worker = async () => {
  for (;;) {
    const idx = i; i += 1;
    if (idx >= work.length) return;
    const item = work[idx];
    if (!dryRun && done.has(item.daPath)) { processed += 1; continue; }
    try {
      await run(item);
      okN += 1;
      if (!dryRun) fs.appendFileSync(DONE, `${item.daPath}\n`);
    } catch (e) {
      failN += 1;
      fs.appendFileSync(FAIL, `${item.daPath}\t${e.message}\n`);
      console.error(`ERR ${item.daPath} :: ${e.message}`);
    }
    processed += 1;
    await sleep(40);
    if (processed % 100 === 0 || processed === total) {
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      console.error(`[${processed}/${total}] ok=${okN} fail=${failN} (${secs}s)`);
    }
  }
};
await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
console.log(`DONE. ok=${okN} failed=${failN} of ${total}`);
if (failN) console.log(`Failures: ${path.relative(REPO_ROOT, FAIL)}`);
