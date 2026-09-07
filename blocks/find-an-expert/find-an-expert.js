// "Find an expert" (News Aug 2026 redesign): a heading plus a row of expert
// cards (photo, name, short bio) and a "Find more expert" button.
// Each authored row is one expert: [photo] [name + bio]. An optional first
// row with a single cell is treated as the section heading; an optional final
// row containing only a link becomes the button.

import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * loads and decorates the find-an-expert block
 * @param {Element} block
 */
export default async function decorate(block) {
  const rows = [...block.children];
  block.textContent = '';

  const header = document.createElement('div');
  header.className = 'find-an-expert-header';
  const grid = document.createElement('ul');
  grid.className = 'find-an-expert-grid';
  let button;

  rows.forEach((row) => {
    const cells = [...row.children];
    const hasImg = row.querySelector('picture');
    const onlyLink = !hasImg && cells.length === 1 && row.querySelector('a')
      && row.textContent.trim() === (row.querySelector('a')?.textContent.trim() || '');
    const headingEl = row.querySelector('h1,h2,h3');

    if (onlyLink) {
      button = document.createElement('p');
      button.className = 'find-an-expert-more';
      button.append(row.querySelector('a'));
      return;
    }
    if (!hasImg && headingEl && cells.length === 1) {
      header.append(headingEl);
      return;
    }

    // Expert card.
    const li = document.createElement('li');
    li.className = 'find-an-expert-card';
    const picture = row.querySelector('picture');
    if (picture) {
      const imgWrap = document.createElement('div');
      imgWrap.className = 'find-an-expert-photo';
      const img = picture.querySelector('img');
      imgWrap.append(img
        ? createOptimizedPicture(img.src, img.alt || '', false, [{ width: '300' }])
        : picture);
      li.append(imgWrap);
    }
    const textCell = cells.find((c) => !c.querySelector('picture'));
    if (textCell) {
      const body = document.createElement('div');
      body.className = 'find-an-expert-body';
      [...textCell.children].forEach((n) => body.append(n));
      if (!textCell.children.length && textCell.textContent.trim()) {
        const p = document.createElement('p');
        p.textContent = textCell.textContent.trim();
        body.append(p);
      }
      li.append(body);
    }
    grid.append(li);
  });

  if (header.children.length) block.append(header);
  block.append(grid);
  if (button) block.append(button);
}
