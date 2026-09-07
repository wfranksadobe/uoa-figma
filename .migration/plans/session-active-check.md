# FIGMA Redesign — News Index + Article Page (isolated `FIGMA` branch)

## Objective

Implement the University of Auckland **News (Aug 2026)** redesign — covering **both** the **news index/homepage** and the **article page** — on a **new `FIGMA` branch only**. `main` must not receive any of this work. The `FIGMA` branch becomes the working line for all redesign changes; we iterate there.

## Hard constraints (confirmed with you)

- **No changes to `main`.** All work lands on a new branch **`FIGMA`**, branched from **current `main`** (which already includes the merged news-feed/index work).
- Content is authored/synced via the DA flow, never hand-edited in `content/` (project rule).
- View/understanding is complete; this artifact is the plan. Building requires **Execute mode**.

## What I understood from Figma (full review)

**File:** `News (Aug 2026)` (`4R2m3DmpddQiE9KfbM3QuK`). Two canvases reviewed frame-by-frame:

### 1. News index / homepage redesign (canvas `1:8`, frame `Desktop 4:3235`)
Top → bottom: **New Header (Aug)** → navy page banner ("News and opinion") → **Hero carousel** (dark image, category pill, headline, date, description, Read more, arrow + 3 dots) → breadcrumb → **Search + Filter bar** → **"Latest News"** = **filter chips** (All, Arts and culture, Business and economy, Education and society, Health and medicine, Politics and law, Science and technology, History/literature and philosophy, University news, Sociology and Design, Show more) above a **single unified 3×3 card grid** (card = image + category tag pill + title + date + teaser) → **Browse all news** → **"Experience the University"** (grey band, video component) → **"Find an expert"** (4 expert cards) → **media advisers CTA** (navy rounded banner) → footer. Also: mobile (320), tablet (768), a "Switching category tag" interaction variant, and hero variations (gradient overlay, light-background full overlay, hover-arrow states, azure/waitematā tints).

**Key change vs. our current build:** our index is 10 separate tag-driven `news-feed` sections; the redesign replaces that with **one filterable Latest-News grid + hero carousel + Experience + Find-an-expert**. Materially different structure.

### 2. Article page redesign (canvas `3:2`, frame `A - Desktop 320:4381`)
**New Header (Aug)** → navy banner → breadcrumb → **light-lavender title block** (date, large headline, standfirst/intro) → **Hero image** (full-width, with caption) → content area: **"Key Points"** callout box (navy tab header, ticked bullets) + **"Related Links"** side box → article **body** (intro bold, inline links, image with caption, **pull-quote** with attribution) → **photo gallery grid** ("View all 8 photos +") → **"Media Contact"** rounded card → **Tags** (chips + "Show N more") → footer.

**Documented variants:** **A** (hero image with Key Points overlay), **B – Azure 10% + Tags at Top**, **No Hero image - Desktop** (tags move directly under the title block, no hero), **Non-Hero Leading Image** (leading image sits inside body, not full-bleed), plus **Share box / Share behaviour** (Facebook/LinkedIn/Instagram/copy) and colour variants, and Tablet/Mobile for each. Reusable component headers exist: **Text Article Headers, Podcast Headers, Key Points, Share box**.

**Vs. our current article blocks:** we have `breadcrumb`, `annotated-image`, `quote`, `media-contact`. The redesign adds **Key Points**, **Related Links**, **Share**, a **photo-gallery**, a restyled **title/standfirst block**, and a **hero-image variant system** — and restyles quote/media-contact/tags to match.

### Design system observations (from frames; exact tokens gated by Figma plan)
- Deep navy `#0c0c48`-family for headings/【tabs】/footer; light-lavender section tint behind title/callouts; blue links; rounded pills/cards; InterDisplay headings, Inter body. I'll extract precise px/hex during build via computed styles on the rendered output and by eye-matching the frames (variable defs are blocked by the Figma plan, so no automated token export).

