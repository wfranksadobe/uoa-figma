import {
  loadHeader,
  loadFooter,
  decorateIcons,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
  buildBlock,
  getMetadata,
} from './aem.js';
import {
  loadCommerceEager,
  loadCommerceLazy,
  initializeCommerce,
  initializeCommerceDropins,
  isCommercePage,
  applyTemplates,
  decorateLinks,
  loadErrorPage,
  decorateSections,
  IS_UE,
  IS_DA,
} from './commerce.js';
import {
  getLanguageConfig,
  getLocaleFromPath,
  getLanguage,
  localizePath,
} from './languages.js';

/*
 * Trusted Types default policy.
 *
 * This policy is defined but NOT currently enforced: the
 * `require-trusted-types-for 'script'` CSP directive that activates it has been
 * removed from the Content-Security-Policy meta in head.html. The policy is kept
 * here so enforcement can be turned back on without re-authoring it.
 *
 * Why the directive was removed: with it enforced, payment SDKs that build a
 * same-origin iframe and synchronously inject a <script> into it fail to render.
 * The Credit Card checkout flow hits this because its hosted-fields SDK does
 * exactly that. Trusted Types policies are scoped per document/realm, so the
 * child iframe inherits the CSP directive but not this default policy; the SDK's
 * `script.src` assignment in that realm then throws "This document requires
 * 'TrustedScriptURL' assignment" and the card fields never mount. Any dependency
 * that injects scripts into a same-origin iframe realm hits the same wall.
 *
 * To re-enable enforcement: add `require-trusted-types-for 'script';` back to the
 * `Content-Security-Policy` meta in head.html. Before doing so, note that the
 * policy below is a passthrough (createScriptURL/createScript return their input
 * unchanged), so enforcing it satisfies the API without adding real containment;
 * hardening it into an allowlist is the useful next step. Enforcement will also
 * re-break any same-origin-iframe SDK unless that SDK installs its own policy in
 * the iframe realm (the correct long-term fix).
 *
 * References:
 * - Directive introduced upstream: https://github.com/adobe/aem-boilerplate/pull/641
 * - Trusted Types API: https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API
 */
