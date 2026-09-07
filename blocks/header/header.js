// University of Auckland header/navigation.
// Content-first: all labels, links and the logo icon come from content/nav.plain.html.
// This module reads that DOM and builds the brand bar, utility menu, search form,
// and the click-triggered full-width megamenu panels. It hardcodes no copy or URLs.

import { decorateIcons } from '../../scripts/aem.js';
import { getLanguageConfig, getLocaleFromPath } from '../../scripts/languages.js';

/**
 * Fetch the nav fragment for the current language, falling back to the default
 * English fragment. Tries, in order:
 *   /content/{lang}/nav.plain.html  (locale, dev server)
 *   {navPath}.plain.html            (locale, DA/EDS production, if provided)
 *   /content/nav.plain.html         (default English, dev server)
 * @param {string} navPath production nav doc path (without .plain.html)
 * @returns {Promise<string>} fragment HTML (empty string if none found)
 */
async function fetchLocalizedNav(navPath) {
  const config = await getLanguageConfig();
  const code = getLocaleFromPath(window.location.pathname, config);
  const candidates = [];
  // Locale-specific fragment, in both content-root (localhost) and root (prod) layouts.
  if (code && code !== config.default) {
    candidates.push(`/content/${code}/nav.plain.html`, `/${code}/nav.plain.html`);
  }
  // Production block metadata path, if provided.
  if (navPath && navPath !== '/nav') candidates.push(`${navPath}.plain.html`);
  // Default English fragment: content-root (localhost) then root (prod).
  candidates.push('/content/nav.plain.html', '/nav.plain.html');
  // Try each unique candidate in order; return the first that resolves.
  const unique = [...new Set(candidates)];
  return unique.reduce(async (prev, url) => {
    const done = await prev;
    if (done !== null) return done;
    const resp = await fetch(url);
    return resp.ok ? resp.text() : null;
  }, Promise.resolve(null)).then((html) => html || '');
}

const isDesktop = window.matchMedia('(min-width: 900px)');

// Source pages we have migrated locally: map the auckland.ac.nz URL to our
// migrated path so nav links to them stay on-site. The path is resolved
// per-locale at call time (e.g. /nz/en/news, or /content/nz/en/news on the
// dev server). Keys are matched against the link's absolute URL.
const MIGRATED_PAGES = [
  { match: /^https?:\/\/(www\.)?auckland\.ac\.nz\/en\/news\.html$/i, path: 'news' },
];

/**
 * Rewrite a nav link's href to a migrated local page when one exists.
 * Leaves all other links pointing at the source site untouched.
 * @param {string} href the authored href
 * @param {string} basePath the localized news root (e.g. "/nz/en" or
 *   "/content/nz/en"), without a trailing slash
 * @returns {string} the (possibly rewritten) href
 */
function localizeHref(href, basePath) {
  if (!href) return href;
  const migrated = MIGRATED_PAGES.find((p) => p.match.test(href));
  return migrated ? `${basePath}/${migrated.path}` : href;
}

/**
 * Convert a leading `:icon-token:` in an element's text into an EDS icon span
 * (`<span class="icon icon-token">`), so decorateIcons() can render /icons/<token>.svg.
 * Returns true if a token was found and replaced.
 */
function replaceIconToken(el) {
  const text = el.textContent.trim();
  const m = text.match(/^:([a-z0-9-]+):$/i);
  if (!m) return false;
  el.textContent = '';
  const span = document.createElement('span');
  span.className = `icon icon-${m[1]}`;
  el.append(span);
  return true;
}

/**
 * Recover te reo + English parts and the panel from a source trigger <li>.
 */
function readTrigger(li) {
  const p = li.querySelector(':scope > p');
  const link = p && p.querySelector('a');
  let reo = '';
  if (p) {
    p.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) reo += n.textContent;
    });
  }
  let en = '';
  if (link) en = link.textContent.trim();
  else if (p) en = p.textContent.trim();
  return {
    reo: reo.replace(/\s+/g, ' ').trim(),
    en,
    href: link ? link.getAttribute('href') : null,
    panel: li.querySelector(':scope > ul'),
  };
}

/**
 * Build a single dropdown trigger button + its megamenu panel from a source <li>.
 * @param {Element} li source list item
 * @param {number} idx index within its list
 * @param {string} prefix id prefix ("main"/"util")
 * @param {string} basePath localized news root for rewriting migrated links
 */