## Scope

**In scope (on `FIGMA` only):**
- Branch `FIGMA` from current `main`.
- **News index redesign:** hero carousel, search+filter bar, filterable "Latest News" grid (chips), "Experience the University" video block, "Find an expert" block, media-advisers CTA, New Header (Aug) — as new/updated blocks.
- **Article page redesign:** title/standfirst block, hero-image + caption (with no-hero / non-hero-leading variants), Key Points, Related Links, Share, photo gallery, restyled quote / media-contact / tags.
- Responsive (mobile/tablet/desktop), accessible, lint-clean; verified on local preview against the Figma frames.

**Out of scope (for now / needs your steer):**
- Publishing to DA and going live (kept separate; `main` untouched means no auto-deploy of these).
- Podcast Headers component (present in Figma but not obviously in these two page types) unless you want it.
- Replacing the existing 10-section `news-feed` index in production.
- Real backend for search/filter beyond the existing `query-index.json` (chips can filter client-side over the same index).

## Approach & Phases

### Phase 0 — Branch + scaffolding
1. Create and switch to **`FIGMA`** from current `main`; push `-u`. All subsequent commits go here.
2. Save a design-reference note (frame list + node IDs + screenshots) under `.migration/plans/` for traceability.

### Phase 1 — Design tokens & shared styles
3. Establish shared redesign tokens (navy, lavender tint, blue link, pill/card radii, InterDisplay/Inter scale, spacing) as CSS custom properties, matched by eye + computed-style checks to the frames.

### Phase 2 — News index redesign (block by block)
4. **Hero carousel** block (image, category pill, headline, date, desc, Read more, dots/arrows; a11y: keyboard, aria-roledescription, reduced-motion).
5. **Latest-News filter grid**: chips + unified card grid filtering the news `query-index.json` client-side; "Browse all news".
6. **Search + Filter bar**, **Experience the University** (video), **Find an expert**, **media-advisers CTA**.
7. **New Header (Aug)** updates (evaluate against existing header block).

### Phase 3 — Article page redesign (block by block)
8. **Title/standfirst block** + **Hero image + caption**, with **no-hero** and **non-hero-leading-image** variants.
9. **Key Points** callout, **Related Links** box, **Share** control, **photo gallery** ("View all N photos").
10. Restyle **quote**, **media-contact**, **tags** to the redesign; keep `breadcrumb`.

### Phase 4 — Verify locally
11. Build static sample HTML in `drafts/` (or reuse a migrated article + the index) and verify each block on `localhost:3000` via Playwright snapshot/evaluate at mobile/tablet/desktop, matching the Figma frames.
12. Accessibility (headings, roles, keyboard, contrast), console-error check.

### Phase 5 — Lint & land on FIGMA
13. `npm run lint` (JS + CSS); fix.
14. Commit incrementally to `FIGMA`; push. **Open a PR from `FIGMA` (do not merge to `main`)** so it's reviewable, with feature-preview links (`https://FIGMA--aem-boilerplate-commerce--wfranksadobe.aem.page/…`). Decide publishing later.

## Key files (all on `FIGMA`)
- `blocks/hero/*` (or new `hero-carousel/*`), `blocks/news-feed/*` (or new `latest-news/*` filter grid), new `blocks/find-an-expert/*`, `blocks/experience/*`, `blocks/media-cta/*`.
- Article: new `blocks/key-points/*`, `blocks/related-links/*`, `blocks/share/*`, `blocks/gallery/*`, updated `blocks/quote/*`, `blocks/media-contact/*`, `blocks/annotated-image/*`, tags styling.
- `styles/*` shared tokens; `.migration/plans/figma-redesign-*.md` reference; model/`component-*.json` regen for any new blocks.