if (window.trustedTypes && window.trustedTypes.createPolicy) {
  const innerTT = window.trustedTypes.createPolicy('tt-inner', {
    createHTML: (s) => s, // avoid stack overflow
  });

  window.trustedTypes.createPolicy('default', {
    createHTML: (input, type, sink) => {
      let processedInput = input;
      if (/srcdoc\s*=/i.test(processedInput)) {
        const doc = new DOMParser().parseFromString(innerTT.createHTML(processedInput), 'text/html');
        doc.querySelectorAll('iframe[srcdoc]').forEach((el) => el.removeAttribute('srcdoc'));
        processedInput = doc.body.innerHTML;
      }
      if (sink.includes('createContextualFragment') || sink.includes('Document write')) {
        const doc = new DOMParser().parseFromString(innerTT.createHTML(processedInput), 'text/html');
        doc.querySelectorAll('script').forEach((el) => el.remove());
        processedInput = doc.body.innerHTML;
      }
      return processedInput;
    },
    createScriptURL: (input) => input,
    createScript: (input) => input,
  });
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Turns `/widgets/...` links into widget blocks.
 * @param {Element} main The container element
 */
function buildWidgetAutoBlocks(main) {
  const widgetLinks = [...main.querySelectorAll('a[href*="/widgets/"]')];
  widgetLinks.forEach((link) => {
    if (link.closest('.widget')) return;
    const newLink = link.cloneNode(true);
    const widgetBlock = buildBlock('widget', { elems: [newLink] });
    const p = link.closest('p');
    if (
      p
      && p.querySelectorAll('a').length === 1
      && p.querySelector('a') === link
      && p.textContent.trim() === link.textContent.trim()
    ) {
      p.replaceWith(widgetBlock);
    } else {
      link.replaceWith(widgetBlock);
    }
  });
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    // auto load `*/fragments/*` references
    const fragments = [...main.querySelectorAll('a[href*="/fragments/"]')].filter((f) => !f.closest('.fragment'));
    if (fragments.length > 0) {
      // eslint-disable-next-line import/no-cycle
      import('../blocks/fragment/fragment.js').then(({ loadFragment }) => {
        fragments.forEach(async (fragment) => {
          try {
            const { pathname } = new URL(fragment.href);
            const frag = await loadFragment(pathname);
            fragment.parentElement.replaceWith(...frag.children);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Fragment loading failed', error);
          }
        });
      });
    }
    buildWidgetAutoBlocks(main);
  } catch (error) {
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Decorates formatted links to style them as buttons.
 * @param {HTMLElement} main The main container element
 */
function decorateButtons(main) {
  main.querySelectorAll('p a[href]').forEach((a) => {
    a.title = a.title || a.textContent;
    const p = a.closest('p');
    const text = a.textContent.trim();

    // quick structural checks
    if (a.querySelector('img') || p.textContent.trim() !== text) return;

    // skip URL display links
    try {
      if (new URL(a.href).href === new URL(text, window.location).href) return;
    } catch { /* continue */ }

    // require authored formatting for buttonization
    const strong = a.closest('strong');
    const em = a.closest('em');
    if (!strong && !em) return;

    p.className = 'button-wrapper';
    a.className = 'button';
    if (strong && em) { // high-impact call-to-action
      a.classList.add('accent');
      const outer = strong.contains(em) ? strong : em;
      outer.replaceWith(a);
    } else if (strong) {
      a.classList.add('primary');
      strong.replaceWith(a);
    } else {
      a.classList.add('secondary');
      em.replaceWith(a);
    }
  });
}

/**
 * Structure a news article's header for styling: merge the date and tags onto
 * one line (date | tag, tag, …), mark the lead/subtitle paragraph, and tag the
 * lead image + its caption. Runs only on pages with the `news-article`
 * template. All styling lives in lazy-styles.css (body.news-article …).
 * @param {Element} main The main element
 */
function decorateNewsArticle(main) {
  // Match case-insensitively: the dev server preserves the authored "Template"
  // casing, while the production pipeline lowercases meta names.
  const template = (getMetadata('template') || getMetadata('Template')).trim().toLowerCase();
  if (template !== 'news-article') return;
  // Ensure the body carries the class our CSS keys off, regardless of casing.
  document.body.classList.add('news-article');
  // The article body is the section that starts with the <h1> (not breadcrumb).
  const h1 = main.querySelector('h1');
  const body = h1?.closest('.default-content-wrapper') || h1?.parentElement;
  if (!body) return;

  const paras = [...body.querySelectorAll(':scope > p')];

  // date = a short paragraph like "20 August 2026".
  const dateP = paras.find((p) => /^\d{1,2}\s+\w+\s+\d{4}$/.test(p.textContent.trim()));
  // tags = the next paragraph, built from tag links.
  const tagsP = dateP?.nextElementSibling?.matches('p') && dateP.nextElementSibling.querySelector('a')
    ? dateP.nextElementSibling : null;
  if (dateP) {
    const meta = document.createElement('div');
    meta.className = 'article-meta';
    const date = document.createElement('span');
    date.className = 'article-date';
    date.textContent = dateP.textContent.trim();
    meta.append(date);
    if (tagsP) {
      const tags = document.createElement('span');
      tags.className = 'article-tags';
      tags.append(...tagsP.childNodes);
      meta.append(tags);
    }
    dateP.replaceWith(meta);
    tagsP?.remove();
  }

  // lead image + caption: the <p> holding the <picture>, then a following
  // <p><em>…</em></p> caption.
  const pictureP = body.querySelector(':scope > p picture')?.closest('p');
  if (pictureP) {
    pictureP.classList.add('article-figure');
    const next = pictureP.nextElementSibling;
    if (next && next.matches('p') && next.children.length === 1
      && next.firstElementChild.tagName === 'EM') {
      next.classList.add('article-caption');
    }
  }

  // subtitle/lead = a paragraph whose only child is <strong>. In the source it
  // sits above the image, so move it directly before the figure.
  const lead = paras.find((p) => p.children.length === 1
    && p.firstElementChild.tagName === 'STRONG'
    && p.textContent.trim() === p.firstElementChild.textContent.trim());
  if (lead) {
    lead.classList.add('article-subtitle');
    // If the lead currently sits after the image, move it above (source order).
    if (pictureP && lead.previousElementSibling !== pictureP) {
      const siblings = [...body.children];
      if (siblings.indexOf(lead) > siblings.indexOf(pictureP)) pictureP.before(lead);
    }
  }
}

/**
 * Structure a News (Aug 2026) redesign article (template: news-article-figma).
 * Wraps the title/date/subtitle into a lavender title block, promotes the lead
 * image to a full-bleed hero with caption, and splits the remaining body into a
 * two-column layout (article + right rail holding Share/Related Links).
 * Variants via the Template value: "…-figma", "…-figma-no-hero",
 * "…-figma-non-hero-lead". All styling lives in lazy-styles.css.
 * @param {Element} main The main element
 */
function decorateFigmaArticle(main) {
  const template = (getMetadata('template') || getMetadata('Template')).trim().toLowerCase();
  if (!template.startsWith('news-article-figma')) return;
  document.body.classList.add('news-article-figma');
  const noHero = template.includes('no-hero');
  const nonHeroLead = template.includes('non-hero-lead');

  const h1 = main.querySelector('h1');
  const bodyWrap = h1?.closest('.default-content-wrapper') || h1?.parentElement;
  if (!bodyWrap) return;

  const paras = [...bodyWrap.querySelectorAll(':scope > p')];
  const dateP = paras.find((p) => /^\d{1,2}\s+\w+\s+\d{4}$/.test(p.textContent.trim()));
  const tagsP = dateP?.nextElementSibling?.matches('p') && dateP.nextElementSibling.querySelector('a')
    ? dateP.nextElementSibling : null;
  const lead = paras.find((p) => p.children.length === 1
    && p.firstElementChild.tagName === 'STRONG'
    && p.textContent.trim() === p.firstElementChild.textContent.trim());

  // Build the lavender title block.
  const titleSection = document.createElement('div');
  titleSection.className = 'section figma-title-container';
  const title = document.createElement('div');
  title.className = 'figma-title';
  if (dateP) {
    const date = document.createElement('span');
    date.className = 'article-date';
    date.textContent = dateP.textContent.trim();
    title.append(date);
    dateP.remove();
  }
  if (h1) title.append(h1);
  if (lead) { lead.classList.add('article-subtitle'); title.append(lead); }
  // In the no-hero variant, tags sit as chips directly under the title.
  if (noHero && tagsP) {
    const chips = document.createElement('div');
    chips.className = 'article-tagchips';
    chips.append(...tagsP.childNodes);
    title.append(chips);
    tagsP.remove();
  }
  titleSection.append(title);
  main.prepend(titleSection);

  // Promote the lead image to a full-bleed hero (unless a non-hero variant).
  const pictureP = bodyWrap.querySelector(':scope > p picture')?.closest('p');
  if (pictureP && !noHero && !nonHeroLead) {
    const hero = document.createElement('div');
    hero.className = 'section figma-hero-container';
    const heroInner = document.createElement('div');
    heroInner.className = 'figma-hero';
    heroInner.append(pictureP.querySelector('picture'));
    const capP = pictureP.nextElementSibling;
    if (capP && capP.matches('p') && capP.firstElementChild?.tagName === 'EM') {
      const cap = document.createElement('p');
      cap.className = 'figma-hero-caption';
      cap.textContent = capP.textContent.trim();
      heroInner.append(cap);
      capP.remove();
    }
    hero.append(heroInner);
    titleSection.after(hero);
    pictureP.remove();
  }

  // Wrap the remaining content into a two-column body with a right rail.
  const bodySection = document.createElement('div');
  bodySection.className = 'section figma-body-container';
  const bodyGrid = document.createElement('div');
  bodyGrid.className = 'figma-body';
  const article = document.createElement('div');
  article.className = 'figma-article';
  const rail = document.createElement('div');
  rail.className = 'figma-rail';

  // Move Share + Related Links sections into the rail; the rest into article.
  const sections = [...main.querySelectorAll(':scope > .section')]
    .filter((s) => s !== titleSection && !s.classList.contains('figma-hero-container')
      && !s.classList.contains('breadcrumb-container'));
  sections.forEach((s) => {
    if (s.querySelector('.share, .related-links')) rail.append(s);
    else article.append(s);
  });
  if (rail.children.length) {
    bodyGrid.append(article, rail);
  } else {
    bodyGrid.append(article);
  }
  bodySection.append(bodyGrid);
  main.append(bodySection);
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
export function decorateMain(main) {
  decorateLinks(main);
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateBlocks(main);
  decorateButtons(main);
  decorateNewsArticle(main);
  decorateFigmaArticle(main);
}

/**
 * Detect the current language from the path and apply it to the document
 * (`lang`/`dir`), then inject hreflang alternate links + og:locale for every
 * configured language. Falls back to English if config is unavailable.
 * @param {Element} doc The container element
 */
async function setupLocale(doc) {
  const config = await getLanguageConfig();
  const code = getLocaleFromPath(window.location.pathname, config);
  const lang = getLanguage(code, config);
  document.documentElement.lang = lang?.hreflang || code || 'en';
  if (lang?.dir) document.documentElement.dir = lang.dir;

  const head = doc.head || document.head;
  // og:locale for the current language
  if (lang?.hreflang && !head.querySelector('meta[property="og:locale"]')) {
    const og = document.createElement('meta');
    og.setAttribute('property', 'og:locale');
    og.setAttribute('content', lang.hreflang.replace('-', '_'));
    head.append(og);
  }
  // hreflang alternates for every configured language (+ x-default)
  const { pathname, origin } = window.location;
  (config.languages || []).forEach((l) => {
    if (head.querySelector(`link[rel="alternate"][hreflang="${l.hreflang}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'alternate';
    link.hreflang = l.hreflang;
    link.href = `${origin}${localizePath(pathname, l.code, config)}`;
    head.append(link);
  });
  if (!head.querySelector('link[rel="alternate"][hreflang="x-default"]')) {
    const xd = document.createElement('link');
    xd.rel = 'alternate';
    xd.hreflang = 'x-default';
    xd.href = `${origin}${localizePath(pathname, config.default, config)}`;
    head.append(xd);
  }
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  await setupLocale(doc);
  decorateTemplateAndTheme();

  const main = doc.querySelector('main');
  if (main) {
    try {
      // Content (CMS) pages have no commerce blocks, so defer the commerce
      // drop-in initialization (auth, cart, personalization, reCAPTCHA) out of
      // the eager/LCP path — loadLazy() runs it. This keeps Total Blocking Time
      // low on content pages. Commerce pages initialize eagerly as before.
      window.hlx.deferCommerceDropins = !isCommercePage(doc);
      await initializeCommerce({ initDropins: !window.hlx.deferCommerceDropins });
      decorateMain(main);
      applyTemplates(doc);
      await loadCommerceEager();
    } catch (e) {
      console.error('Error initializing commerce configuration:', e);
      loadErrorPage(418);
    }
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  // Run the commerce drop-in init that was deferred out of the eager phase on
  // content pages (keeps eager TBT low). No-op on commerce pages, which already
  // initialized eagerly.
  if (window.hlx.deferCommerceDropins) {
    initializeCommerceDropins();
  }

  loadHeader(doc.querySelector('header'));

  const main = doc.querySelector('main');
  await loadSections(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadFooter(doc.querySelector('footer'));

  loadCommerceLazy();

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

// UE Editor support before page load
if (IS_UE) {
  // eslint-disable-next-line import/no-unresolved
  await import(`${window.hlx.codeBasePath}/scripts/ue.js`).then(({ default: ue }) => ue());
}

loadPage();

(async function loadDa() {
  if (!IS_DA) return;
  // eslint-disable-next-line import/no-unresolved
  import('https://da.live/scripts/dapreview.js').then(({ default: daPreview }) => daPreview(loadPage));
}());
