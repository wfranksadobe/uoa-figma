/* eslint-disable no-console */
// Delete literal (messy-slug) orphan duplicate documents from Document
// Authoring, keeping their normalized twins. For each orphan: unpreview the
// literal path, then delete the DA source. Uses curl (credential injection).
// Gentle + resumable.
//
// Reads /tmp/real-dups.tsv lines: "YYYY/MM/DD<TAB>literalSlug<TAB>normalizedSlug"
// Usage: node tools/importer/delete-orphans.mjs [--concurrency=N] [--limit=N]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORG = 'wfranksadobe';
const SITE = 'aem-boilerplate-commerce';
const PROG = path.join(__dirname, '.progress');
const DUPS = '/tmp/real-dups.tsv';
const DONE = path.join(PROG, 'orphans-deleted.txt');
const FAIL = path.join(PROG, 'orphans-failed.tsv');

const args = process.argv.slice(2);
const concurrency = Number((args.find((a) => a.startsWith('--concurrency=')) || '').split('=')[1] || 3);
const limit = Number((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0);
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

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

fs.mkdirSync(PROG, { recursive: true });
const done = new Set(fs.existsSync(DONE) ? fs.readFileSync(DONE, 'utf8').split('\n').filter(Boolean) : []);
let rows = fs.readFileSync(DUPS, 'utf8').split('\n').filter(Boolean)
  .map((l) => { const [day, lit, norm] = l.split('\t'); return { day, lit, norm }; });
if (limit) rows = rows.slice(0, limit);

const total = rows.length;
let ok = 0; let fail = 0; let skip = 0; let processed = 0;

async function del({ day, lit, norm }) {
  // Safety: never delete if literal == normalized (would remove the good copy)
  if (lit === norm) throw new Error('literal equals normalized — refusing');
  const litPath = `nz/en/news/${day}/${lit}`;
  // 1. unpreview
  const un = await retry(['-X', 'DELETE', `https://admin.hlx.page/preview/${ORG}/${SITE}/main/${litPath}`]);
  if (!/^20\d$/.test(un) && un !== '404') throw new Error(`unpreview ${un}`);
  // 2. delete DA source
  const de = await retry(['-X', 'DELETE', `https://admin.da.live/source/${ORG}/${SITE}/${litPath}.html`]);
  if (!/^20\d$/.test(de) && de !== '404') throw new Error(`DA delete ${de}`);
}

let i = 0;
const worker = async () => {
  for (;;) {
    const idx = i; i += 1;
    if (idx >= rows.length) return;
    const row = rows[idx];
    const key = `${row.day}/${row.lit}`;
    if (done.has(key)) { skip += 1; processed += 1; continue; }
    try { await del(row); ok += 1; done.add(key); fs.appendFileSync(DONE, `${key}\n`); } catch (e) { fail += 1; fs.appendFileSync(FAIL, `${key}\t${e.message}\n`); }
    processed += 1;
    await sleep(60);
    if (processed % 25 === 0 || processed === total) {
      console.error(`[${processed}/${total}] ok=${ok} fail=${fail} skip=${skip}`);
    }
  }
};
await Promise.all(Array.from({ length: concurrency }, () => worker()));
console.log(`DONE. deleted=${ok} failed=${fail} skipped=${skip} of ${total}`);
