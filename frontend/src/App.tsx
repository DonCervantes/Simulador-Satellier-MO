import { useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { loadWasm } from './infrastructure/wasm/keplerWasm';
import './index.css';

export default function App() {
  // Load WASM physics module once on startup.
  // Falls back gracefully to JS propagation if WASM fails.
  useEffect(() => { loadWasm(); }, []);

  return <AppShell />;
}
