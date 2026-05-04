import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Controls from './Controls';
import ThumbnailSidebar from './ThumbnailSidebar';
import { tokenizeText, getDelayMultiplier, getORPIndex, formatTime, detectChapters } from '../utils/wordUtils';

function wordFontSize(word) {
  const len = word.length;
  if (len <= 4) return 96;
  if (len <= 6) return 80;
  if (len <= 9) return 68;
  if (len <= 13) return 56;
  return 48;
}

// ORP-highlighted word span — no layout concerns, just the text
function WordInner({ word }) {
  if (!word) return null;
  const orpIdx = getORPIndex(word);
  const before = word.slice(0, orpIdx);
  const orp = word[orpIdx];
  const after = word.slice(orpIdx + 1);
  const size = wordFontSize(word);
  return (
    <span className="word-display__word" style={{ fontSize: `${size}px` }}>
      <span className="word-display__before">{before}</span>
      <span className="word-display__orp">{orp}</span>
      <span className="word-display__after">{after}</span>
    </span>
  );
}

// Animated word stage: smooth enter/exit transitions + scroll scrubbing when paused
function WordStage({ words, index, wpm, playing, onSeek, finished, total, onRestart }) {
  const animDuration = wpm >= 200 ? 150 : 250;
  const [animKey, setAnimKey] = useState(0);
  const [exitWord, setExitWord] = useState(null);
  const [direction, setDirection] = useState(1);
  const prevIndexRef = useRef(index);
  const exitTimerRef = useRef(null);
  const stageRef = useRef(null);
  const scrollCooldownRef = useRef(false);
  const touchStartYRef = useRef(null);

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

  // Attach scroll + touch listeners only while paused
  useEffect(() => {
    if (playing || finished) return;
    const el = stageRef.current;
    if (!el) return;

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

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, [playing, finished, advanceOne]);

  const currentWord = words[index] ?? '';
  const prevWord = index > 0 ? words[index - 1] : '';
  const nextWord = index < words.length - 1 ? words[index + 1] : '';
  const dirSuffix = direction > 0 ? 'fwd' : 'bwd';
  const showScrollCue = !playing && !finished;

  return (
    <div
      ref={stageRef}
      className={`reader__stage${showScrollCue ? ' reader__stage--paused' : ''}`}
    >
      {finished ? (
        <div className="reader__finished">
          <h2>Done!</h2>
          <p>You finished reading {total.toLocaleString()} words.</p>
          <button className="reader__restart-btn" onClick={onRestart}>Read again</button>
        </div>
      ) : (
        <>
          <div className={`stage-scroll-cue stage-scroll-cue--up${showScrollCue ? ' stage-scroll-cue--visible' : ''}`}>
            <svg width="14" height="9" viewBox="0 0 14 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1,8 7,2 13,8" />
            </svg>
          </div>

          <div key={`prev-${animKey}`} className="word-context word-context--prev">{prevWord}</div>

          <div className="word-center">
            {exitWord && (
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
              className={`word-display${animKey > 0 ? ` word-display--enter-${dirSuffix}` : ''}`}
              style={{ '--word-dur': `${animDuration}ms` }}
            >
              <WordInner word={currentWord} />
            </div>
          </div>

          <div key={`next-${animKey}`} className="word-context word-context--next">{nextWord}</div>

          <div className={`stage-scroll-cue stage-scroll-cue--down${showScrollCue ? ' stage-scroll-cue--visible' : ''}`}>
            <svg width="14" height="9" viewBox="0 0 14 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1,1 7,7 13,1" />
            </svg>
          </div>
        </>
      )}
    </div>
  );
}

export default function Reader({ rawText, fileName, onBack, pdfData, pageWordCounts }) {
  const words = useRef([]);
  const [isReady, setIsReady] = useState(false);
  const [chapters, setChapters] = useState([]);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [wpm, setWpm] = useState(300);
  const [finished, setFinished] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const playingRef = useRef(false);
  const wpmRef = useRef(wpm);
  const indexRef = useRef(0);
  const timeoutRef = useRef(null);

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

    timeoutRef.current = setTimeout(() => {
      scheduleNext();
    }, ms);
  }, []);

  const play = useCallback(() => {
    if (indexRef.current >= words.current.length) {
      indexRef.current = 0;
      setIndex(0);
      setFinished(false);
    }
    playingRef.current = true;
    setPlaying(true);
    scheduleNext();
  }, [scheduleNext]);

  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    clearTimeout(timeoutRef.current);
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
          setWpm((w) => Math.min(1000, w + 50));
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
        />

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
