/**
 * Language taxonomy helper.
 *
 * Convention: content is organised by a language path prefix, e.g.
 *   /en/news, /mi/news, /zh/news …
 * The default language (English) is also reachable without a prefix.
 * Supported languages and their metadata live in /languages.json.
 */

let cache;

/**
 * Load the language configuration (cached).
 * @returns {Promise<{default:string, languages:Array}>}
 */
export async function getLanguageConfig() {
  if (cache) return cache;
  try {
    const resp = await fetch(`${window.hlx?.codeBasePath || ''}/languages.json`);
    cache = resp.ok ? await resp.json() : null;
  } catch {
    cache = null;
  }
  if (!cache) {
    cache = {
      default: 'en',
      languages: [{
        code: 'en', hreflang: 'en-NZ', label: 'English', dir: 'ltr', populated: true,
      }],
    };
  }
  return cache;
}

/**
 * Extract the language code from a pathname's first segment, if it is a
 * configured language; otherwise return the default language.
 * @param {string} [pathname] defaults to the current path
 * @param {object} config language config (from getLanguageConfig)
 * @returns {string} language code, e.g. 'en'
 */
export function getLocaleFromPath(pathname, config) {
  const codes = (config?.languages || []).map((l) => l.code);
  const path = pathname || window.location.pathname;
  // paths may be prefixed with a content root (e.g. /content) on the dev server
  const seg = path.split('/').filter(Boolean);
  const first = seg.find((s) => codes.includes(s));
  return first || config?.default || 'en';
}

/**
 * Return the config entry for a language code (falls back to default).
 * @param {string} code
 * @param {object} config
 */
export function getLanguage(code, config) {
  const langs = config?.languages || [];
  return langs.find((l) => l.code === code)
    || langs.find((l) => l.code === config?.default)
    || langs[0];
}

/**
 * Build the equivalent path for a given language by swapping the language
 * segment (or inserting one). Keeps the rest of the path intact.
 * @param {string} pathname current path
 * @param {string} targetCode language to switch to
 * @param {object} config
 * @returns {string} rewritten path
 */
export function localizePath(pathname, targetCode, config) {
  const codes = (config?.languages || []).map((l) => l.code);
  const parts = pathname.split('/');
  // find an existing language segment and replace it
  const idx = parts.findIndex((p) => codes.includes(p));
  if (idx !== -1) {
    parts[idx] = targetCode;
    return parts.join('/');
  }
  // no existing prefix: insert after a leading /content root if present, else at root
  const rootIdx = parts[1] === 'content' ? 2 : 1;
  parts.splice(rootIdx, 0, targetCode);
  return parts.join('/');
}
