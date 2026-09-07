/* eslint-disable no-console */
// Upload migrated news articles to Document Authoring (at AEM-normalized paths)
// and preview them. Uses curl (credential injection only intercepts curl, not
// Node fetch). Gentle: low concurrency + 429 backoff, resumable via a done log.
//
// Reads paths from tools/importer/.progress/out-of-sync.txt (one
// "YYYY/MM/DD/slug" per line, LOCAL/literal slug). For each:
//   1. wrap local .plain.html in <body><main>…</main></body>
//   2. curl POST to admin.da.live/source at the NORMALIZED path
//   3. curl POST to admin.hlx.page/preview at the NORMALIZED path
//
// Usage: node tools/importer/upload-preview-batch.mjs [--concurrency=N] [--limit=N] [--offset=N]

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
const LIST = path.join(PROG, 'out-of-sync.txt');
const DONE = path.join(PROG, 'uploaded-previewed.txt');
const FAIL = path.join(PROG, 'upload-preview-failed.tsv');

const args = process.argv.slice(2);
const concurrency = Number((args.find((a) => a.startsWith('--concurrency=')) || '').split('=')[1] || 4);
const limit = Number((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0);
const offset = Number((args.find((a) => a.startsWith('--offset=')) || '').split('=')[1] || 0);

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

function normalizeRel(rel) {
  const parts = rel.split('/');
  const date = parts.slice(0, 3).join('/');
  const slug = parts.slice(3).join('/')
    .toLowerCase()
    .replace(/[^a-z0-9/-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
    .replace(/-\//g, '/')
    .replace(/\/-/g, '/');
  return `${date}/${slug}`;
}

// Run curl and resolve with the HTTP status code (string).
function curlCode(curlArgs) {
  return new Promise((resolve) => {
    const child = spawn('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', ...curlArgs]);
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', () => resolve(out.trim()));
    child.on('error', () => resolve('000'));
  });
}

async function postRetry(curlArgs, attempt = 0) {
  const code = await curlCode(curlArgs);
  if (code === '429' && attempt < 6) {
    await sleep(1000 * (2 ** attempt));
    return postRetry(curlArgs, attempt + 1);
  }
  return code;
}

const done = new Set(fs.existsSync(DONE) ? fs.readFileSync(DONE, 'utf8').split('\n').filter(Boolean) : []);
let rels = [...new Set(fs.readFileSync(LIST, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean))];
if (offset) rels = rels.slice(offset);
if (limit) rels = rels.slice(0, limit);

const total = rels.length;
let ok = 0; let fail = 0; let skip = 0; let processed = 0;
const t0 = Date.now();

async function uploadAndPreview(rel) {
  const src = path.join(CONTENT, `${rel}.plain.html`);
  if (!fs.existsSync(src)) throw new Error('local source missing');
  const norm = normalizeRel(rel);
  const tmp = path.join(os.tmpdir(), `da-${norm.replace(/\//g, '_')}.html`);
  fs.writeFileSync(tmp, `<body>\n<main>\n${fs.readFileSync(src, 'utf8')}\n</main>\n</body>\n`);
  try {
    const upCode = await postRetry([
      '-X', 'POST', '-F', `data=@${tmp};type=text/html`,
      `https://admin.da.live/source/${ORG}/${SITE}/nz/en/news/${norm}.html`,
    ]);
    if (!/^20\d$/.test(upCode)) throw new Error(`DA upload ${upCode}`);
    const pvCode = await postRetry([
      '-X', 'POST',
      `https://admin.hlx.page/preview/${ORG}/${SITE}/main/nz/en/news/${norm}`,
    ]);
    if (!/^20\d$/.test(pvCode)) throw new Error(`preview ${pvCode}`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

let i = 0;
const worker = async () => {
  for (;;) {
    const idx = i; i += 1;
    if (idx >= rels.length) return;
    const rel = rels[idx];
    if (done.has(rel)) { skip += 1; processed += 1; continue; }
    try {
      await uploadAndPreview(rel);
      ok += 1; done.add(rel); fs.appendFileSync(DONE, `${rel}\n`);
    } catch (e) {
      fail += 1; fs.appendFileSync(FAIL, `${rel}\t${e.message}\n`);
    }
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
