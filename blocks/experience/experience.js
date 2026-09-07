// "Experience the University" (News Aug 2026 redesign): a grey band with a
// video/still on the left and a title, blurb and action buttons on the right.
// Authored as two cells per row: [media] [text+buttons]. If the media cell
// contains a video link, clicking the poster swaps in an embedded player.

/**
 * Turn a YouTube/Vimeo watch URL into an embeddable src, or return null.
 * @param {string} url
 * @returns {string|null}
 */
function toEmbed(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu')) {
      const id = u.searchParams.get('v') || u.pathname.split('/').pop();
      return id ? `https://www.youtube.com/embed/${id}?autoplay=1` : null;
    }
    if (u.hostname.includes('vimeo')) {
      const id = u.pathname.split('/').filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}?autoplay=1` : null;
    }
  } catch {
    // not a URL
  }
  return null;
}

/**
 * loads and decorates the experience block
 * @param {Element} block
 */
export default async function decorate(block) {
  const row = block.firstElementChild;
  if (!row) return;
  const cells = [...row.children];
  const mediaCell = cells.find((c) => c.querySelector('picture, a')) || cells[0];
  const textCell = cells.find((c) => c !== mediaCell) || cells[1];

  block.textContent = '';

  const media = document.createElement('div');
  media.className = 'experience-media';
  const picture = mediaCell?.querySelector('picture');
  const videoLink = [...(mediaCell?.querySelectorAll('a') || [])]
    .map((a) => a.href).find((h) => toEmbed(h));

  if (picture) media.append(picture);
  if (videoLink) {
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'experience-play';
    play.setAttribute('aria-label', 'Play video');
    play.innerHTML = '<span aria-hidden="true">▶</span>';
    play.addEventListener('click', () => {
      const iframe = document.createElement('iframe');
      iframe.src = toEmbed(videoLink);
      iframe.title = 'Video';
      iframe.allow = 'autoplay; fullscreen; picture-in-picture';
      iframe.setAttribute('allowfullscreen', '');
      media.textContent = '';
      media.append(iframe);
    });
    media.append(play);
  }

  const content = document.createElement('div');
  content.className = 'experience-content';
  if (textCell) [...textCell.children].forEach((n) => content.append(n));

  block.append(media, content);
}
