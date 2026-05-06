import { useRef, useState, useCallback } from 'react';
import { extractPDFData } from '../utils/pdfParser';
import { SAMPLE_TEXT } from '../utils/wordUtils';

export default function Uploader({ onLoad }) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const processFile = useCallback(async (file) => {
    if (!file || file.type !== 'application/pdf') {
      setError('Please upload a valid PDF file.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { text, pageWordCounts, pageWordBoxes, pdfData } = await extractPDFData(file);
      onLoad({ text, name: file.name, pageWordCounts, pageWordBoxes, pdfData });
    } catch (e) {
      console.error(e);
      setError('Failed to parse PDF. Try another file.');
    } finally {
      setLoading(false);
    }
  }, [onLoad]);

  const loadPreloaded = useCallback(async ({ url, fileName }) => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], fileName, { type: 'application/pdf' });
      await processFile(file);
    } catch (e) {
      console.error(e);
      setError('Failed to load the preloaded PDF. Make sure the file exists in /books.');
    } finally {
      setLoading(false);
    }
  }, [processFile]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    processFile(file);
  }, [processFile]);

  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);

  const handleFileChange = (e) => {
    processFile(e.target.files[0]);
    e.target.value = '';
  };

  return (
    <div className="uploader">
      <div className="uploader__logo">Flash<span>Read</span></div>

      <div
        className={`uploader__dropzone${dragging ? ' uploader__dropzone--active' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
      >
        <div className="uploader__icon">📄</div>
        <div className="uploader__title">Drop a PDF here</div>
        <div className="uploader__subtitle">or click to browse your files</div>
        <button
          className="uploader__btn"
          onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
        >
          Choose PDF
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>

      <div className="uploader__preloaded">
        <div className="uploader__preloaded-label">Preloaded books</div>
        <div className="uploader__preloaded-row">
          <button
            className="uploader__preloaded-btn"
            disabled={loading}
            onClick={() => loadPreloaded({ url: `${import.meta.env.BASE_URL}books/Dune pdf.pdf`, fileName: 'Dune.pdf' })}
          >
            Dune
          </button>
          <button
            className="uploader__preloaded-btn"
            disabled={loading}
            onClick={() => loadPreloaded({ url: `${import.meta.env.BASE_URL}books/Dune Messiah - Frank Herbert.pdf`, fileName: 'Dune Messiah - Frank Herbert.pdf' })}
          >
            Dune Messiah
          </button>
          <button
            className="uploader__preloaded-btn"
            disabled={loading}
            onClick={() => loadPreloaded({ url: `${import.meta.env.BASE_URL}books/Iqbal thesis - development of metaphysics.pdf`, fileName: 'Iqbal.pdf' })}
          >
            Iqbal
          </button>
        </div>
      </div>

      {loading && <p className="uploader__loading">Parsing PDF…</p>}
      {error && <p className="uploader__error">{error}</p>}

      <button
        className="uploader__sample-btn"
        onClick={() => onLoad({ text: SAMPLE_TEXT, name: 'Sample Text', pageWordCounts: null, pdfData: null })}
      >
        Try with sample text
      </button>
    </div>
  );
}
