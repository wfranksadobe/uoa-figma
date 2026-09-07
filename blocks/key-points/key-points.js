// "Key Points" / "In Brief" callout (News Aug 2026 redesign): a navy tab
// header above a lavender box of ticked bullet points. The authored block is
// a list (or paragraphs); an optional first row that is a single short line is
// treated as the tab label (defaults to "Key Points").

/**
 * loads and decorates the key-points callout
 * @param {Element} block
 */
export default async function decorate(block) {
  const rows = [...block.children];
  block.textContent = '';

  // Determine the label: an authored first row like "Key Points" / "In Brief"
  // that carries no list. Otherwise default.
  let label = 'Key Points';
  let pointsSource = rows;
  const first = rows[0];
  if (first && !first.querySelector('ul,ol,li') && first.textContent.trim().length
    && first.textContent.trim().length < 40) {
    label = first.textContent.trim();
    pointsSource = rows.slice(1);
  }

  const tab = document.createElement('div');
  tab.className = 'key-points-tab';
  tab.textContent = label;

  const boxBody = document.createElement('div');
  boxBody.className = 'key-points-body';

  // Collect bullet items from any authored lists / paragraphs.
  const list = document.createElement('ul');
  list.className = 'key-points-list';
  pointsSource.forEach((row) => {
    const items = row.querySelectorAll('li');
    if (items.length) {
      items.forEach((li) => {
        const item = document.createElement('li');
        item.innerHTML = li.innerHTML;
        list.append(item);
      });
    } else if (row.textContent.trim()) {
      const item = document.createElement('li');
      item.textContent = row.textContent.trim();
      list.append(item);
    }
  });
  boxBody.append(list);

  block.append(tab, boxBody);
}
