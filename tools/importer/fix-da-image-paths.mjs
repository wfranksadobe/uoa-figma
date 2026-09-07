/* eslint-disable no-console */
// Fix broken images in the DA authoring editor for migrated news articles.
//
// Cause: article HTML references images as "./<slug>/image-N.jpg". The
// published site resolves that against the page URL's parent folder and works,
// but the DA editor resolves "./" against the document treated as a FOLDER
// (…/<slug>/), so the ref doubles (…/<slug>/<slug>/…) and images look broken
// in DA.
//
// Fix (proven end-to-end): co-locate each image BESIDE the page with a flat
// name and reference it flat — "./<slug>-image-N.jpg". DA's base is the page's
// parent folder (…/YYYY/MM/DD/), so "./<slug>-image-N.jpg" resolves with no
// doubling AND the relative "./" form still feeds the EDS media pipeline, so
// the rendered site keeps working (og:image + body images ingest correctly).
//
// Per article:
//   1. upload each local image beside the page: …/YYYY/MM/DD/<slug>-<file>
//   2. rewrite HTML "./<slug>/<file>" -> "./<slug>-<file>"
//   3. upload the page, then preview + publish (main)
// Resumable via a done log. The old …/<slug>/<file> assets are left in place
// (harmless).
//
// Usage: node tools/importer/fix-da-image-paths.mjs
//   [--concurrency=N] [--limit=N] [--offset=N] [--only=YYYY/MM/DD/slug] [--reset]

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
const DONE = path.join(PROG, 'fix-img-done.txt');
const FAIL = path.join(PROG, 'fix-img-failed.tsv');

const args = process.argv.slice(2);
const concurrency = Number((args.find((a) => a.startsWith('--concurrency=')) || '').split('=')[1] || 4);
const limit = Number((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0);
const offset = Number((args.find((a) => a.startsWith('--offset=')) || '').split('=')[1] || 0);
const only = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
const reset = args.includes('--reset');
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

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
if (only) work = work.filter((r) => r === only);
if (offset) work = work.slice(offset);
if (limit) work = work.slice(0, limit);

fs.mkdirSync(PROG, { recursive: true });
if (reset && fs.existsSync(DONE)) fs.rmSync(DONE);
const done = new Set(fs.existsSync(DONE) ? fs.readFileSync(DONE, 'utf8').split('\n').filter(Boolean) : []);

const CTYPES = {
  png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
};
const ctype = (f) => CTYPES[(f.split('.').pop() || '').toLowerCase()] || 'image/jpeg';

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

const total = work.length;
let ok = 0; let fail = 0; let skip = 0; let noop = 0; let processed = 0; let imgs = 0;
const t0 = Date.now();

async function handle(rel) {
  const src = path.join(CONTENT, `${rel}.plain.html`);
  if (!fs.existsSync(src)) throw new Error('local source missing');
  const slug = path.basename(rel);
  const dir = path.dirname(rel); // YYYY/MM/DD
  let html = fs.readFileSync(src, 'utf8');

  // Find distinct "./<slug>/<file>" references.
  const re = new RegExp(`\\./${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^"'\\s)]+)`, 'g');
  const files = new Set();
  let m;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(html)) !== null) files.add(m[1]);
  if (!files.size) { noop += 1; return; }

  // 1. Upload each image beside the page with a flat name.
  for (const file of files) {
    const localImg = path.join(CONTENT, dir, slug, file);
    if (!fs.existsSync(localImg)) continue; // skip missing binary
    const flat = `${slug}-${file}`;
    const up = await retry(['-X', 'POST', '-F', `data=@${localImg};type=${ctype(file)}`,
      `https://admin.da.live/source/${ORG}/${SITE}/nz/en/news/${dir}/${flat}`]);
    if (!ok2(up)) throw new Error(`img ${file} ${up}`);
    imgs += 1;
  }

  // 2. Rewrite refs "./<slug>/<file>" -> "./<slug>-<file>".
  html = html.replace(re, (_full, file) => `./${slug}-${file}`);

  // 3. Upload page + preview + publish.
  const remote = `nz/en/news/${rel}`;
  const tmp = path.join(os.tmpdir(), `fiximg-${rel.replace(/\W/g, '_')}.html`);
  fs.writeFileSync(tmp, `<body>\n<main>\n${html}\n</main>\n</body>\n`);
  try {
    const up = await retry(['-X', 'POST', '-F', `data=@${tmp};type=text/html`,
      `https://admin.da.live/source/${ORG}/${SITE}/${remote}.html`]);
    if (!ok2(up)) throw new Error(`page ${up}`);
  } finally { fs.rmSync(tmp, { force: true }); }
  const pv = await retry(['-X', 'POST', `https://admin.hlx.page/preview/${ORG}/${SITE}/main/${remote}`]);
  if (!ok2(pv)) throw new Error(`preview ${pv}`);
  const li = await retry(['-X', 'POST', `https://admin.hlx.page/live/${ORG}/${SITE}/main/${remote}`]);
  if (!ok2(li)) throw new Error(`publish ${li}`);
}

let i = 0;
const worker = async () => {
  for (;;) {
    const idx = i; i += 1;
    if (idx >= work.length) return;
    const rel = work[idx];
    if (done.has(rel)) { skip += 1; processed += 1; continue; }
    try { await handle(rel); ok += 1; done.add(rel); fs.appendFileSync(DONE, `${rel}\n`); } catch (e) { fail += 1; fs.appendFileSync(FAIL, `${rel}\t${e.message}\n`); }
    processed += 1;
    await sleep(40);
    if (processed % 50 === 0 || processed === total) {
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      console.error(`[${processed}/${total}] ok=${ok} fail=${fail} skip=${skip} noop=${noop} imgs=${imgs} (${secs}s)`);
    }
  }
};
await Promise.all(Array.from({ length: concurrency }, () => worker()));
console.log(`DONE. ok=${ok} failed=${fail} skipped=${skip} noop=${noop} images=${imgs} of ${total}`);
if (fail) console.log(`Failures: ${path.relative(REPO_ROOT, FAIL)}`);
