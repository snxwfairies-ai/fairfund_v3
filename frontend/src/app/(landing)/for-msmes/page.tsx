'use client';
import Link from 'next/link';
import { WaitlistForm } from '@/components/WaitlistForm';

const TIMELINE = [
  { day: 'Day 1',   icon: '📝', title: 'Apply online',        desc: 'Submit company details, financials, and documents via our secure portal.' },
  { day: 'Day 3',   icon: '🧑‍⚖️', title: 'CA/CS assigned',      desc: 'An empanelled professional reviews your PAS-4, audited accounts, and compliance checklist.' },
  { day: 'Day 7',   icon: '🤖', title: 'AI scoring',           desc: 'FaireFund AI scores your financial health, execution track record, and market position.' },
  { day: 'Day 10',  icon: '✅', title: 'Listing approved',     desc: 'Admin review complete. Your deal goes live to 2,000+ verified investors.' },
  { day: 'Day 21',  icon: '💰', title: 'Funds in escrow',      desc: 'Investments flow in. Funds held securely until allotment is confirmed by the board.' },
  { day: 'Day 30',  icon: '📤', title: 'Allotment & PAS-3',   desc: 'Shares allotted, PAS-3 auto-filed with MCA. Cap table updated automatically.' },
];

const ELIGIBILITY = [
  '✅ Incorporated in India (Pvt Ltd, LLP, or similar)',
  '✅ Minimum 2 years of operations',
  '✅ Audited financials for at least 1 FY',
  '✅ Raising ₹10 Lakh – ₹5 Crore',
  '✅ Director KYC (PAN + Aadhaar)',
  '❌ Not a financial services company or NBFC',
  '❌ No active insolvency or legal proceedings',
];

const COSTS = [
  { item: 'Listing fee',        amount: '₹0', note: 'Free for first 6 months (early access)' },
  { item: 'Platform fee',       amount: '2%', note: 'Of total amount raised, deducted at allotment' },
  { item: 'CA/CS review',       amount: '₹0', note: 'Included — assigned by FaireFund' },
  { item: 'PAS-3 auto-filing',  amount: '₹0', note: 'Automated, no CA fees for ROC' },
  { item: 'eSign per investor', amount: '₹25', note: 'Per subscription agreement signed' },
];

