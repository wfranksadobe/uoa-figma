// News search + filter bar (News Aug 2026 redesign). A presentational search
// field with a Filter toggle. On submit it filters the sibling latest-news
// grid on the same page by matching the query against card titles/teasers;
// with no latest-news block present it falls back to navigating to a search
// results path. Keeps behaviour client-side over the existing content.

/**
 * Filter the on-page latest-news cards by a free-text query.
 * @param {string} query
 */
function filterLatestNews(query) {
  const grid = document.querySelector('.latest-news .latest-news-list');
  if (!grid) return false;
  const q = query.trim().toLowerCase();
  grid.querySelectorAll('.latest-news-card').forEach((card) => {
    const text = card.textContent.toLowerCase();
    // eslint-disable-next-line no-param-reassign
    card.hidden = q ? !text.includes(q) : false;
  });
  return true;
}

/**
 * loads and decorates the news search bar
 * @param {Element} block
 */
export default async function decorate(block) {
  const cfg = block.textContent.trim();
  block.textContent = '';

  const form = document.createElement('form');
  form.className = 'news-search-form';
  form.setAttribute('role', 'search');

  const label = document.createElement('label');
  label.className = 'news-search-label';
  label.textContent = 'Search news';
  label.setAttribute('for', 'news-search-input');

  const input = document.createElement('input');
  input.type = 'search';
  input.id = 'news-search-input';
  input.className = 'news-search-input';
  input.placeholder = 'Rapunga / Search News';

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'news-search-submit';
  submit.setAttribute('aria-label', 'Search');
  submit.innerHTML = '<span aria-hidden="true">⌕</span>';

  const filterBtn = document.createElement('button');
  filterBtn.type = 'button';
  filterBtn.className = 'news-search-filter';
  filterBtn.innerHTML = 'Filter <span aria-hidden="true">▾</span>';
  filterBtn.setAttribute('aria-expanded', 'false');
  // The filter button simply scrolls to / reveals the category chips.
  filterBtn.addEventListener('click', () => {
    const chips = document.querySelector('.latest-news .latest-news-chips');
    if (chips) chips.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  form.append(label, input, submit, filterBtn);
  block.append(form);

  const run = (e) => {
    e.preventDefault();
    const handled = filterLatestNews(input.value);
    if (!handled && cfg) window.location.href = `${cfg}?q=${encodeURIComponent(input.value)}`;
  };
  form.addEventListener('submit', run);
  input.addEventListener('input', () => { if (!input.value) filterLatestNews(''); });
}
