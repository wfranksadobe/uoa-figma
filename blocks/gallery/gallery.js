// Photo gallery (News Aug 2026 redesign): a compact grid of article images.
// When there are more images than visible tiles, the last visible tile shows a
// "View all N photos +" overlay; clicking it reveals the rest. Authored as one
// image per row (or several pictures in one row).

import { createOptimizedPicture } from '../../scripts/aem.js';

const VISIBLE = 6;

/**
 * loads and decorates the gallery
 * @param {Element} block
 */
export default async function decorate(block) {
  const pictures = [...block.querySelectorAll('picture')];
  block.textContent = '';
  block.classList.add('gallery');

  const grid = document.createElement('div');
  grid.className = 'gallery-grid';

  const tiles = pictures.map((pic, i) => {
    const tile = document.createElement('div');
    tile.className = 'gallery-tile';
    const img = pic.querySelector('img');
    tile.append(img
      ? createOptimizedPicture(img.src, img.alt || '', false, [{ width: '500' }])
      : pic);
    if (i >= VISIBLE) tile.hidden = true;
    grid.append(tile);
    return tile;
  });

  block.append(grid);

  const hiddenCount = pictures.length - VISIBLE;
  if (hiddenCount > 0) {
    const last = tiles[VISIBLE - 1];
    const overlay = document.createElement('button');
    overlay.type = 'button';
    overlay.className = 'gallery-more';
    overlay.textContent = `View all ${pictures.length} photos +`;
    overlay.addEventListener('click', () => {
      tiles.forEach((t) => { t.hidden = false; });
      overlay.remove();
    });
    last.append(overlay);
  }
}
