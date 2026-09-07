# UoA News — Figma (Aug 2026) Redesign Migration Guide

Instructions for finishing the migration of the University of Auckland news
articles (and index) to the **News (Aug 2026)** Figma redesign in **this repo**
(`wfranksadobe/uoa-figma`).

> Written for the agent picking this up. Everything the redesign needs (block
> code + template wiring) is already in this repo. The remaining work is almost
> entirely **content-side in DA**: flipping each article to the redesign
> template and (optionally) adding the two new authored content blocks.

---

## 1. Current state (what's already done)

**This repo (`uoa-figma`) is a standalone AEM Edge Delivery site.**
- Code source: `github.com/wfranksadobe/uoa-figma` (this repo), branch `main`.
- Content source (DA): `https://content.da.live/wfranksadobe/uoa-figma/`
  (`contentSourceType: markup`). Confirmed via
  `admin.hlx.page/sidekick/wfranksadobe/uoa-figma/main/config.json`.
- Preview: `https://main--uoa-figma--wfranksadobe.aem.page/…`
- Live: `https://main--uoa-figma--wfranksadobe.aem.live/…`
- URLs are **extensionless** — never append `.html` (that 404s).

**Content already copied in (exact copy of the old repo):**
- All ~2,451 news articles under `/nz/en/news/YYYY/MM/DD/…` + their images.
- The commerce boilerplate, nav, footer, and the news index at `/nz/en/news/`.
- The redesigned index is published here at **`/nz/en/news/index`** (the
  renamed `index-redesign`).

**Article images already display in the DA editor** — every article's `<img>`
references use full `https://content.da.live/wfranksadobe/uoa-figma/…` URLs
(applied by `tools/importer/fix-da-editor-images-uoa.mjs` in the source repo).
Do NOT revert these to relative `./` paths — relative paths break in the DA
editor (they resolve against `da.live`, not `content.da.live`).

**Redesign block code is present in this repo** (see §3).

---

## 2. THE core remaining task — flip the article template

The redesign article layout is driven by the page **`Template` metadata**, read
by `decorateFigmaArticle()` in `scripts/scripts.js`:

```js
const template = (getMetadata('template') || getMetadata('Template')).trim().toLowerCase();
if (!template.startsWith('news-article-figma')) return;   // ← gate
const noHero = template.includes('no-hero');
const nonHeroLead = template.includes('non-hero-lead');
```

**Right now every migrated article has `Template = news-article`** (the OLD
design). Until it is changed to `news-article-figma`, the redesign does NOT
render — the page falls back to the legacy `news-article` styling.

### What to do
For each article, set the Metadata **`Template`** cell to one of:

| Template value | Layout |
| --- | --- |
| `news-article-figma` | **Default** — lavender title block, full-bleed hero image + caption, 2-column body (article + right rail). Use for articles that have a lead image. |
| `news-article-figma-no-hero` | No hero image; tag chips sit directly under the title block. Use for image-less articles. |
| `news-article-figma-non-hero-lead` | Leading image stays inline in the body (not full-bleed). |

This is a **bulk DA content edit**, not a code change. Recommended approach:
mirror the existing importer tooling — read each article's DA source, replace
the `Template` value, re-upload + preview + publish. See §6 for the pattern
(adapt `fix-da-editor-images-uoa.mjs`, which already walks every article and
re-publishes; swap the image-rewrite for a Template-cell rewrite).

> Decision needed before batching: which template variant each article gets.
> Simplest rule that matches the design: if the article has a lead image →
> `news-article-figma`; if not → `news-article-figma-no-hero`. Confirm with the
> stakeholder before running across all 2,451.

---

## 3. The redesign blocks (already in this repo)

All live under `blocks/`. Each has `.js`, `.css`, and a `_<name>.json` model.

### Index / homepage blocks
| Block | Purpose |
| --- | --- |
| `hero-carousel` | Rotating featured-story hero: image, category pill, headline, date, description, Read more; prev/next arrows + dots; autoplay w/ pause-on-hover; **crossfade** transition; `prefers-reduced-motion` aware. Authored one row per slide. |
| `latest-news` | Single unified card grid over the news `query-index.json` with **category filter chips** (client-side), "Show more" chips, "Browse all news". Config rows: `Heading`, `Count` (default 9), `Link`. |
| `news-search` | Search field + Filter affordance that filters the on-page `latest-news` grid. |
| `experience` | "Experience the University" grey band: video/still + title/blurb + buttons; click-to-play embed (YouTube/Vimeo). Two cells: `[media] [text+buttons]`. |
| `find-an-expert` | 4-up expert cards (photo, name, bio) + "Find more experts" button. One row per expert; optional heading row; optional final link row = button. |
| `media-cta` | Navy rounded "media advisers" CTA banner. One row: `[text] [link]`. |

