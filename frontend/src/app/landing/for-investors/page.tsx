'use client';
import Link from 'next/link';
import { WaitlistForm } from '@/components/WaitlistForm';

const RETURNS = [
  { sector: 'AgriTech',  irr: '22–28%', risk: 'Medium', rating: 4 },
  { sector: 'HealthTech', irr: '19–25%', risk: 'Medium', rating: 4 },
  { sector: 'CleanTech', irr: '18–24%', risk: 'Low',    rating: 5 },
  { sector: 'EdTech',    irr: '20–26%', risk: 'Medium', rating: 3 },
  { sector: 'Logistics', irr: '16–21%', risk: 'Low',    rating: 5 },
];

const SAFEGUARDS = [
  { icon: '🔐', title: 'PAN + Aadhaar eKYC', desc: 'Every investor verified via Signzy before investing.' },
  { icon: '🏦', title: 'RazorpayX Escrow',  desc: 'Funds released only after board resolution & allotment.' },
  { icon: '✍️', title: 'Aadhaar eSign',      desc: 'Subscription agreement legally binding under IT Act 2000.' },
  { icon: '⚖️', title: 'Section 42 Cap',    desc: 'Max 200 investors per offering. No dilution risk.' },
  { icon: '📋', title: 'PAS-3 Auto-filed',  desc: 'MCA V3 return filed automatically post-allotment.' },
  { icon: '📊', title: 'Immutable ledger',  desc: 'Double-entry accounting. Every rupee traceable.' },
];

const FAQ = [
  { q: 'What is the minimum investment?', a: 'Minimum is ₹50,000 per deal. There is no maximum per deal, but each offering is capped at 200 investors under Companies Act §42.' },
  { q: 'How are MSMEs verified?', a: 'Every MSME is reviewed by an empanelled CA/CS professional. They verify PAS-4 documents, audited financials, director KYC, and compliance tasks before the deal goes live.' },
  { q: 'What if an MSME defaults?', a: 'Funds are held in escrow until allotment. If the deal doesn\'t close, you get a full refund. Post-allotment, FairFund facilitates recovery and provides legal documentation for any dispute.' },
  { q: 'Are returns guaranteed?', a: 'No — returns are projected, not guaranteed. FairFund provides AI-scored risk assessments and analyst-reviewed IRR projections. Investment in unlisted securities carries risk.' },
  { q: 'How do I exit my investment?', a: 'FairFund is building a secondary market module (Phase 3). Currently, investments are held to tenure (12–36 months). Returns are paid per the term sheet.' },
];

