# Language taxonomy

This site is set up for multiple languages using a **path-prefix** convention.
English is populated today; other languages can be added later with zero code
changes.

## URL structure

```
/en/news            English (default)
/mi/news            Te reo Māori
/zh/news            简体中文
/ko/news            한국어
/ja/news            日本語
```

The **default language (English)** is also reachable without a prefix
(e.g. `/news`), so existing links keep working. Non-default languages always
use their prefix.

## Configuration

Supported languages live in [`/languages.json`](../languages.json):

```json
{
  "default": "en",
  "languages": [
    { "code": "en", "hreflang": "en-NZ", "label": "English", "dir": "ltr", "populated": true },
    { "code": "mi", "hreflang": "mi-NZ", "label": "Te reo Māori", "dir": "ltr", "populated": false },
    ...
  ]
}
```

- `code` — the URL path segment and content-folder name.
- `hreflang` — value used for `<html lang>`, `<link rel="alternate" hreflang>`, and `og:locale`.
- `label` — display name (for a future language switcher).
- `dir` — text direction (`ltr`/`rtl`).
- `populated` — whether translated content exists yet.

## What the code does

- **`scripts/languages.js`** — helper: `getLanguageConfig()`, `getLocaleFromPath()`,
  `getLanguage()`, `localizePath()`.
- **`scripts/scripts.js`** (`setupLocale`) — on every page load, detects the
  language from the path, sets `<html lang>` and `dir`, and injects
  `hreflang` alternate links for every configured language plus `x-default`,
  and an `og:locale` meta.
- **`blocks/header/header.js`** and **`blocks/footer/footer.js`** — fetch the
  language-specific nav/footer fragment first
  (`/content/{lang}/nav.plain.html`), falling back to the default English
  fragment (`/content/nav.plain.html`). So a page in a language without a
  translated nav still shows the English nav until one is authored.

## Adding a new language (e.g. Te reo Māori, `mi`)

1. In `/languages.json`, set that language's `"populated": true` (it is already
   listed).
2. Author the translated content under the `/{code}/` folder in Document
   Authoring, e.g. `/mi/news`, `/mi/index`.
3. (Optional) Add a translated nav/footer fragment at `/content/mi/nav` and
   `/content/mi/footer`. Until then, the English nav/footer are used
   automatically.
4. No code changes are required — detection, `hreflang`, and fragment
   resolution all read from `/languages.json` and the path.

## Notes

- Translations of the megamenu/footer copy live entirely in the per-language
  `nav`/`footer` fragments (content-first) — no strings are hardcoded in JS.
- The nav labels are already bilingual (te reo Māori + English) as on the
  source site; full-page translation is a separate content task.
