// University of Auckland footer.
// Content-first: all links, headings and icons come from content/footer.plain.html.
// This module reads that DOM and renders the black footer band (logo + link
// columns + social icons) and the legal bar. It hardcodes no copy or URLs.

import { decorateIcons } from '../../scripts/aem.js';
import { getLanguageConfig, getLocaleFromPath } from '../../scripts/languages.js';

/**
 * Fetch the footer fragment for the current language, falling back to the
 * default English fragment. Tries locale path first, then production path,
 * then default English.
 * @param {string} footerPath production footer doc path (without .plain.html)
 * @returns {Promise<string>} fragment HTML (empty string if none found)
 */
async function fetchLocalizedFooter(footerPath) {
  const config = await getLanguageConfig();
  const code = getLocaleFromPath(window.location.pathname, config);
  const candidates = [];
  // Locale-specific fragment, in both content-root (localhost) and root (prod) layouts.
  if (code && code !== config.default) {
    candidates.push(`/content/${code}/footer.plain.html`, `/${code}/footer.plain.html`);
  }
  // Production block metadata path, if provided.
  if (footerPath && footerPath !== '/footer') candidates.push(`${footerPath}.plain.html`);
  // Default English fragment: content-root (localhost) then root (prod).
  candidates.push('/content/footer.plain.html', '/footer.plain.html');
  // Try each unique candidate in order; return the first that resolves.
  const unique = [...new Set(candidates)];
  return unique.reduce(async (prev, url) => {
    const done = await prev;
    if (done !== null) return done;
    const resp = await fetch(url);
    return resp.ok ? resp.text() : null;
  }, Promise.resolve(null)).then((html) => html || '');
}

/**
 * Replace any element whose entire text is `:icon-token:` with an EDS icon span
 * (`<span class="icon icon-token">`) so decorateIcons() renders /icons/<token>.svg.
 */
function convertIconTokens(root) {
  root.querySelectorAll('a, p').forEach((el) => {
    // only leaf-ish elements holding just the token text
    if (el.children.length) return;
    const m = el.textContent.trim().match(/^:([a-z0-9-]+):$/i);
    if (!m) return;
    el.textContent = '';
    const span = document.createElement('span');
    span.className = `icon icon-${m[1]}`;
    el.append(span);
  });
}

/**
 * Clone a media node (icon span or img) from a source element for rendering.
 */
function cloneMedia(sourceEl) {
  const icon = sourceEl.querySelector('.icon');
  if (icon) return icon.cloneNode(true);
  const img = sourceEl.querySelector('img');
  if (img) {
    const i = document.createElement('img');
    i.src = img.getAttribute('src');
    i.alt = img.getAttribute('alt') || '';
    i.loading = 'lazy';
    return i;
  }
  return null;
}

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  block.textContent = '';

  // Locale-aware fetch: current language fragment, falling back to English.
  const footerPath = block.closest('.footer-wrapper')?.dataset?.footerPath || '/footer';
  const html = await fetchLocalizedFooter(footerPath);

  const dom = new DOMParser().parseFromString(html, 'text/html');
  convertIconTokens(dom.body);
  const sections = [...dom.body.children].filter((el) => el.tagName === 'DIV');

  const footer = document.createElement('div');
  footer.className = 'uoa-footer';

  // The last section is the legal bar (links row + motif); everything before
  // it forms the main band (logo + link/social columns).
  const legalSection = sections[sections.length - 1];
  const mainSections = sections.slice(0, -1);

  // --- Main band ---
  const main = document.createElement('div');
  main.className = 'uoa-footer-main';

  mainSections.forEach((section) => {
    const col = document.createElement('div');
    col.className = 'uoa-footer-col';

    const heading = section.querySelector('h2');
    if (heading) {
      const h = document.createElement('h2');
      h.textContent = heading.textContent.trim();
      col.append(h);
    }

    // Brand logo (a with media, no heading) gets a dedicated class.
    const brandMedia = !heading && section.querySelector('p a .icon, p a img');
    if (brandMedia) col.classList.add('uoa-footer-brand');

    // Link list
    const list = section.querySelector('ul');
    if (list) {
      const ul = document.createElement('ul');
      // Social icons vs text links: detect media inside the list.
      const hasIcons = !!list.querySelector('.icon, img');
      if (hasIcons) ul.classList.add('uoa-footer-social');
      list.querySelectorAll(':scope > li').forEach((li) => {
        const a = li.querySelector('a');
        if (!a) return;
        const link = document.createElement('a');
        link.href = a.getAttribute('href');
        const media = cloneMedia(a);
        if (media) {
          link.append(media);
          link.setAttribute('aria-label', media.querySelector('img')?.alt || media.alt || '');
        } else {
          link.textContent = a.textContent.trim();
        }
        const item = document.createElement('li');
        item.append(link);
        ul.append(item);
      });
      col.append(ul);
    }

    // Standalone media links / logos (p > a > icon|img, or p > icon|img).
    section.querySelectorAll(':scope > p').forEach((p) => {
      const a = p.querySelector('a');
      const media = cloneMedia(a || p);
      if (!media) return;
      if (a) {
        const link = document.createElement('a');
        link.href = a.getAttribute('href');
        link.append(media);
        if (col.classList.contains('uoa-footer-brand')) col.append(link);
        else {
          const wrap = document.createElement('p');
          wrap.className = 'uoa-footer-extra';
          wrap.append(link);
          col.append(wrap);
        }
      } else {
        col.append(media);
      }
    });

    main.append(col);
  });
  footer.append(main);

  // --- Legal bar ---
  if (legalSection) {
    const legal = document.createElement('div');
    legal.className = 'uoa-footer-legal';

    const legalList = legalSection.querySelector('ul');
    if (legalList) {
      const nav = document.createElement('ul');
      nav.className = 'uoa-footer-legal-links';
      legalList.querySelectorAll(':scope > li > a').forEach((a) => {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = a.getAttribute('href');
        link.textContent = a.textContent.trim();
        li.append(link);
        nav.append(li);
      });
      legal.append(nav);
    }

    // Motif graphic (decorative, no link) — icon token or img.
    const motifP = [...legalSection.querySelectorAll(':scope > p')].find((p) => cloneMedia(p));
    const motif = motifP && cloneMedia(motifP);
    if (motif) {
      motif.classList.add('uoa-footer-motif');
      legal.append(motif);
    }
    footer.append(legal);
  }

  block.append(footer);

  // Resolve any :icon-token: spans to /icons/<token>.svg images.
  decorateIcons(footer);
}
