import { useState, useEffect, useRef, useCallback } from 'react';
import Controls from './Controls';
import { tokenizeText, getDelayMultiplier, getORPIndex, formatTime } from '../utils/wordUtils';

function wordFontSize(word) {
  const len = word.length;
  if (len <= 4) return 96;
  if (len <= 6) return 80;
  if (len <= 9) return 68;
  if (len <= 13) return 56;
  return 48;
}

function WordDisplay({ word }) {
  if (!word) return <div className="word-display" />;
  const orpIdx = getORPIndex(word);
  const before = word.slice(0, orpIdx);
  const orp = word[orpIdx];
  const after = word.slice(orpIdx + 1);
  const size = wordFontSize(word);

  return (
    <div className="word-display">
      <span
        className="word-display__word"
        style={{ fontSize: `${size}px` }}
      >
        <span className="word-display__before">{before}</span>
        <span className="word-display__orp">{orp}</span>
        <span className="word-display__after">{after}</span>
      </span>
    </div>
  );
}

export default function Reader({ rawText, fileName, onBack }) {
  const words = useRef(tokenizeText(rawText));
  const total = words.current.length;

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [wpm, setWpm] = useState(300);
  const [finished, setFinished] = useState(false);

  const playingRef = useRef(false);
  const wpmRef = useRef(wpm);
  const indexRef = useRef(0);
  const timeoutRef = useRef(null);

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
      // resume after a tiny delay so state flushes
      setTimeout(() => {
        playingRef.current = true;
        setPlaying(true);
        scheduleNext();
      }, 50);
    }
  }, [pause, scheduleNext]);

  // Keyboard handler
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

  // Cleanup on unmount
  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const currentWord = words.current[index] ?? '';
  const prevWord = index > 0 ? words.current[index - 1] : '';
  const nextWord = index < total - 1 ? words.current[index + 1] : '';
  const wordsLeft = total - index;
  const timeRemaining = (wordsLeft / wpm) * 60;

  return (
    <div className="reader">
      {/* Top bar */}
      <div className="reader__topbar">
        <span className="reader__title">{fileName}</span>
        <button className="reader__back-btn" onClick={() => { pause(); onBack(); }}>
          ← New file
        </button>
      </div>

      {/* Stage */}
      <div className="reader__stage">
        {finished ? (
          <div className="reader__finished">
            <h2>Done!</h2>
            <p>You finished reading {total.toLocaleString()} words.</p>
            <button className="reader__restart-btn" onClick={restart}>Read again</button>
          </div>
        ) : (
          <>
            <div className="word-context word-context--prev">{prevWord}</div>
            <WordDisplay word={currentWord} />
            <div className="word-context word-context--next">{nextWord}</div>
          </>
        )}
      </div>

      {/* Controls */}
      <Controls
        playing={playing}
        onPlay={play}
        onPause={pause}
        onRestart={restart}
        onSkip={skip}
        wpm={wpm}
        onWpmChange={setWpm}
        currentIndex={index}
        totalWords={total}
        timeRemaining={timeRemaining}
      />
    </div>
  );
}
