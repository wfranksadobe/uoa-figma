// University of Auckland pull-quote.
// Content model (three rows):
//   row 1: the quotation text
//   row 2 (optional): who — the person's name
//   row 3 (optional): position — their role / organisation
// Renders <figure><blockquote>…</blockquote><figcaption><span.quote-name>…
// <span.quote-source>…</figcaption></figure>.

export default function decorate(block) {
  const rows = [...block.children];
  const [quoteRow, whoRow, positionRow] = rows;

  const figure = document.createElement('figure');
  figure.className = 'quote-figure';

  const blockquote = document.createElement('blockquote');
  blockquote.className = 'quote-text';
  // Move the authored quote content (paragraphs/text) into the blockquote.
  const quoteCell = quoteRow?.firstElementChild || quoteRow;
  if (quoteCell) {
    while (quoteCell.firstChild) blockquote.append(quoteCell.firstChild);
  }
  figure.append(blockquote);

  // Attribution — separate "who" (name) and "position" rows.
  const who = whoRow ? (whoRow.firstElementChild || whoRow).textContent.trim() : '';
  const position = positionRow ? (positionRow.firstElementChild || positionRow).textContent.trim() : '';
  if (who || position) {
    const caption = document.createElement('figcaption');
    caption.className = 'quote-attribution';
    if (who) {
      const nameEl = document.createElement('span');
      nameEl.className = 'quote-name';
      nameEl.textContent = who;
      caption.append(nameEl);
    }
    if (position) {
      const posEl = document.createElement('span');
      posEl.className = 'quote-source';
      posEl.textContent = position;
      caption.append(posEl);
    }
    figure.append(caption);
  }

  block.replaceChildren(figure);
}
