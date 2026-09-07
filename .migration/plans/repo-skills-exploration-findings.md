# University of Auckland — News Article Migration & Dynamic Tag Feeds Plan

## Goal

Establish a repeatable way to **author and migrate news articles** into this EDS project, and build **dynamic, tag-driven sections** on the news index that auto-populate from those articles. This phase delivers:

1. A repeatable **article page pattern** at `/content/nz/en/news/yyyy/mm/dd/article-name.html`, carrying **date** and **tags** in metadata.
2. Migration of **two real articles** (Safeguarding infant formula exports; Award-winning Pacific educator) at **full fidelity**.
3. A **query index** that exposes article date + tags for querying.
4. A reusable **tag-feed block** that loads the latest N articles for a given tag, applied to the **"Sustainable impact"** section on `/content/nz/en/news/index.html` as the working proof.

## Confirmed decisions

- **Section scope (this phase):** Only the **"Sustainable impact"** section is wired to a live tag feed. Other category sections + Feature Article come later (the block is built to be reused for them).
- **Tag model:** Store **both** a display **label** (e.g. "Sustainable impact") and the source **hierarchical path** (e.g. `news:communications-team/sustainable-impact`). Matching/querying is done on the label; the path is retained in metadata for future linking to source tag pages.
- **Article body fidelity:** **Full** — intro, figures/captions, pull-quote blockquotes, PDF download links, subheadings, and the media-contact block.

## How this works (architecture)

**1. Article as a page + metadata.** Each article is a normal EDS page. Its date and tags live in a page **metadata** block (rendered into `<meta>` tags in `<head>`), exactly like the existing Title/Description on the index page. Proposed metadata keys:
- `Publication Date` → `2026-08-20` (ISO, sortable) — plus a human display date derived at render time.
- `Tags` → comma-separated **labels** (e.g. `Sustainable impact, Health and medicine, Communications Team`).
- `Tag Paths` → comma-separated source **paths** (kept for future use; not used for matching now).
- `Image` (og:image) → article hero/thumbnail for cards.

**2. Query index (`helix-query.yaml`).** Add a **news index** scoped to `/nz/en/news/**` that extracts `title`, `image`, `description`, `publicationDate`, and `tags` from each article's `<head>`. AEM generates a `query-index.json` that the tag-feed block fetches. (Repo currently has only `default-query.yaml` for sitemap/enrichment — we add a news index there.)

**3. Tag-feed block (`blocks/news-feed`).** A new block authored on the index page. Content model (per section):
- **Tag** — the label to match (e.g. "Sustainable impact").
- **Count** — how many articles (default 3).
- **Heading / Link** — section title + optional "see more" link (matches source).

At runtime it fetches the news `query-index.json`, filters entries whose `tags` include the configured Tag, sorts by `publicationDate` **descending**, takes the top N, and renders article cards (image, title, date, teaser) styled to match the source layout.

**4. Section styling.** The rendered cards match the source's section pattern (heading, 3-across cards on desktop, stacked on mobile, "See more" affordance).

## Scope

**In scope:**
- ✅ Article authoring pattern + metadata model (date, tags label+path)
- ✅ Migrate 2 articles at full fidelity into `/content/nz/en/news/yyyy/mm/dd/…`
- ✅ `helix-query.yaml` news index (date + tags queryable)
- ✅ `news-feed` block (fetch → filter by tag → sort by date → render N cards)
- ✅ Wire the **Sustainable impact** section on the index to the block
- ✅ Responsive + accessible + lint-clean; verified on local preview

**Out of scope (later):**
- ❌ Wiring the remaining category sections + Feature Article (block will support them)
- ❌ A full news listing/search page (`list.html?tag=…` equivalent)
- ❌ Live tag pages / clickable tag filtering destinations
- ❌ Automatic sitewide `query-index` publishing config beyond the news index

## Approach & Phases

### Phase A — Capture source articles
1. Scrape both article URLs: DOM, computed styles, images, exact date + tag list, body structure (figures, pull-quotes, PDF links, media contact).
2. Record the index page's "Sustainable impact" section layout (card grid, spacing, typography, "See more").

### Phase B — Define the content model
3. Finalise metadata keys (`Publication Date`, `Tags`, `Tag Paths`, `Image`) and the article section structure (breadcrumb → title → date/tags → body → media contact). Reuse the existing `breadcrumb` block; identify which body pieces map to default content vs. blocks (blockquote/pull-quote, figure, PDF link list).
4. Decide any new small blocks needed for full-fidelity body (e.g. a `pullquote` block) vs. plain markup.