export default function ForInvestorsPage() {
  return (
    <div className="min-h-screen font-body bg-white">

      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-lg"
                 style={{ background: 'linear-gradient(135deg,#C9A84C,#E8C96A)', color: '#0B1D3A' }}>F</div>
            <span className="font-display font-bold text-base" style={{ color: '#0B1D3A' }}>FairFund</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-semibold px-4 py-2 rounded-lg"
              style={{ color: '#0B1D3A', border: '1.5px solid #E2E8F0' }}>Sign in</Link>
            <a href="#join" className="text-sm font-bold px-5 py-2 rounded-xl"
               style={{ background: 'linear-gradient(135deg,#C9A84C,#E8C96A)', color: '#0B1D3A' }}>
              Join Waitlist
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-20 px-5" style={{ background: 'linear-gradient(160deg,#0B1D3A,#162B5C)' }}>
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-6 text-xs font-bold"
               style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)', color: '#E8C96A' }}>
            📈 For HNIs, Angel Investors & Family Offices
          </div>
          <h1 className="font-display text-white mb-5 leading-tight"
              style={{ fontSize: 'clamp(2rem,5vw,3.2rem)' }}>
            Earn <span style={{ color: '#C9A84C' }}>18–28% IRR</span> investing in{' '}
            India's best MSMEs
          </h1>
          <p className="text-slate-300 leading-relaxed mb-10 max-w-xl mx-auto text-sm">
            Curated, CA/CS-verified deals. Escrow-protected funds. Full compliance automation.
            The private placement market, finally made accessible.
          </p>
          <a href="#join"
            className="inline-block px-8 py-4 rounded-xl font-black text-lg transition-all hover:shadow-xl hover:-translate-y-1"
            style={{ background: 'linear-gradient(135deg,#C9A84C,#E8C96A)', color: '#0B1D3A' }}>
            Join Investor Waitlist →
          </a>
        </div>
      </section>

      {/* Returns table */}
      <section className="py-16 px-5 bg-white">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-display text-3xl text-center mb-3" style={{ color: '#0B1D3A' }}>
            Projected returns by sector
          </h2>
          <p className="text-center text-sm mb-10" style={{ color: '#64748B' }}>
            Based on our deal pipeline. Returns are projected, not guaranteed.
          </p>
          <div className="rounded-2xl overflow-hidden border" style={{ borderColor: '#E2E8F0' }}>
            <table className="w-full">
              <thead>
                <tr style={{ background: '#0B1D3A' }}>
                  <th className="px-5 py-3 text-left text-xs font-bold text-white/70 uppercase tracking-wide">Sector</th>
                  <th className="px-5 py-3 text-center text-xs font-bold text-white/70 uppercase tracking-wide">Target IRR</th>
                  <th className="px-5 py-3 text-center text-xs font-bold text-white/70 uppercase tracking-wide">Risk</th>
                  <th className="px-5 py-3 text-center text-xs font-bold text-white/70 uppercase tracking-wide">AI Score</th>
                </tr>
              </thead>
              <tbody>
                {RETURNS.map((r, i) => (
                  <tr key={r.sector} style={{ background: i % 2 ? '#FAFBFD' : 'white', borderTop: '1px solid #F1F5F9' }}>
                    <td className="px-5 py-3.5 font-semibold text-sm" style={{ color: '#0B1D3A' }}>{r.sector}</td>
                    <td className="px-5 py-3.5 text-center font-black text-sm" style={{ color: '#C9A84C' }}>{r.irr}</td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`badge text-[10px] ${r.risk === 'Low' ? 'badge-green' : 'badge-gold'}`}>{r.risk}</span>
                    </td>
                    <td className="px-5 py-3.5 text-center text-amber-500">
                      {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Safeguards */}
      <section className="py-16 px-5" style={{ background: '#F8FAFC' }}>
        <div className="max-w-4xl mx-auto">
          <h2 className="font-display text-3xl text-center mb-3" style={{ color: '#0B1D3A' }}>Your money is protected</h2>
          <p className="text-center text-sm mb-10" style={{ color: '#64748B' }}>
            6 layers of safeguards built into every deal.
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            {SAFEGUARDS.map(s => (
              <div key={s.title} className="rounded-2xl p-5 bg-white border"
                   style={{ borderColor: '#E2E8F0' }}>
                <span className="text-2xl block mb-3">{s.icon}</span>
                <h3 className="font-bold text-sm mb-1.5" style={{ color: '#0B1D3A' }}>{s.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: '#64748B' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-5 bg-white">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-display text-3xl text-center mb-10" style={{ color: '#0B1D3A' }}>
            Frequently asked questions
          </h2>
          <div className="space-y-4">
            {FAQ.map(({ q, a }) => (
              <div key={q} className="rounded-2xl p-5" style={{ border: '1.5px solid #F1F5F9', background: '#FAFBFD' }}>
                <p className="font-bold text-sm mb-2" style={{ color: '#0B1D3A' }}>Q: {q}</p>
                <p className="text-sm leading-relaxed" style={{ color: '#64748B' }}>A: {a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Waitlist CTA */}
      <section id="join" className="py-20 px-5" style={{ background: 'linear-gradient(160deg,#0B1D3A,#162B5C)' }}>
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <h2 className="font-display text-3xl text-white mb-3">Join the investor waitlist</h2>
            <p className="text-sm" style={{ color: '#94A3B8' }}>
              Zero fee on your first 3 investments. Priority deal access.
            </p>
          </div>
          <div className="bg-white rounded-3xl p-8 shadow-2xl">
            <WaitlistForm defaultRole="investor" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-5 text-center" style={{ background: '#0B1D3A' }}>
        <Link href="/" className="font-display text-white font-bold">FairFund</Link>
        <p className="text-xs mt-2" style={{ color: '#475569' }}>
          Investment in unlisted securities carries risk. Read all documents before investing.
        </p>
      </footer>
    </div>
  );
}
