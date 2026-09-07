// University of Auckland news hero carousel (News Aug 2026 redesign).
// Each authored row is a slide: an image, an optional category label, a
// heading, a date, a short description and an optional "Read more" link.
// The block rotates through slides with prev/next controls and dot indicators,
// pausing on hover/focus and respecting prefers-reduced-motion.

import { createOptimizedPicture } from '../../scripts/aem.js';

const AUTOPLAY_MS = 6000;

/**
 * Build one slide element from an authored row, preserving authored content
 * (category label, heading, date, description, link) in source order.
 * @param {Element} row the authored row
 * @param {number} i slide index
 * @returns {HTMLElement}
 */
function buildSlide(row, i) {
  const slide = document.createElement('div');
  slide.className = 'hero-carousel-slide';
  slide.setAttribute('role', 'group');
  slide.setAttribute('aria-roledescription', 'slide');
  slide.setAttribute('aria-label', `${i + 1}`);
  if (i !== 0) slide.setAttribute('aria-hidden', 'true');

  const cells = [...row.children];
  const pictureCell = cells.find((c) => c.querySelector('picture'));
  const contentCells = cells.filter((c) => c !== pictureCell);

  // Background image.
  if (pictureCell) {
    const media = document.createElement('div');
    media.className = 'hero-carousel-media';
    const pic = pictureCell.querySelector('picture');
    const img = pic.querySelector('img');
    if (img) {
      const optimized = createOptimizedPicture(
        img.src,
        img.alt || '',
        i === 0, // eager-load the first slide for LCP
        [{ width: '1600' }],
      );
      media.append(optimized);
    } else {
      media.append(pic);
    }
    slide.append(media);
  }

  // Content overlay: keep the authored blocks (label, heading, date, text,
  // button) in the order the author wrote them.
  const content = document.createElement('div');
  content.className = 'hero-carousel-content';
  contentCells.forEach((cell) => {
    [...cell.children].forEach((node) => content.append(node));
    // also fold in bare text nodes wrapped by the cell
    if (!cell.children.length && cell.textContent.trim()) {
      const p = document.createElement('p');
      p.textContent = cell.textContent.trim();
      content.append(p);
    }
  });
  slide.append(content);
  return slide;
}

/**
 * loads and decorates the hero carousel
 * @param {Element} block
 */
export default async function decorate(block) {
  const rows = [...block.children];
  block.textContent = '';
  block.classList.add('hero-carousel');

  const viewport = document.createElement('div');
  viewport.className = 'hero-carousel-track';
  viewport.setAttribute('aria-live', 'polite');

  const slides = rows.map((row, i) => buildSlide(row, i));
  slides.forEach((s) => viewport.append(s));
  block.append(viewport);

  const total = slides.length;
  if (total === 0) return;

  // Signal that JS has taken over: the CSS first-paint fallback (which forces
  // the first slide visible) stops applying, so only .is-active shows.
  block.classList.add('is-ready');

  // Controls + dots only make sense with more than one slide.
  const controls = document.createElement('div');
  controls.className = 'hero-carousel-controls';
  const dots = [];
  let prevBtn;
  let nextBtn;

  let current = 0;
  const show = (next) => {
    const idx = (next + total) % total;
    slides.forEach((s, i) => {
      const active = i === idx;
      s.classList.toggle('is-active', active);
      s.toggleAttribute('aria-hidden', !active);
    });
    dots.forEach((d, i) => {
      d.classList.toggle('is-active', i === idx);
      d.setAttribute('aria-selected', i === idx ? 'true' : 'false');
    });
    current = idx;
  };

  if (total > 1) {
    prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'hero-carousel-arrow hero-carousel-prev';
    prevBtn.setAttribute('aria-label', 'Previous story');
    prevBtn.innerHTML = '<span aria-hidden="true">‹</span>';

    nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'hero-carousel-arrow hero-carousel-next';
    nextBtn.setAttribute('aria-label', 'Next story');
    nextBtn.innerHTML = '<span aria-hidden="true">›</span>';

    const dotWrap = document.createElement('div');
    dotWrap.className = 'hero-carousel-dots';
    dotWrap.setAttribute('role', 'tablist');
    dotWrap.setAttribute('aria-label', 'Choose story');
    slides.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'hero-carousel-dot';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', `Story ${i + 1}`);
      dot.addEventListener('click', () => show(i));
      dots.push(dot);
      dotWrap.append(dot);
    });

    prevBtn.addEventListener('click', () => show(current - 1));
    nextBtn.addEventListener('click', () => show(current + 1));
    block.append(prevBtn);
    block.append(nextBtn);
    controls.append(dotWrap);
    block.append(controls);
  }

  show(0);

  // Autoplay, unless the user prefers reduced motion. Pause on hover/focus.
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (total > 1 && !reduce) {
    let timer = setInterval(() => show(current + 1), AUTOPLAY_MS);
    const stop = () => { clearInterval(timer); timer = null; };
    const start = () => { if (!timer) timer = setInterval(() => show(current + 1), AUTOPLAY_MS); };
    block.addEventListener('mouseenter', stop);
    block.addEventListener('mouseleave', start);
    block.addEventListener('focusin', stop);
    block.addEventListener('focusout', start);
  }
}