## Risks & open items
- **Structural shift on the index** (10 sections → filter grid): larger than a restyle; confirm we replace vs. add alongside.
- **Figma tokens gated** by plan → exact hex/px derived by eye + computed styles, not auto-exported.
- **Search/filter backend**: chips filter the existing index client-side unless you want real search.
- **`main` isolation**: nothing here deploys to production until you explicitly decide; the branch preview is how we review.
- **Variant breadth** (A / B / no-hero / non-hero-leading / share colour variants): I'll build the primary A-Desktop first, then variants, to avoid over-building before your review.

## Checklist
- [ ] (Execute) Create + push branch **`FIGMA`** from current `main`; confirm `main` stays untouched
- [ ] Save Figma design-reference (frames, node IDs, screenshots) under `.migration/plans/`
- [ ] Define shared redesign tokens (colour, type, radius, spacing) as CSS variables
- [ ] Index: build **hero carousel** block (a11y + reduced-motion)
- [ ] Index: build **Latest News** filter-chips + unified card grid over `query-index.json` + "Browse all news"
- [ ] Index: build **search+filter bar**, **Experience the University**, **Find an expert**, **media-advisers CTA**
- [ ] Index: apply **New Header (Aug)** updates
- [ ] Article: **title/standfirst** block + **hero image + caption** (with no-hero / non-hero-leading variants)
- [ ] Article: **Key Points**, **Related Links**, **Share**, **photo gallery**
- [ ] Article: restyle **quote**, **media-contact**, **tags**; keep breadcrumb
- [ ] Verify all blocks locally (Playwright, mobile/tablet/desktop) against Figma frames
- [ ] Accessibility + console checks
- [ ] `npm run lint` (JS + CSS) and fix
- [ ] Commit + push to **`FIGMA`**; open PR from `FIGMA` (do **not** merge to `main`) with feature-preview links

---

**Note:** This is the plan only. Creating the `FIGMA` branch and building the blocks are write operations requiring **Execute mode**. Approve to proceed and I'll start with Phase 0 (branch creation) — and I will not touch `main`. One decision I'll need before Phase 2: whether the redesigned index **replaces** or **sits alongside** the current 10-section `news-feed`.

---

## DELIVERED — final comparison URLs (as built)

All redesign block code (JS/CSS) lives **only on the `FIGMA` branch**; `main` is untouched
(`d52655c`). The branch prefix in the host is what flips old-vs-new styling. Redesign
content pages (`index-redesign`, `article-redesign`) are DA pages, published on both
branches, but only render *styled* on `FIGMA` because that is where the block code exists.

**Important:** Edge Delivery serves clean URLs — do **NOT** append `.html` (that 404s).
Swap `.aem.page` → `.aem.live` for the live tier.

### News index
| Design | URL |
| --- | --- |
| **Old** (original 10-section index) | `https://main--aem-boilerplate-commerce--wfranksadobe.aem.page/nz/en/news/` |
| **New** (Aug 2026 redesign) | `https://figma--aem-boilerplate-commerce--wfranksadobe.aem.page/nz/en/news/index-redesign` |

### Article (same content; branch flips the styling)
| Design | URL |
| --- | --- |
| **Old** | `https://main--aem-boilerplate-commerce--wfranksadobe.aem.page/nz/en/news/article-redesign` |
| **New** | `https://figma--aem-boilerplate-commerce--wfranksadobe.aem.page/nz/en/news/article-redesign` |

### Notes
- **News-index hero fixed & migrated:** `hero.jpg` was never uploaded to DA (404 on
  preview/live). Uploaded to DA + republished; the pipeline ingested it
  (`media_10f32…jpg`) and it now returns 200 on preview and live. Content/asset only —
  no `main` code change.
- **New page names:** index `index-redesign`, article `article-redesign`, both under
  `/nz/en/news/`.
- **Redesign images:** currently reuse the single news `hero.jpg` as a stand-in for the
  carousel / experience / expert / gallery images — swap in real assets when finalised.
- **Branch verification:** redesign block code returns 200 on `figma`, 404 on `main`
  (e.g. `/blocks/hero-carousel/hero-carousel.css`).
