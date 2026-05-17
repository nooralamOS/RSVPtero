import { useRef, useState, useCallback } from 'react';
import { useDialKit } from 'dialkit';
import { ACCEPT_ATTR } from '../utils/documentParser';

const CURL_DEFAULTS = {
  size: { base: 100, hover: 120, drag: 120 },
  fold: { angle: 54, radius: 2 },
  shadow: {
    underOpacity: 0.02,
    underBlur: 7,
    underScale: 0.9,
    underOffset: 8,
    ontoPageOpacity: 0.28,
    ontoPageBlur: 5,
    ontoPageOffset: 0,
    innerOpacity: 0.08,
  },
  highlight: { opacity: 0.1, spread: 1 },
  colors: { back1: '#e9e4dd', back2: '#e7e2da', back3: '#e7e2da' },
  paper: { surfaceRadius: 0 },
  previewState: 'default',
};

export default function PaperDropzone({ onFileSelect }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const p = useDialKit('Paper Curl', {
    previewState: {
      type: 'select',
      options: ['default', 'hover', 'drag'],
      default: 'default',
    },
    size: {
      base: [100, 60, 240],
      hover: [120, 60, 260],
      drag: [120, 60, 280],
    },
    fold: {
      angle: [54, 35, 65],
      radius: [2, 0, 48],
    },
    shadow: {
      underOpacity: [0.02, 0, 0.7],
      underBlur: [7, 0, 32],
      underScale: [0.9, 0.5, 1.3],
      underOffset: [8, 0, 24],
      ontoPageOpacity: [0.28, 0, 0.5],
      ontoPageBlur: [5, 0, 32],
      ontoPageOffset: [0, 0, 24],
      innerOpacity: [0.08, 0, 0.4],
    },
    highlight: {
      opacity: [0.1, 0, 1],
      spread: [1, 0, 12],
    },
    colors: {
      back1: '#e9e4dd',
      back2: '#e7e2da',
      back3: '#e7e2da',
    },
    paper: {
      surfaceRadius: [0, 0, 48],
    },
  });

  const dial = import.meta.env.DEV ? p : CURL_DEFAULTS;
  const preview = import.meta.env.DEV ? dial.previewState : 'default';

  const curlVars = {
    '--curl-fold': `${dial.fold.angle}%`,
    '--curl-radius': `${dial.fold.radius}px`,
    '--curl-shadow-opacity': dial.shadow.underOpacity,
    '--curl-shadow-blur': `${dial.shadow.underBlur}px`,
    '--curl-shadow-scale': dial.shadow.underScale,
    '--curl-shadow-offset': `${dial.shadow.underOffset}px`,
    '--curl-drop-opacity': dial.shadow.ontoPageOpacity,
    '--curl-drop-blur': `${dial.shadow.ontoPageBlur}px`,
    '--curl-drop-offset': `${dial.shadow.ontoPageOffset}px`,
    '--curl-inner-opacity': dial.shadow.innerOpacity,
    '--curl-highlight-opacity': dial.highlight.opacity,
    '--curl-highlight-spread': `${dial.highlight.spread}%`,
    '--curl-color-1': dial.colors.back1,
    '--curl-color-2': dial.colors.back2,
    '--curl-color-3': dial.colors.back3,
    '--paper-surface-radius': `${dial.paper.surfaceRadius}px`,
    '--curl-size-base': `${dial.size.base}px`,
    '--curl-size-hover': `${dial.size.hover}px`,
    '--curl-size-drag': `${dial.size.drag}px`,
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFileSelect(file);
  }, [onFileSelect]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => {
    setDragging(false);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) onFileSelect(file);
    e.target.value = '';
  };

  const stateClass = preview === 'drag'
    ? 'paper-dropzone--dragging'
    : preview === 'hover'
      ? 'paper-dropzone--hover-preview'
      : dragging
        ? 'paper-dropzone--dragging'
        : '';

  return (
    <div className="paper-dropzone-wrapper">
      <div
        className={`paper-dropzone ${stateClass}`}
        style={curlVars}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
      >
        <div className="paper-surface">
          <div className="paper-content">
            <h2 className="paper-title">Drop a book here</h2>
            <p className="paper-subtitle">PDF, EPUB, TXT, Markdown, or HTML</p>
            <button
              className="paper-btn"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
            >
              Choose file
            </button>
          </div>

          <div className="paper-curl-container">
            <div className="paper-curl-shadow" />
            <div className="paper-curl">
              <div className="paper-curl-highlight" />
            </div>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
