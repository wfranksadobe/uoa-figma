// University of Auckland breadcrumb.
// Auto-generates the trail from the current page's URL. "Home" points to the
// language root; each path segment beyond that becomes a crumb, and the current
// page is the (non-linked) last item. A configurable "Depth" limits how far back
// the trail goes, counting from the current page.

import { readBlockConfig } from '../../scripts/aem.js';
import { getLanguageConfig, getLocaleFromPath } from '../../scripts/languages.js';

/**
 * Prettify a URL segment into a human label (fallback when no title is found).
 * "research-and-innovation" -> "Research and innovation"
 * @param {string} segment
 * @returns {string}
 */
function prettify(segment) {
  const words = decodeURIComponent(segment).replace(/[-_]+/g, ' ').trim();
  if (!words) return '';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Fetch a page's title (og:title, then <title>), falling back to null so the
 * caller can prettify the segment instead. Same-origin only.
 * @param {string} url page URL (no extension)
 * @returns {Promise<string|null>}
 */
async function fetchTitle(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const og = doc.querySelector('head meta[property="og:title"]');
    if (og?.content) return og.content.trim();
    if (doc.title) return doc.title.trim();
    return null;
  } catch {
    return null;
  }
}

/**
 * Build the ordered list of crumbs for the current path.
 * Each crumb is { label, url|null }. The last crumb (current page) has url:null.
 * @param {number} depth max crumbs to show, counting back from current (0 = all)
 * @returns {Promise<Array<{label:string,url:string|null}>>}
 */
async function buildTrail(depth) {
  const config = await getLanguageConfig();
  const { pathname } = window.location;
  const parts = pathname.split('/').filter(Boolean);

  // Strip a leading content root (dev server serves under /content).
  const hasContentRoot = parts[0] === 'content';
  const rootParts = hasContentRoot ? ['content'] : [];
  const pathParts = hasContentRoot ? parts.slice(1) : parts.slice();

  // The language root is everything up to and including the locale segment.
  const code = getLocaleFromPath(pathname, config);
  let localeIdx = pathParts.findIndex((p) => p === code);
  if (localeIdx === -1) localeIdx = -1; // no locale in path: home is the site root

  // Home links to the language root (e.g. /nz/en), or the site root if none.
  const homeParts = pathParts.slice(0, localeIdx + 1);
  const homeUrl = `/${[...rootParts, ...homeParts].join('/')}` || '/';

  // Segments after the language root become crumbs. Drop a trailing "index".
  let rest = pathParts.slice(localeIdx + 1);
  if (rest[rest.length - 1] === 'index') rest = rest.slice(0, -1);

  const trail = [{ label: 'Home', url: homeUrl }];
  let acc = [...rootParts, ...homeParts];
  rest.forEach((seg, i) => {
    acc = [...acc, seg];
    const isCurrent = i === rest.length - 1;
    // Skip purely-numeric path segments (e.g. the yyyy/mm/dd folders in article
    // URLs) — they are structural, not navigable pages. Keep them in `acc` so
    // deeper crumb URLs stay correct.
    if (!isCurrent && /^\d+$/.test(seg)) return;
    trail.push({
      label: prettify(seg),
      url: isCurrent ? null : `/${acc.join('/')}`,
      // remember the resolvable url so we can fetch a nicer title
      titleUrl: `/${acc.join('/')}`,
    });
  });

  // The current page's real title is already in the document.
  if (trail.length > 1) {
    trail[trail.length - 1].label = (document.title || trail[trail.length - 1].label).trim();
  }

  // Truncate to the requested depth, keeping the deepest crumbs (current always
  // shows). depth 0 / empty / invalid means "show the whole trail".
  if (depth > 0 && trail.length > depth) {
    return trail.slice(trail.length - depth);
  }
  return trail;
}

/**
 * loads and decorates the breadcrumb
 * @param {Element} block The block element
 */
export default async function decorate(block) {
  const cfg = readBlockConfig(block);
  const depth = parseInt(cfg.depth, 10);
  const trail = await buildTrail(Number.isFinite(depth) ? depth : 0);

  // Fill in nicer titles for intermediate crumbs (best effort, non-blocking on
  // failure). Skip Home (fixed label) and the current page (already correct).
  await Promise.all(trail.map(async (crumb) => {
    if (crumb.url && crumb.titleUrl && crumb.label && crumb.label !== 'Home') {
      const title = await fetchTitle(crumb.titleUrl);
      if (title) crumb.label = title;
    }
  }));

  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Breadcrumb');

  const ol = document.createElement('ol');
  ol.className = 'breadcrumb-list';

  trail.forEach((crumb, i) => {
    const li = document.createElement('li');
    li.className = 'breadcrumb-item';
    if (crumb.url) {
      const a = document.createElement('a');
      a.href = crumb.url;
      a.textContent = crumb.label;
      li.append(a);
    } else {
      li.classList.add('breadcrumb-current');
      li.setAttribute('aria-current', 'page');
      const span = document.createElement('span');
      span.textContent = crumb.label;
      li.append(span);
    }
    if (i > 0) li.dataset.separator = '/';
    ol.append(li);
  });

  block.textContent = '';
  block.append(nav);
  nav.append(ol);
}
