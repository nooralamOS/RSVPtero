import { paginateWords } from './paginateText';
import { buildTextPageBoxes } from './previewRenderer';
import { markersFromPageStarts, pageStartsFromCounts } from './chapterUtils';
import { htmlToPlainText, plainTextToReadingStream } from './textExtract';

export async function extractTextData(file) {
  const raw = await file.text();
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  let text = raw.replace(/\r\n/g, '\n').trim();
  if (ext === 'html' || ext === 'htm' || file.type === 'text/html') {
    text = htmlToPlainText(raw);
  } else {
    text = text
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n');
  }

  const readingText = plainTextToReadingStream(text);
  const { pageTexts, pageWordCounts } = paginateWords(readingText);
  const pageStarts = pageStartsFromCounts(pageWordCounts);

  return {
    text: readingText,
    pageTexts,
    pageWordCounts,
    pageWordBoxes: buildTextPageBoxes(pageTexts),
    documentChapters: markersFromPageStarts(pageStarts, null, 'Page'),
  };
}
