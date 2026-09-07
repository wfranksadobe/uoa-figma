/* eslint-disable no-console */
// Batch runner for the news article importer.
//
// Reads a list of source URLs (one per line), imports each into the local
// content tree (downloading images), and records progress so the run is
// resumable. Generation only — uploading to DA/preview is a separate step.
//
// Usage:
//   node tools/importer/run-batch.mjs [urlListFile] [--limit N] [--offset N]
//
// Defaults: urlListFile = tools/importer/news-urls.txt
// Progress: tools/importer/.progress/done.txt  (imported rel paths)
//           tools/importer/.progress/failed.tsv (url<TAB>error)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const PROGRESS = path.join(__dirname, '.progress');
const DONE = path.join(PROGRESS, 'done.txt');
const FAILED = path.join(PROGRESS, 'failed.tsv');
const IMPORTER = path.join(__dirname, 'import-article.mjs');

const args = process.argv.slice(2);
const listFile = args.find((a) => !a.startsWith('--')) || path.join(__dirname, 'news-urls.txt');
const limit = Number((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0);
const offset = Number((args.find((a) => a.startsWith('--offset=')) || '').split('=')[1] || 0);
const concurrency = Number((args.find((a) => a.startsWith('--concurrency=')) || '').split('=')[1] || 6);

fs.mkdirSync(PROGRESS, { recursive: true });
const done = new Set(fs.existsSync(DONE) ? fs.readFileSync(DONE, 'utf8').split('\n').filter(Boolean) : []);

/** Run the single-article importer as a child process; resolve with its JSON result. */
function importOne(url) {
  return new Promise((resolve) => {
    const child = spawn('node', [IMPORTER, url], { cwd: REPO });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      if (code === 0) {
        try {
          resolve({ ok: true, info: JSON.parse(out.trim().split('\n').pop()) });
        } catch {
          resolve({ ok: true, info: { out: out.trim() } });
        }
      } else {
        resolve({ ok: false, error: (err || out).trim().split('\n').pop() });
      }
    });
    child.on('error', (e) => resolve({ ok: false, error: e.message }));
  });
}

async function main() {
  let urls = fs.readFileSync(listFile, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  if (offset) urls = urls.slice(offset);
  if (limit) urls = urls.slice(0, limit);

  const total = urls.length;
  let okCount = 0;
  let failCount = 0;
  let skipCount = 0;
  let processed = 0;
  const t0 = Date.now();

  // Process the queue with a bounded pool of concurrent importer processes.
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= urls.length) return;
      const url = urls[i];
      const rel = (url.match(/\/news\/(\d{4}\/\d{2}\/\d{2}\/[^/?#]+?)\.html/i) || [])[1];
      if (rel && done.has(rel)) {
        skipCount += 1;
      } else {
        const res = await importOne(url);
        if (res.ok) {
          okCount += 1;
          if (rel) {
            done.add(rel);
            fs.appendFileSync(DONE, `${rel}\n`);
          }
        } else {
          failCount += 1;
          fs.appendFileSync(FAILED, `${url}\t${res.error}\n`);
        }
      }
      processed += 1;
      if (processed % 20 === 0 || processed === total) {
        const secs = ((Date.now() - t0) / 1000).toFixed(0);
        const rate = (processed / (secs || 1)).toFixed(2);
        console.info(`[${processed}/${total}] ok=${okCount} fail=${failCount} skip=${skipCount} (${secs}s, ${rate}/s)`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));

  console.info(`DONE. imported=${okCount} failed=${failCount} skipped=${skipCount} of ${total}`);
  if (failCount) console.info(`Failures logged to ${path.relative(REPO, FAILED)}`);
}

main().catch((e) => {
  console.error('BATCH FAILED:', e.message);
  process.exit(1);
});
