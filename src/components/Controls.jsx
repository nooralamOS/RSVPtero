import { formatTime } from '../utils/wordUtils';

export default function Controls({
  playing,
  onPlay,
  onPause,
  onRestart,
  onSkip,
  wpm,
  onWpmChange,
  currentIndex,
  totalWords,
  timeRemaining,
}) {
  const progress = totalWords > 0 ? (currentIndex / totalWords) * 100 : 0;

  return (
    <div className="controls">
      {/* Progress */}
      <div className="controls__progress-wrap">
        <span>{currentIndex.toLocaleString()}</span>
        <div className="controls__progress-bar">
          <div
            className="controls__progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span>{totalWords.toLocaleString()}</span>
      </div>

      {/* Main row */}
      <div className="controls__main">
        {/* Playback */}
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

        {/* WPM slider */}
        <div className="controls__wpm">
          <span className="controls__wpm-label">WPM</span>
          <input
            type="range"
            min={100}
            max={1000}
            step={10}
            value={wpm}
            onChange={(e) => onWpmChange(Number(e.target.value))}
          />
          <span className="controls__wpm-val">{wpm}</span>
        </div>

        {/* Stats */}
        <div className="controls__stats">
          <span>⏱ {formatTime(timeRemaining)} left</span>
        </div>
      </div>

      {/* Shortcuts legend */}
      <div className="controls__shortcuts">
        <div className="shortcut"><kbd>Space</kbd> Play / Pause</div>
        <div className="shortcut"><kbd>←</kbd> Back 10 words</div>
        <div className="shortcut"><kbd>→</kbd> Forward 10 words</div>
        <div className="shortcut"><kbd>↑</kbd> +50 WPM</div>
        <div className="shortcut"><kbd>↓</kbd> −50 WPM</div>
        <div className="shortcut"><kbd>R</kbd> Restart</div>
      </div>
    </div>
  );
}
