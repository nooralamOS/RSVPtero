import { useState } from 'react';
import Uploader from './components/Uploader';
import Reader from './components/Reader';
import './styles/main.css';

export default function App() {
  const [session, setSession] = useState(null);

  if (!session) {
    return (
      <Uploader
        onLoad={(data) => setSession(data)}
      />
    );
  }

  return (
    <Reader
      rawText={session.text}
      fileName={session.name}
      pdfData={session.pdfData}
      pageWordCounts={session.pageWordCounts}
      onBack={() => setSession(null)}
    />
  );
}
