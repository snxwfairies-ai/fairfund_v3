'use client';
import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('Global error:', error); }, [error]);

  return (
    <html>
      <body>
        <div className="min-h-screen flex flex-col items-center justify-center text-center px-5"
             style={{ background: '#F8FAFC', fontFamily: 'system-ui, sans-serif' }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-bold mb-6"
               style={{ background: '#FEF2F2', color: '#DC2626', border: '2px solid #FECACA' }}>!</div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: '#0B1D3A' }}>Something went wrong</h1>
          <p className="text-sm mb-6 max-w-sm" style={{ color: '#64748B' }}>
            An unexpected error occurred. Our team has been notified.
          </p>
          <div className="flex gap-3">
            <button onClick={reset}
              className="px-6 py-3 rounded-xl font-bold text-sm text-white transition-all"
              style={{ background: '#0B1D3A' }}>
              Try again
            </button>
            <a href="/"
              className="px-6 py-3 rounded-xl font-semibold text-sm transition-all"
              style={{ border: '1.5px solid #E2E8F0', color: '#0B1D3A', background: 'white' }}>
              Go home
            </a>
          </div>
          {process.env.NODE_ENV === 'development' && (
            <pre className="mt-6 p-4 rounded-lg text-left text-xs overflow-auto max-w-lg"
                 style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
              {error.message}
            </pre>
          )}
        </div>
      </body>
    </html>
  );
}