### Phase C — Query infrastructure
5. Add the **news index** to `helix-query.yaml` (properties: title, image, description, publicationDate, tags). Document how AEM builds `query-index.json` and how the block consumes it.

### Phase D — Build the `news-feed` block
6. `blocks/news-feed/news-feed.js` + `.css` + `_news-feed.json` (Tag, Count, Heading, Link fields).
7. Fetch + filter-by-tag + sort-by-date-desc + top-N; render cards; graceful empty/loading states; align to content column.
8. Match the source section styling responsively.

### Phase E — Migrate the two articles
9. Build full-fidelity article HTML (with metadata blocks) via the project's import/bundling flow — **not** hand-edited into `content/` — then upload to DA and sync local cache, following the established DA workflow.
10. Verify each article renders (breadcrumb, date, tags, body, figures, quotes, PDF links, media contact).

### Phase F — Wire the index section
11. Author the `news-feed` block into the index page's "Sustainable impact" section (Tag = "Sustainable impact", Count = 3); upload to DA; sync.
12. Confirm it auto-lists the two tagged articles newest-first (and would show 3 once more exist).

### Phase G — Validate & ship
13. Visual-critique articles + index section vs. source (mobile/tablet/desktop).
14. Accessibility (headings, ARIA, keyboard), console-error check, `npm run lint`.
15. Commit + push; PR with feature-preview links; `gh pr checks` / PageSpeed.

## Key files

- `helix-query.yaml` *(new)* — news query index
- `blocks/news-feed/{news-feed.js,news-feed.css,_news-feed.json}` *(new)*
- `blocks/pullquote/…` *(new, if pull-quotes are a block rather than markup)*
- `models/_component-definition.json` + regenerated `component-*.json` — register new block(s)
- Content (via DA, then local `content/` sync): 2 article pages + updated `index.html`

## Risks & open items

- **Query-index availability locally.** `query-index.json` is generated by AEM's indexing; the local dev server may not build it from `helix-query.yaml`. Mitigation: the block reads a standard `query-index.json`; for local verification we may need to preview via admin to generate it, or temporarily point the block at a small static fixture. Confirmed as a verification step, not a design change.
- **Date sorting reliability.** Relies on ISO `Publication Date` in metadata; the folder path (`yyyy/mm/dd`) is a secondary fallback for ordering.
- **Tag matching.** Case/whitespace-insensitive label match; labels must be authored consistently (the `Tags` metadata is the source of truth).
- **Full-fidelity body blocks.** Pull-quotes / figures / PDF-link lists may need a small new block or agreed default-content markup — decided in Phase B before building.
- **Content editing rule.** All content changes go through the import/bundling + DA upload flow, never hand-edited in `content/`.

## Checklist

- [ ] Scrape both source articles (DOM, styles, images, date, tags, body structure)
- [ ] Capture the index "Sustainable impact" section layout + card styling
- [ ] Finalise article metadata model (Publication Date, Tags label, Tag Paths, Image)
- [ ] Define full-fidelity article section structure; decide body blocks vs. markup (pull-quote, figure, PDF links, media contact)
- [ ] Add news index to `helix-query.yaml` (title, image, description, publicationDate, tags)
- [ ] Build `news-feed` block JS/CSS/model (Tag, Count, Heading, Link)
- [ ] Implement fetch → filter-by-tag → sort-by-date-desc → top-N → render cards, with empty/loading states
- [ ] Style the feed section to match source, responsive at all breakpoints
- [ ] Register new block(s) in component definition/models/filters
- [ ] Migrate article 1 (Safeguarding infant formula exports) at full fidelity via import flow → DA → local sync
- [ ] Migrate article 2 (Award-winning Pacific educator) at full fidelity via import flow → DA → local sync
- [ ] Verify both articles render fully (breadcrumb, date, tags, body, figures, quotes, PDF, media contact)
- [ ] Wire the index "Sustainable impact" section to `news-feed` (Tag="Sustainable impact", Count=3) via DA → local sync
- [ ] Confirm the section auto-lists tagged articles newest-first
- [ ] Visual-critique articles + index section vs. source (mobile/tablet/desktop)
- [ ] Accessibility + console + `npm run lint` pass
- [ ] Commit + push; open PR with preview links; run PR/PSI checks

---

**Note:** This artifact is the plan only. Executing it (scraping, creating blocks/files, editing `helix-query.yaml`, uploading to DA) requires **Execute mode** — approve the plan to switch over and I'll start with Phase A.
