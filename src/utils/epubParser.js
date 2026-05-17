import JSZip from 'jszip';
import { buildTextPageBoxes, truncatePreviewText } from './previewRenderer';
import { markersFromPageStarts, pageStartsFromCounts } from './chapterUtils';
import { buildSpinePaths, extractEpubToc } from './epubToc';
import { htmlToPlainText, plainTextToReadingStream } from './textExtract';

function resolvePath(baseDir, href) {
  const parts = `${baseDir}/${href}`.split('/').filter(Boolean);
  const stack = [];
  for (const part of parts) {
    if (part === '..') stack.pop();
    else if (part !== '.') stack.push(part);
  }
  return stack.join('/');
}

function parseXml(xml) {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

function allByLocalName(root, name) {
  return [...root.getElementsByTagName('*')].filter(
    (el) => el.localName === name || el.tagName === name,
  );
}

export async function extractEpubData(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) throw new Error('Invalid EPUB: missing container.xml');

  const containerDoc = parseXml(containerXml);
  const rootfile = allByLocalName(containerDoc, 'rootfile').find(
    (el) => el.getAttribute('media-type')?.includes('package'),
  ) || allByLocalName(containerDoc, 'rootfile')[0];
  const opfPath = rootfile?.getAttribute('full-path');
  if (!opfPath) throw new Error('Invalid EPUB: missing package document');

  const opfXml = await zip.file(opfPath)?.async('string');
  if (!opfXml) throw new Error('Invalid EPUB: missing OPF');

  const opfDoc = parseXml(opfXml);
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : '';

  const manifest = new Map();
  for (const item of allByLocalName(opfDoc, 'item')) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    const mediaType = item.getAttribute('media-type') || '';
    const properties = item.getAttribute('properties') || '';
    if (id && href) manifest.set(id, { href, mediaType, properties });
  }

  const spine = allByLocalName(opfDoc, 'itemref')
    .map((ref) => manifest.get(ref.getAttribute('idref')))
    .filter(Boolean);

  const spinePaths = buildSpinePaths(opfDir, spine);
  const chapterTexts = [];
  const chapterHtml = [];
  const pageWordCounts = [];

  for (const { href, mediaType } of spine) {
    const path = resolvePath(opfDir, href);
    const content = await zip.file(path)?.async('string');
    if (!content) continue;

    const isHtml =
      mediaType.includes('html') ||
      mediaType.includes('xml') ||
      /\.x?html?$/i.test(href);
    const text = isHtml
      ? htmlToPlainText(content)
      : content.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
    if (!text) continue;

    chapterTexts.push(text);
    chapterHtml.push(isHtml ? content : '');
    pageWordCounts.push(plainTextToReadingStream(text).split(/\s+/).filter(Boolean).length);
  }

  if (chapterTexts.length === 0) throw new Error('EPUB contains no readable text');

  const spineLabels = await extractEpubToc(zip, opfDoc, opfDir, manifest, spine, spinePaths, chapterHtml);
  const pageStarts = pageStartsFromCounts(pageWordCounts);
  const documentChapters = markersFromPageStarts(pageStarts, spineLabels, 'Chapter').map((m) => ({
    ...m,
    kind: 'chapter',
  }));

  const pageTexts = chapterTexts.map((chapter) => truncatePreviewText(chapter));

  return {
    text: chapterTexts.map(plainTextToReadingStream).join(' '),
    pageTexts,
    pageWordCounts,
    pageWordBoxes: buildTextPageBoxes(pageTexts),
    documentChapters,
    pdfData: null,
  };
}
