// University of Auckland "Latest News" grid (News Aug 2026 redesign).
// Fetches the news query-index, renders a single unified grid of article
// cards (image + category tag + title + date + teaser) and a row of category
// filter chips that filter the grid client-side. A "Browse all news" button
// and a "Show more" chip toggle round it out.
//
// Authored config (optional, key/value rows):
//   Count   — cards to show per view (default 9)
//   Heading — section heading (default "Latest News")
//   Link    — "Browse all news" destination

import { readBlockConfig, createOptimizedPicture } from '../../scripts/aem.js';

const DEFAULT_COUNT = 9;
const CHIPS_COLLAPSED = 8;

/** Locate the news query-index for dev (/content) or production (root). */
async function fetchNewsIndex() {
  const candidates = [
    '/content/nz/en/news/query-index.json',
    '/nz/en/news/query-index.json',
  ];
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
      // try next candidate
    }
    return acc;
  }, Promise.resolve([]));
}

const normalize = (t) => (t || '').trim().toLowerCase();

/** Parse the multi-shape tags field into a clean array. */
function parseTags(value) {
  if (Array.isArray(value)) return value.map((t) => t.trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    const s = value.trim();
    if (s.startsWith('[')) {
      try {
        return JSON.parse(s).map((t) => String(t).trim()).filter(Boolean);
      } catch {
        // fall through
      }
    }
    return s.split(',').map((t) => t.trim()).filter(Boolean);
  }
  return [];
}

/** Format an ISO date as "20 August 2026". */
function formatDate(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return iso;
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  const [, y, mo, d] = m;
  return `${parseInt(d, 10)} ${months[parseInt(mo, 10) - 1]} ${y}`;
}

/** Comparable sort key: publicationDate, else the yyyy/mm/dd path. */
function sortKey(row) {
  if (row.publicationDate) return row.publicationDate.trim();
  const m = /\/news\/(\d{4})\/(\d{2})\/(\d{2})\//.exec(row.path || '');
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/** The category chip vocabulary from the redesign (source order). */
const CATEGORIES = [
  'Arts and culture', 'Business and economy', 'Education and society',
  'Health and medicine', 'Politics and law', 'Science and technology',
  'History, literature and philosophy', 'University news', 'Sociology and Design',
];

/** Build one article card. */
function buildCard(row) {
  const li = document.createElement('li');
  li.className = 'latest-news-card';

  const link = document.createElement('a');
  link.className = 'latest-news-card-link';
  link.href = row.path;

  if (row.image) {
    const imgWrap = document.createElement('div');
    imgWrap.className = 'latest-news-card-image';
    imgWrap.append(createOptimizedPicture(row.image, row.title || '', false, [{ width: '750' }]));
    link.append(imgWrap);
  }

  const body = document.createElement('div');
  body.className = 'latest-news-card-body';

  const tags = parseTags(row.tags);
  const primary = tags.find((t) => CATEGORIES.some((c) => normalize(c) === normalize(t)));
  if (primary) {
    const pill = document.createElement('span');
    pill.className = 'latest-news-card-tag';
    pill.textContent = primary;
    body.append(pill);
  }

  const h3 = document.createElement('h3');
  h3.className = 'latest-news-card-title';
  h3.textContent = row.title || '';
  body.append(h3);

  const date = formatDate(sortKey(row));
  if (date) {
    const dateEl = document.createElement('p');
    dateEl.className = 'latest-news-card-date';
    dateEl.textContent = date;
    body.append(dateEl);
  }

  if (row.description) {
    const desc = document.createElement('p');
    desc.className = 'latest-news-card-desc';
    desc.textContent = row.description;
    body.append(desc);
  }

  link.append(body);
  li.append(link);
  return li;
}

/**
 * loads and decorates the latest-news grid
 * @param {Element} block
 */
export default async function decorate(block) {
  const cfg = readBlockConfig(block);
  const count = parseInt(cfg.count, 10) || DEFAULT_COUNT;
  const heading = cfg.heading || 'Latest News';
  const browseLink = cfg.link || '';

  block.textContent = '';

  const header = document.createElement('div');
  header.className = 'latest-news-header';
  const h2 = document.createElement('h2');
  h2.className = 'latest-news-heading';
  h2.textContent = heading;
  header.append(h2);
  block.append(header);

  // Chip bar (built now; wired after data loads so we can hide empty ones).
  const chipBar = document.createElement('div');
  chipBar.className = 'latest-news-chips';
  chipBar.setAttribute('role', 'tablist');
  chipBar.setAttribute('aria-label', 'Filter news by category');
  block.append(chipBar);

  const list = document.createElement('ul');
  list.className = 'latest-news-list';
  block.append(list);

  const rows = (await fetchNewsIndex())
    .slice()
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)));

  // Which categories actually have articles?
  const present = CATEGORIES.filter((cat) => rows.some(
    (r) => parseTags(r.tags).some((t) => normalize(t) === normalize(cat)),
  ));

  let activeCat = 'All';

  const render = () => {
    const filtered = activeCat === 'All'
      ? rows
      : rows.filter((r) => parseTags(r.tags).some((t) => normalize(t) === normalize(activeCat)));
    list.textContent = '';
    filtered.slice(0, count).forEach((r) => list.append(buildCard(r)));
    if (!filtered.length) {
      const empty = document.createElement('p');
      empty.className = 'latest-news-empty';
      empty.textContent = 'No articles in this category yet.';
      list.append(empty);
    }
  };

  const makeChip = (label) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'latest-news-chip';
    chip.setAttribute('role', 'tab');
    chip.textContent = label;
    if (label === activeCat) chip.classList.add('is-active');
    chip.addEventListener('click', () => {
      activeCat = label;
      chipBar.querySelectorAll('.latest-news-chip').forEach((c) => {
        const on = c.textContent === label;
        c.classList.toggle('is-active', on);
        c.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      render();
    });
    return chip;
  };

  const allChips = ['All', ...present].map(makeChip);
  // Collapse long chip lists behind a "Show more" toggle.
  allChips.forEach((c, i) => {
    if (i >= CHIPS_COLLAPSED + 1) c.hidden = true;
    chipBar.append(c);
  });
  if (allChips.length > CHIPS_COLLAPSED + 1) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'latest-news-chip latest-news-chip-more';
    more.textContent = 'Show more';
    let expanded = false;
    more.addEventListener('click', () => {
      expanded = !expanded;
      allChips.forEach((c, i) => { if (i >= CHIPS_COLLAPSED + 1) c.hidden = !expanded; });
      more.textContent = expanded ? 'Show less' : 'Show more';
    });
    chipBar.append(more);
  }

  render();

  if (browseLink) {
    const more = document.createElement('p');
    more.className = 'latest-news-browse';
    const a = document.createElement('a');
    a.href = browseLink;
    a.textContent = 'Browse all news';
    more.append(a);
    block.append(more);
  }
}
