import { useState } from 'react';
import Uploader from './components/Uploader';
import Reader from './components/Reader';
import './styles/main.css';

export default function App() {
  const [session, setSession] = useState(null);

  if (!session) {
    return (
      <Uploader
        onLoad={(text, name) => setSession({ text, name })}
      />
    );
  }

  return (
    <Reader
      rawText={session.text}
      fileName={session.name}
      onBack={() => setSession(null)}
    />
  );
}