function buildNavItem(li, idx, prefix, basePath) {
  const {
    reo, en, href, panel,
  } = readTrigger(li);
  const item = document.createElement('li');
  item.className = 'nav-item';

  const hasPanel = panel && panel.children.length > 0;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nav-trigger';
  btn.setAttribute('aria-haspopup', hasPanel ? 'true' : 'false');
  btn.setAttribute('aria-expanded', 'false');
  btn.id = `${prefix}-trigger-${idx}`;
  btn.innerHTML = `${reo ? `<span class="nav-reo">${reo}</span>` : ''}<span class="nav-en">${en}</span>`;
  item.append(btn);

  if (!hasPanel) {
    if (href) btn.dataset.href = localizeHref(href, basePath);
    return item;
  }

  const megamenu = document.createElement('div');
  megamenu.className = 'megamenu';
  megamenu.setAttribute('role', 'region');
  megamenu.setAttribute('aria-labelledby', btn.id);
  megamenu.hidden = true;

  const inner = document.createElement('div');
  inner.className = 'megamenu-inner';

  // Mobile-only "Back" control at the top of each slide-in sub-panel.
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'megamenu-back';
  back.innerHTML = `<span aria-hidden="true">&larr;</span> Back to ${en}`;
  back.setAttribute('aria-label', `Back to main menu from ${en}`);
  inner.append(back);

  if (href) {
    const landing = document.createElement('a');
    landing.className = 'megamenu-landing';
    landing.href = localizeHref(href, basePath);
    // Show the te reo prefix (normal weight) followed by the English word
    // (bold), e.g. "Pitopito kōrero News", matching the source landing.
    if (reo) {
      const reoSpan = document.createElement('span');
      reoSpan.className = 'megamenu-landing-reo';
      reoSpan.textContent = `${reo} `;
      landing.append(reoSpan);
    }
    const enSpan = document.createElement('span');
    enSpan.className = 'megamenu-landing-en';
    enSpan.textContent = en;
    landing.append(enSpan);
    inner.append(landing);
  }

  const columns = document.createElement('div');
  columns.className = 'megamenu-columns';
  panel.querySelectorAll(':scope > li').forEach((colLi) => {
    const column = document.createElement('div');
    column.className = 'megamenu-column';

    const headingP = colLi.querySelector(':scope > p');
    if (headingP) {
      const headingLink = headingP.querySelector('a');
      const heading = document.createElement('div');
      heading.className = 'megamenu-heading';
      if (headingLink) {
        const a = document.createElement('a');
        a.href = localizeHref(headingLink.getAttribute('href'), basePath);
        a.textContent = headingLink.textContent.trim();
        heading.append(a);
      } else {
        heading.textContent = headingP.textContent.trim();
      }
      column.append(heading);
    }

    const subList = colLi.querySelector(':scope > ul');
    if (subList) {
      const ul = document.createElement('ul');
      subList.querySelectorAll(':scope > li > a').forEach((a) => {
        const liEl = document.createElement('li');
        const link = document.createElement('a');
        link.href = localizeHref(a.getAttribute('href'), basePath);
        link.textContent = a.textContent.trim();
        liEl.append(link);
        ul.append(liEl);
      });
      column.append(ul);
    }
    columns.append(column);
  });
  inner.append(columns);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'megamenu-close';
  close.textContent = 'Close';
  close.setAttribute('aria-label', 'Close menu');
  inner.append(close);

  megamenu.append(inner);
  item.append(megamenu);
  return item;
}

/**
 * Wire click-to-open behavior for all triggers within the header.
 * Only one panel is open at a time; clicking outside or Escape closes it.
 */
