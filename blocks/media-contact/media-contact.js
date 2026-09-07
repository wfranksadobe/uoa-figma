// University of Auckland media contact — a grey callout box at the foot of an
// article. Content model (five rows):
//   row 1: block title   (e.g. "Media contact")
//   row 2: name          (e.g. "Caryn Wilkinson")
//   row 3: role          (e.g. "Media adviser")
//   row 4: mobile number (e.g. "027 202 6372")  → rendered as "M: <number>"
//   row 5: email address (e.g. "name@auckland.ac.nz") → rendered as "E: <mailto link>"
//
// Renders <h3> + a details block: "<b>Name | Role</b><br>M: number<br>E: email".

export default function decorate(block) {
  const cellText = (row) => ((row?.firstElementChild || row)?.textContent || '').trim();
  const rows = [...block.children];
  const [titleRow, nameRow, roleRow, mobileRow, emailRow] = rows;

  const title = cellText(titleRow) || 'Media contact';
  const name = cellText(nameRow);
  const role = cellText(roleRow);
  const mobile = cellText(mobileRow);
  const email = cellText(emailRow);

  const heading = document.createElement('h3');
  heading.className = 'media-contact-heading';
  heading.textContent = title;

  const details = document.createElement('p');
  details.className = 'media-contact-details';

  // Line 1: name + role, bold and separated by a pipe (matches the source).
  const lead = [name, role].filter(Boolean).join(' | ');
  if (lead) {
    const strong = document.createElement('strong');
    strong.textContent = lead;
    details.append(strong);
  }

  // Line 2: mobile, prefixed "M:".
  if (mobile) {
    if (details.childNodes.length) details.append(document.createElement('br'));
    details.append(`M: ${mobile}`);
  }

  // Line 3: email, prefixed "E:", as a mailto link.
  if (email) {
    if (details.childNodes.length) details.append(document.createElement('br'));
    details.append('E: ');
    const a = document.createElement('a');
    a.href = `mailto:${email}`;
    a.textContent = email;
    details.append(a);
  }

  block.replaceChildren(heading, details);
}
