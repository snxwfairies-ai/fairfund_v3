'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { WaitlistForm } from '@/components/WaitlistForm';

// ── Animated counter ────────────────────────────────────────────────────────
function Counter({ target, suffix = '', prefix = '' }: { target: number; suffix?: string; prefix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      const dur  = 1800;
      const step = 16;
      const inc  = target / (dur / step);
      let cur = 0;
      const t = setInterval(() => {
        cur = Math.min(cur + inc, target);
        setCount(Math.round(cur));
        if (cur >= target) clearInterval(t);
      }, step);
    }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target]);
  return <span ref={ref}>{prefix}{count.toLocaleString('en-IN')}{suffix}</span>;
}

const STATS = [
  { label: 'Waitlist members',      value: 2340,  suffix: '+' },
  { label: 'SMEs in pipeline',      value: 47,    suffix: '' },
  { label: 'Investor interest',     value: 12,    suffix: 'Cr+', prefix: '₹' },
  { label: 'CA/CS empanelled',      value: 23,    suffix: '' },
];

const HOW_IT_WORKS = [
  {
    step: '01', icon: '🔐', title: 'Verify once',
    desc: 'PAN + Aadhaar eKYC via Signzy. Takes 3 minutes. No branch visits.',
    color: '#2563EB',
  },
  {
    step: '02', icon: '🔍', title: 'Browse curated deals',
    desc: 'Every MSME is CA/CS-verified, AI-scored, and PAS-4 compliant before listing.',
    color: '#2D7A4F',
  },
  {
    step: '03', icon: '✍️', title: 'eSign & escrow',
    desc: 'Sign your subscription agreement via Digio Aadhaar eSign. Funds held in RazorpayX escrow.',
    color: '#C9A84C',
  },
  {
    step: '04', icon: '📈', title: 'Track & earn',
    desc: 'Real-time portfolio dashboard. PAS-3 auto-filed. Returns disbursed to your bank.',
    color: '#7C3AED',
  },
];

const FEATURES_INVESTOR = [
  { icon: '🏦', title: 'Escrow-protected', desc: 'Funds released only after board allotment. Never held by platform.' },
  { icon: '⚖️', title: 'SEBI §42 compliant', desc: 'Every deal structured as private placement under Companies Act 2013.' },
  { icon: '🤖', title: 'AI risk scores', desc: 'GPT-4o powered financial + compliance scoring for every MSME.' },
  { icon: '📋', title: 'Full audit trail', desc: 'Every rupee traceable. Double-entry ledger. Immutable records.' },
  { icon: '💰', title: '18–28% IRR target', desc: 'Curated deals with realistic, analyst-reviewed return projections.' },
  { icon: '🔄', title: 'Auto-compliance', desc: 'PAS-3 MCA filing, cap table update, allotment certificate — all automated.' },
];

const FEATURES_MSME = [
  { icon: '🚀', title: 'Raise ₹10L–₹5Cr', desc: 'Private placement up to 200 investors. No public listing required.' },
  { icon: '🧑‍⚖️', title: 'CA/CS assigned', desc: 'Dedicated professional verifies your docs and signs off PAS-4.' },
  { icon: '⏱️', title: '21-day listing', desc: 'From application to live deal in under 3 weeks with dedicated support.' },
  { icon: '📊', title: 'Live dashboard', desc: 'Real-time fundraise progress, investor list, compliance checklist.' },
  { icon: '🔒', title: 'Structured cap table', desc: 'ESOP-ready, SAFE-compatible. Digital PAS-3 keeps ROC current.' },
  { icon: '🌐', title: 'Network access', desc: '2,000+ HNI investors and family offices on the platform.' },
];

const TESTIMONIALS = [
  {
    name: 'Ananya Mehta', role: 'Angel Investor, Mumbai', avatar: 'A',
    quote: "Finally a platform that treats compliance as a feature, not a checkbox. The AI scoring saved me hours of due diligence.",
    rating: 5,
  },
  {
    name: 'Rajan Iyer', role: 'Founder, AgriTech Solutions', avatar: 'R',
    quote: "We raised ₹1.2Cr in 6 weeks. The CA/CS assigned to us was brilliant. PAS-3 filing happened automatically — I didn't even know it was done.",
    rating: 5,
  },
  {
    name: 'CA Priya Sharma', role: 'Practising CA, Bengaluru', avatar: 'P',
    quote: "As an empanelled verifier, the workflow is clean. Checklist-driven, audit trail built in. Exactly what the profession needed.",
    rating: 5,
  },
];