function wireBehavior(header) {
  const triggers = [...header.querySelectorAll('.nav-trigger[aria-haspopup="true"]')];

  const closeAll = (except) => {
    triggers.forEach((t) => {
      if (t === except) return;
      t.setAttribute('aria-expanded', 'false');
      const panel = t.nextElementSibling;
      if (panel && panel.classList.contains('megamenu')) panel.hidden = true;
    });
    const anyOpen = !!except && except.getAttribute('aria-expanded') === 'true';
    header.classList.toggle('is-open', anyOpen);
  };

  triggers.forEach((trigger) => {
    const panel = trigger.nextElementSibling;
    trigger.addEventListener('click', () => {
      const willOpen = trigger.getAttribute('aria-expanded') !== 'true';
      closeAll(willOpen ? trigger : null);
      trigger.setAttribute('aria-expanded', String(willOpen));
      if (panel) panel.hidden = !willOpen;
      header.classList.toggle('is-open', willOpen);
      // Mobile: slide the drawer to the sub-panel view.
      header.classList.toggle('subpanel-open', willOpen && !isDesktop.matches);
    });
    const closeBtn = panel && panel.querySelector('.megamenu-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        trigger.setAttribute('aria-expanded', 'false');
        panel.hidden = true;
        header.classList.remove('is-open');
        trigger.focus();
      });
    }
    // Mobile "Back" returns from the sub-panel to the main list.
    const backBtn = panel && panel.querySelector('.megamenu-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        trigger.setAttribute('aria-expanded', 'false');
        panel.hidden = true;
        header.classList.remove('is-open', 'subpanel-open');
        trigger.focus();
      });
    }
  });

  header.querySelectorAll('.nav-trigger[aria-haspopup="false"]').forEach((t) => {
    if (t.dataset.href) {
      t.addEventListener('click', () => { window.location.href = t.dataset.href; });
    }
  });

  document.addEventListener('click', (e) => {
    if (!header.contains(e.target)) closeAll(null);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const open = triggers.find((t) => t.getAttribute('aria-expanded') === 'true');
      if (open) { closeAll(null); open.focus(); }
    }
  });

  // Reset state when crossing the desktop/mobile breakpoint.
  isDesktop.addEventListener('change', () => {
    closeAll(null);
    header.classList.remove('nav-open');
    document.body.classList.remove('nav-locked');
    const hamburger = header.querySelector('.nav-hamburger');
    if (hamburger) {
      hamburger.setAttribute('aria-expanded', 'false');
      hamburger.setAttribute('aria-label', 'Open menu');
    }
  });
}

