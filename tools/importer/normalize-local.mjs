/* eslint-disable no-console */
// Rename migrated news article files + image folders to AEM-normalized slugs,
// and rewrite in-file image src paths to match. Makes the LOCAL content tree
// match the normalized paths used in Document Authoring.
//
// Usage: node tools/importer/normalize-local.mjs [--dry]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT = path.resolve(__dirname, '../../content/nz/en/news');
const dry = process.argv.includes('--dry');

const normSlug = (s) => s
  .toLowerCase().replace(/[^a-z0-9/-]+/g, '-').replace(/-+/g, '-')
  .replace(/(^-|-$)/g, '')
  .replace(/-\//g, '/')
  .replace(/\/-/g, '/');

// collect article rels
const rels = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const fp = path.join(d, e.name);
    if (e.isDirectory()) walk(fp);
    else if (e.name.endsWith('.plain.html')) rels.push(path.relative(CONTENT, fp).replace(/\.plain\.html$/, ''));
  }
};
['2024', '2025', '2026'].forEach((y) => fs.existsSync(path.join(CONTENT, y)) && walk(path.join(CONTENT, y)));

let renamed = 0; let skipped = 0; let imgFolders = 0; const errors = [];
for (const rel of rels) {
  const parts = rel.split('/');
  const date = parts.slice(0, 3).join('/');
  const oldSlug = parts.slice(3).join('/'); // usually single segment
  const newSlug = normSlug(oldSlug);
  if (newSlug === oldSlug) { skipped += 1; continue; }

  // Only single-segment slugs expected here; nested handled generally
  const oldName = oldSlug.split('/').pop();
  const newName = newSlug.split('/').pop();
  const oldHtml = path.join(CONTENT, date, `${oldSlug}.plain.html`);
  const newHtml = path.join(CONTENT, date, `${newSlug}.plain.html`);
  const oldImgDir = path.join(CONTENT, date, oldSlug); // image folder shares slug name
  const newImgDir = path.join(CONTENT, date, newSlug);

  try {
    // 1. rewrite in-file src refs ./oldName/ -> ./newName/
    let html = fs.readFileSync(oldHtml, 'utf8');
    const before = html;
    html = html.split(`./${oldName}/`).join(`./${newName}/`);
    if (!dry) fs.writeFileSync(oldHtml, html);

    // 2. rename image folder if present
    if (fs.existsSync(oldImgDir) && fs.statSync(oldImgDir).isDirectory()) {
      if (!dry) {
        fs.mkdirSync(path.dirname(newImgDir), { recursive: true });
        fs.renameSync(oldImgDir, newImgDir);
      }
      imgFolders += 1;
    }

    // 3. rename the html file
    if (!dry) {
      fs.mkdirSync(path.dirname(newHtml), { recursive: true });
      fs.renameSync(oldHtml, newHtml);
    }
    renamed += 1;
    if (renamed <= 8) console.log(`  ${oldSlug}  ->  ${newSlug}${before !== html ? '  [+src rewrite]' : ''}`);
  } catch (e) {
    errors.push(`${rel}: ${e.message}`);
  }
}

console.log(`\n${dry ? '[DRY] ' : ''}renamed: ${renamed}, image folders moved: ${imgFolders}, skipped (already clean): ${skipped}, errors: ${errors.length}`);
errors.slice(0, 20).forEach((e) => console.log('  ERR', e));
