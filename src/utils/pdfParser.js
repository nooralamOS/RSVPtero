import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href;

// JBIG2 / JPEG2000 decode needs WASM; wasm + fonts are copied to /wasm and
// /standard_fonts by vite-plugin-static-copy (dev + build).
const assetBase = import.meta.env.BASE_URL.replace(/\/?$/, '/');
export const pdfDocumentBaseOptions = {
  wasmUrl: `${assetBase}wasm/`,
  standardFontDataUrl: `${assetBase}standard_fonts/`,
};

export { pdfjsLib };

export async function extractPDFData(file) {
  const arrayBuffer = await file.arrayBuffer();
  // pdfjs transfers the ArrayBuffer to its worker, so pass a disposable copy
  // for text extraction and keep the original for thumbnail rendering.
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer.slice(0)),
    ...pdfDocumentBaseOptions,
  }).promise;

  const pageTexts = [];
  const pageWordCounts = [];
  const pageWordBoxes = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const rotation = page.rotate || 0;
    const viewport = page.getViewport({ scale: 1, rotation });
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    pageTexts.push(pageText);
    const words = pageText.replace(/\s+/g, ' ').trim().split(' ').filter((w) => w.length > 0);
    pageWordCounts.push(words.length);

    // Build an approximate word → bounding-box map for highlighting.
    // This must never crash PDF parsing; if it fails, we gracefully disable highlights.
    let boxes = null;
    try {
      // Notes:
      // - PDF text "items" can contain multiple words; we split and apportion width per word.
      // - Boxes are in viewport(scale=1) coordinates with origin at top-left.
      const tmp = [];
      for (const item of content.items) {
        const str = 'str' in item ? item.str : '';
        if (!str) continue;

        const rawWords = str.replace(/\s+/g, ' ').trim().split(' ').filter((w) => w.length > 0);
        if (rawWords.length === 0) continue;

        const t = item.transform;
        const x = Array.isArray(t) || typeof t?.length === 'number' ? (t?.[4] ?? 0) : 0;
        const y = Array.isArray(t) || typeof t?.length === 'number' ? (t?.[5] ?? 0) : 0;
        const itemWidth = typeof item.width === 'number' && isFinite(item.width) ? item.width : 0;
        const itemHeight = typeof item.height === 'number' && isFinite(item.height)
          ? item.height
          : Math.abs((t?.[3] ?? 10));

        if (typeof viewport.convertToViewportPoint !== 'function') continue;

        const [vx1, vy1] = viewport.convertToViewportPoint(x, y);
        const [vx2, vy2] = viewport.convertToViewportPoint(x + itemWidth, y + itemHeight);
        const left = Math.min(vx1, vx2);
        const top = Math.min(vy1, vy2);
        const width = Math.abs(vx2 - vx1);
        const height = Math.max(1, Math.abs(vy2 - vy1));
        if (!isFinite(left) || !isFinite(top) || !isFinite(width) || !isFinite(height)) continue;

        const totalChars = rawWords.reduce((acc, w) => acc + w.length, 0) || 1;
        let cursorX = left;
        for (const w of rawWords) {
          const wWidth = width * (w.length / totalChars);
          tmp.push({ x: cursorX, y: top, w: Math.max(1, wWidth), h: height });
          cursorX += wWidth;
        }
      }
      boxes = tmp;
    } catch (e) {
      console.warn('pdfParser: word box extraction failed on page', i, e);
      boxes = null;
    }

    pageWordBoxes.push(boxes ? {
      pageWidth: viewport.width,
      pageHeight: viewport.height,
      words: words.length,
      boxes,
    } : null);
  }

  return {
    text: pageTexts.join(' '),
    pageWordCounts,
    pageWordBoxes,
    pdfData: arrayBuffer,  // original ArrayBuffer, never transferred
  };
}
