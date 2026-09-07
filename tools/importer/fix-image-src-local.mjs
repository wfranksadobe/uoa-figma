/* eslint-disable no-console */
// Normalize local article image `src` to the SINGLE upload-safe convention used
// by Document Authoring: full `https://content.da.live/...` URLs.
//
// Why: the local tree had two conventions. Root-absolute `/media-da/...` paths
// render on the dev server (served statically from content/media-da/) BUT break
// when re-uploaded to DA — the EDS media pipeline drops the image (proven by a
// round-trip test). The `content.da.live` form works in BOTH the dev-server
// render AND on re-upload (it is exactly what DA stores). Converting every local
// file to the `content.da.live` form makes the tree uniform, keeps local
// rendering working, and makes a future re-upload a byte-identical no-op.
//
// Mapping (verified against DA source, diff-identical apart from this prefix):
//   /media-da/wfranksadobe/<rest>  ->  https://content.da.live/wfranksadobe/<rest>
//   /media-da/<rest>               ->  https://content.da.live/wfranksadobe/uoa-figma/<rest>
// (first rule handles the handful of legacy old-repo refs that already carry an
//  explicit org/repo segment; second handles the current-repo majority.)
//
// Pure local file edit — no network. Idempotent (files already on content.da.live
// are untouched). Reports counts; --dry-run to preview.
//
// Usage: node tools/importer/fix-image-src-local.mjs [--dry-run]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT = path.resolve(__dirname, '../../content/nz/en/news');
const dryRun = process.argv.includes('--dry-run');

const CDL = 'https://content.da.live';

function convert(html) {
  let out = html;
  // old-repo refs first (explicit /wfranksadobe/<repo>/… already present)
  out = out.replace(/(["'(])\/media-da\/wfranksadobe\//g, `$1${CDL}/wfranksadobe/`);
  // current-repo refs (implicit org/repo)
  out = out.replace(/(["'(])\/media-da\//g, `$1${CDL}/wfranksadobe/uoa-figma/`);
  return out;
}

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
let refsRewritten = 0;
let untouched = 0;
for (const fp of files) {
  const html = fs.readFileSync(fp, 'utf8');
  if (!html.includes('/media-da/')) { untouched += 1; continue; }
  const next = convert(html);
  const before = (html.match(/\/media-da\//g) || []).length;
  const after = (next.match(/\/media-da\//g) || []).length;
  refsRewritten += before - after;
  if (next !== html) {
    changed += 1;
    if (!dryRun) fs.writeFileSync(fp, next);
  }
}

console.log(`${dryRun ? '[dry-run] ' : ''}files scanned: ${files.length}`);
console.log(`files ${dryRun ? 'to change' : 'changed'}: ${changed}`);
console.log(`img refs rewritten (/media-da/ -> content.da.live): ${refsRewritten}`);
console.log(`files already on content.da.live (untouched): ${untouched}`);
// Any residual /media-da/ after conversion would indicate an unhandled shape.
const residual = files.reduce((n, fp) => {
  const h = fs.readFileSync(fp, 'utf8');
  return n + (dryRun ? (convert(h).match(/\/media-da\//g) || []).length : (h.match(/\/media-da\//g) || []).length);
}, 0);
console.log(`residual /media-da/ refs after conversion: ${residual}`);
