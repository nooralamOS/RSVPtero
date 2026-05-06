import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import Controls from './Controls';
import ThumbnailSidebar from './ThumbnailSidebar';
import PagePreviewPopup from './PagePreviewPopup';
import { tokenizeText, getDelayMultiplier, getORPIndex, formatTime, detectChapters } from '../utils/wordUtils';

function WordInner({ word, orpRef }) {
  if (!word) return null;
  const orpIdx = getORPIndex(word);
  const before = word.slice(0, orpIdx);
  const orp = word[orpIdx];
  const after = word.slice(orpIdx + 1);
  return (
    <span className="word-display__word">
      <span className="word-display__before">{before}</span>
      <span ref={orpRef} className="word-display__orp">{orp}</span>
      <span className="word-display__after">{after}</span>
    </span>
  );
}

// Drum roller: all positions driven by a single dragOffsetPx value (-FULL to +FULL).
// t = dragOffsetPx / FULL_DRAG_PX  (−1 … +1)
// Each slot's effective position p = naturalPos − t
// translateY = SLOT_GAP * p,  scale/opacity interpolated from |p|
function WordStage({ words, index, wpm, playing, onSeek, finished, total, onRestart, onWordRect, onWordDoubleClick }) {
  const FULL_DRAG_PX = 70;   // pixels of drag = one full word transition
  const SLOT_GAP     = 82;   // px between slot centres at rest
  const animDuration = wpm >= 300 ? 180 : wpm >= 200 ? 220 : 260;

  const stageRef        = useRef(null);
  const orpAlignRef     = useRef(null);
  const orpRef          = useRef(null);
  const isDraggingRef   = useRef(false);
  const dragStartYRef   = useRef(0);
  const dragStartOffRef = useRef(0);
  const snapRafRef      = useRef(null);
  const scrollCoolRef   = useRef(false);

  const [dragOffsetPx, setDragOffsetPx] = useState(0);
  const dragOffRef = useRef(0);

  const indexRef    = useRef(index);
  const onSeekRef   = useRef(onSeek);
  const wordsLenRef = useRef(words.length);
  const durRef      = useRef(animDuration);
  useEffect(() => { indexRef.current    = index;         }, [index]);
  useEffect(() => { onSeekRef.current   = onSeek;        }, [onSeek]);
  useEffect(() => { wordsLenRef.current = words.length;  }, [words.length]);
  useEffect(() => { durRef.current      = animDuration;  }, [animDuration]);

  // Reset offset when playback starts
  useEffect(() => {
    if (!playing) return;
    cancelAnimationFrame(snapRafRef.current);
    dragOffRef.current = 0;
    setDragOffsetPx(0);
  }, [playing]);

  useEffect(() => () => cancelAnimationFrame(snapRafRef.current), []);

  // Animate dragOffsetPx → target with ease-out-cubic
  const snapTo = useCallback((target, dur) => {
    cancelAnimationFrame(snapRafRef.current);
    const duration   = dur ?? durRef.current;
    const startVal   = dragOffRef.current;
    if (Math.abs(startVal - target) < 0.5) {
      dragOffRef.current = target;
      setDragOffsetPx(target);
      return;
    }
    const t0 = performance.now();
    function tick(now) {
      const p = Math.min((now - t0) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3);
      const v = startVal + (target - startVal) * e;
      dragOffRef.current = v;
      setDragOffsetPx(v);
      if (p < 1) snapRafRef.current = requestAnimationFrame(tick);
    }
    snapRafRef.current = requestAnimationFrame(tick);
  }, []);

  // Advance index and start animation from the natural "from" position
  const commitAndAnimate = useCallback((dir) => {
    const target = Math.max(0, Math.min(wordsLenRef.current - 1, indexRef.current + dir));
    if (target === indexRef.current) return;
    // After index updates, the new current slot (naturalPos 0) should start
    // where it visually was as a neighbour, then snap to centre.
    // That starting offset = −dir * FULL_DRAG_PX.
    dragOffRef.current = -dir * FULL_DRAG_PX;
    setDragOffsetPx(-dir * FULL_DRAG_PX);
    onSeekRef.current(target);
    snapTo(0, durRef.current);
  }, [snapTo]);

  // Finish a drag gesture: commit or snap back
  const handleRelease = useCallback(() => {
    isDraggingRef.current = false;
    stageRef.current?.classList.remove('reader__stage--dragging');
    const d = dragOffRef.current;
    const t = d / FULL_DRAG_PX;

    if (t > 0.35) {
      // Commit forward — continue smoothly from current visual position
      const target = Math.max(0, Math.min(wordsLenRef.current - 1, indexRef.current + 1));
      if (target !== indexRef.current) {
        const after = d - FULL_DRAG_PX; // negative — new current starts slightly below centre
        dragOffRef.current = after;
        setDragOffsetPx(after);
        onSeekRef.current(target);
        snapTo(0, durRef.current * (FULL_DRAG_PX - d) / FULL_DRAG_PX);
      } else {
        snapTo(0);
      }
    } else if (t < -0.35) {
      // Commit backward
      const target = Math.max(0, Math.min(wordsLenRef.current - 1, indexRef.current - 1));
      if (target !== indexRef.current) {
        const after = FULL_DRAG_PX + d; // positive — new current starts slightly above centre
        dragOffRef.current = after;
        setDragOffsetPx(after);
        onSeekRef.current(target);
        snapTo(0, durRef.current * (FULL_DRAG_PX + d) / FULL_DRAG_PX);
      } else {
        snapTo(0);
      }
    } else {
      snapTo(0);
    }
  }, [snapTo]);

  // Attach wheel + touch + mouse listeners (paused only)
  useEffect(() => {
    if (playing || finished) return;

    const onWheel = (e) => {
      e.preventDefault();
      if (scrollCoolRef.current) return;
      scrollCoolRef.current = true;
      cancelAnimationFrame(snapRafRef.current);
      commitAndAnimate(e.deltaY > 0 ? 1 : -1);
      setTimeout(() => { scrollCoolRef.current = false; }, durRef.current + 30);
    };
    const onTouchStart = (e) => {
      cancelAnimationFrame(snapRafRef.current);
      isDraggingRef.current  = true;
      dragStartYRef.current  = e.touches[0].clientY;
      dragStartOffRef.current = dragOffRef.current;
    };
    const onTouchMove = (e) => {
      e.preventDefault();
      if (!isDraggingRef.current) return;
      const dy  = dragStartYRef.current - e.touches[0].clientY;
      const val = Math.max(-FULL_DRAG_PX, Math.min(FULL_DRAG_PX, dragStartOffRef.current + dy));
      dragOffRef.current = val;
      setDragOffsetPx(val);
    };
    const onTouchEnd = () => { if (isDraggingRef.current) handleRelease(); };
    const onMouseDown = (e) => {
      cancelAnimationFrame(snapRafRef.current);
      isDraggingRef.current  = true;
      dragStartYRef.current  = e.clientY;
      dragStartOffRef.current = dragOffRef.current;
      stageRef.current?.classList.add('reader__stage--dragging');
      e.preventDefault();
    };
    const onMouseMove = (e) => {
      if (!isDraggingRef.current) return;
      const dy  = dragStartYRef.current - e.clientY;
      const val = Math.max(-FULL_DRAG_PX, Math.min(FULL_DRAG_PX, dragStartOffRef.current + dy));
      dragOffRef.current = val;
      setDragOffsetPx(val);
    };
    const onMouseUp = () => { if (isDraggingRef.current) handleRelease(); };

    const stage = stageRef.current;
    if (!stage) return;
    stage.addEventListener('wheel',      onWheel,      { passive: false });
    stage.addEventListener('touchstart', onTouchStart, { passive: true  });
    stage.addEventListener('touchmove',  onTouchMove,  { passive: false });
    stage.addEventListener('touchend',   onTouchEnd);
    stage.addEventListener('mousedown',  onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    return () => {
      stage.removeEventListener('wheel',      onWheel);
      stage.removeEventListener('touchstart', onTouchStart);
      stage.removeEventListener('touchmove',  onTouchMove);
      stage.removeEventListener('touchend',   onTouchEnd);
      stage.removeEventListener('mousedown',  onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
    };
  }, [playing, finished, commitAndAnimate, handleRelease]);

  const alignOrpToStage = useCallback(() => {
    const stage   = stageRef.current;
    const alignEl = orpAlignRef.current;
    const orp     = orpRef.current;
    if (!stage || !alignEl || !orp || finished) return;
    alignEl.style.transform = 'translateX(0px)';
    const stageRect  = stage.getBoundingClientRect();
    const orpRect    = orp.getBoundingClientRect();
    const targetX    = stageRect.left + stageRect.width / 2;
    const orpCenterX = orpRect.left + orpRect.width / 2;
    alignEl.style.transform = `translateX(${targetX - orpCenterX}px)`;
  }, [finished]);

  const currentWord = words[index] ?? '';

  useLayoutEffect(() => {
    if (finished) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      alignOrpToStage();
      if (typeof onWordRect === 'function' && orpRef.current) {
        onWordRect(orpRef.current.getBoundingClientRect());
      }
    };
    run();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(run) : null;
    if (ro && stageRef.current) ro.observe(stageRef.current);
    let fontsDone = Promise.resolve();
    if (typeof document !== 'undefined' && document.fonts?.ready) fontsDone = document.fonts.ready;
    fontsDone.then(() => { if (!cancelled) requestAnimationFrame(run); });
    return () => { cancelled = true; ro?.disconnect(); };
  }, [currentWord, index, finished, alignOrpToStage, onWordRect]);

  // Slot transform: naturalPos ∈ {−2,−1,0,1,2}, t drives animation
  const t = dragOffsetPx / FULL_DRAG_PX;
  function slotStyle(naturalPos) {
    const p    = naturalPos - t;
    const absP = Math.abs(p);
    const translateY = SLOT_GAP * p;
    const scale   = absP <= 1 ? 1 - 0.45 * absP : Math.max(0.05, 0.55 - 0.375 * (absP - 1));
    const opacity = absP <= 1 ? Math.max(0, 1 - 0.72 * absP) : Math.max(0, 0.28 * (2 - absP));
    return { transform: `translateY(${translateY}px) scale(${scale})`, opacity };
  }

  const prevPrevWord = index > 1              ? words[index - 2] : '';
  const prevWord     = index > 0              ? words[index - 1] : '';
  const nextWord     = index < words.length-1 ? words[index + 1] : '';
  const nextNextWord = index < words.length-2 ? words[index + 2] : '';

  return (
    <div
      ref={stageRef}
      className={`reader__stage${!playing && !finished ? ' reader__stage--paused' : ''}`}
    >
      <div className="reader__guideline reader__guideline--top" />
      <div className="reader__guideline reader__guideline--bottom" />
      {finished ? (
        <div className="reader__finished">
          <h2>Done!</h2>
          <p>You finished reading {total.toLocaleString()} words.</p>
          <button className="reader__restart-btn" onClick={onRestart}>Read again</button>
        </div>
      ) : (
        <div
          className="drum-roller"
          onDoubleClick={() => !finished && onWordDoubleClick?.()}
        >
          <div className="drum-slot drum-slot--neighbor" style={slotStyle(-2)} aria-hidden="true">{prevPrevWord}</div>
          <div className="drum-slot drum-slot--neighbor" style={slotStyle(-1)} aria-hidden="true">{prevWord}</div>
          <div className="drum-slot" style={slotStyle(0)}>
            <div ref={orpAlignRef} className="word-display__orp-align">
              <WordInner word={currentWord} orpRef={orpRef} />
            </div>
          </div>
          <div className="drum-slot drum-slot--neighbor" style={slotStyle(1)} aria-hidden="true">{nextWord}</div>
          <div className="drum-slot drum-slot--neighbor" style={slotStyle(2)} aria-hidden="true">{nextNextWord}</div>
        </div>
      )}
    </div>
  );
}

export default function Reader({ rawText, fileName, onBack, pdfData, pageWordCounts, pageWordBoxes }) {
  const words = useRef([]);
  const [isReady, setIsReady] = useState(false);
  const [chapters, setChapters] = useState([]);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [wpm, setWpm] = useState(300);
  const [finished, setFinished] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);
  const [previewAnchorRect, setPreviewAnchorRect] = useState(null);
  const [previewSide, setPreviewSide] = useState('right');
  const [wordRect, setWordRect] = useState(null);

  const playingRef = useRef(false);
  const wpmRef = useRef(wpm);
  const indexRef = useRef(0);
  const timeoutRef = useRef(null);
  const nextAtRef = useRef(null);

  const pageStarts = useMemo(() => {
    if (!pageWordCounts?.length) return [];
    const starts = [];
    let acc = 0;
    for (const count of pageWordCounts) {
      starts.push(acc);
      acc += count;
    }
    return starts;
  }, [pageWordCounts]);

  const currentPage = useMemo(() => {
    let cp = 0;
    for (let i = 0; i < pageStarts.length; i++) {
      if (pageStarts[i] <= index) cp = i;
      else break;
    }
    return cp;
  }, [index, pageStarts]);

  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      if (cancelled) return;
      const w = tokenizeText(rawText);
      const ch = detectChapters(w);
      words.current = w;
      setChapters(ch);
      setIsReady(true);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [rawText]);

  useEffect(() => { wpmRef.current = wpm; }, [wpm]);
  useEffect(() => { indexRef.current = index; }, [index]);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { if (previewOpen) setPreviewPage(currentPage); }, [currentPage, previewOpen]);

  const localWordIndex = useMemo(() => {
    if (!pageStarts.length) return 0;
    const start = pageStarts[currentPage] ?? 0;
    return Math.max(0, index - start);
  }, [index, currentPage, pageStarts]);

  const highlightRect = useMemo(() => {
    const page = pageWordBoxes?.[currentPage];
    if (!page?.boxes?.length) return null;
    return page.boxes[localWordIndex] ?? null;
  }, [pageWordBoxes, currentPage, localWordIndex]);

  const scheduleNext = useCallback(() => {
    if (!playingRef.current) return;
    const i = indexRef.current;
    if (i >= words.current.length) {
      setPlaying(false);
      setFinished(true);
      return;
    }
    const word = words.current[i];
    const baseMs = (60 / wpmRef.current) * 1000;
    const ms = baseMs * getDelayMultiplier(word);

    setIndex(i);
    indexRef.current = i + 1;

    const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
    if (nextAtRef.current === null) nextAtRef.current = now;
    nextAtRef.current += ms;
    const delay = Math.max(0, nextAtRef.current - now);
    timeoutRef.current = setTimeout(scheduleNext, delay);
  }, []);

  const play = useCallback(() => {
    if (indexRef.current >= words.current.length) {
      indexRef.current = 0;
      setIndex(0);
      setFinished(false);
    }
    nextAtRef.current = null;
    playingRef.current = true;
    setPlaying(true);
    scheduleNext();
  }, [scheduleNext]);

  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    clearTimeout(timeoutRef.current);
    nextAtRef.current = null;
  }, []);

  const restart = useCallback(() => {
    pause();
    indexRef.current = 0;
    setIndex(0);
    setFinished(false);
  }, [pause]);

  const skip = useCallback((delta) => {
    const wasPaused = !playingRef.current;
    pause();
    const next = Math.max(0, Math.min(words.current.length - 1, indexRef.current + delta));
    indexRef.current = next;
    setIndex(next);
    setFinished(false);
    if (!wasPaused) {
      setTimeout(() => {
        nextAtRef.current = null;
        playingRef.current = true;
        setPlaying(true);
        scheduleNext();
      }, 50);
    }
  }, [pause, scheduleNext]);

  const seek = useCallback((wordIndex) => {
    const wasPaused = !playingRef.current;
    pause();
    const next = Math.max(0, Math.min(words.current.length - 1, wordIndex));
    indexRef.current = next;
    setIndex(next);
    setFinished(false);
    if (!wasPaused) {
      setTimeout(() => {
        nextAtRef.current = null;
        playingRef.current = true;
        setPlaying(true);
        scheduleNext();
      }, 50);
    }
  }, [pause, scheduleNext]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          playingRef.current ? pause() : play();
          break;
        case 'ArrowRight':
          e.preventDefault();
          skip(10);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skip(-10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setWpm((w) => Math.min(2000, w + 50));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setWpm((w) => Math.max(100, w - 50));
          break;
        case 'r':
        case 'R':
          restart();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [play, pause, skip, restart]);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  if (!isReady) {
    return (
      <div className="reader">
        <div className="reader__main">
          <div className="reader__topbar">
            <div className="reader__topbar-left">
              <span className="reader__title">{fileName}</span>
            </div>
            <button className="reader__back-btn" onClick={onBack}>← New file</button>
          </div>
          <div className="reader__stage">
            <div style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>Processing…</div>
          </div>
        </div>
      </div>
    );
  }

  const total = words.current.length;
  const wordsLeft = total - index;
  const timeRemaining = (wordsLeft / wpm) * 60;

  return (
    <div className="reader">
      {pdfData && sidebarOpen && (
        <ThumbnailSidebar
          pdfData={pdfData}
          pageWordCounts={pageWordCounts}
          pageStarts={pageStarts}
          currentPage={currentPage}
          onSeek={seek}
          onPreview={(pageIdx, rect) => { setPreviewPage(pageIdx); setPreviewAnchorRect(rect ?? null); setPreviewSide('right'); setPreviewOpen(true); }}
        />
      )}
      <div className="reader__main">
        <div className="reader__topbar">
          <div className="reader__topbar-left">
            {pdfData && (
              <button
                className={`reader__sidebar-btn${sidebarOpen ? ' reader__sidebar-btn--active' : ''}`}
                onClick={() => setSidebarOpen((o) => !o)}
                title="Toggle page thumbnails"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <rect x="0" y="1" width="4" height="12" rx="1"/>
                  <rect x="6" y="1" width="8" height="3" rx="1" opacity="0.5"/>
                  <rect x="6" y="5.5" width="8" height="3" rx="1" opacity="0.5"/>
                  <rect x="6" y="10" width="8" height="3" rx="1" opacity="0.5"/>
                </svg>
              </button>
            )}
            <span className="reader__title">{fileName}</span>
          </div>
          <button className="reader__back-btn" onClick={() => { pause(); onBack(); }}>
            ← New file
          </button>
        </div>

        <WordStage
          words={words.current}
          index={index}
          wpm={wpm}
          playing={playing}
          onSeek={seek}
          finished={finished}
          total={total}
          onRestart={restart}
          onWordRect={setWordRect}
          onWordDoubleClick={() => {
            setPreviewPage(currentPage);
            setPreviewAnchorRect(wordRect);
            setPreviewSide('left');
            setPreviewOpen(true);
          }}
        />

        {pdfData && (
          <PagePreviewPopup
            open={previewOpen}
            pdfData={pdfData}
            pageIndex={previewPage}
            anchorRect={previewAnchorRect}
            side={previewSide}
            highlightRect={previewPage === currentPage ? highlightRect : null}
            highlightPageIndex={currentPage}
            onClose={() => setPreviewOpen(false)}
          />
        )}

        <Controls
          playing={playing}
          onPlay={play}
          onPause={pause}
          onRestart={restart}
          onSkip={skip}
          onSeek={seek}
          wpm={wpm}
          onWpmChange={setWpm}
          currentIndex={index}
          totalWords={total}
          timeRemaining={timeRemaining}
          chapters={chapters}
        />
      </div>
    </div>
  );
}
