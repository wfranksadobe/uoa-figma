/* eslint-disable no-console */
// University of Auckland news article importer.
//
// Given a source article URL (https://www.auckland.ac.nz/en/news/YYYY/MM/DD/slug.html),
// fetch the page, parse its component structure, download images into the local
// content tree, and emit a `.plain.html` document that matches our EDS block
// structure (quote / media-contact / annotated-image / metadata), exactly like
// the two hand-built reference articles.
//
// Usage:
//   node tools/importer/import-article.mjs <sourceUrl> [--dry]
//
// Output:
//   content/nz/en/news/YYYY/MM/DD/slug.plain.html
//   content/nz/en/news/YYYY/MM/DD/slug/<image files>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const CONTENT_ROOT = path.join(REPO, 'content/nz/en/news');
const SRC_ORIGIN = 'https://www.auckland.ac.nz';

/** Collapse whitespace in a text string. */
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

/** Escape text for safe inclusion in HTML text nodes. */
const esc = (s) => (s || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/** Parse a source article URL into its date parts + slug. */
function parseUrl(url) {
  // Slug is everything after the date up to `.html`; a few articles have a
  // nested sub-page path (…/slug/subpage.html), so allow `/` in the slug and
  // use only the final segment as the image-folder name.
  const m = url.match(/\/news\/(\d{4})\/(\d{2})\/(\d{2})\/(.+?)\.html/i);
  if (!m) throw new Error(`Unrecognised news URL: ${url}`);
  const [, year, month, day, slugPath] = m;
  const slug = slugPath.split('/').pop();
  return {
    year, month, day, slug, slugPath, rel: `${year}/${month}/${day}/${slugPath}`,
  };
}

/** Encode a URL so stray characters (e.g. a comma in the slug) don't break fetch. */
const safeUrl = (u) => encodeURI(u).replace(/,/g, '%2C');

/** Fetch a URL as text (with a browser-ish UA). */
async function fetchText(url) {
  const res = await fetch(safeUrl(url), { headers: { 'user-agent': 'Mozilla/5.0 (migration-bot)' } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

/** Fetch a URL as a Buffer. */
async function fetchBuffer(url) {
  const res = await fetch(safeUrl(url), { headers: { 'user-agent': 'Mozilla/5.0 (migration-bot)' } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * From a source imagecomponent <picture>/<img>, choose the highest-resolution
 * source URL available (the srcset entries and the img src), returning an
 * absolute URL.
 */
function bestImageUrl(pictureEl) {
  const urls = [];
  pictureEl.querySelectorAll('source').forEach((s) => {
    const ss = s.getAttribute('srcset');
    if (!ss) return;
    // A srcset is comma-separated, but URLs here can themselves contain commas.
    // Split only on a comma that precedes a new candidate (optional descriptor
    // then a URL-looking token starting with "/" or "http").
    ss.split(/,(?=\s*(?:\/|https?:))/).forEach((cand) => {
      const u = cand.trim().split(/\s+/)[0];
      if (u) urls.push(u);
    });
  });
  const img = pictureEl.querySelector('img');
  if (img?.getAttribute('src')) urls.push(img.getAttribute('src'));
  // Prefer the largest declared width (…img.<WIDTH>.<quality>.jpg…).
  const scored = urls
    .filter(Boolean)
    .map((u) => ({ u, w: Number((u.match(/\.img\.(\d+)\./) || [])[1] || 0) }));
  scored.sort((a, b) => b.w - a.w);
  const pick = scored[0]?.u;
  if (!pick) return null;
  return pick.startsWith('http') ? pick : SRC_ORIGIN + pick;
}

/** Derive a file extension from a URL, defaulting to jpg. */
function extFromUrl(u) {
  const m = u.match(/\.(jpg|jpeg|png|gif|webp|svg)(?:[/?#]|$)/i);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

/**
 * Parse the source article DOM into a normalised model.
 */
function parseArticle(html) {
  const { document } = new JSDOM(html).window;

  const title = clean(document.querySelector('h1[data-page-title]')?.textContent
    || document.querySelector('h1')?.textContent);

  const dateEl = document.querySelector('[data-news-article-publish-date], .news-article__published-date');
  const date = clean(dateEl?.textContent);
  const isoDate = (() => {
    const attr = dateEl?.getAttribute('data-news-article-publish-date'); // DD/MM/YYYY
    if (attr && /^\d{2}\/\d{2}\/\d{4}$/.test(attr)) {
      const [d, m, y] = attr.split('/');
      return `${y}-${m}-${d}`;
    }
    return '';
  })();

  // Tags: name + full tag path.
  const tagEls = [...document.querySelectorAll('.news-article__tags a[data-news-article-tag]')];
  const tags = tagEls.map((a) => ({
    name: clean(a.getAttribute('data-news-article-tag') || a.textContent),
    path: (a.getAttribute('href').match(/tag=([^&]+)/) || [])[1] || '',
  }));

  // Content columns — the article body is split across one or more
  // `.content-area` columns; each holds direct-child `.section` component
  // blocks in document order. Collect them all, in order.
  const areas = [...document.querySelectorAll('.content-area')];
  const orderedComponents = [];
  areas.forEach((a) => {
    a.querySelectorAll(':scope > .section').forEach((s) => orderedComponents.push(s));
  });

  const blocks = [];
  {
    const seen = new Set();
    orderedComponents.forEach((el) => {
      if (seen.has(el)) return;
      const cls = el.className || '';

      if (/contentintrotextcomponent/.test(cls)) {
        const p = clean(el.querySelector('.intro, p')?.textContent);
        if (p) blocks.push({ type: 'subtitle', text: p });
      } else if (/imagecomponent/.test(cls)) {
        const pic = el.querySelector('picture');
        if (pic) {
          const src = bestImageUrl(pic);
          const alt = clean(el.querySelector('img')?.getAttribute('alt'));
          const caption = clean(el.querySelector('.imagecomponent__caption')?.textContent);
          if (src) {
            blocks.push({
              type: 'image', src, alt, caption,
            });
          }
        }
      } else if (/pullquotecomponent/.test(cls)) {
        const quote = clean(el.querySelector('blockquote')?.textContent);
        const who = clean(el.querySelector('.quote-author__name')?.textContent);
        const position = clean(el.querySelector('.quote-author__title')?.textContent);
        if (quote) {
          blocks.push({
            type: 'quote', quote, who, position,
          });
        }
      } else if (/filedownloadlinkcomponent/.test(cls)) {
        const a = el.querySelector('a[href]');
        if (a) {
          // Label: the clean doc title (from data attr or the doctitle span),
          // plus size/type suffix when present, rendered like "Title (PDF, 648.1 kB)".
          const label = clean(a.getAttribute('data-file-download-text')
            || a.querySelector('.filedownload__doctitle')?.textContent);
          const full = clean(a.textContent);
          const size = (full.match(/Size:\s*([\d.]+\s*[kMG]?B)/i) || [])[1];
          const ftype = (full.match(/Type:\s*([A-Z0-9]+)/i) || [])[1];
          let suffix = '';
          if (ftype && size) suffix = ` (${ftype}, ${size})`;
          else if (ftype) suffix = ` (${ftype})`;
          blocks.push({
            type: 'download',
            href: a.getAttribute('href'),
            text: `${label}${suffix}`,
          });
        }
      } else if (/sectionheading/.test(cls)) {
        const h = clean(el.textContent);
        if (h) blocks.push({ type: 'h2', text: h });
      } else if (/(contenttextcomponent|textcomponent|\btext\b)/.test(cls)) {
        // Body text: keep paragraphs and sub-headings, and detect media contact.
        const mcHeading = [...el.querySelectorAll('h3')]
          .find((h) => /media\s*contact/i.test(h.textContent));
        if (mcHeading) {
          blocks.push({ type: 'media-contact', el });
        } else {
          [...el.querySelectorAll('h2, h3, p, ul, ol')].forEach((node) => {
            const tag = node.tagName.toLowerCase();
            const text = clean(node.textContent);
            if (!text) return;
            if (tag === 'h2') blocks.push({ type: 'h2', text });
            else if (tag === 'h3') blocks.push({ type: 'h3', text });
            else if (tag === 'ul' || tag === 'ol') blocks.push({ type: 'list', node, tag });
            else blocks.push({ type: 'p', node });
          });
        }
      }
      seen.add(el);
    });
  }

  return {
    title, date, isoDate, tags, blocks, document,
  };
}

/** Parse a media-contact text component element into fields. */
function parseMediaContact(el) {
  // Source shape: <h3>Media contact</h3>
  //   <p><b>Name | Role<br>M</b>: mobile<br><b>E</b>: <a>email</a></p>
  const p = el.querySelector('p');
  const result = {
    title: 'Media contact', name: '', role: '', mobile: '', email: '',
  };
  if (!p) return result;
  const email = p.querySelector('a[href^="mailto:"]');
  if (email) result.email = clean(email.textContent);
  const text = p.textContent.replace(/[\u00a0]/g, ' ');
  // "Name | Role" is the bold first line; a trailing "M" may cling to it.
  const b = p.querySelector('b, strong');
  if (b) {
    const parts = clean(b.textContent).split('|');
    result.name = clean(parts[0]);
    if (parts[1]) result.role = clean(parts[1].replace(/\bM\b\s*$/, ''));
  }
  const mob = text.match(/M\s*:\s*([0-9+()\s-]{6,})/i);
  if (mob) result.mobile = clean(mob[1]);
  return result;
}

/** Serialise inline HTML for a paragraph node, keeping <a>, <strong>, <em>, <br>. */
function inlineHtml(node) {
  const allowed = new Set(['A', 'STRONG', 'B', 'EM', 'I', 'BR']);
  const walk = (n) => {
    let out = '';
    n.childNodes.forEach((c) => {
      if (c.nodeType === 3) {
        out += esc(c.textContent);
      } else if (c.nodeType === 1) {
        const tag = c.tagName;
        if (tag === 'BR') { out += '<br>'; return; }
        if (allowed.has(tag)) {
          if (tag === 'A') {
            let href = c.getAttribute('href') || '';
            if (href.startsWith('/')) href = SRC_ORIGIN + href;
            out += `<a href="${href}">${walk(c)}</a>`;
          } else {
            // Normalise <b>→<strong> and <i>→<em>; keep others as-is.
            const map = { B: 'strong', I: 'em' };
            const t = map[tag] || tag.toLowerCase();
            out += `<${t}>${walk(c)}</${t}>`;
          }
        } else {
          out += walk(c);
        }
      }
    });
    return out;
  };
  return clean(walk(node)) ? walk(node).replace(/\s+/g, ' ').trim() : '';
}

/**
 * Build the .plain.html content from the parsed model, downloading images.
 */
async function buildContent(model, meta, dryRun) {
  const { rel, slug } = meta;
  const imgDir = path.join(CONTENT_ROOT, path.dirname(rel), slug);
  const parts = [];
  let imgCount = 0;
  let firstImageForMeta = null;

  // Breadcrumb + intro section (title, date, tags, subtitle).
  parts.push('<div>');
  parts.push('<div class="breadcrumb">');
  parts.push('<div>\n<div>Depth</div>\n<div></div>\n</div>');
  parts.push('</div>');
  parts.push('</div>');

  // Group leading intro content into one section: h1, date, tags, subtitle.
  const introLines = [];
  introLines.push(`<h1>${esc(model.title)}</h1>`);
  if (model.date) introLines.push(`<p>${esc(model.date)}</p>`);
  if (model.tags.length) {
    const links = model.tags
      .map((t) => `<a href="${SRC_ORIGIN}/en/news/list.html?tag=${t.path}">${esc(t.name)}</a>`)
      .join(', ');
    introLines.push(`<p>${links}</p>`);
  }
  // subtitle if the first block is a subtitle
  const subtitleBlock = model.blocks.find((b) => b.type === 'subtitle');
  if (subtitleBlock) introLines.push(`<p><strong>${esc(subtitleBlock.text)}</strong></p>`);

  parts.push('<div>');
  parts.push(introLines.join('\n'));
  parts.push('</div>');

  // Helper to download an image and return its local relative src.
  const downloadImage = async (src, idx) => {
    const ext = extFromUrl(src);
    const name = `image-${idx}.${ext}`;
    if (!dryRun) {
      fs.mkdirSync(imgDir, { recursive: true });
      const buf = await fetchBuffer(src);
      fs.writeFileSync(path.join(imgDir, name), buf);
    }
    return `./${slug}/${name}`;
  };

  // Emit the remaining blocks in order, grouping consecutive body text.
  let textBuffer = [];
  const flushText = () => {
    if (textBuffer.length) {
      parts.push('<div>');
      parts.push(textBuffer.join('\n'));
      parts.push('</div>');
      textBuffer = [];
    }
  };

  for (const b of model.blocks) {
    if (b.type === 'subtitle') {
      // already used in intro
    } else if (b.type === 'image') {
      flushText();
      imgCount += 1;
      const localSrc = await downloadImage(b.src, imgCount);
      // Fall back to the caption (then title) when the source alt is empty,
      // so images always carry meaningful alt text.
      const altText = b.alt || b.caption || model.title;
      if (!firstImageForMeta) firstImageForMeta = { src: localSrc, alt: altText };
      parts.push('<div>');
      parts.push('<div class="annotated-image">');
      parts.push(`<div>\n<div><picture><img src="${localSrc}" alt="${esc(altText)}"></picture></div>\n</div>`);
      if (b.caption) parts.push(`<div>\n<div>${esc(b.caption)}</div>\n</div>`);
      // Third row (explicit alt) only when it differs from the caption.
      if (b.alt && b.alt !== b.caption) parts.push(`<div>\n<div>${esc(b.alt)}</div>\n</div>`);
      parts.push('</div>');
      parts.push('</div>');
    } else if (b.type === 'quote') {
      flushText();
      parts.push('<div>');
      parts.push('<div class="quote">');
      parts.push(`<div>\n<div>${esc(b.quote)}</div>\n</div>`);
      if (b.who) parts.push(`<div>\n<div>${esc(b.who)}</div>\n</div>`);
      if (b.position) parts.push(`<div>\n<div>${esc(b.position)}</div>\n</div>`);
      parts.push('</div>');
      parts.push('</div>');
    } else if (b.type === 'media-contact') {
      flushText();
      const mc = parseMediaContact(b.el);
      parts.push('<div>');
      parts.push('<div class="media-contact">');
      parts.push(`<div>\n<div>${esc(mc.title)}</div>\n</div>`);
      parts.push(`<div>\n<div>${esc(mc.name)}</div>\n</div>`);
      parts.push(`<div>\n<div>${esc(mc.role)}</div>\n</div>`);
      parts.push(`<div>\n<div>${esc(mc.mobile)}</div>\n</div>`);
      parts.push(`<div>\n<div>${esc(mc.email)}</div>\n</div>`);
      parts.push('</div>');
      parts.push('</div>');
    } else if (b.type === 'h2') {
      textBuffer.push(`<h2>${esc(b.text)}</h2>`);
    } else if (b.type === 'h3') {
      textBuffer.push(`<h3>${esc(b.text)}</h3>`);
    } else if (b.type === 'list') {
      const items = [...b.node.querySelectorAll('li')]
        .map((li) => `<li>${inlineHtml(li)}</li>`).join('\n');
      textBuffer.push(`<${b.tag}>\n${items}\n</${b.tag}>`);
    } else if (b.type === 'download') {
      let { href } = b;
      if (href.startsWith('/')) href = SRC_ORIGIN + href;
      textBuffer.push(`<p><a href="${href}">${esc(b.text)}</a></p>`);
    } else if (b.type === 'p') {
      const h = inlineHtml(b.node);
      if (h) textBuffer.push(`<p>${h}</p>`);
    }
  }
  flushText();

  // Metadata section.
  const tagNames = model.tags.map((t) => t.name).join(', ');
  const tagPaths = model.tags.map((t) => t.path).join(', ');
  const descr = subtitleBlock ? subtitleBlock.text
    : clean(model.blocks.find((b) => b.type === 'p')?.node?.textContent).slice(0, 200);
  const metaImg = firstImageForMeta
    ? `<img src="${firstImageForMeta.src}" alt="${esc(firstImageForMeta.alt)}">` : '';
  parts.push('<div>');
  parts.push('<div class="metadata">');
  parts.push(`<div>\n<div>Title</div>\n<div>${esc(model.title)}</div>\n</div>`);
  parts.push(`<div>\n<div>Description</div>\n<div>${esc(descr)}</div>\n</div>`);
  parts.push(`<div>\n<div>Publication Date</div>\n<div>${esc(model.isoDate)}</div>\n</div>`);
  parts.push(`<div>\n<div>Tags</div>\n<div>${esc(tagNames)}</div>\n</div>`);
  parts.push(`<div>\n<div>Tag Paths</div>\n<div>${esc(tagPaths)}</div>\n</div>`);
  parts.push(`<div>\n<div>Image</div>\n<div>${metaImg}</div>\n</div>`);
  parts.push('<div>\n<div>Template</div>\n<div>news-article</div>\n</div>');
  parts.push('</div>');
  parts.push('</div>');

  return { html: parts.join('\n'), imgCount };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry');
  const url = args.find((a) => a.startsWith('http'));
  if (!url) {
    console.error('Usage: node tools/importer/import-article.mjs <sourceUrl> [--dry]');
    process.exit(1);
  }
  const meta = parseUrl(url);
  const html = await fetchText(url);
  const model = parseArticle(html);
  if (!model.title) throw new Error('No title parsed — page structure unexpected');
  const { html: content, imgCount } = await buildContent(model, meta, dryRun);

  const outPath = path.join(CONTENT_ROOT, `${meta.rel}.plain.html`);
  if (!dryRun) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${content}\n`);
  }
  console.log(JSON.stringify({
    url,
    out: path.relative(REPO, outPath),
    title: model.title,
    blocks: model.blocks.map((b) => b.type),
    images: imgCount,
    tags: model.tags.length,
    dryRun,
  }));
}

main().catch((e) => {
  console.error('IMPORT FAILED:', e.message);
  process.exit(1);
});
