'use client';
import { useState, FormEvent } from 'react';

const ROLE_CONFIG = {
  investor: {
    label:    'Investor / HNI',
    icon:     '📈',
    desc:     'Invest ₹50K–₹5Cr in verified MSME deals',
    color:    '#2563EB',
    extraField: { name: 'investment_size', label: 'Investment size you\'re considering', type: 'select',
      opts: ['₹50K – ₹5L', '₹5L – ₹25L', '₹25L – ₹1Cr', '₹1Cr+'] },
  },
  sme: {
    label:    'MSME / Startup',
    icon:     '🏢',
    desc:     'Raise ₹10L–₹5Cr via private placement',
    color:    '#2D7A4F',
    extraField: { name: 'raise_amount', label: 'How much are you looking to raise?', type: 'select',
      opts: ['₹10L – ₹50L', '₹50L – ₹1Cr', '₹1Cr – ₹5Cr', '₹5Cr+'] },
  },
  agent: {
    label:    'Referral Agent',
    icon:     '🤝',
    desc:     'Earn 1.5–2.5% commission on every investment',
    color:    '#C9A84C',
    extraField: { name: 'company_name', label: 'Your current organisation (optional)', type: 'text', placeholder: 'Wealth management firm, CA firm, etc.' },
  },
  ca_cs: {
    label:    'CA / CS Professional',
    icon:     '⚖️',
    desc:     'Get empanelled as a FairFund verifier',
    color:    '#7C3AED',
    extraField: { name: 'company_name', label: 'Your firm / practice name', type: 'text', placeholder: 'ABC & Associates' },
  },
};

type Role = keyof typeof ROLE_CONFIG;

interface Props {
  defaultRole?: Role;
  compact?: boolean;
}