const COMPLIANCE_BADGES = [
  'Companies Act 2013 §42', 'PAS-4 / PAS-3', 'SEBI ICDR 2018',
  'IT Act 2000 eSign', 'RBI Escrow Norms', 'FEMA Compliant',
];

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeFeatureTab, setActiveFeatureTab] = useState<'investor' | 'msme'>('investor');
  const [waitlistRole, setWaitlistRole] = useState<string | null>(null);
  const waitlistRef  = useRef<HTMLDivElement>(null);

  function scrollToWaitlist(role?: string) {
    if (role) setWaitlistRole(role);
    waitlistRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <div className="min-h-screen font-body" style={{ background: 'white' }}>

      {/* ── NAV ─────────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center font-display font-black text-xl"
                 style={{ background: 'linear-gradient(135deg,#C9A84C,#E8C96A)', color: '#0B1D3A' }}>F</div>
            <div>
              <span className="font-display font-bold text-lg" style={{ color: '#0B1D3A' }}>FaireFund</span>
              <span className="ml-2 text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded-full"
                    style={{ background: '#FEF9EE', color: '#C9A84C', border: '1px solid #C9A84C44' }}>EARLY ACCESS</span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-6">
            {[['For Investors', '#investors'], ['For MSMEs', '#msmes'], ['How it Works', '#how'], ['Compliance', '#compliance']].map(([l, h]) => (
              <a key={l} href={h} className="text-sm font-medium transition-colors"
                 style={{ color: '#64748B' }}
                 onMouseEnter={e => (e.currentTarget.style.color = '#0B1D3A')}
                 onMouseLeave={e => (e.currentTarget.style.color = '#64748B')}>{l}</a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden md:block text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              style={{ color: '#0B1D3A', border: '1.5px solid #E2E8F0' }}>Sign in</Link>
            <button onClick={() => scrollToWaitlist()}
              className="text-sm font-bold px-5 py-2 rounded-xl transition-all hover:shadow-md hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg,#C9A84C,#E8C96A)', color: '#0B1D3A' }}>
              Join Waitlist
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden" style={{ background: 'linear-gradient(160deg,#0B1D3A 0%,#0D2550 55%,#162B5C 100%)' }}>
        {/* Subtle grid overlay */}
        <div className="absolute inset-0 opacity-5"
             style={{ backgroundImage: 'linear-gradient(rgba(201,168,76,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(201,168,76,0.4) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="relative max-w-6xl mx-auto px-5 pt-20 pb-24">
          <div className="max-w-3xl mx-auto text-center">

            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-8 text-sm font-semibold"
                 style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)', color: '#E8C96A' }}>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              2,300+ investors & MSMEs on the waitlist
            </div>

            <h1 className="font-display text-white leading-tight mb-6"
                style={{ fontSize: 'clamp(2.4rem, 6vw, 4rem)', lineHeight: 1.15 }}>
              India's First{' '}
              <span style={{ color: '#C9A84C' }}>SEBI-Aligned</span>{' '}
              MSME Investment Exchange
            </h1>

            <p className="text-slate-300 text-lg leading-relaxed mb-10 max-w-xl mx-auto">
              Invest in verified, high-growth MSMEs. Escrow-protected funds, Aadhaar eSign agreements,
              automated PAS-3 compliance — all in one platform.
            </p>

            <div className="flex flex-wrap gap-3 justify-center mb-12">
              <button onClick={() => scrollToWaitlist('investor')}
                className="px-7 py-3.5 rounded-xl font-black text-navy text-base transition-all hover:shadow-xl hover:-translate-y-1"
                style={{ background: 'linear-gradient(135deg,#C9A84C,#E8C96A)' }}>
                Join as Investor →
              </button>
              <button onClick={() => scrollToWaitlist('sme')}
                className="px-7 py-3.5 rounded-xl font-semibold text-sm transition-all hover:border-amber-400"
                style={{ background: 'transparent', border: '2px solid rgba(255,255,255,0.2)', color: 'white' }}>
                Raise Funds as MSME
              </button>
            </div>

            {/* Compliance badges */}
            <div className="flex flex-wrap gap-2 justify-center">
              {COMPLIANCE_BADGES.map(b => (
                <span key={b} className="text-[10px] font-bold px-3 py-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {b}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Wave divider */}
        <div style={{ lineHeight: 0 }}>
          <svg viewBox="0 0 1440 48" fill="white" xmlns="http://www.w3.org/2000/svg">
            <path d="M0,24 C360,48 1080,0 1440,24 L1440,48 L0,48 Z" />
          </svg>
        </div>
      </section>

      {/* ── STATS BAR ───────────────────────────────────────────────────────── */}
      <section className="py-10 border-b" style={{ background: 'white', borderColor: '#F1F5F9' }}>
        <div className="max-w-5xl mx-auto px-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {STATS.map(s => (
              <div key={s.label}>
                <div className="font-display font-normal text-3xl mb-1" style={{ color: '#0B1D3A' }}>
                  <Counter target={s.value} suffix={s.suffix} prefix={s.prefix ?? ''} />
                </div>
                <div className="text-xs font-medium" style={{ color: '#94A3B8' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────────────────── */}
      <section id="how" className="py-20" style={{ background: '#F8FAFC' }}>
        <div className="max-w-5xl mx-auto px-5">
          <div className="text-center mb-14">
            <p className="text-xs font-black tracking-[3px] uppercase mb-3" style={{ color: '#C9A84C' }}>Simple. Compliant. Transparent.</p>
            <h2 className="font-display text-4xl" style={{ color: '#0B1D3A' }}>How FaireFund Works</h2>
            <p className="mt-3 max-w-md mx-auto text-sm" style={{ color: '#64748B' }}>
              From browsing to allotment in under 14 days. Every step is legally binding and auditable.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-0 relative">
            {/* Connector line */}
            <div className="hidden md:block absolute top-12 left-[12.5%] right-[12.5%] h-0.5"
                 style={{ background: 'linear-gradient(90deg,#2563EB,#2D7A4F,#C9A84C,#7C3AED)' }} />

            {HOW_IT_WORKS.map(s => (
              <div key={s.step} className="relative text-center px-5 py-6">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4 relative z-10"
                     style={{ background: s.color + '15', border: `2px solid ${s.color}33` }}>
                  {s.icon}
                </div>
                <p className="text-xs font-black mb-1" style={{ color: s.color }}>STEP {s.step}</p>
                <h3 className="font-bold text-base mb-2" style={{ color: '#0B1D3A' }}>{s.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: '#64748B' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────────────────── */}
      <section className="py-20" style={{ background: 'white' }}>
        <div className="max-w-5xl mx-auto px-5">
          <div className="text-center mb-10">
            <h2 className="font-display text-4xl mb-3" style={{ color: '#0B1D3A' }}>Built for every stakeholder</h2>
            <div className="inline-flex rounded-xl overflow-hidden border" style={{ borderColor: '#E2E8F0' }}>
              {(['investor', 'msme'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveFeatureTab(tab)}
                  className="px-6 py-2.5 text-sm font-bold transition-all capitalize"
                  style={{
                    background: activeFeatureTab === tab ? '#0B1D3A' : 'white',
                    color:      activeFeatureTab === tab ? 'white'    : '#64748B',
                  }}>
                  {tab === 'msme' ? 'MSME / Startups' : 'Investors'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {(activeFeatureTab === 'investor' ? FEATURES_INVESTOR : FEATURES_MSME).map(f => (
              <div key={f.title} className="rounded-2xl p-6 transition-all hover:shadow-md"
                   style={{ border: '1.5px solid #F1F5F9', background: '#FAFBFD' }}>
                <span className="text-3xl block mb-3">{f.icon}</span>
                <h3 className="font-bold text-base mb-1.5" style={{ color: '#0B1D3A' }}>{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#64748B' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ────────────────────────────────────────────────────── */}
      <section className="py-20" style={{ background: 'linear-gradient(135deg,#0B1D3A,#162B5C)' }}>
        <div className="max-w-5xl mx-auto px-5">
          <div className="text-center mb-12">
            <h2 className="font-display text-4xl text-white mb-3">What early members say</h2>
            <p style={{ color: '#94A3B8', fontSize: 14 }}>From our founding cohort of investors, MSMEs, and CA/CS professionals</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {TESTIMONIALS.map(t => (
              <div key={t.name} className="rounded-2xl p-6"
                   style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <span key={i} style={{ color: '#C9A84C', fontSize: 14 }}>★</span>
                  ))}
                </div>
                <p className="text-sm leading-relaxed mb-5" style={{ color: '#CBD5E1' }}>"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm"
                       style={{ background: 'linear-gradient(135deg,#C9A84C,#E8C96A)', color: '#0B1D3A' }}>
                    {t.avatar}
                  </div>
                  <div>
                    <p className="font-bold text-sm text-white">{t.name}</p>
                    <p style={{ color: '#94A3B8', fontSize: 11 }}>{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMPLIANCE ──────────────────────────────────────────────────────── */}
      <section id="compliance" className="py-16" style={{ background: '#F5F0E8' }}>
        <div className="max-w-3xl mx-auto px-5 text-center">
          <p className="text-xs font-black tracking-[3px] uppercase mb-3" style={{ color: '#C9A84C' }}>Non-negotiable</p>
          <h2 className="font-display text-3xl mb-4" style={{ color: '#0B1D3A' }}>
            Built on India's regulatory framework
          </h2>
          <p className="text-sm leading-relaxed mb-8" style={{ color: '#64748B' }}>
            FaireFund operates as a private placement platform under Companies Act 2013 §42
            (maximum 200 investors per offering). Every transaction is escrow-backed,
            eSign-verified, and auto-filed with the ROC.
          </p>
          <div className="flex flex-wrap gap-2.5 justify-center">
            {COMPLIANCE_BADGES.map(b => (
              <span key={b} className="px-4 py-2 rounded-full text-xs font-bold"
                style={{ background: 'white', color: '#0B1D3A', border: '1.5px solid rgba(11,29,58,0.12)' }}>
                ✓ {b}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── WAITLIST ────────────────────────────────────────────────────────── */}
      <section id="waitlist" ref={waitlistRef} className="py-20" style={{ background: 'white' }}>
        <div className="max-w-5xl mx-auto px-5">
          <div className="grid md:grid-cols-2 gap-12 items-start">

            {/* Left: copy */}
            <div>
              <p className="text-xs font-black tracking-[3px] uppercase mb-3" style={{ color: '#C9A84C' }}>Limited Early Access</p>
              <h2 className="font-display text-4xl mb-5 leading-tight" style={{ color: '#0B1D3A' }}>
                Get early access<br />before public launch
              </h2>
              <p className="text-sm leading-relaxed mb-8" style={{ color: '#64748B' }}>
                We're onboarding in batches to ensure every deal gets the attention it deserves.
                Join the waitlist and lock in your early-access benefits.
              </p>

              <div className="space-y-4">
                {[
                  { icon: '📈', role: 'Investor', perks: 'Zero fee on first 3 investments', action: 'investor' },
                  { icon: '🏢', role: 'MSME',     perks: 'Free listing for 6 months', action: 'sme' },
                  { icon: '🤝', role: 'Agent',    perks: '2.5% commission rate (vs 1.5%)', action: 'agent' },
                  { icon: '⚖️', role: 'CA/CS',    perks: 'Preferred empanelment + ₹2K/verification', action: 'ca_cs' },
                ].map(item => (
                  <button key={item.role} onClick={() => scrollToWaitlist(item.action)}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all hover:shadow-sm"
                    style={{ border: '1.5px solid #E2E8F0', background: '#FAFBFD' }}>
                    <span className="text-2xl">{item.icon}</span>
                    <div>
                      <p className="font-bold text-sm" style={{ color: '#0B1D3A' }}>
                        {item.role} <span style={{ color: '#94A3B8', fontWeight: 400 }}>→</span>
                        <span style={{ color: '#2D7A4F', marginLeft: 6, fontSize: 12 }}>{item.perks}</span>
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: form */}
            <div>
              <div className="rounded-3xl p-8 shadow-xl"
                   style={{ border: '1.5px solid #E2E8F0', background: 'white' }}>
                <WaitlistForm defaultRole={waitlistRole as any ?? undefined} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer style={{ background: '#0B1D3A' }} className="py-12">
        <div className="max-w-5xl mx-auto px-5">
          <div className="grid md:grid-cols-4 gap-8 mb-10">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center font-display font-black text-xl"
                     style={{ background: 'linear-gradient(135deg,#C9A84C,#E8C96A)', color: '#0B1D3A' }}>F</div>
                <span className="font-display text-white font-bold text-lg">FaireFund</span>
              </div>
              <p style={{ color: '#64748B', fontSize: 13, lineHeight: 1.7 }}>
                India's SEBI-aligned MSME Investment Exchange.
                Escrow-protected. Compliance-first. Built for trust.
              </p>
            </div>
            <div>
              <p className="font-bold text-xs uppercase tracking-widest mb-4" style={{ color: '#C9A84C' }}>Platform</p>
              {['For Investors','For MSMEs','For Agents','For CA/CS','Compliance Framework'].map(l => (
                <a key={l} href="#" className="block mb-2 text-sm transition-colors"
                   style={{ color: '#64748B' }}>{l}</a>
              ))}
            </div>
            <div>
              <p className="font-bold text-xs uppercase tracking-widest mb-4" style={{ color: '#C9A84C' }}>Company</p>
              {['About FaireFund','Contact Us','Privacy Policy','Terms of Service'].map(l => (
                <a key={l} href="#" className="block mb-2 text-sm" style={{ color: '#64748B' }}>{l}</a>
              ))}
              <div className="mt-4">
                <Link href="/login" className="text-sm font-bold"
                  style={{ color: '#C9A84C' }}>Already a member? Sign in →</Link>
              </div>
            </div>
          </div>

          <div className="border-t pt-6 flex flex-col md:flex-row justify-between items-center gap-3"
               style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <p style={{ color: '#475569', fontSize: 12 }}>
              © 2025 FaireFund Technologies Pvt Ltd. All rights reserved.
            </p>
            <p style={{ color: '#475569', fontSize: 12 }}>
              ⚠️ Investment in unlisted securities carries risk. Read all offer documents before investing.
              This platform does not guarantee returns.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
