/* eslint-disable no-console */
// Report which migrated news articles are out of sync (source newer than
// preview, or not previewed at all). Gentle on the admin API: low concurrency
// with retry/backoff on HTTP 429.
//
// Usage: node tools/importer/check-sync.mjs [--limit=N] [--concurrency=N] [--publish]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORG = 'wfranksadobe';
const REPO = 'aem-boilerplate-commerce';
const args = process.argv.slice(2);
const limit = Number((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0);
const concurrency = Number((args.find((a) => a.startsWith('--concurrency=')) || '').split('=')[1] || 4);
const checkPublish = args.includes('--publish');

const urls = fs.readFileSync(path.join(__dirname, 'news-urls.txt'), 'utf8')
  .split('\n').map((s) => s.trim()).filter(Boolean);
const list = limit ? urls.slice(0, limit) : urls;
const toPath = (u) => (u.match(/\/news\/(\d{4}\/\d{2}\/\d{2}\/.+?)\.html/i) || [])[1];

const out = { notPreviewed: [], sourceNewer: [], notPublished: [], inSync: 0, error: [] };
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

async function fetchStatus(rel, attempt = 0) {
  const api = `https://admin.hlx.page/status/${ORG}/${REPO}/main/nz/en/news/${rel}`;
  const res = await fetch(api);
  if (res.status === 429 && attempt < 5) {
    await sleep(1000 * (2 ** attempt));
    return fetchStatus(rel, attempt + 1);
  }
  return res;
}

async function check(rel) {
  try {
    const res = await fetchStatus(rel);
    if (!res.ok) { out.error.push(`${rel} (status ${res.status})`); return; }
    const d = await res.json();
    const pv = d.preview || {}; const lv = d.live || {};
    const src = Date.parse(pv.sourceLastModified || lv.sourceLastModified || 0);
    const prev = pv.status === 200 ? Date.parse(pv.lastModified) : 0;
    const live = lv.status === 200 ? Date.parse(lv.lastModified) : 0;
    if (!prev) out.notPreviewed.push(rel);
    else if (src && src > prev + 1000) out.sourceNewer.push(rel);
    else if (checkPublish && !live) out.notPublished.push(rel);
    else out.inSync += 1;
  } catch (e) { out.error.push(`${rel} (${e.message})`); }
}

let i = 0;
const worker = async () => {
  for (;;) {
    const idx = i; i += 1;
    if (idx >= list.length) return;
    await check(toPath(list[idx]));
    await sleep(80); // gentle pacing
    if ((idx + 1) % 200 === 0) console.error(`  checked ${idx + 1}/${list.length}`);
  }
};
await Promise.all(Array.from({ length: concurrency }, () => worker()));

console.log(`\nChecked ${list.length} articles:`);
console.log(`  in sync:              ${out.inSync}`);
console.log(`  NOT previewed:        ${out.notPreviewed.length}`);
console.log(`  source newer (stale): ${out.sourceNewer.length}`);
if (checkPublish) console.log(`  previewed not live:   ${out.notPublished.length}`);
console.log(`  errors:               ${out.error.length}`);
const dir = path.join(__dirname, '.progress');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'out-of-sync.txt'), [...out.notPreviewed, ...out.sourceNewer].join('\n') + '\n');
fs.writeFileSync(path.join(dir, 'sync-errors.txt'), out.error.join('\n') + '\n');
console.log('\nFull lists: tools/importer/.progress/out-of-sync.txt, sync-errors.txt');
