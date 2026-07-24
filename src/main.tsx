import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n/config';
import { ErrorBoundary } from './components/ErrorBoundary';

// Service workers caused repeated blank-screen incidents via stale caches
// (old workers serving HTML that referenced deleted hashed chunks). The app
// no longer registers one; instead, defensively remove any worker and cached
// data left over from earlier versions. /sw.js itself is now a self-purging
// "kill switch" for browsers whose page JS never gets a chance to run this.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
      .catch(() => undefined);
    if ('caches' in window) {
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .catch(() => undefined);
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
