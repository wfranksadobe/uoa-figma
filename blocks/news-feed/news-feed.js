// University of Auckland news feed.
// A tag-driven section for the news index: fetches the news query-index,
// filters entries by the configured Tag, sorts by publication date (newest
// first) and renders the latest N as article cards. Reusable for every
// category section (Sustainable impact, Arts and culture, …).

import { readBlockConfig, createOptimizedPicture } from '../../scripts/aem.js';

/**
 * Locate the news query-index for the current site layout. The dev server
 * serves content under /content; production serves it at the root.
 * @returns {Promise<Array>} the index rows (empty array if unavailable)
 */
async function fetchNewsIndex() {
  const candidates = [
    '/content/nz/en/news/query-index.json',
    '/nz/en/news/query-index.json',
  ];
  // Try each candidate in order, resolving to the first that returns rows.
  return candidates.reduce(async (prev, url) => {
    const acc = await prev;
    if (acc.length) return acc;
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const json = await resp.json();
        if (Array.isArray(json.data)) return json.data;
      }
    } catch {
      // try the next candidate
    }
    return acc;
  }, Promise.resolve([]));
}

/**
 * Normalise a tag for matching: case-insensitive, trimmed.
 * @param {string} t
 * @returns {string}
 */
const normalize = (t) => (t || '').trim().toLowerCase();

/**
 * Parse the multi-value tags field from a query-index row. The indexer emits
 * either an array or a comma-separated / JSON-encoded string depending on the
 * pipeline, so handle all shapes.
 * @param {*} value
 * @returns {string[]}
 */
function parseTags(value) {
  if (Array.isArray(value)) return value.map((t) => t.trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    const s = value.trim();
    if (s.startsWith('[')) {
      try {
        return JSON.parse(s).map((t) => String(t).trim()).filter(Boolean);
      } catch {
        // fall through to comma split
      }
    }
    return s.split(',').map((t) => t.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Format an ISO date (YYYY-MM-DD) as "20 August 2026". Falls back to the raw
 * string if it is not parseable.
 * @param {string} iso
 * @returns {string}
 */
function formatDate(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return iso;
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  const [, y, mo, d] = m;
  return `${parseInt(d, 10)} ${months[parseInt(mo, 10) - 1]} ${y}`;
}

/**
 * Sort key for a row: prefer the publication-date metadata, fall back to the
 * yyyy/mm/dd folders in the path so ordering still works without metadata.
 * @param {object} row
 * @returns {string} comparable ISO-ish string
 */
function sortKey(row) {
  if (row.publicationDate) return row.publicationDate.trim();
  const m = /\/news\/(\d{4})\/(\d{2})\/(\d{2})\//.exec(row.path || '');
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/**
 * Build a single article card.
 * @param {object} row query-index row
 * @returns {HTMLLIElement}
 */
function buildCard(row) {
  const li = document.createElement('li');
  li.className = 'news-feed-card';

  const href = row.path;
  const link = document.createElement('a');
  link.className = 'news-feed-card-link';
  link.href = href;

  if (row.image) {
    const imgWrap = document.createElement('div');
    imgWrap.className = 'news-feed-card-image';
    imgWrap.append(createOptimizedPicture(row.image, row.title || '', false, [{ width: '750' }]));
    link.append(imgWrap);
  }

  const body = document.createElement('div');
  body.className = 'news-feed-card-body';

  const h3 = document.createElement('h3');
  h3.className = 'news-feed-card-title';
  h3.textContent = row.title || '';
  body.append(h3);

  const date = formatDate(sortKey(row));
  if (date) {
    const dateEl = document.createElement('p');
    dateEl.className = 'news-feed-card-date';
    dateEl.textContent = date;
    body.append(dateEl);
  }

  if (row.description) {
    const desc = document.createElement('p');
    desc.className = 'news-feed-card-desc';
    desc.textContent = row.description;
    body.append(desc);
  }

  link.append(body);
  li.append(link);
  return li;
}

/**
 * Zebra-stripe the visible news-feed sections to match the source: the FIRST
 * visible section gets a grey band, then white, then grey… Runs after each
 * block decorates (idempotent), so the striping stays correct regardless of
 * which categories are empty/hidden.
 */
function restripeSections() {
  const sections = [...document.querySelectorAll('.section.news-feed-container')]
    .filter((s) => !s.hasAttribute('hidden') && s.querySelector('.news-feed:not([hidden])'));
  sections.forEach((s, i) => {
    s.classList.toggle('news-feed-section--alt', i % 2 === 0);
  });
}

/**
 * loads and decorates the news feed
 * @param {Element} block The block element
 */
export default async function decorate(block) {
  const cfg = readBlockConfig(block);
  const tag = cfg.tag || '';
  const count = parseInt(cfg.count, 10) || 3;
  const heading = cfg.heading || tag;
  const link = cfg.link || '';

  // Preserve config, then clear the authored table.
  block.textContent = '';

  // Fetch and filter first: a category with no matching articles collapses
  // entirely (no empty heading), so unpopulated sections stay invisible until
  // content exists — important now that every category is wired on the index.
  const rows = await fetchNewsIndex();
  const wanted = normalize(tag);
  const matches = rows
    .filter((row) => parseTags(row.tags).some((t) => normalize(t) === wanted))
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)))
    .slice(0, count);

  if (!matches.length) {
    // Hide the whole section (and its wrapper) when there is nothing to show.
    block.closest('.section')?.setAttribute('hidden', '');
    block.setAttribute('hidden', '');
    restripeSections();
    return;
  }

  // Section header (heading + optional "see more" link), matching the source.
  if (heading) {
    const header = document.createElement('div');
    header.className = 'news-feed-header';
    const h2 = document.createElement('h2');
    h2.className = 'news-feed-heading';
    if (link) {
      const a = document.createElement('a');
      a.href = link;
      a.textContent = heading;
      h2.append(a);
    } else {
      h2.textContent = heading;
    }
    header.append(h2);
    block.append(header);
  }

  const list = document.createElement('ul');
  list.className = 'news-feed-list';
  block.append(list);

  matches.forEach((row) => list.append(buildCard(row)));

  // Optional "See more" link below the cards, matching the source pattern.
  if (link) {
    const more = document.createElement('p');
    more.className = 'news-feed-more';
    const a = document.createElement('a');
    a.href = link;
    a.textContent = `See more ${heading}`;
    more.append(a);
    block.append(more);
  }

  restripeSections();
}
