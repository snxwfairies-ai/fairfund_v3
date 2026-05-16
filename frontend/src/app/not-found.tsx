import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-5"
         style={{ background: 'linear-gradient(160deg,#0B1D3A 0%,#162B5C 100%)' }}>

      <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-display font-black mb-8"
           style={{ background: 'linear-gradient(135deg,#C9A84C,#E8C96A)', color: '#0B1D3A' }}>F</div>

      <h1 className="font-display text-8xl font-normal mb-2" style={{ color: '#C9A84C' }}>404</h1>
      <h2 className="font-display text-2xl text-white mb-3">Page not found</h2>
      <p className="text-slate-400 text-sm mb-8 max-w-xs">
        This page doesn't exist or you may not have access to it.
      </p>

      <div className="flex gap-3 flex-wrap justify-center">
        <Link href="/"
          className="px-6 py-3 rounded-xl font-bold text-sm transition-all hover:shadow-lg hover:-translate-y-0.5"
          style={{ background: 'linear-gradient(135deg,#C9A84C,#E8C96A)', color: '#0B1D3A' }}>
          ← Back to Home
        </Link>
        <Link href="/dashboard/marketplace"
          className="px-6 py-3 rounded-xl font-semibold text-sm text-white transition-all hover:border-amber-400"
          style={{ border: '1.5px solid rgba(255,255,255,0.2)', background: 'transparent' }}>
          Go to Marketplace
        </Link>
      </div>
    </div>
  );
}