export default function ForMSMEsPage() {
  return (
    <div className="min-h-screen font-body bg-white">

      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-lg"
                 style={{ background: 'linear-gradient(135deg,#C9A84C,#E8C96A)', color: '#0B1D3A' }}>F</div>
            <span className="font-display font-bold text-base" style={{ color: '#0B1D3A' }}>FaireFund</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-semibold px-4 py-2 rounded-lg"
              style={{ color: '#0B1D3A', border: '1.5px solid #E2E8F0' }}>Sign in</Link>
            <a href="#join" className="text-sm font-bold px-5 py-2 rounded-xl"
               style={{ background: 'linear-gradient(135deg,#2D7A4F,#3DAA6E)', color: 'white' }}>
              Apply Now
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-20 px-5" style={{ background: 'linear-gradient(160deg,#0B1D3A,#1a3a1a)' }}>
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-6 text-xs font-bold"
               style={{ background: 'rgba(45,122,79,0.25)', border: '1px solid rgba(45,122,79,0.4)', color: '#4ADE80' }}>
            🏢 For Indian MSMEs & Startups
          </div>
          <h1 className="font-display text-white mb-5 leading-tight"
              style={{ fontSize: 'clamp(2rem,5vw,3.2rem)' }}>
            Raise ₹10L–₹5Cr from{' '}
            <span style={{ color: '#4ADE80' }}>2,000+ verified investors</span>{' '}
            in 30 days
          </h1>
          <p className="text-slate-300 leading-relaxed mb-10 max-w-xl mx-auto text-sm">
            SEBI-aligned private placement. CA/CS verified. PAS-3 automated.
            No investment bankers, no ridiculous fees, no months of waiting.
          </p>
          <a href="#join"
            className="inline-block px-8 py-4 rounded-xl font-black text-lg transition-all hover:shadow-xl hover:-translate-y-1 text-white"
            style={{ background: 'linear-gradient(135deg,#2D7A4F,#3DAA6E)' }}>
            Apply as MSME →
          </a>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-16 px-5 bg-white">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-display text-3xl text-center mb-3" style={{ color: '#0B1D3A' }}>
            From application to funded in 30 days
          </h2>
          <p className="text-center text-sm mb-12" style={{ color: '#64748B' }}>
            Our structured process removes compliance bottlenecks.
          </p>
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-8 top-0 bottom-0 w-0.5 hidden md:block"
                 style={{ background: 'linear-gradient(180deg,#2D7A4F,#C9A84C)' }} />

            <div className="space-y-8">
              {TIMELINE.map(t => (
                <div key={t.day} className="flex items-start gap-5">
                  <div className="flex-shrink-0 w-16 h-16 rounded-2xl flex flex-col items-center justify-center z-10"
                       style={{ background: '#F5F0E8', border: '2px solid #C9A84C44' }}>
                    <span className="text-xl">{t.icon}</span>
                    <span className="text-[9px] font-black" style={{ color: '#C9A84C' }}>{t.day}</span>
                  </div>
                  <div className="pt-3">
                    <h3 className="font-bold text-base mb-1" style={{ color: '#0B1D3A' }}>{t.title}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: '#64748B' }}>{t.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Eligibility + Costs side by side */}
      <section className="py-16 px-5" style={{ background: '#F8FAFC' }}>
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">

          {/* Eligibility */}
          <div>
            <h2 className="font-display text-2xl mb-6" style={{ color: '#0B1D3A' }}>Are you eligible?</h2>
            <div className="space-y-3">
              {ELIGIBILITY.map(e => (
                <div key={e} className="flex items-start gap-2 text-sm" style={{ color: e.startsWith('✅') ? '#15803D' : '#B91C1C' }}>
                  <span className="font-bold">{e.slice(0,2)}</span>
                  <span>{e.slice(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Costs */}
          <div>
            <h2 className="font-display text-2xl mb-6" style={{ color: '#0B1D3A' }}>Transparent pricing</h2>
            <div className="space-y-3">
              {COSTS.map(c => (
                <div key={c.item} className="flex items-start justify-between gap-4 py-3 border-b"
                     style={{ borderColor: '#F1F5F9' }}>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: '#0B1D3A' }}>{c.item}</p>
                    <p className="text-xs" style={{ color: '#94A3B8' }}>{c.note}</p>
                  </div>
                  <span className="font-black text-base flex-shrink-0"
                        style={{ color: c.amount === '₹0' ? '#15803D' : '#0B1D3A' }}>
                    {c.amount}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl p-4" style={{ background: '#ECFDF5', border: '1px solid #BBF7D0' }}>
              <p className="text-xs font-bold" style={{ color: '#15803D' }}>
                💡 Early access: Listing is FREE for the first 6 months. Only 2% success fee applies.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Waitlist CTA */}
      <section id="join" className="py-20 px-5" style={{ background: 'linear-gradient(160deg,#0B1D3A,#1a3a1a)' }}>
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <h2 className="font-display text-3xl text-white mb-3">Apply for early access</h2>
            <p className="text-sm" style={{ color: '#94A3B8' }}>
              Free listing + dedicated onboarding support for founding cohort.
            </p>
          </div>
          <div className="bg-white rounded-3xl p-8 shadow-2xl">
            <WaitlistForm defaultRole="sme" />
          </div>
        </div>
      </section>

      <footer className="py-8 px-5 text-center" style={{ background: '#0B1D3A' }}>
        <Link href="/" className="font-display text-white font-bold">FaireFund</Link>
        <p className="text-xs mt-2" style={{ color: '#475569' }}>
          Private placement under Companies Act 2013 §42. Max 200 investors per offering.
        </p>
      </footer>
    </div>
  );
}
