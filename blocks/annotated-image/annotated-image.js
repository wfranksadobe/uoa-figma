// University of Auckland annotated image — a rounded lead/inline image with a
// caption below it, matching the article figure styling on the source.
// Content model (up to three rows):
//   row 1: the image
//   row 2: the caption / image description
//   row 3 (optional): alt text for the image (accessibility)

import { createOptimizedPicture } from '../../scripts/aem.js';

export default function decorate(block) {
  const rows = [...block.children];
  const imageRow = rows[0];
  const captionRow = rows[1];
  const altRow = rows[2];

  const img = imageRow?.querySelector('img');
  const captionText = captionRow ? captionRow.textContent.trim() : '';
  const altText = altRow ? altRow.textContent.trim() : '';

  const figure = document.createElement('figure');
  figure.className = 'annotated-image-figure';

  if (img) {
    // Prefer the authored alt row; fall back to the image's own alt.
    const alt = altText || img.getAttribute('alt') || '';
    const optimized = createOptimizedPicture(img.src, alt, false, [{ width: '750' }]);
    figure.append(optimized);
  }

  if (captionText) {
    const caption = document.createElement('figcaption');
    caption.className = 'annotated-image-caption';
    caption.textContent = captionText;
    figure.append(caption);
  }

  block.replaceChildren(figure);
}
