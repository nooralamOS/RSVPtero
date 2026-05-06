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

// Drum roller: positions are driven by a single continuous `wordPos` float.
// - wordPos = 0 means words[0] is centered; wordPos = 12.4 means you're between words[12] and words[13]
// - centerIdx = round(wordPos)
// - frac = wordPos - centerIdx
// For a slot at relative offset k (… -2,-1,0,1,2 …):
// - effective position p = k - frac
// - translateY = SLOT_GAP * p,  scale/opacity interpolated from |p|
function WordStage({ words, index, wpm, playing, onSeek, onScrubStart, onScrubEnd, finished, total, onRestart, onWordRect, onWordDoubleClick }) {
  const FULL_DRAG_PX = 70;   // pixels of drag = one word of travel
  const SLOT_GAP     = 82;   // px between slot centres at rest
  const animDuration = wpm >= 300 ? 180 : wpm >= 200 ? 220 : 260;
  const LONG_PRESS_MS = 220;
  const DRAG_ARM_PX = 6;     // start drag after small movement (mouse/pen/touch)

  const stageRef        = useRef(null);
  const orpAlignRef     = useRef(null);
  const orpRef          = useRef(null);
  const isDraggingRef   = useRef(false);
  const dragStartYRef   = useRef(0);
  const dragStartPosRef = useRef(0);
  const pointerDownYRef = useRef(0);
  const pointerDownPosRef = useRef(0);
  const longPressTimerRef = useRef(null);
  const activePointerIdRef = useRef(null);
  const lastPointerYRef = useRef(0);
  const [wordAreaHovering, setWordAreaHovering] = useState(false);
  const snapRafRef      = useRef(null);
  const wheelRafRef     = useRef(null);
  const wheelVelRef     = useRef(0);     // words per ms
  const wheelLastTsRef  = useRef(0);
  const scrubbingRef    = useRef(false);

  const [wordPos, setWordPos] = useState(index);
  const wordPosRef = useRef(index);
  const snappingRef = useRef(false);
  const lastSeekSentRef = useRef(index);

  const indexRef    = useRef(index);
  const onSeekRef   = useRef(onSeek);
  const wordsLenRef = useRef(words.length);
  const durRef      = useRef(animDuration);
  useEffect(() => { indexRef.current    = index;         }, [index]);
  useEffect(() => { onSeekRef.current   = onSeek;        }, [onSeek]);
  useEffect(() => { wordsLenRef.current = words.length;  }, [words.length]);
  useEffect(() => { durRef.current      = animDuration;  }, [animDuration]);

  // Keep the wheel aligned to the current index during playback,
  // and when we're not actively dragging/snapping.
  useEffect(() => {
    if (finished) return;
    if (isDraggingRef.current || snappingRef.current) return;
    wordPosRef.current = index;
    setWordPos(index);
    lastSeekSentRef.current = index;
  }, [index, playing, finished]);

  useEffect(() => () => cancelAnimationFrame(snapRafRef.current), []);
  useEffect(() => () => cancelAnimationFrame(wheelRafRef.current), []);
  useEffect(() => () => clearTimeout(longPressTimerRef.current), []);

  // Animate wordPos → target with ease-out-cubic
  const snapTo = useCallback((target, dur) => {
    cancelAnimationFrame(snapRafRef.current);
    const duration   = dur ?? durRef.current;
    const startVal   = wordPosRef.current;
    if (Math.abs(startVal - target) < 0.002) {
      wordPosRef.current = target;
      setWordPos(target);
      return;
    }
    snappingRef.current = true;
    const t0 = performance.now();
    function tick(now) {
      const p = Math.min((now - t0) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3);
      const v = startVal + (target - startVal) * e;
      wordPosRef.current = v;
      setWordPos(v);
      if (p < 1) {
        snapRafRef.current = requestAnimationFrame(tick);
      } else {
        snappingRef.current = false;
      }
    }
    snapRafRef.current = requestAnimationFrame(tick);
  }, []);

  const clampIndex = useCallback((i) => Math.max(0, Math.min(wordsLenRef.current - 1, i)), []);

  const sendSeekIfChanged = useCallback((nextIdx) => {
    const clamped = clampIndex(nextIdx);
    if (clamped === lastSeekSentRef.current) return;
    lastSeekSentRef.current = clamped;
    onSeekRef.current(clamped);
  }, [clampIndex]);

  const applyDragAtY = useCallback((clientY) => {
    const dy  = dragStartYRef.current - clientY;
    const nextPos = dragStartPosRef.current + (dy / FULL_DRAG_PX);
    wordPosRef.current = nextPos;
    setWordPos(nextPos);
    sendSeekIfChanged(Math.round(nextPos));
  }, [sendSeekIfChanged]);

  const beginDragFromPointerDown = useCallback(() => {
    cancelAnimationFrame(snapRafRef.current);
    isDraggingRef.current = true;
    dragStartYRef.current = pointerDownYRef.current;
    dragStartPosRef.current = pointerDownPosRef.current;
    stageRef.current?.classList.add('reader__stage--dragging');
    // Apply immediately so drag feels instant when it arms.
    applyDragAtY(lastPointerYRef.current);
  }, [applyDragAtY]);

  // Snap to nearest word
  const handleRelease = useCallback(() => {
    isDraggingRef.current = false;
    stageRef.current?.classList.remove('reader__stage--dragging');
    const targetIdx = clampIndex(Math.round(wordPosRef.current));
    // Ensure the rest of the app is synced to where we snapped.
    sendSeekIfChanged(targetIdx);

    const dist = Math.abs(wordPosRef.current - targetIdx); // in words
    const dur = Math.max(90, durRef.current * Math.min(1, dist));
    snapTo(targetIdx, dur);
  }, [snapTo]);

  // Attach wheel + pointer listeners (paused only)
  useEffect(() => {
    if (finished) return;
    const endScrubIfNeeded = () => {
      if (!scrubbingRef.current) return;
      scrubbingRef.current = false;
      onScrubEnd?.();
    };
    const stopWheelInertia = () => {
      if (!wheelRafRef.current) return;
      wheelVelRef.current = 0;
      cancelAnimationFrame(wheelRafRef.current);
      wheelRafRef.current = null;
      snappingRef.current = false;
      endScrubIfNeeded();
      handleRelease();
    };

    const onWheel = (e) => {
      e.preventDefault();
      cancelAnimationFrame(snapRafRef.current);
      if (!scrubbingRef.current) {
        scrubbingRef.current = true;
        onScrubStart?.();
      }

      // PDF-like: apply wheel delta immediately (no lag),
      // then let inertia continue the motion after input stops.
      const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      const deltaPx =
        e.deltaMode === 1 ? e.deltaY * 16 : // DOM_DELTA_LINE
        e.deltaMode === 2 ? e.deltaY * (typeof window !== 'undefined' ? window.innerHeight : 800) : // DOM_DELTA_PAGE
        e.deltaY; // DOM_DELTA_PIXEL

      const deltaWords = (deltaPx / FULL_DRAG_PX);

      // Immediate position update
      let nextPos = wordPosRef.current + deltaWords;
      const minPos = 0;
      const maxPos = Math.max(0, wordsLenRef.current - 1);
      if (nextPos < minPos) nextPos = minPos;
      if (nextPos > maxPos) nextPos = maxPos;
      wordPosRef.current = nextPos;
      setWordPos(nextPos);
      sendSeekIfChanged(Math.round(nextPos));

      // Velocity impulse (words per ms). Use wheel-event dt for stability.
      const dt = wheelLastTsRef.current ? Math.max(8, Math.min(60, now - wheelLastTsRef.current)) : 16;
      wheelLastTsRef.current = now;
      const instVel = deltaWords / dt;
      const prevVel = wheelVelRef.current;
      const prevSign = Math.sign(prevVel);
      const instSign = Math.sign(instVel);

      if (prevSign !== 0 && instSign !== 0 && prevSign !== instSign) {
        // Opposite-direction input should cancel momentum quickly.
        wheelVelRef.current = prevVel * 0.15 + instVel * 0.85;
      } else {
        // Normal smoothing.
        wheelVelRef.current = prevVel * 0.55 + instVel * 0.45;
      }

      if (wheelRafRef.current) return;
      snappingRef.current = true; // prevent prop-index sync while inertia runs

      const step = (ts) => {
        const last = wheelLastTsRef.current || ts;
        const dt = Math.min(48, Math.max(0, ts - last)); // ms
        wheelLastTsRef.current = ts;

        // Integrate
        let nextPos = wordPosRef.current + wheelVelRef.current * dt;

        // Clamp + damp at edges
        const minPos = 0;
        const maxPos = Math.max(0, wordsLenRef.current - 1);
        if (nextPos < minPos) {
          nextPos = minPos;
          wheelVelRef.current *= 0.2;
        } else if (nextPos > maxPos) {
          nextPos = maxPos;
          wheelVelRef.current *= 0.2;
        }

        wordPosRef.current = nextPos;
        setWordPos(nextPos);
        sendSeekIfChanged(Math.round(nextPos));

        // Friction
        const decayPer16 = 0.90;
        const decay = Math.pow(decayPer16, dt / 16);
        wheelVelRef.current *= decay;

        if (Math.abs(wheelVelRef.current) < 0.001) {
          wheelVelRef.current = 0;
          wheelRafRef.current = null;
          snappingRef.current = false;
          endScrubIfNeeded();
          handleRelease();
          return;
        }

        wheelRafRef.current = requestAnimationFrame(step);
      };

      wheelRafRef.current = requestAnimationFrame(step);
    };

    const onPointerMove = (e) => {
      if (!isDraggingRef.current) return;
      if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
      applyDragAtY(e.clientY);
    };
    const onPointerUp = (e) => {
      if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
      clearTimeout(longPressTimerRef.current);
      activePointerIdRef.current = null;
      if (isDraggingRef.current) handleRelease();
      endScrubIfNeeded();
    };
    const onPointerCancel = () => {
      clearTimeout(longPressTimerRef.current);
      activePointerIdRef.current = null;
      if (isDraggingRef.current) handleRelease();
      endScrubIfNeeded();
    };

    const stage = stageRef.current;
    if (!stage) return;
    stage.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    // Best-effort stop when user re-engages pointer while coasting.
    window.addEventListener('pointerdown', stopWheelInertia, { capture: true });

    return () => {
      stage.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('pointerdown', stopWheelInertia, { capture: true });
    };
  }, [finished, handleRelease, sendSeekIfChanged, snapTo, applyDragAtY, onScrubStart, onScrubEnd]);

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

  const getWordAt = (i) => (i >= 0 && i < words.length ? words[i] : '');

  // Slot transform: k is the slot offset from the current centre word.
  const centerIdx = clampIndex(Math.round(wordPos));
  const frac = wordPos - centerIdx;
  const currentWord = getWordAt(centerIdx);

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
  }, [currentWord, centerIdx, finished, alignOrpToStage, onWordRect]);
  function slotStyle(k) {
    const p    = k - frac;
    const absP = Math.abs(p);
    const translateY = SLOT_GAP * p;
    const scale   = absP <= 1 ? 1 - 0.45 * absP : Math.max(0.05, 0.55 - 0.375 * (absP - 1));
    const opacity = absP <= 1 ? Math.max(0, 1 - 0.72 * absP) : Math.max(0, 0.28 * (2 - absP));
    return { transform: `translateY(${translateY}px) scale(${scale})`, opacity };
  }

  const windowOffsets = [-4, -3, -2, -1, 0, 1, 2, 3, 4];

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
          onPointerEnter={(e) => {
            if (playing || finished) return;
            if (e.pointerType === 'mouse' || e.pointerType === 'pen') setWordAreaHovering(true);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse' || e.pointerType === 'pen') setWordAreaHovering(false);
          }}
          onPointerDown={(e) => {
            if (finished) return;
            // Don't require a prior hover event to arm dragging; after pause the first interaction
            // can happen before onPointerEnter fires, which made the first drag attempt a no-op.

            e.stopPropagation();
            // Avoid interfering with desktop double-click; prevent default on touch only.
            if (e.pointerType === 'touch') e.preventDefault();
            if (!scrubbingRef.current) {
              scrubbingRef.current = true;
              onScrubStart?.();
            }

            // Stop wheel inertia on intentional scrub gesture.
            wheelVelRef.current = 0;
            if (wheelRafRef.current) {
              cancelAnimationFrame(wheelRafRef.current);
              wheelRafRef.current = null;
            }

            clearTimeout(longPressTimerRef.current);
            activePointerIdRef.current = e.pointerId;
            lastPointerYRef.current = e.clientY;
            pointerDownYRef.current = e.clientY;
            pointerDownPosRef.current = wordPosRef.current;
            try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }

            longPressTimerRef.current = setTimeout(() => {
              if (activePointerIdRef.current !== e.pointerId) return;
              lastSeekSentRef.current = clampIndex(Math.round(wordPosRef.current));
              beginDragFromPointerDown();
            }, LONG_PRESS_MS);
          }}
          onPointerMove={(e) => {
            if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
            lastPointerYRef.current = e.clientY;
            // Start dragging immediately once the user actually drags (no need to long-press).
            if (!isDraggingRef.current && activePointerIdRef.current !== null) {
              const dy = Math.abs(e.clientY - pointerDownYRef.current);
              if (dy >= DRAG_ARM_PX) {
                clearTimeout(longPressTimerRef.current);
                lastSeekSentRef.current = clampIndex(Math.round(wordPosRef.current));
                beginDragFromPointerDown();
              }
            }
          }}
          onPointerUp={(e) => {
            if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
            clearTimeout(longPressTimerRef.current);
            activePointerIdRef.current = null;
            if (isDraggingRef.current) handleRelease();
            if (scrubbingRef.current) {
              scrubbingRef.current = false;
              onScrubEnd?.();
            }
          }}
          onPointerCancel={() => {
            clearTimeout(longPressTimerRef.current);
            activePointerIdRef.current = null;
            if (isDraggingRef.current) handleRelease();
            if (scrubbingRef.current) {
              scrubbingRef.current = false;
              onScrubEnd?.();
            }
          }}
        >
          {windowOffsets.map((k) => {
            const wordIdx = centerIdx + k;
            const isCenter = k === 0;
            const word = isCenter ? getWordAt(centerIdx) : getWordAt(wordIdx);
            if (!word) return null;
            return (
              <div
                key={`${wordIdx}:${k}`}
                className={`drum-slot${isCenter ? '' : ' drum-slot--neighbor'}`}
                style={slotStyle(k)}
                aria-hidden={!isCenter}
              >
                {isCenter ? (
                  <div
                    ref={orpAlignRef}
                    className="word-display__orp-align"
                  >
                    <WordInner word={word} orpRef={orpRef} />
                  </div>
                ) : (
                  word
                )}
              </div>
            );
          })}
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

  const scrubWasPlayingRef = useRef(false);
  const handleScrubStart = useCallback(() => {
    scrubWasPlayingRef.current = !!playingRef.current;
    if (scrubWasPlayingRef.current) pause();
  }, [pause]);
  const handleScrubEnd = useCallback(() => {
    if (scrubWasPlayingRef.current) {
      scrubWasPlayingRef.current = false;
      play();
    }
  }, [play]);

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
      // Keep global shortcuts working even when the WPM slider (range input) is focused.
      // Still ignore typing-focused controls (text inputs, textareas, contentEditable).
      const target = e.target;
      const tag = target?.tagName;
      const isTextLikeInput =
        tag === 'TEXTAREA' ||
        target?.isContentEditable ||
        (tag === 'INPUT' && target?.type !== 'range');
      if (isTextLikeInput) return;
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
          onScrubStart={handleScrubStart}
          onScrubEnd={handleScrubEnd}
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