### Article blocks
| Block | Purpose |
| --- | --- |
| `key-points` | "Key Points" / "In Brief" callout: navy tab header over a lavender box of ticked bullets. Author **one bullet per row** (the DA pipeline strips `<ul>`, so rows are the reliable form). Optional first row = custom label. |
| `related-links` | Right-rail titled panel of links. Optional first row = title (default "Related Links"). |
| `share` | Share buttons (Facebook/LinkedIn/Instagram/copy-link) built from the page URL. No authored content needed. `share (colour)` variant = navy theme. |
| `gallery` | Photo grid; shows first 6 then a "View all N photos +" overlay to reveal the rest. One image per row. |
| Reused, restyled | `quote`, `media-contact`, `annotated-image`, `breadcrumb` — already styled to the redesign via `body.news-article-figma` rules in `styles/lazy-styles.css`. |

### Shared tokens
`styles/styles.css` defines the redesign design tokens (`--uoa-navy #0c0c48`,
`--uoa-blue #1f2bd4`, `--uoa-lavender #e9e9fb`, `--uoa-grey-band #f3f3f6`,
pill/card radii, InterDisplay/Inter scale, `--uoa-content-max 1152px`,
`--uoa-article-measure 652px`). Reuse these; don't hardcode hexes.

---

## 4. The Figma designs (source of truth)

**File:** `News (Aug 2026)` — `figma.com/design/4R2m3DmpddQiE9KfbM3QuK`

### Index / homepage — canvas `1:8`, frame `Desktop` (`4:3235`)
Top → bottom: New Header (Aug) → navy "News and opinion" banner → **hero
carousel** (dark image, category pill, headline, date, desc, Read more, arrow +
3 dots) → breadcrumb → **search + Filter bar** → **"Latest News"** = filter
chips (All, Arts and culture, Business and economy, Education and society, Te ao
Māori, Health and medicine, Politics and law, Science and technology, History
literature and philosophy, University news, Sociology and Design, Show more)
over a single **3×3 card grid** (image + category tag + title + date + teaser) →
"Browse all news" → **"Experience the University"** (grey band, video) →
**"Find an expert"** (4 cards) → **media-advisers CTA** (navy banner) → footer.
There is **no per-category section** and **no Feature Article** in the redesign
(unlike the legacy 10-section index).
Also in the file: mobile (320) + tablet (768) frames, a "Switching category
tag" interaction variant, and hero banner variations (gradient overlay,
light-background full overlay, hover-arrow states, azure/waitematā tints).

### Article page — canvas `3:2`, frame `A - Desktop` (`320:4381`)
New Header → navy banner → breadcrumb → **lavender title block** (date, large
headline, standfirst/intro) → **full-bleed hero image + caption** → content
area: **"Key Points"** callout + **"Related Links"** side box (right rail) →
body (intro bold, inline links, inline image + caption, **pull-quote** with
attribution) → **photo gallery** ("View all 8 photos +") → **"Media Contact"**
card → **Tags** (chips + "Show N more") → footer.
**Documented variants:** `A` (hero + Key Points), `B – Azure 10% + Tags at Top`,
**No Hero image** (tags under title, no hero), **Non-Hero Leading Image**
(leading image inside body), plus **Share box / Share behaviour** (+ colour
variant), all with Tablet/Mobile. Reusable component headers in the file:
Text Article Headers, Podcast Headers, Key Points, Share box.

### Design system notes (tokens gated by Figma plan — matched by eye)
Deep navy `#0c0c48` for headings/tabs/footer/buttons; brand blue `#1f2bd4` for
links/dates/pills; light-lavender `#e9e9fb` section tint behind title + callouts;
grey band `#f3f3f6`; rounded pills (30px) and cards (10px); InterDisplay for
display headings, Inter for body. Section heading InterDisplay 30px (mobile) →
32px (desktop). Article title InterDisplay ~44px.

---

## 5. New authored content the redesign introduces (per article)

