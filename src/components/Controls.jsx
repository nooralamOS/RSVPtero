import { formatTime } from '../utils/wordUtils';

export default function Controls({
  playing,
  onPlay,
  onPause,
  onRestart,
  onSkip,
  onSeek,
  wpm,
  onWpmChange,
  currentIndex,
  totalWords,
  timeRemaining,
  chapters = [],
}) {
  const progress = totalWords > 0 ? (currentIndex / totalWords) * 100 : 0;

  const handleBarClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(Math.floor(fraction * totalWords));
  };

  return (
    <div className="controls">
      <div className="controls__progress-wrap">
        <span>{currentIndex.toLocaleString()}</span>
        <div className="controls__progress-track" onClick={handleBarClick}>
          <div className="controls__progress-bar">
            <div
              className="controls__progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          {chapters.map((ch) => (
            <div
              key={`${ch.kind ?? 'chapter'}-${ch.wordIndex}-${ch.label}`}
              className={`controls__chapter-marker${ch.kind === 'section' ? ' controls__section-marker' : ''}`}
              style={{ left: `${(ch.wordIndex / totalWords) * 100}%` }}
              title={ch.label}
              onClick={(e) => { e.stopPropagation(); onSeek(ch.wordIndex); }}
            />
          ))}
        </div>
        <span>{totalWords.toLocaleString()}</span>
      </div>

      <div className="controls__main">
        <div className="controls__playback">
          <button className="ctrl-btn" onClick={onRestart} title="Restart">⟳</button>
          <button className="ctrl-btn" onClick={() => onSkip(-10)} title="Back 10 words">«</button>
          <button
            className="ctrl-btn ctrl-btn--play"
            onClick={playing ? onPause : onPlay}
            title={playing ? 'Pause' : 'Play'}
          >
            {playing ? '⏸' : '▶'}
          </button>
          <button className="ctrl-btn" onClick={() => onSkip(10)} title="Forward 10 words">»</button>
        </div>

        <div className="controls__wpm">
          <span className="controls__wpm-label">WPM</span>
          <input
            type="range"
            min={100}
            max={2000}
            step={10}
            value={wpm}
            onChange={(e) => onWpmChange(Number(e.target.value))}
          />
          <span className="controls__wpm-val">{wpm}</span>
        </div>

        <div className="controls__stats">
          <span>⏱ {formatTime(timeRemaining)} left</span>
        </div>
      </div>

      <div className="controls__shortcuts">
        <div className="shortcut"><kbd>Space</kbd> Play / Pause</div>
        <div className="shortcut"><kbd>←</kbd> Back 10 words</div>
        <div className="shortcut"><kbd>→</kbd> Forward 10 words</div>
        <div className="shortcut"><kbd>↑</kbd> +50 WPM</div>
        <div className="shortcut"><kbd>↓</kbd> −50 WPM</div>
        <div className="shortcut"><kbd>R</kbd> Restart</div>
        {chapters.length > 0 && (
          <>
            <div className="shortcut"><kbd>[</kbd> Previous marker</div>
            <div className="shortcut"><kbd>]</kbd> Next marker</div>
          </>
        )}
      </div>
    </div>
  );
}