export function WaitlistForm({ defaultRole, compact = false }: Props) {
  const [step,     setStep]     = useState<'role' | 'details' | 'done'>(defaultRole ? 'details' : 'role');
  const [role,     setRole]     = useState<Role>(defaultRole ?? 'investor');
  const [loading,  setLoading]  = useState(false);
  const [position, setPosition] = useState(0);
  const [error,    setError]    = useState('');
  const [form,     setForm]     = useState({
    name: '', email: '', phone: '', city: '', referral_source: '',
    investment_size: '', raise_amount: '', company_name: '',
  });

  const cfg = ROLE_CONFIG[role];
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const body = { ...form, role, phone: form.phone || undefined, city: form.city || undefined };
      const res  = await fetch('/api/v1/waitlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Something went wrong');
      setPosition(data.position);
      setStep('done');
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="text-center py-6">
        <div className="text-5xl mb-4">🎉</div>
        <h3 className="font-bold text-xl mb-2" style={{ color: '#0B1D3A' }}>You're on the list!</h3>
        <div className="inline-block rounded-2xl px-6 py-3 mb-4" style={{ background: '#F5F0E8' }}>
          <p style={{ color: '#718096', fontSize: 12, marginBottom: 4 }}>Your position</p>
          <p className="font-black text-4xl" style={{ color: '#C9A84C' }}>#{position}</p>
          <p style={{ color: '#718096', fontSize: 11 }}>among {ROLE_CONFIG[role].label}s</p>
        </div>
        <p style={{ color: '#718096', fontSize: 13, lineHeight: 1.6 }}>
          We'll email you at <strong>{form.email}</strong> when your spot opens.
          Usually within 2–4 weeks.
        </p>
        <div className="mt-4 flex gap-2 justify-center flex-wrap">
          <a href={`https://twitter.com/intent/tweet?text=Just joined the @FairFundIN waitlist! India's first SEBI-aligned MSME investment exchange. Join me: https://fairfund.in`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white"
            style={{ background: '#1DA1F2' }}>
            🐦 Share on X
          </a>
          <a href={`https://wa.me/?text=I just joined FairFund's waitlist – India's MSME investment exchange. Check it out: https://fairfund.in`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white"
            style={{ background: '#25D366' }}>
            💬 Share on WhatsApp
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Role selector */}
      {!defaultRole && step === 'role' && (
        <div>
          {!compact && <p className="text-center text-sm font-semibold mb-4" style={{ color: '#718096' }}>I want to join as…</p>}
          <div className="grid grid-cols-2 gap-2.5 mb-4">
            {(Object.entries(ROLE_CONFIG) as [Role, typeof ROLE_CONFIG.investor][]).map(([key, c]) => (
              <button key={key} onClick={() => { setRole(key); setStep('details'); }}
                className="p-4 rounded-2xl text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{ background: 'white', border: `2px solid ${c.color}22`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <span className="text-2xl block mb-1.5">{c.icon}</span>
                <p className="font-bold text-sm" style={{ color: '#0B1D3A' }}>{c.label}</p>
                <p style={{ fontSize: 11, color: '#718096', marginTop: 2 }}>{c.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Details form */}
      {step === 'details' && (
        <form onSubmit={submit}>
          {!defaultRole && (
            <button type="button" onClick={() => setStep('role')}
              className="flex items-center gap-1.5 text-sm mb-4"
              style={{ color: '#718096' }}>
              ← Back
            </button>
          )}

          <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 mb-5"
               style={{ background: cfg.color + '11', border: `1.5px solid ${cfg.color}33` }}>
            <span className="text-2xl">{cfg.icon}</span>
            <div>
              <p className="font-bold text-sm" style={{ color: cfg.color }}>{cfg.label}</p>
              <p style={{ fontSize: 11, color: '#718096' }}>{cfg.desc}</p>
            </div>
          </div>

          {error && (
            <div className="rounded-xl px-4 py-3 mb-4 text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="form-label">Full Name *</label>
              <input className="form-input" value={form.name} onChange={set('name')} placeholder="Prashant Kumar" required minLength={2} />
            </div>
            <div>
              <label className="form-label">Email *</label>
              <input className="form-input" type="email" value={form.email} onChange={set('email')} placeholder="prashant@example.com" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Phone</label>
                <input className="form-input" value={form.phone} onChange={set('phone')} placeholder="9876543210" />
              </div>
              <div>
                <label className="form-label">City</label>
                <input className="form-input" value={form.city} onChange={set('city')} placeholder="Mumbai" />
              </div>
            </div>

            {/* Role-specific field */}
            {cfg.extraField.type === 'select' ? (
              <div>
                <label className="form-label">{cfg.extraField.label}</label>
                <select className="form-input" value={(form as any)[cfg.extraField.name]} onChange={set(cfg.extraField.name)}>
                  <option value="">Select…</option>
                  {(cfg.extraField as any).opts.map((o: string) => <option key={o}>{o}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="form-label">{cfg.extraField.label}</label>
                <input className="form-input" value={(form as any)[cfg.extraField.name]}
                  onChange={set(cfg.extraField.name)} placeholder={(cfg.extraField as any).placeholder} />
              </div>
            )}

            <div>
              <label className="form-label">How did you hear about us?</label>
              <select className="form-input" value={form.referral_source} onChange={set('referral_source')}>
                <option value="">Select…</option>
                {['LinkedIn','Twitter/X','WhatsApp','Friend/Referral','CA / Advisor','Google','News Article','Other'].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>

          <button type="submit" disabled={loading}
            className="w-full mt-5 py-3.5 rounded-xl font-black text-sm disabled:opacity-60 transition-all hover:shadow-lg hover:-translate-y-0.5"
            style={{ background: `linear-gradient(135deg, ${cfg.color}, ${cfg.color}CC)`, color: 'white' }}>
            {loading ? 'Joining…' : `Join as ${cfg.label} →`}
          </button>

          <p className="text-center mt-3" style={{ fontSize: 11, color: '#94A3B8' }}>
            No spam. Unsubscribe anytime. 🔒 Your data is safe.
          </p>
        </form>
      )}
    </div>
  );
}
