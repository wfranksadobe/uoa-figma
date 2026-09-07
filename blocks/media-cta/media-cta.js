// Media advisers CTA (News Aug 2026 redesign): a navy rounded banner with a
// line of text and a call-to-action button. Authored as a single row:
// [text] [link]. Purely presentational — decoration just adds class hooks.

/**
 * loads and decorates the media CTA banner
 * @param {Element} block
 */
export default async function decorate(block) {
  const row = block.firstElementChild;
  if (!row) return;
  const cells = [...row.children];
  block.textContent = '';

  const inner = document.createElement('div');
  inner.className = 'media-cta-inner';

  const link = row.querySelector('a');
  cells.forEach((cell) => {
    if (link && cell.contains(link)) return;
    const text = document.createElement('div');
    text.className = 'media-cta-text';
    [...cell.children].forEach((n) => text.append(n));
    if (!cell.children.length && cell.textContent.trim()) {
      const p = document.createElement('p');
      p.textContent = cell.textContent.trim();
      text.append(p);
    }
    if (text.childNodes.length) inner.append(text);
  });

  if (link) {
    link.classList.add('media-cta-button');
    inner.append(link);
  }
  block.append(inner);
}
