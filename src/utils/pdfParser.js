import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href;

export { pdfjsLib };

export async function extractPDFData(file) {
  const arrayBuffer = await file.arrayBuffer();
  // pdfjs transfers the ArrayBuffer to its worker, so pass a disposable copy
  // for text extraction and keep the original for thumbnail rendering.
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise;

  const pageTexts = [];
  const pageWordCounts = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    pageTexts.push(pageText);
    const words = pageText.replace(/\s+/g, ' ').trim().split(' ').filter((w) => w.length > 0);
    pageWordCounts.push(words.length);
  }

  return {
    text: pageTexts.join(' '),
    pageWordCounts,
    pdfData: arrayBuffer,  // original ArrayBuffer, never transferred
  };
}
