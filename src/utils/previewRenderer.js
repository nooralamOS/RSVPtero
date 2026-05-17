export const PREVIEW_REF_WIDTH = 332;
/** Max words drawn in EPUB/section text previews (sidebar + popup). */
export const PREVIEW_MAX_WORDS = 150;

const PAGE_BG = '#f8f6f1';
const PAGE_FG = '#1c1917';
const FONT = '15px "Libre Baskerville", Georgia, serif';

export function truncatePreviewText(text, maxWords = PREVIEW_MAX_WORDS) {
  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  let count = 0;

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (count + words.length > maxWords) {
      const remain = maxWords - count;
      if (remain > 0) out.push(words.slice(0, remain).join(' '));
      break;
    }
    out.push(para);
    count += words.length;
  }

  if (count === 0) return '';
  const full = paragraphs.join('\n\n');
  const joined = out.join('\n\n');
  if (joined.length >= full.length && full.split(/\s+/).filter(Boolean).length <= maxWords) {
    return full;
  }
  return `${joined}…`;
}

function splitParagraphs(text) {
  return text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
}

function layoutParagraphs(ctx, paragraphs, width, padding, fontSize, lineHeight) {
  const maxX = width - padding;
  const paraGap = lineHeight * 0.55;
  const boxes = [];
  let x = padding;
  let y = padding + fontSize;

  for (let p = 0; p < paragraphs.length; p++) {
    if (p > 0) y += paraGap;
    const words = paragraphs[p].split(/\s+/).filter(Boolean);
    for (const word of words) {
      const segment = `${word} `;
      const w = ctx.measureText(segment).width;
      if (x > padding && x + w > maxX) {
        x = padding;
        y += lineHeight;
      }
      boxes.push({ x, y: y - fontSize, w: Math.max(1, w), h: lineHeight });
      x += w;
    }
    x = padding;
    y += lineHeight;
  }

  const pageHeight = Math.max(160, y + padding);
  return { boxes, pageHeight };
}

export function renderTextPage(text, canvas, targetWidth) {
  const width = Math.max(120, Math.round(targetWidth));
  const padding = 14;
  const fontSize = width <= 160 ? 9 : 15;
  const lineHeight = fontSize * 1.45;
  const paraGap = lineHeight * 0.55;
  const font = width <= 160 ? `${fontSize}px Georgia, serif` : FONT;

  const paragraphs = splitParagraphs(text);
  const ctx = canvas.getContext('2d');
  ctx.font = font;

  const { boxes, pageHeight } = layoutParagraphs(ctx, paragraphs, width, padding, fontSize, lineHeight);
  canvas.width = width;
  canvas.height = Math.ceil(pageHeight);

  ctx.fillStyle = PAGE_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = PAGE_FG;
  ctx.font = font;

  const maxX = width - padding;
  let x = padding;
  let y = padding + fontSize;

  for (let p = 0; p < paragraphs.length; p++) {
    if (p > 0) y += paraGap;
    const words = paragraphs[p].split(/\s+/).filter(Boolean);
    x = padding;
    for (const word of words) {
      const segment = `${word} `;
      const w = ctx.measureText(segment).width;
      if (x > padding && x + w > maxX) {
        x = padding;
        y += lineHeight;
      }
      ctx.fillText(word, x, y);
      x += w;
    }
    y += lineHeight;
  }

  return {
    aspect: canvas.height / canvas.width,
    pageWidth: width,
    pageHeight: canvas.height,
    boxes,
  };
}

export function buildTextPageBoxes(pageTexts, refWidth = PREVIEW_REF_WIDTH) {
  const canvas = document.createElement('canvas');
  return pageTexts.map((pageText) => {
    const { pageWidth, pageHeight, boxes } = renderTextPage(pageText, canvas, refWidth);
    return {
      pageWidth,
      pageHeight,
      words: boxes.length,
      boxes,
    };
  });
}

export async function renderPdfPage(pdf, pageNum, canvas, targetWidth) {
  const page = await pdf.getPage(pageNum);
  const rotation = page.rotate || 0;
  const nativeVp = page.getViewport({ scale: 1, rotation });
  const scale = targetWidth / nativeVp.width;
  const viewport = page.getViewport({ scale, rotation });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return {
    aspect: viewport.height / viewport.width,
    nativeVp,
    viewport,
  };
}
