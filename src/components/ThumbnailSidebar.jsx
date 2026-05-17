import { useEffect, useLayoutEffect, useRef, useState, memo } from 'react';
import { pdfjsLib, pdfDocumentBaseOptions } from '../utils/pdfParser';
import { renderPdfPage, renderTextPage } from '../utils/previewRenderer';

const THUMB_WIDTH = 148;

async function renderThumbnail(pdf, pageTexts, pageNum, canvas) {
  if (!canvas) return;
  if (pdf) {
    await renderPdfPage(pdf, pageNum, canvas, THUMB_WIDTH);
    return;
  }
  const text = pageTexts?.[pageNum - 1];
  if (text) renderTextPage(text, canvas, THUMB_WIDTH);
}

export default memo(function ThumbnailSidebar({
  pdfData,
  pageTexts,
  pageStarts,
  currentPage,
  onSeek,
  onPreview,
}) {
  const [numPages, setNumPages] = useState(0);
  const pdfRef = useRef(null);
  const listRef = useRef(null);
  const renderedRef = useRef(new Set());

  const isPdf = Boolean(pdfData);
  const pageCount = isPdf ? numPages : (pageTexts?.length ?? 0);

  useEffect(() => {
    if (!pdfData) {
      pdfRef.current = null;
      setNumPages(pageTexts?.length ?? 0);
      return;
    }
    let cancelled = false;
    pdfjsLib.getDocument({
      data: new Uint8Array(pdfData.slice(0)),
      ...pdfDocumentBaseOptions,
    }).promise
      .then((pdf) => {
        if (cancelled) return;
        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
      })
      .catch((err) => console.error('ThumbnailSidebar: failed to load PDF', err));
    return () => { cancelled = true; };
  }, [pdfData, pageTexts?.length]);

  useEffect(() => {
    const total = isPdf ? numPages : (pageTexts?.length ?? 0);
    if (total === 0 || !listRef.current) return;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const pageNum = parseInt(entry.target.dataset.page, 10);
        if (renderedRef.current.has(pageNum)) continue;
        renderedRef.current.add(pageNum);
        const canvas = entry.target.querySelector('canvas');
        renderThumbnail(pdfRef.current, pageTexts, pageNum, canvas);
      }
    }, { rootMargin: '200px' });

    for (const child of listRef.current.children) {
      observer.observe(child);
    }

    return () => observer.disconnect();
  }, [numPages, pageTexts, isPdf]);

  useLayoutEffect(() => {
    const total = isPdf ? numPages : (pageTexts?.length ?? 0);
    if (total === 0 || !listRef.current) return;
    listRef.current
      .querySelector(`[data-page="${currentPage + 1}"]`)
      ?.scrollIntoView({ block: 'end', behavior: 'auto' });
  }, [currentPage, numPages, pageTexts?.length, isPdf]);

  const total = pageCount;

  return (
    <div className="thumb-sidebar">
      <div className="thumb-sidebar__header">{isPdf ? 'Pages' : 'Sections'}</div>
      <div className="thumb-sidebar__list" ref={listRef}>
        {total === 0 && <div className="thumb-sidebar__loading">Loading…</div>}
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            data-page={i + 1}
            className={`thumb-page${i === currentPage ? ' thumb-page--active' : ''}`}
            onClick={() => onSeek(pageStarts[i] ?? 0)}
            onDoubleClick={(e) => onPreview?.(i, e.currentTarget.getBoundingClientRect())}
          >
            <div className="thumb-page__img">
              <canvas />
            </div>
            <span className="thumb-page__num">{i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