The article body content is otherwise **the same** as the legacy articles — the
redesign is mostly presentation. But two blocks are **new authored content** and
do not exist in the migrated articles:

- **Key Points** — a hand-written bullet summary (2–5 points). Not derivable
  automatically; someone must author it (or seed a first draft from the
  standfirst, then edit).
- **Related Links** — curated related-article links for the right rail.

`share` and `gallery` are functional/structural (share is generated from the
URL; gallery groups existing images), so they don't require new authoring —
though a gallery only appears if the article has multiple images grouped in a
`gallery` block.

**Reference article block sequence for `news-article-figma`:**
breadcrumb → (title/date/tags/standfirst as default content) → lead image +
`<em>` caption → body paragraphs → `key-points` → `related-links` → `share` →
`gallery` → `quote` → `media-contact` → Metadata (with `Template =
news-article-figma`). `decorateFigmaArticle()` moves `share` + `related-links`
into the right rail automatically; author them anywhere in the doc.

---

## 6. Batch tooling pattern (from the source repo)

The source repo (`aem-boilerplate-commerce`, branch `FIGMA`) has resumable DA
batch scripts under `tools/importer/` that are the template for any bulk edit
here:
- `fix-da-editor-images-uoa.mjs` — walks every article, reads DA source,
  rewrites, re-uploads, previews + publishes on `uoa-figma`. **Adapt this** for
  the Template flip (§2): replace the image-URL rewrite with a `Template`-cell
  rewrite (`>news-article<` → `>news-article-figma<`, choosing the variant).
- `da-diff.mjs` — recursively diff two DA repos for parity checks.
- `da-copy-news.mjs` — cross-repo DA copy (how this repo's content was seeded).

DA API cheat-sheet (credentials injected — no token in code):
- Read source: `GET  https://admin.da.live/source/wfranksadobe/uoa-figma/<path>.html`
- Write source: `POST https://admin.da.live/source/wfranksadobe/uoa-figma/<path>.html` (multipart `data=@file;type=text/html`)
- Preview: `POST https://admin.hlx.page/preview/wfranksadobe/uoa-figma/main/<path>`
- Publish: `POST https://admin.hlx.page/live/wfranksadobe/uoa-figma/main/<path>`
- List (per folder): `GET https://admin.da.live/list/wfranksadobe/uoa-figma/<path>`
Be gentle: low concurrency + exponential backoff on HTTP 429. Keep a done log
for resumability.

---

## 7. Suggested finish sequence

1. **Confirm site onboarding** — `config.json` resolves and a preview call on
   one article returns 200 (already verified during setup).
2. **Verify the index** renders the redesign at
   `https://main--uoa-figma--wfranksadobe.aem.page/nz/en/news/index` (hero
   carousel, chips, cards, experience, experts, CTA). Swap the placeholder
   images for real per-slot assets when the final design assets are ready
   (currently reuse migrated article images).
3. **Decide template-variant rule** (§2) with the stakeholder.
4. **Batch-flip the article Template** to `news-article-figma[/-no-hero]`
   (adapt the tooling in §6). Run on 1 → spot-check in DA editor + preview →
   then the full corpus. Resumable; expect a handful of benign "no image /
   text-only" skips.
5. **Author Key Points + Related Links** for priority articles (§5) — these are
   new editorial content and cannot be auto-generated.
6. **Visual-critique** representative articles + the index against the Figma
   frames (mobile/tablet/desktop); adjust block CSS as needed.
7. **Accessibility + lint** — `npm run lint`; check headings, keyboard, contrast.

---

## 8. Guardrails / gotchas learned during setup

- **Extensionless URLs only** — `.html` 404s on every EDS page.
- **DA editor images need full `content.da.live` URLs**, not relative `./`
  paths. This repo's articles are already fixed; keep any new content the same
  way, pointing at **this repo's** DA (`…/uoa-figma/…`), not the old repo.
- **Absolute site-root image paths break the media pipeline** (`about:error`).
  Use full `content.da.live` URLs (editor-safe AND pipeline-safe) or relative
  `./` for the rendered site — never `/nz/en/…` root-absolute.
- **Key Points bullets:** author one bullet per DA row; the pipeline strips a
  pasted `<ul>`.
- The legacy `news-article` template still works — flipping to
  `news-article-figma` is additive and reversible (just change the Metadata
  value back).
