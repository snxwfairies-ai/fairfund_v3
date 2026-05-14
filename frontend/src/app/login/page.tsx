'use client';

import { useState, FormEvent } from 'react';
import { useAuth } from '@/lib/auth';

const DEMOS = [
  { label: 'Investor',      email: 'prashant@fairefund.in' },
  { label: 'SME Admin',     email: 'riya@agritech.in' },
  { label: 'Admin',         email: 'admin@fairefund.in' },
  { label: 'Compliance',    email: 'compliance@fairefund.in' },
];

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode]     = useState<'login' | 'register'>('login');
  const [form, setForm]     = useState<Record<string,string>>({ name:'', email:'prashant@fairefund.in', password:'fairefund123', role:'investor', phone:'', pan:'', referral_code:'' });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else                  await register(form as any);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg, #0B1D3A 0%, #0D2550 60%, #162B5C 100%)' }}>

      {/* ── Left brand panel ─────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-center px-20 flex-1 text-white max-w-xl">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl font-display font-black mb-8"
             style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C96A)', color: '#0B1D3A' }}>F</div>
        <h1 className="font-display text-5xl leading-tight mb-4">
          India's MSME<br />
          <span style={{ color: '#C9A84C' }}>Investment Exchange</span>
        </h1>
        <p className="text-slate-400 text-lg leading-relaxed mb-10">
          SEBI-aligned private placement. Escrow-protected. Cap-table automated.
        </p>
        <div className="space-y-4">
          {[
            { icon: '🔐', text: 'Full KYC/AML — PAN, Aadhaar, AML screening' },
            { icon: '🏦', text: 'RazorpayX escrow — funds secured until allotment' },
            { icon: '📝', text: 'Digio eSign — legally binding subscription agreements' },
            { icon: '⚖️', text: 'PAS-4 / PAS-3 compliance automation built-in' },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-3">
              <span className="text-xl">{icon}</span>
              <span className="text-slate-300">{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right form panel ─────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="bg-white rounded-3xl p-10 w-full max-w-md shadow-2xl">

          {/* Logo on mobile */}
          <div className="flex lg:hidden items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-display font-black text-xl"
                 style={{ background: 'linear-gradient(135deg,#C9A84C,#E8C96A)', color: '#0B1D3A' }}>F</div>
            <span className="font-display text-xl text-navy">FaireFund</span>
          </div>

          <h2 className="font-display text-3xl text-navy mb-1">
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h2>
          <p className="text-slate-400 text-sm mb-6">
            {mode === 'login' ? 'Sign in to your investment dashboard' : 'Join the MSME investment platform'}
          </p>

          {/* Demo accounts */}
          {mode === 'login' && (
            <div className="bg-cream rounded-xl p-4 mb-6">
              <p className="text-xs font-bold text-navy mb-2">🚀 Demo accounts (password: fairefund123)</p>
              <div className="flex flex-wrap gap-2">
                {DEMOS.map(d => (
                  <button key={d.label}
                    onClick={() => setForm(f => ({ ...f, email: d.email, password: 'fairefund123' }))}
                    className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-navy hover:border-amber-400 transition-colors">
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="form-label">Full Name</label>
                  <input className="form-input" placeholder="Prashant Kumar" value={form.name} onChange={set('name')} required minLength={2} />
                </div>
                <div>
                  <label className="form-label">Phone</label>
                  <input className="form-input" placeholder="9876543210" value={form.phone} onChange={set('phone')} />
                </div>
                <div><label className="form-label">Referral Code (optional)</label><input className="form-input" placeholder="FF-XXXX-XXXX" value={form.referral_code} onChange={set('referral_code')} /></div>
                <div>
                  <label className="form-label">I am a…</label>
                  <select className="form-input" value={form.role} onChange={set('role')}>
                    <option value="investor">Investor / HNI</option>
                    <option value="sme_admin">MSME / Company</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="form-label">Email address</label>
              <input className="form-input" type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
            </div>

            <div className="pb-2">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" value={form.password} onChange={set('password')} required minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-navy text-base transition-all hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C96A)' }}>
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign In →' : 'Create Account →'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-400 mt-5">
            {mode === 'login' ? 'New to FaireFund?' : 'Already have an account?'}{' '}
            <button onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError(''); }}
              className="text-amber-600 font-bold hover:underline">
              {mode === 'login' ? 'Create account' : 'Sign in'}
            </button>
          </p>

        </div>
      </div>
    </div>
  );
}
