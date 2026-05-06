import { useEffect, useMemo, useRef, useState } from 'react';
import { pdfjsLib, pdfDocumentBaseOptions } from '../utils/pdfParser';

async function renderPage(pdf, pageNum, canvas, targetWidthPx) {
  const page = await pdf.getPage(pageNum);
  const nativeVp = page.getViewport({ scale: 1 });
  const scale = targetWidthPx / nativeVp.width;
  const viewport = page.getViewport({ scale });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return { viewport, nativeVp };
}

export default function PagePreviewPopup({
  open,
  pdfData,
  pageIndex,
  anchorRect,
  side = 'right',
  highlightRect, // {x,y,w,h} in viewport(scale=1) coords
  highlightPageIndex,
  tuning,
  onClose,
}) {
  const [pdf, setPdf] = useState(null);
  const [viewportScale, setViewportScale] = useState(1);
  const [pageAspect, setPageAspect] = useState(1.294);
  const canvasRef = useRef(null);
  const popupRef = useRef(null);
  const dragRef = useRef(null);
  const resizeRef = useRef(null);

  const [manualPos, setManualPos] = useState(null); // {left, top}
  const [viewportWidth, setViewportWidth] = useState(null);

  useEffect(() => {
    if (!open) {
      // Clear stale pdf so the next open always waits for a fresh load.
      setPdf(null);
      return;
    }
    setViewportWidth(tuning?.viewportWidth ?? 332);
    setManualPos(null);
  }, [open, tuning?.viewportWidth]);

  const minViewportWidth = tuning?.viewportWidth?.[1] ?? 220;
  // Clamp max by screen height so the popup never grows taller than the viewport.
  // 90px accounts for popup padding (28px), meta row (~30px), and screen margins (~32px).
  const maxViewportWidth = Math.min(
    tuning?.viewportWidth?.[2] ?? 700,
    Math.floor((window.innerHeight - 90) / Math.max(pageAspect, 0.5)),
  );

  const clampViewportWidth = (w) => Math.max(minViewportWidth, Math.min(maxViewportWidth, w));

  const popupStyle = useMemo(() => {
    if (!anchorRect) return { opacity: 0, pointerEvents: 'none' };
    const padding = 14;
    const gutter = 290;
    const canvasW = viewportWidth ?? tuning?.viewportWidth ?? 332;
    const width = Math.max(240, canvasW + padding * 2);
    const canvasH = canvasW * pageAspect;
    const metaAndGap = 30;
    const desiredHeight = canvasH + padding * 2 + metaAndGap;

    if (manualPos) {
      return {
        left: Math.max(padding, Math.min(manualPos.left, window.innerWidth - width - padding)),
        top: Math.max(padding, Math.min(manualPos.top, window.innerHeight - desiredHeight - padding)),
        width,
      };
    }

    const desiredLeft = side === 'left'
      ? anchorRect.left - width - gutter + (tuning?.offsetX ?? 0)
      : anchorRect.right + gutter + (tuning?.offsetX ?? 0);
    const left = Math.max(padding, Math.min(desiredLeft, window.innerWidth - width - padding));
    const rawTop = side === 'left'
      ? anchorRect.top + (anchorRect.height ?? 0) / 2 - desiredHeight / 2 + (tuning?.offsetY ?? 0)
      : anchorRect.top + (tuning?.offsetY ?? 0);
    const top = Math.max(padding, Math.min(rawTop, window.innerHeight - desiredHeight - padding));
    return { left, top, width };
  }, [
    anchorRect,
    side,
    manualPos,
    tuning?.offsetX,
    tuning?.offsetY,
    tuning?.viewportWidth,
    viewportWidth,
    pageAspect,
  ]);

  useEffect(() => {
    if (!open || !pdfData) return;
    let cancelled = false;
    pdfjsLib.getDocument({
      data: new Uint8Array(pdfData.slice(0)),
      ...pdfDocumentBaseOptions,
    }).promise
      .then((doc) => {
        if (!cancelled) setPdf(doc);
      })
      .catch((err) => console.error('PagePreviewPopup: failed to load PDF', err));
    return () => { cancelled = true; };
  }, [open, pdfData]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      const el = popupRef.current;
      if (!el) return;
      if (e.target?.closest?.('.dialkit-root, .dialkit-panel')) return;
      if (e.target?.closest?.('.controls')) return;
      if (!el.contains(e.target)) onClose?.();
    };
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    return () => window.removeEventListener('pointerdown', onPointerDown, { capture: true });
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !pdf || !canvasRef.current) return;
    let cancelled = false;
    const targetWidth = viewportWidth ?? tuning?.viewportWidth ?? 332;
    renderPage(pdf, pageIndex + 1, canvasRef.current, targetWidth)
      .then(({ viewport, nativeVp }) => {
        if (cancelled) return;
        setViewportScale(viewport.scale);
        if (nativeVp?.width && nativeVp?.height) {
          setPageAspect(nativeVp.height / nativeVp.width);
        }
      })
      .catch((err) => console.error('PagePreviewPopup: render failed', err));
    return () => { cancelled = true; };
  }, [open, pdf, pageIndex, viewportWidth, tuning?.viewportWidth]);

  const shouldHighlight = open && highlightRect && highlightPageIndex === pageIndex && viewportScale > 0;
  const hl = shouldHighlight ? {
    left: highlightRect.x * viewportScale,
    top: highlightRect.y * viewportScale,
    width: highlightRect.w * viewportScale,
    height: highlightRect.h * viewportScale,
  } : null;

  const onViewportDragDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = manualPos?.left ?? popupStyle.left ?? 0;
    const startTop = manualPos?.top ?? popupStyle.top ?? 0;
    dragRef.current = { startX, startY, startLeft, startTop };

    const onMove = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      setManualPos({
        left: d.startLeft + (ev.clientX - d.startX),
        top: d.startTop + (ev.clientY - d.startY),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onViewportResizeDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startW = viewportWidth ?? tuning?.viewportWidth ?? 332;
    resizeRef.current = { startX, startW };

    const onMove = (ev) => {
      const r = resizeRef.current;
      if (!r) return;
      const nextW = clampViewportWidth(Math.round(r.startW + (ev.clientX - r.startX)));
      setViewportWidth(nextW);
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  if (!open) return null;

  const w = clampViewportWidth(viewportWidth ?? tuning?.viewportWidth ?? 332);

  return (
    <div ref={popupRef} className="page-pop" style={popupStyle}>
      <div
        className="page-pop__viewport"
        style={{ width: w }}
        onPointerDown={onViewportDragDown}
      >
        <div className="page-pop__viewport-inner">
          <canvas ref={canvasRef} />
          {hl && <div className="page-pop__highlight" style={hl} />}
        </div>
      </div>
      <div className="page-pop__meta">Page {pageIndex + 1}</div>
      <div
        className="page-pop__resize"
        role="button"
        aria-label="Resize preview"
        onPointerDown={onViewportResizeDown}
      />
    </div>
  );
}

