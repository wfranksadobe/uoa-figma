/* eslint-disable no-console */
// Upload article image binaries into Document Authoring at the article-relative
// path (…/news/YYYY/MM/DD/slug/image-N.jpg). The EDS pipeline ingests them into
// its media store on the next preview/publish and rewrites references
// automatically — no content edits needed. curl-based, gentle, resumable.
//
// Usage: node tools/importer/upload-images-batch.mjs [--year=YYYY]
//   [--concurrency=N] [--limit=N] [--no-republish]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const ORG = 'wfranksadobe';
const SITE = 'aem-boilerplate-commerce';
const CONTENT = path.join(REPO_ROOT, 'content/nz/en/news');
const PROG = path.join(__dirname, '.progress');
const args = process.argv.slice(2);
const year = (args.find((a) => a.startsWith('--year=')) || '--year=2024').split('=')[1];
const concurrency = Number((args.find((a) => a.startsWith('--concurrency=')) || '').split('=')[1] || 4);
const limit = Number((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0);
const noRepublish = args.includes('--no-republish');

const DONE = path.join(PROG, `images-done-${year}.txt`);
const FAIL = path.join(PROG, `images-failed-${year}.tsv`);
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

// Find every article dir (holding image-*.jpg) under the year.
const articleDirs = new Set();
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const fp = path.join(d, e.name);
    if (e.isDirectory()) walk(fp);
    else if (/^image-\d+\.(jpg|jpeg|png|gif|webp|svg)$/i.test(e.name)) articleDirs.add(path.dirname(fp));
  }
};
const base = path.join(CONTENT, year);
if (fs.existsSync(base)) walk(base);
let dirs = [...articleDirs].sort();
if (limit) dirs = dirs.slice(0, limit);

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
const ok2 = (c) => /^20\d$/.test(c);
const CTYPES = {
  png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
};
const ctype = (f) => CTYPES[(f.split('.').pop() || '').toLowerCase()] || 'image/jpeg';

const total = dirs.length;
let ok = 0; let fail = 0; let skip = 0; let processed = 0; let imgs = 0;
const t0 = Date.now();

async function handle(dir) {
  const relDir = path.relative(CONTENT, dir); // YYYY/MM/DD/slug
  const remoteBase = `nz/en/news/${relDir}`;
  const files = fs.readdirSync(dir).filter((f) => /^image-\d+\./i.test(f));
  for (const f of files) {
    const code = await retry(['-X', 'POST', '-F', `data=@${path.join(dir, f)};type=${ctype(f)}`,
      `https://admin.da.live/source/${ORG}/${SITE}/${remoteBase}/${f}`]);
    if (!ok2(code)) throw new Error(`upload ${f} ${code}`);
    imgs += 1;
  }
  if (!noRepublish) {
    const pv = await retry(['-X', 'POST', `https://admin.hlx.page/preview/${ORG}/${SITE}/main/${remoteBase}`]);
    if (!ok2(pv)) throw new Error(`preview ${pv}`);
    const li = await retry(['-X', 'POST', `https://admin.hlx.page/live/${ORG}/${SITE}/main/${remoteBase}`]);
    if (!ok2(li)) throw new Error(`publish ${li}`);
  }
}

let i = 0;
const worker = async () => {
  for (;;) {
    const idx = i; i += 1;
    if (idx >= dirs.length) return;
    const dir = dirs[idx];
    const key = path.relative(CONTENT, dir);
    if (done.has(key)) { skip += 1; processed += 1; continue; }
    try { await handle(dir); ok += 1; done.add(key); fs.appendFileSync(DONE, `${key}\n`); } catch (e) { fail += 1; fs.appendFileSync(FAIL, `${key}\t${e.message}\n`); }
    processed += 1;
    await sleep(40);
    if (processed % 50 === 0 || processed === total) {
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      console.error(`[${processed}/${total}] ok=${ok} fail=${fail} skip=${skip} imgs=${imgs} (${secs}s)`);
    }
  }
};
await Promise.all(Array.from({ length: concurrency }, () => worker()));
console.log(`DONE ${year}. articles ok=${ok} failed=${fail} skipped=${skip} images=${imgs} of ${total}`);
if (fail) console.log(`Failures: ${path.relative(REPO_ROOT, FAIL)}`);
