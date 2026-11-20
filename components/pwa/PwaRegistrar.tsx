'use client';

import { useEffect } from 'react';

/**
 * Registers the static-export-safe Yuk Main offline-first Service Worker (`/sw.js`).
 */
export function PwaRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const registerSw = () => {
      void navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch(() => {
          // Silently ignore in restricted preview or non-HTTPS contexts
        });
    };

    if (document.readyState === 'complete') {
      registerSw();
    } else {
      window.addEventListener('load', registerSw, { once: true });
      return () => window.removeEventListener('load', registerSw);
    }
  }, []);

  return null;
}
