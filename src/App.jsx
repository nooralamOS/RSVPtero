import { useState, useEffect, useCallback } from 'react';
import Uploader from './components/Uploader';
import Reader from './components/Reader';
import './styles/main.css';
import { DialRoot } from 'dialkit';
import 'dialkit/styles.css';

const THEME_KEY = 'ziptero-theme';

function getInitialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch { /* ignore */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  const [session, setSession] = useState(null);
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  if (!session) {
    return (
      <>
        {import.meta.env.DEV && <DialRoot position="top-right" />}
        <Uploader onLoad={(data) => setSession(data)} theme={theme} onToggleTheme={toggleTheme} />
      </>
    );
  }

  return (
    <>
      {import.meta.env.DEV && <DialRoot position="top-right" />}
      <Reader
        rawText={session.text}
        fileName={session.name}
        pdfData={session.pdfData}
        pageTexts={session.pageTexts}
        pageWordCounts={session.pageWordCounts}
        pageWordBoxes={session.pageWordBoxes}
        documentChapters={session.documentChapters}
        onBack={() => setSession(null)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    </>
  );
}
