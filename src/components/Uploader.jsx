import { useState, useCallback } from 'react';
import { parseDocument, detectDocumentType, formatLabel } from '../utils/documentParser';
import { SAMPLE_TEXT } from '../utils/wordUtils';
import PaperDropzone from './PaperDropzone';
import '../styles/paper-dropzone.css';

export default function Uploader({ onLoad }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const processFile = useCallback(async (file) => {
    const type = detectDocumentType(file);
    if (!file || !type) {
      setError('Please upload a PDF, EPUB, TXT, Markdown, or HTML file.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { text, pageWordCounts, pageWordBoxes, pdfData, pageTexts, documentChapters } = await parseDocument(file);
      onLoad({ text, name: file.name, pageWordCounts, pageWordBoxes, pdfData, pageTexts, documentChapters });
    } catch (e) {
      console.error(e);
      if (e?.message === 'unsupported') {
        setError('Please upload a PDF, EPUB, TXT, Markdown, or HTML file.');
      } else if (e?.message === 'empty') {
        setError('That file appears to be empty.');
      } else {
        setError(`Failed to parse ${formatLabel(type)}. Try another file.`);
      }
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
      setError('Failed to load the preloaded book. Make sure the file exists in /books.');
    } finally {
      setLoading(false);
    }
  }, [processFile]);

  return (
    <div className="uploader">
      <div className="uploader__logo">Zip<span>tero</span></div>

      <PaperDropzone onFileSelect={processFile} />

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
            onClick={() => loadPreloaded({ url: `${import.meta.env.BASE_URL}books/odysseyfagles.pdf`, fileName: 'odysseyfagles.pdf' })}
          >
            The Odyssey
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

      {loading && <p className="uploader__loading">Parsing document…</p>}
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
