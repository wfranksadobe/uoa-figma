// "Share" control (News Aug 2026 redesign): a small titled panel with share
// buttons for Facebook, LinkedIn, Instagram and a copy-link action. Uses the
// current page URL. A `share (colour)` block variant swaps to the navy theme
// via CSS. No authored content is required.

const NETWORKS = [
  {
    name: 'Facebook',
    href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    glyph: 'f',
  },
  {
    name: 'LinkedIn',
    href: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    glyph: 'in',
  },
  {
    name: 'Instagram',
    href: () => 'https://www.instagram.com/universityofauckland',
    glyph: 'ig',
  },
];

/**
 * loads and decorates the share panel
 * @param {Element} block
 */
export default async function decorate(block) {
  block.textContent = '';
  const url = encodeURIComponent(window.location.href);

  const title = document.createElement('h2');
  title.className = 'share-title';
  title.textContent = 'Share';
  block.append(title);

  const row = document.createElement('div');
  row.className = 'share-buttons';

  NETWORKS.forEach((n) => {
    const a = document.createElement('a');
    a.className = `share-button share-${n.name.toLowerCase()}`;
    a.href = n.href(url);
    a.target = '_blank';
    a.rel = 'noopener';
    a.setAttribute('aria-label', `Share on ${n.name}`);
    a.innerHTML = `<span aria-hidden="true">${n.glyph}</span>`;
    row.append(a);
  });

  // Copy-link button.
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'share-button share-copy';
  copy.setAttribute('aria-label', 'Copy link');
  copy.innerHTML = '<span aria-hidden="true">🔗</span>';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      copy.classList.add('is-copied');
      setTimeout(() => copy.classList.remove('is-copied'), 1500);
    } catch {
      // clipboard unavailable — no-op
    }
  });
  row.append(copy);

  block.append(row);
}
