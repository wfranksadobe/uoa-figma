/* eslint-disable no-console */
// One-off: add a Key Points callout to the three 2026/08/24 articles per the
// News (Aug 2026) redesign. Inserts a `key-points` block as its own section
// immediately AFTER the lead image section (so decorateFigmaArticle keeps it at
// the top of the content area, matching the Figma order). Author bullets ONE
// PER ROW — the DA pipeline strips a pasted <ul>.
//
// Updates the local .plain.html AND pushes to DA (source -> preview -> live).
// Usage: node tools/importer/add-keypoints-0824.mjs [--dry-run]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const ORG = 'wfranksadobe';
const SITE = 'uoa-figma';
const DATEDIR = 'nz/en/news/2026/08/24';
const CONTENT = path.join(REPO_ROOT, 'content', DATEDIR);
const dryRun = process.argv.includes('--dry-run');
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const ok2xx = (c) => /^20\d$/.test(c);

// Article-specific key points, drawn from each article's own text.
const POINTS = {
  'giving-researchers-commercialisation-rights-is-just-the-start': [
    "New Zealand's Intellectual Property Management Policy gives university researchers the first right to commercialise their inventions from 1 July 2026.",
    'Disclosure is the gateway that makes those rights meaningful — researchers must disclose IP with commercial potential before revealing it publicly.',
    'The policy can only act on opportunities researchers recognise, so it depends on academics spotting the commercial potential in their work.',
    'Universities need to help researchers build the confidence, language and judgement to treat innovation as part of their academic role.',
  ],
  'innovation-needs-to-become-everyones-business': [
    'The University of Auckland has endorsed a new 2026–2030 strategy for its Centre for Innovation and Entrepreneurship (CIE).',
    'The strategy shifts focus from delivering more CIE programmes to spreading innovation and entrepreneurial capability across the whole University.',
    'Innovation starts with people and agency — the capability and confidence to see that something could be different, and to act on it.',
    'The ambition is broader than start-ups: entrepreneurial skills add value in research, business, government, community and beyond.',
    "A university innovation ecosystem should reach beyond its boundaries, with Māori and Pacific perspectives shaping how impact is created in and from Aotearoa.",
  ],
  'time-to-lobby-for-lobbying-regulations': [
    'New Zealand has dropped to 53rd on the global tobacco industry interference index, showing how commercial lobbying quietly shapes government decisions.',
    'The OECD gave New Zealand a zero rating for managing the risks of lobbying — bottom of 47 countries, most of which already have laws in place.',
    'The Opportunity Party is campaigning to regulate lobbying, reform political donations and establish an anti-corruption body.',
    'Undue commercial influence — from ministers moving into lobbying roles to fast-tracked projects — is a growing risk to public trust in government.',
  ],
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Build the key-points block markup (one bullet per row). */
function keyPointsSection(points) {
  const rows = [
    '<div>\n<div>Key Points</div>\n</div>',
    ...points.map((p) => `<div>\n<div>${esc(p)}</div>\n</div>`),
  ].join('\n');
  return `<div>\n<div class="key-points">\n${rows}\n</div>\n</div>\n`;
}

/** Split top-level section <div>s of the fragment; return array of {start,end}. */
function topLevelSections(html) {
  const sections = [];
  let depth = 0; let start = -1; let i = 0;
  const tagRe = /<(\/?)div\b[^>]*>/g;
  let m;
  // eslint-disable-next-line no-cond-assign
  while ((m = tagRe.exec(html)) !== null) {
    const closing = m[1] === '/';
    if (!closing) {
      if (depth === 0) start = m.index;
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0) sections.push({ start, end: tagRe.lastIndex });
    }
    i += 1;
  }
  return sections;
}

function insertAfterLeadImage(html, block) {
  const sections = topLevelSections(html);
  // find the section that contains the (first) annotated-image
  const idx = sections.findIndex((s) => html.slice(s.start, s.end).includes('class="annotated-image"'));
  if (idx === -1) throw new Error('no annotated-image section found');
  const insAt = sections[idx].end;
  // insert on its own line after the lead image section
  return `${html.slice(0, insAt)}\n${block}${html.slice(insAt)}`;
}

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

async function main() {
  for (const [slug, points] of Object.entries(POINTS)) {
    const fp = path.join(CONTENT, `${slug}.plain.html`);
    const rel = `${DATEDIR}/${slug}`;
    const html = fs.readFileSync(fp, 'utf8');
    if (html.includes('class="key-points"')) { console.log(`SKIP ${slug} (already has key-points)`); continue; }
    const next = insertAfterLeadImage(html, keyPointsSection(points));
    if (dryRun) { console.log(`[dry-run] ${slug}: +${points.length} points`); continue; }

    fs.writeFileSync(fp, next); // update local copy

    const tmp = path.join(os.tmpdir(), `kp-${slug}.html`);
    fs.writeFileSync(tmp, `<body>\n<main>\n${next}\n</main>\n</body>\n`);
    try {
      const up = await retry(['-X', 'POST', '-F', `data=@${tmp};type=text/html`,
        `https://admin.da.live/source/${ORG}/${SITE}/${rel}.html`]);
      if (!ok2xx(up)) throw new Error(`upload ${up}`);
      const pv = await retry(['-X', 'POST', `https://admin.hlx.page/preview/${ORG}/${SITE}/main/${rel}`]);
      if (!ok2xx(pv)) throw new Error(`preview ${pv}`);
      const li = await retry(['-X', 'POST', `https://admin.hlx.page/live/${ORG}/${SITE}/main/${rel}`]);
      if (!ok2xx(li)) throw new Error(`publish ${li}`);
    } finally { fs.rmSync(tmp, { force: true }); }
    console.log(`OK ${slug}: +${points.length} points (source+preview+live)`);
  }
}
main();
