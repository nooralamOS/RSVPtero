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

// Animated word stage: smooth enter/exit transitions + scroll scrubbing when paused
function WordStage({ words, index, wpm, playing, onSeek, finished, total, onRestart, onWordRect, onWordDoubleClick }) {
  const animDuration = wpm >= 200 ? 150 : 250;
  const [animKey, setAnimKey] = useState(0);
  const [exitWord, setExitWord] = useState(null);
  const [direction, setDirection] = useState(1);
  const prevIndexRef = useRef(index);
  const exitTimerRef = useRef(null);
  const stageRef = useRef(null);
  const orpAlignRef = useRef(null);
  const orpRef = useRef(null);
  const scrollCooldownRef = useRef(false);
  const touchStartYRef = useRef(null);
  const dragRef = useRef({ active: false, lastY: 0, accum: 0 });
  const DRAG_PX = 32;

  // Refs so scroll handler is stable and never goes stale
  const indexRef = useRef(index);
  const onSeekRef = useRef(onSeek);
  const wordsLenRef = useRef(words.length);
  useEffect(() => { indexRef.current = index; }, [index]);
  useEffect(() => { onSeekRef.current = onSeek; }, [onSeek]);
  useEffect(() => { wordsLenRef.current = words.length; }, [words.length]);

  // Trigger enter/exit animation whenever the displayed word changes
  useEffect(() => {
    if (index === prevIndexRef.current) return;
    const newDir = index > prevIndexRef.current ? 1 : -1;
    const prevIdx = prevIndexRef.current;
    prevIndexRef.current = index;

    setExitWord(words[prevIdx] ?? '');
    setDirection(newDir);
    setAnimKey((k) => k + 1);

    clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => setExitWord(null), animDuration);
    return () => clearTimeout(exitTimerRef.current);
  }, [index, words, animDuration]);

  // Debounced single-word advance for scroll scrubbing
  const advanceOne = useCallback((dir) => {
    if (scrollCooldownRef.current) return;
    scrollCooldownRef.current = true;
    const next = Math.max(0, Math.min(wordsLenRef.current - 1, indexRef.current + dir));
    onSeekRef.current(next);
    setTimeout(() => { scrollCooldownRef.current = false; }, 150);
  }, []);

  // No-cooldown seek for drag (threshold is the rate limiter)
  const seekDirect = useCallback((dir) => {
    const next = Math.max(0, Math.min(wordsLenRef.current - 1, indexRef.current + dir));
    onSeekRef.current(next);
  }, []);

  // Attach scroll + touch + mouse-drag listeners while paused
  useEffect(() => {
    if (playing || finished) return;

    const onWheel = (e) => {
      e.preventDefault();
      advanceOne(e.deltaY > 0 ? 1 : -1);
    };
    const onTouchStart = (e) => {
      touchStartYRef.current = e.touches[0].clientY;
    };
    const onTouchMove = (e) => {
      e.preventDefault();
      if (touchStartYRef.current === null) return;
      const delta = touchStartYRef.current - e.touches[0].clientY;
      if (Math.abs(delta) > 25) {
        advanceOne(delta > 0 ? 1 : -1);
        touchStartYRef.current = e.touches[0].clientY;
      }
    };
    const onMouseDown = (e) => {
      dragRef.current = { active: true, lastY: e.clientY, accum: 0 };
      stageRef.current?.classList.add('reader__stage--dragging');
      e.preventDefault();
    };
    const onMouseMove = (e) => {
      if (!dragRef.current.active) return;
      const dy = e.clientY - dragRef.current.lastY;
      dragRef.current.lastY = e.clientY;
      dragRef.current.accum += dy;
      while (dragRef.current.accum <= -DRAG_PX) {
        seekDirect(1);
        dragRef.current.accum += DRAG_PX;
      }
      while (dragRef.current.accum >= DRAG_PX) {
        seekDirect(-1);
        dragRef.current.accum -= DRAG_PX;
      }
    };
    const onMouseUp = () => {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;
      stageRef.current?.classList.remove('reader__stage--dragging');
    };

    const stage = stageRef.current;
    if (!stage) return;

    // Bind wheel/touch to the stage only so scrolling the thumbnail sidebar (or
    // controls/topbar) does not scrub words.
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('touchstart', onTouchStart, { passive: true });
    stage.addEventListener('touchmove', onTouchMove, { passive: false });
    stage.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('touchstart', onTouchStart);
      stage.removeEventListener('touchmove', onTouchMove);
      stage.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [playing, finished, advanceOne, seekDirect]);

  const alignOrpToStage = useCallback(() => {
    const stage = stageRef.current;
    const alignEl = orpAlignRef.current;
    const orp = orpRef.current;
    if (!stage || !alignEl || !orp || finished) return;
    alignEl.style.transform = 'translateX(0px)';
    const stageRect = stage.getBoundingClientRect();
    const orpRect = orp.getBoundingClientRect();
    const targetX = stageRect.left + stageRect.width / 2;
    const orpCenterX = orpRect.left + orpRect.width / 2;
    const dx = targetX - orpCenterX;
    alignEl.style.transform = `translateX(${dx}px)`;
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
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(run)
      : null;
    if (ro && stageRef.current) ro.observe(stageRef.current);
    let fontsDone = Promise.resolve();
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      fontsDone = document.fonts.ready;
    }
    fontsDone.then(() => {
      if (!cancelled) requestAnimationFrame(run);
    });
    return () => {
      cancelled = true;
      ro?.disconnect();
    };
  }, [currentWord, index, animKey, finished, alignOrpToStage, onWordRect]);
  const prevWord = index > 0 ? words[index - 1] : '';
  const nextWord = index < words.length - 1 ? words[index + 1] : '';
  const dirSuffix = direction > 0 ? 'fwd' : 'bwd';
  // Stable keys during playback so context words never remount while playing
  const prevKey = playing ? 'prev' : `prev-${animKey}`;
  const nextKey = playing ? 'next' : `next-${animKey}`;

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
        <>
          <div key={prevKey} className="word-context word-context--prev">{prevWord}</div>

          <div className="word-center" onDoubleClick={() => !finished && onWordDoubleClick?.()}>
            {exitWord && !playing && (
              <div
                key={`exit-${animKey}`}
                className={`word-display word-display--exit word-display--exit-${dirSuffix}`}
                style={{ '--word-dur': `${animDuration}ms` }}
              >
                <WordInner word={exitWord} />
              </div>
            )}
            <div
              key={`enter-${animKey}`}
              className={`word-display${!playing && animKey > 0 ? ` word-display--enter-${dirSuffix}` : ''}`}
              style={{ '--word-dur': `${animDuration}ms` }}
            >
              <div ref={orpAlignRef} className="word-display__orp-align">
                <WordInner word={currentWord} orpRef={orpRef} />
              </div>
            </div>
          </div>

          <div key={nextKey} className="word-context word-context--next">{nextWord}</div>
        </>
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
