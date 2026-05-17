import { useEffect, useMemo, useRef, useState } from 'react';
import { pdfjsLib, pdfDocumentBaseOptions } from '../utils/pdfParser';
import { renderPdfPage, renderTextPage, PREVIEW_REF_WIDTH } from '../utils/previewRenderer';

export default function PagePreviewPopup({
  open,
  pdfData,
  pageTexts,
  pageIndex,
  anchorRect,
  side = 'right',
  highlightRect,
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

  const [manualPos, setManualPos] = useState(null);
  const [viewportWidth, setViewportWidth] = useState(null);

  const isPdf = Boolean(pdfData);
  const pageLabel = isPdf ? 'Page' : 'Section';

  useEffect(() => {
    if (!open) {
      setPdf(null);
      return;
    }
    setViewportWidth(tuning?.viewportWidth ?? PREVIEW_REF_WIDTH);
    setManualPos(null);
  }, [open, tuning?.viewportWidth]);

  const minViewportWidth = tuning?.viewportWidth?.[1] ?? 220;
  const maxViewportWidth = Math.min(
    tuning?.viewportWidth?.[2] ?? 700,
    Math.floor((window.innerHeight - 90) / Math.max(pageAspect, 0.5)),
  );

  const clampViewportWidth = (w) => Math.max(minViewportWidth, Math.min(maxViewportWidth, w));

  const popupStyle = useMemo(() => {
    if (!anchorRect) return { opacity: 0, pointerEvents: 'none' };
    const padding = 14;
    const gutter = 290;
    const canvasW = viewportWidth ?? tuning?.viewportWidth ?? PREVIEW_REF_WIDTH;
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
      if (e.target?.closest?.('.reader__stage, .drum-roller')) return;
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
    if (!open || !canvasRef.current) return;
    let cancelled = false;
    const targetWidth = viewportWidth ?? tuning?.viewportWidth ?? PREVIEW_REF_WIDTH;

    const render = async () => {
      try {
        if (pdf) {
          const { aspect, viewport } = await renderPdfPage(pdf, pageIndex + 1, canvasRef.current, targetWidth);
          if (cancelled) return;
          setViewportScale(viewport.scale);
          setPageAspect(aspect);
          return;
        }

        const text = pageTexts?.[pageIndex];
        if (!text) return;
        const { aspect } = renderTextPage(text, canvasRef.current, targetWidth);
        if (cancelled) return;
        setViewportScale(targetWidth / PREVIEW_REF_WIDTH);
        setPageAspect(aspect);
      } catch (err) {
        console.error('PagePreviewPopup: render failed', err);
      }
    };

    render();
    return () => { cancelled = true; };
  }, [open, pdf, pageTexts, pageIndex, viewportWidth, tuning?.viewportWidth]);

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
    onViewportResizeHandleDown('se', e);
  };

  const onViewportResizeHandleDown = (handle, e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = viewportWidth ?? tuning?.viewportWidth ?? PREVIEW_REF_WIDTH;
    const startLeft = manualPos?.left ?? popupStyle.left ?? 0;
    const startTop = manualPos?.top ?? popupStyle.top ?? 0;
    resizeRef.current = { handle, startX, startY, startW, startLeft, startTop };

    const onMove = (ev) => {
      const r = resizeRef.current;
      if (!r) return;

      const dx = ev.clientX - r.startX;
      const dy = ev.clientY - r.startY;
      const aspect = Math.max(0.5, pageAspect || 1);
      const dyToW = dy / aspect;

      const hasN = r.handle.includes('n');
      const hasS = r.handle.includes('s');
      const hasW = r.handle.includes('w');
      const hasE = r.handle.includes('e');

      let deltaW = 0;
      if (hasE) deltaW += dx;
      if (hasW) deltaW -= dx;
      if (hasS) deltaW += dyToW;
      if (hasN) deltaW -= dyToW;

      const nextW = clampViewportWidth(Math.round(r.startW + deltaW));
      const appliedDeltaW = nextW - r.startW;

      let nextLeft = r.startLeft;
      let nextTop = r.startTop;

      if (hasW) nextLeft = r.startLeft - appliedDeltaW;
      if (hasN) nextTop = r.startTop - appliedDeltaW * aspect;

      setViewportWidth(nextW);
      if (hasW || hasN) {
        setManualPos({ left: nextLeft, top: nextTop });
      }
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

  const w = clampViewportWidth(viewportWidth ?? tuning?.viewportWidth ?? PREVIEW_REF_WIDTH);

  return (
    <div ref={popupRef} className="page-pop" style={popupStyle}>
      <div className="page-pop__handles" aria-hidden="true">
        <div className="page-pop__handle page-pop__handle--n"  onPointerDown={(e) => onViewportResizeHandleDown('n', e)} />
        <div className="page-pop__handle page-pop__handle--s"  onPointerDown={(e) => onViewportResizeHandleDown('s', e)} />
        <div className="page-pop__handle page-pop__handle--e"  onPointerDown={(e) => onViewportResizeHandleDown('e', e)} />
        <div className="page-pop__handle page-pop__handle--w"  onPointerDown={(e) => onViewportResizeHandleDown('w', e)} />
        <div className="page-pop__handle page-pop__handle--ne" onPointerDown={(e) => onViewportResizeHandleDown('ne', e)} />
        <div className="page-pop__handle page-pop__handle--nw" onPointerDown={(e) => onViewportResizeHandleDown('nw', e)} />
        <div className="page-pop__handle page-pop__handle--se" onPointerDown={(e) => onViewportResizeHandleDown('se', e)} />
        <div className="page-pop__handle page-pop__handle--sw" onPointerDown={(e) => onViewportResizeHandleDown('sw', e)} />
      </div>
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
      <div className="page-pop__meta">{pageLabel} {pageIndex + 1}</div>
      <div className="page-pop__resize" role="button" aria-label="Resize preview" onPointerDown={onViewportResizeDown} />
    </div>
  );
}
