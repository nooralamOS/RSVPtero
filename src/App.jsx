import { useState } from 'react';
import Uploader from './components/Uploader';
import Reader from './components/Reader';
import './styles/main.css';
import { DialRoot } from 'dialkit';
import 'dialkit/styles.css';

export default function App() {
  const [session, setSession] = useState(null);

  if (!session) {
    return (
      <>
        {import.meta.env.DEV && <DialRoot position="top-right" />}
        <Uploader onLoad={(data) => setSession(data)} />
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
        pageWordCounts={session.pageWordCounts}
        pageWordBoxes={session.pageWordBoxes}
        onBack={() => setSession(null)}
      />
    </>
  );
}
