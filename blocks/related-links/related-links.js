// "Related Links" side box (News Aug 2026 redesign): a small titled panel of
// links that sits in the article's right rail. Authored as a list of links,
// optionally preceded by a heading row (defaults to "Related Links").

/**
 * loads and decorates the related-links box
 * @param {Element} block
 */
export default async function decorate(block) {
  const rows = [...block.children];
  block.textContent = '';

  let title = 'Related Links';
  let source = rows;
  const first = rows[0];
  if (first && !first.querySelector('a,ul,ol,li') && first.textContent.trim()) {
    title = first.textContent.trim();
    source = rows.slice(1);
  }

  const heading = document.createElement('h2');
  heading.className = 'related-links-title';
  heading.textContent = title;
  block.append(heading);

  const list = document.createElement('ul');
  list.className = 'related-links-list';
  source.forEach((row) => {
    row.querySelectorAll('a').forEach((a) => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = a.href;
      link.textContent = a.textContent.trim();
      li.append(link);
      list.append(li);
    });
  });
  block.append(list);
}
