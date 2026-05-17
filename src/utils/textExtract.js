const BLOCK_TAGS = ['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'tr', 'section', 'article'];

/** Scene-break line: * * * or *** with optional spaces */
const SCENE_BREAK_LINE = /^\s*(\*\s*){1,}\s*$/;

export function isSceneBreakLine(line) {
  return SCENE_BREAK_LINE.test(line.trim());
}

/**
 * Convert EPUB/HTML chapter markup to plain text with paragraph breaks preserved.
 * Block elements become `\n\n`; <br> becomes `\n`. Scene-break asterisk lines are removed
 * (they are not useful in RSVP and clutter previews).
 */
export function htmlToPlainText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, nav, noscript, svg').forEach((el) => el.remove());

  for (const tag of BLOCK_TAGS) {
    doc.querySelectorAll(tag).forEach((el) => {
      el.appendChild(doc.createTextNode('\n'));
    });
  }
  doc.querySelectorAll('div').forEach((el) => {
    el.appendChild(doc.createTextNode('\n'));
  });
  doc.querySelectorAll('br').forEach((br) => {
    br.replaceWith(doc.createTextNode('\n'));
  });
  doc.querySelectorAll('hr').forEach((hr) => {
    hr.replaceWith(doc.createTextNode('\n\n'));
  });

  const lines = (doc.body?.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .split('\n')
    .map((l) => l.trim());

  const paragraphs = [];
  let buf = [];

  const flush = () => {
    if (buf.length === 0) return;
    paragraphs.push(buf.join(' '));
    buf = [];
  };

  for (const line of lines) {
    if (!line) {
      flush();
      continue;
    }
    if (isSceneBreakLine(line)) {
      flush();
      continue;
    }
    buf.push(line);
  }
  flush();

  return paragraphs.join('\n\n');
}

/** Flatten to a single stream for RSVP (paragraph boundaries → space). */
export function plainTextToReadingStream(text) {
  return text
    .replace(/\n\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
