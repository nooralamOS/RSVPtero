import { extractPDFData } from './pdfParser';
import { extractEpubData } from './epubParser';
import { extractTextData } from './textParser';

const EXTENSION_TYPES = {
  pdf: 'pdf',
  epub: 'epub',
  txt: 'text',
  text: 'text',
  md: 'text',
  markdown: 'text',
  html: 'text',
  htm: 'text',
};

const MIME_TYPES = {
  'application/pdf': 'pdf',
  'application/epub+zip': 'epub',
  'application/x-epub+zip': 'epub',
  'text/plain': 'text',
  'text/markdown': 'text',
  'text/html': 'text',
};

export const SUPPORTED_EXTENSIONS = Object.keys(EXTENSION_TYPES);
export const ACCEPT_ATTR = '.pdf,.epub,.txt,.md,.html,.htm,application/pdf,application/epub+zip,text/plain,text/markdown,text/html';

export function detectDocumentType(file) {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (EXTENSION_TYPES[ext]) return EXTENSION_TYPES[ext];
  if (MIME_TYPES[file.type]) return MIME_TYPES[file.type];
  return null;
}

export function formatLabel(type) {
  if (type === 'pdf') return 'PDF';
  if (type === 'epub') return 'EPUB';
  return 'document';
}

export async function parseDocument(file) {
  const type = detectDocumentType(file);
  if (!type) throw new Error('unsupported');

  if (type === 'pdf') {
    const data = await extractPDFData(file);
    return { ...data, format: 'pdf' };
  }

  if (type === 'epub') {
    const data = await extractEpubData(file);
    return { ...data, format: 'epub' };
  }

  const data = await extractTextData(file);
  if (!data.text) throw new Error('empty');
  return { ...data, pdfData: null, format: 'text' };
}
