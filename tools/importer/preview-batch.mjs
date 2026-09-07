/* eslint-disable no-console */
// Gently preview a list of news article paths via the AEM admin preview API.
// Reads tools/importer/.progress/out-of-sync.txt (one "YYYY/MM/DD/slug" per
// line), POSTs each to admin.hlx.page/preview with low concurrency + 429
// backoff, and is resumable via a done log.
//
// Usage: node tools/importer/preview-batch.mjs [--concurrency=N] [--limit=N]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORG = 'wfranksadobe';
const REPO = 'aem-boilerplate-commerce';
const PROG = path.join(__dirname, '.progress');
const LIST = path.join(PROG, 'out-of-sync.txt');
const DONE = path.join(PROG, 'previewed.txt');
const FAIL = path.join(PROG, 'preview-failed.tsv');

const args = process.argv.slice(2);
const concurrency = Number((args.find((a) => a.startsWith('--concurrency=')) || '').split('=')[1] || 4);
const limit = Number((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0);

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const done = new Set(fs.existsSync(DONE) ? fs.readFileSync(DONE, 'utf8').split('\n').filter(Boolean) : []);
let rels = fs.readFileSync(LIST, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
rels = [...new Set(rels)];
if (limit) rels = rels.slice(0, limit);

const total = rels.length;
let ok = 0; let fail = 0; let skip = 0; let processed = 0;
const t0 = Date.now();

async function preview(rel, attempt = 0) {
  const api = `https://admin.hlx.page/preview/${ORG}/${REPO}/main/nz/en/news/${rel}`;
  const res = await fetch(api, { method: 'POST' });
  if (res.status === 429 && attempt < 6) {
    await sleep(1000 * (2 ** attempt));
    return preview(rel, attempt + 1);
  }
  return res;
}

let i = 0;
const worker = async () => {
  for (;;) {
    const idx = i; i += 1;
    if (idx >= rels.length) return;
    const rel = rels[idx];
    if (done.has(rel)) { skip += 1; processed += 1; continue; }
    try {
      const res = await preview(rel);
      if (res.ok) {
        ok += 1; done.add(rel); fs.appendFileSync(DONE, `${rel}\n`);
      } else {
        fail += 1; fs.appendFileSync(FAIL, `${rel}\t${res.status}\n`);
      }
    } catch (e) {
      fail += 1; fs.appendFileSync(FAIL, `${rel}\t${e.message}\n`);
    }
    processed += 1;
    await sleep(60);
    if (processed % 100 === 0 || processed === total) {
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      console.error(`[${processed}/${total}] ok=${ok} fail=${fail} skip=${skip} (${secs}s)`);
    }
  }
};
await Promise.all(Array.from({ length: concurrency }, () => worker()));
console.log(`DONE. previewed=${ok} failed=${fail} skipped=${skip} of ${total}`);
if (fail) console.log(`Failures: ${path.relative(process.cwd(), FAIL)}`);