/**
 * loads and decorates the header
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  block.textContent = '';

  // Locale-aware fetch: current language fragment, falling back to English.
  const navMeta = block.closest('.nav-wrapper')?.dataset?.navPath || '/nav';
  const html = await fetchLocalizedNav(navMeta);

  // Base path for migrated-page links. Our migrated content lives under
  // /nz/en (and /content/nz/en on the dev server). Preserve a leading
  // /content root when present so links resolve on localhost.
  const contentRoot = window.location.pathname.startsWith('/content/') ? '/content' : '';
  const localeBase = `${contentRoot}/nz/en`;

  const dom = new DOMParser().parseFromString(html, 'text/html');
  const sections = [...dom.body.children].filter((el) => el.tagName === 'DIV');
  const [brandSection, utilitySection, mainSection] = sections;

  const header = document.createElement('div');
  header.className = 'uoa-header';

  // Accent strip (static navy band above the header).
  const accent = document.createElement('div');
  accent.className = 'uoa-accent';
  header.append(accent);

  // Brand + utility band.
  const topRow = document.createElement('div');
  topRow.className = 'nav-top';

  const brandLink = brandSection && brandSection.querySelector('a');
  const brand = document.createElement('a');
  brand.className = 'nav-brand';
  brand.href = brandLink ? brandLink.getAttribute('href') : 'https://www.auckland.ac.nz/';
  brand.setAttribute('aria-label', 'Waipapa Taumata Rau, University of Auckland');
  // Logo comes from an icon token in the fragment (e.g. :logo-uoa-blue:).
  // On localhost the token is literal text; on DA/EDS production it is already
  // converted to <span class="icon">. Handle a pre-converted span, a literal
  // token, and a plain <img> fallback.
  const brandIconSpan = brandSection && brandSection.querySelector('.icon');
  if (brandIconSpan) {
    brand.append(brandIconSpan.cloneNode(true));
  } else if (brandLink && replaceIconToken(brandLink)) {
    brand.append(brandLink.querySelector('.icon'));
  } else {
    const brandImg = brandSection && brandSection.querySelector('img');
    if (brandImg) {
      const img = document.createElement('img');
      img.src = brandImg.getAttribute('src');
      img.alt = brandImg.getAttribute('alt') || '';
      img.loading = 'eager';
      brand.append(img);
    }
  }
  topRow.append(brand);

  // Hamburger (mobile) sits in the top row, revealed by CSS below 900px.
  const hamburger = document.createElement('button');
  hamburger.type = 'button';
  hamburger.className = 'nav-hamburger';
  hamburger.setAttribute('aria-label', 'Open menu');
  hamburger.setAttribute('aria-expanded', 'false');
  hamburger.innerHTML = '<span class="nav-hamburger-icon"></span>';
  topRow.append(hamburger);

  // Right-hand cluster: utility nav + search + sign in.
  const topTools = document.createElement('div');
  topTools.className = 'nav-top-tools';

  const utilityNav = document.createElement('nav');
  utilityNav.className = 'nav-utility';
  utilityNav.setAttribute('aria-label', 'Utility');
  const utilityList = document.createElement('ul');
  utilityList.className = 'nav-list';
  const utilityItems = utilitySection ? [...utilitySection.querySelectorAll(':scope > ul > li')] : [];
  utilityItems.forEach((li, i) => utilityList.append(buildNavItem(li, i, 'util', localeBase)));
  utilityNav.append(utilityList);

  const search = document.createElement('form');
  search.className = 'nav-search';
  search.setAttribute('role', 'search');
  search.action = 'https://www.auckland.ac.nz/content/auckland/en/search-result';
  search.method = 'get';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.name = 'q';
  searchInput.placeholder = 'Rapunga | Search';
  searchInput.setAttribute('aria-label', 'Search the University of Auckland website');
  const searchBtn = document.createElement('button');
  searchBtn.type = 'submit';
  searchBtn.className = 'nav-search-btn';
  searchBtn.setAttribute('aria-label', 'Search');
  searchBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 5 1.49-1.5-5-5Zm-6 0A4.5 4.5 0 1 1 14 9.5 4.49 4.49 0 0 1 9.5 14Z" fill="currentColor"/></svg>';
  search.append(searchInput, searchBtn);

  const signIn = document.createElement('a');
  signIn.className = 'nav-signin';
  signIn.href = 'https://www.auckland.ac.nz/en/login.html';
  signIn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5Z" fill="currentColor"/></svg><span>Sign in</span>';

  topTools.append(utilityNav, search, signIn);
  topRow.append(topTools);
  header.append(topRow);

  // Main navigation band.
  const mainNav = document.createElement('nav');
  mainNav.className = 'nav-main';
  mainNav.setAttribute('aria-label', 'Main');
  const mainList = document.createElement('ul');
  mainList.className = 'nav-list';
  const mainItems = mainSection ? [...mainSection.querySelectorAll(':scope > ul > li')] : [];
  mainItems.forEach((li, i) => mainList.append(buildNavItem(li, i, 'main', localeBase)));
  mainNav.append(mainList);
  header.append(mainNav);

  // Overlay/backdrop behind the mobile drawer (matches source semi-transparent black).
  const overlay = document.createElement('div');
  overlay.className = 'nav-overlay';
  overlay.hidden = true;
  header.append(overlay);

  block.append(header);

  // Resolve any :icon-token: spans to /icons/<token>.svg images.
  decorateIcons(header);

  const closeDrawer = () => {
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.setAttribute('aria-label', 'Open menu');
    header.classList.remove('nav-open', 'subpanel-open', 'is-open');
    document.body.classList.remove('nav-locked');
    overlay.hidden = true;
    // collapse any open sub-panel
    header.querySelectorAll('.nav-trigger[aria-expanded="true"]').forEach((t) => {
      t.setAttribute('aria-expanded', 'false');
      const p = t.nextElementSibling;
      if (p && p.classList.contains('megamenu')) p.hidden = true;
    });
  };

  // Hamburger toggles the mobile drawer.
  hamburger.addEventListener('click', () => {
    const open = hamburger.getAttribute('aria-expanded') !== 'true';
    if (!open) { closeDrawer(); return; }
    hamburger.setAttribute('aria-expanded', 'true');
    hamburger.setAttribute('aria-label', 'Close menu');
    header.classList.add('nav-open');
    document.body.classList.add('nav-locked');
    overlay.hidden = false;
  });

  // Tapping the overlay closes the drawer (matches source).
  overlay.addEventListener('click', closeDrawer);

  // Single mobile drawer: on mobile the utility tools live inside the main
  // nav drawer (above the main list); on desktop they sit in the top bar.
  const syncDrawer = () => {
    if (isDesktop.matches) {
      if (topTools.parentElement !== topRow) topRow.append(topTools);
    } else if (topTools.parentElement !== mainNav) {
      mainNav.insertBefore(topTools, mainNav.firstChild);
    }
  };
  syncDrawer();
  isDesktop.addEventListener('change', () => { closeDrawer(); syncDrawer(); });

  wireBehavior(header);
}
