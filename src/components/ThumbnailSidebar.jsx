import { useEffect, useLayoutEffect, useRef, useState, memo } from 'react';
import { pdfjsLib, pdfDocumentBaseOptions } from '../utils/pdfParser';

async function renderPageToCanvas(pdf, pageNum, canvas) {
  if (!canvas) return;
  const page = await pdf.getPage(pageNum);
  const rotation = page.rotate || 0;
  const nativeVp = page.getViewport({ scale: 1, rotation });
  const scale = 148 / nativeVp.width;
  const viewport = page.getViewport({ scale, rotation });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
}

// memo() prevents re-renders on every word — this only re-renders when currentPage changes
// (roughly once per page, not once per word).
export default memo(function ThumbnailSidebar({ pdfData, pageWordCounts, pageStarts, currentPage, onSeek, onPreview }) {
  const [numPages, setNumPages] = useState(0);
  const pdfRef = useRef(null);
  const listRef = useRef(null);
  const renderedRef = useRef(new Set());

  useEffect(() => {
    if (!pdfData) return;
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
  }, [pdfData]);

  // Lazy-render canvases only as pages scroll into view — no per-element ref callbacks.
  useEffect(() => {
    if (!pdfRef.current || numPages === 0 || !listRef.current) return;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const pageNum = parseInt(entry.target.dataset.page, 10);
        if (renderedRef.current.has(pageNum)) continue;
        renderedRef.current.add(pageNum);
        const canvas = entry.target.querySelector('canvas');
        renderPageToCanvas(pdfRef.current, pageNum, canvas);
      }
    }, { rootMargin: '200px' });

    for (const child of listRef.current.children) {
      observer.observe(child);
    }

    return () => observer.disconnect();
  }, [numPages]);

  // Scroll active page into view when currentPage changes, and again once thumbnails exist
  // (sidebar unmounts when closed; on open numPages is 0 until PDF loads, so a currentPage-only effect would miss).
  useLayoutEffect(() => {
    if (numPages === 0 || !listRef.current) return;
    listRef.current
      .querySelector(`[data-page="${currentPage + 1}"]`)
      ?.scrollIntoView({ block: 'end', behavior: 'auto' });
  }, [currentPage, numPages]);

  return (
    <div className="thumb-sidebar">
      <div className="thumb-sidebar__header">Pages</div>
      <div className="thumb-sidebar__list" ref={listRef}>
        {numPages === 0 && <div className="thumb-sidebar__loading">Loading…</div>}
        {Array.from({ length: numPages }, (_, i) => (
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
