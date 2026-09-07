/* eslint-disable no-console */
// Convert local article image `src` to the RELATIVE `./` form that works in
// BOTH the DA editor Preview AND the rendered EDS pipeline.
//
// Background: images are co-located beside each page in DA
// (…/YYYY/MM/DD/<slug>-image-N.jpg next to …/YYYY/MM/DD/<slug>.html). The
// portable reference is therefore `./<slug>-image-N.jpg`:
//  - DA editor resolves `./` against the page's parent folder (…/YYYY/MM/DD/)
//    — no auth needed, so the image displays (content.da.live URLs 401 in the
//    editor because an <img> tag cannot send an Authorization header).
//  - The EDS pipeline also ingests the `./` form and rewrites it to
//    ./media_<hash>, so the rendered site keeps working.
// This is the convention documented + proven in fix-da-image-paths.mjs.
//
// This converts BOTH prior conventions to relative:
//   https://content.da.live/wfranksadobe/uoa-figma/<datedir>/<file>  -> ./<file>
//   /media-da/nz/en/news/<datedir>/<file>                            -> ./<file>
// where <datedir> is the page's own YYYY/MM/DD folder. The leading path (up to
// and including the page's date folder) is stripped so only the co-located
// filename remains. Refs that live in a SUBFOLDER of the page (rare nested
// slugs) keep the sub-path after the date folder, still relative.
//
// Pure local edit, idempotent (already-`./` refs untouched). --dry-run to preview.
// Usage: node tools/importer/fix-image-src-relative.mjs [--dry-run]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT = path.resolve(__dirname, '../../content/nz/en/news');
const dryRun = process.argv.includes('--dry-run');

const files = [];
const walk = (d) => {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const fp = path.join(d, e.name);
    if (e.isDirectory()) walk(fp);
    else if (e.name.endsWith('.plain.html')) files.push(fp);
  }
};
['2024', '2025', '2026'].forEach((y) => walk(path.join(CONTENT, y)));

let changed = 0;
let refs = 0;
let untouched = 0;
const oddballs = [];

for (const fp of files) {
  const rel = path.relative(CONTENT, fp); // YYYY/MM/DD/<slug...>.plain.html
  const parts = rel.split('/');
  // Images are co-located beside the PAGE. For the common case the page sits in
  // its date folder (YYYY/MM/DD). For nested slugs the page has an extra folder
  // segment; `./` must resolve against the page's OWN directory, so anchor on
  // the page's parent dir (everything except the filename).
  const pageDir = `nz/en/news/${parts.slice(0, -1).join('/')}`; // page's parent dir
  const html = fs.readFileSync(fp, 'utf8');
  let next = html;

  // Both source forms, anchored to THIS page's directory, collapse to `./`.
  const cdl = `https://content.da.live/wfranksadobe/uoa-figma/${pageDir}/`;
  const mediaDa = `/media-da/${pageDir}/`;
  const before = next;
  next = next.split(cdl).join('./');
  next = next.split(mediaDa).join('./');

  // Detect any residual absolute image refs that did NOT match this page's
  // date folder (e.g. old-repo refs or cross-folder) — report, don't force.
  const residual = (next.match(/src="(https:\/\/content\.da\.live|\/media-da\/)[^"]*/g) || []);
  if (residual.length) oddballs.push({ rel, residual: residual.slice(0, 2) });

  const n = (before.match(/(https:\/\/content\.da\.live\/wfranksadobe\/uoa-figma\/|\/media-da\/)/g) || []).length
    - (next.match(/(https:\/\/content\.da\.live\/wfranksadobe\/uoa-figma\/|\/media-da\/)/g) || []).length;
  refs += n;
  if (next !== html) {
    changed += 1;
    if (!dryRun) fs.writeFileSync(fp, next);
  } else {
    untouched += 1;
  }
}

console.log(`${dryRun ? '[dry-run] ' : ''}files scanned: ${files.length}`);
console.log(`files ${dryRun ? 'to change' : 'changed'}: ${changed}`);
console.log(`refs collapsed to ./ : ${refs}`);
console.log(`files unchanged: ${untouched}`);
console.log(`files with residual non-relative refs (need review): ${oddballs.length}`);
oddballs.slice(0, 10).forEach((o) => console.log(`   ${o.rel} :: ${o.residual.join(' | ')}`));
