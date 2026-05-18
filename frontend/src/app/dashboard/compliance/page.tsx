'use client';

const MODULES = [
  {
    title: 'PAS-4 Information Memorandum',
    status: 'Active', color: '#2D7A4F',
    icon: '📋',
    desc: 'Auto-generated from SME data and reviewed by CS before each deal launch.',
    items: ['Auto-generated from onboarding data', 'CS/CA review workflow integrated', 'Investor distribution tracking', 'Downloadable by verified investors only'],
  },
  {
    title: 'KYC & AML Screening',
    status: 'Active', color: '#2D7A4F',
    icon: '🔐',
    desc: 'PAN, Aadhaar verification via Signzy/Karza with full AML and CIBIL screening.',
    items: ['PAN Verification (₹3–12/check)', 'Aadhaar eKYC (₹15–20)', 'AML/CIBIL Screening (₹25–60)', 'Video KYC option for HNIs'],
  },
  {
    title: 'eSign (Aadhaar / DSC)',
    status: 'Active', color: '#2D7A4F',
    icon: '✍️',
    desc: 'Subscription agreements signed via Digio/Leegality. Legally binding under IT Act 2000.',
    items: ['Aadhaar OTP eSign (₹15–25/sign)', 'DSC option available (₹5–12)', 'Tamper-evident signed PDFs', 'Stored immutably with deal documents'],
  },
  {
    title: 'Escrow Management',
    status: 'Active', color: '#2D7A4F',
    icon: '🏦',
    desc: 'All funds flow via RazorpayX regulated escrow. Released only on allotment completion.',
    items: ['RazorpayX / Cashfree escrow', 'Auto-release on board allotment', 'Transaction fee: ₹5–15/txn', 'RBI Payment Aggregator compliant'],
  },
  {
    title: 'PAS-3 Auto-Filing',
    status: 'Roadmap', color: '#C9A84C',
    icon: '📤',
    desc: 'Post-allotment return auto-filed via MCA V3 portal. Cap-table auto-updated.',
    items: ['ROC return automation (MCA V3)', 'Cap table update on allotment', 'Allotment certificate generation', 'CS countersign workflow'],
  },
  {
    title: 'Section 113 — Corporate Voting',
    status: 'Available', color: '#2563EB',
    icon: '🗳️',
    desc: 'If investor is a company, Board Resolution + Authorization Letter required per §113.',
    items: ['Board Resolution template', 'Authorization letter format', 'Certified copy upload workflow', 'Corporate representative tracking'],
  },
  {
    title: 'Investor Cap Enforcement',
    status: 'Active', color: '#2D7A4F',
    icon: '⛔',
    desc: 'Database-level trigger enforces ≤200 investors per offering per Companies Act §42.',
    items: ['DB trigger blocks investor #201+', 'Real-time count on deal page', 'Override only by super_admin', 'Full audit log per allotment'],
  },
  {
    title: 'AI MSME Risk Scoring',
    status: 'Beta', color: '#7C3AED',
    icon: '🤖',
    desc: 'OpenAI-powered scoring across financial, execution, market, and compliance dimensions.',
    items: ['Financial health analysis', 'Execution risk profiling', 'Market opportunity scoring', 'Compliance risk flagging'],
  },
];

const LEGAL_TAGS = [
  'Companies Act 2013 §42', 'SEBI ICDR 2018', 'PAS-4 / PAS-3',
  'Section 113/179', 'RBI Escrow Norms', 'IT Act 2000',
  'Secretarial Standard SS-2', 'FEMA Compliance', 'Income Tax §56(2)',
];

const STATUS_BADGE: Record<string, string> = {
  Active:   'bg-emerald-100 text-emerald-700',
  Roadmap:  'bg-amber-100 text-amber-700',
  Available:'bg-blue-100 text-blue-700',
  Beta:     'bg-purple-100 text-purple-700',
};

export default function CompliancePage() {
  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-3xl text-navy mb-1">Compliance Center</h1>
        <p className="text-slate-400 text-sm">SEBI · Companies Act, 2013 · RBI · IT Act 2000</p>
      </div>

      {/* Module cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {MODULES.map(m => (
          <div key={m.title} className="card p-5" style={{ borderTop: `3px solid ${m.color}` }}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{m.icon}</span>
                <h3 className="font-bold text-sm text-navy leading-snug">{m.title}</h3>
              </div>
              <span className={`badge text-[10px] flex-shrink-0 ml-2 ${STATUS_BADGE[m.status] ?? 'bg-slate-100 text-slate-500'}`}>
                {m.status}
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed mb-3">{m.desc}</p>
            <ul className="space-y-1">
              {m.items.map(item => (
                <li key={item} className="flex items-center gap-2 text-xs text-slate-600">
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: m.color, flexShrink: 0, display: 'inline-block' }} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Legal framework banner */}
      <div className="rounded-2xl p-7 text-white" style={{ background: 'linear-gradient(135deg,#0B1D3A,#1a3a6e)' }}>
        <h2 className="font-display text-xl mb-2">⚖️ Legal Framework</h2>
        <p className="text-sm text-slate-300 leading-relaxed mb-5 max-w-2xl">
          FairFund operates as a private placement platform under Companies Act 2013 §42 (maximum 200
          investors per offering per financial year). All transactions comply with SEBI (ICDR) Regulations 2018,
          RBI Payment Aggregator guidelines for escrow, and IT Act 2000 for Aadhaar-based digital signatures.
          Income Tax §56(2) disclosures included in PAS-4 for all listed instruments.
        </p>
        <div className="flex flex-wrap gap-2">
          {LEGAL_TAGS.map(tag => (
            <span key={tag}
              className="text-[10px] font-bold px-3 py-1 rounded-full"
              style={{ background: 'rgba(201,168,76,0.18)', border: '1px solid rgba(201,168,76,0.3)', color: '#E8C96A' }}>
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Phase roadmap */}
      <div className="mt-5 card p-6">
        <h2 className="font-semibold text-sm text-navy mb-5">Development Roadmap</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              phase: 'Phase 1 — MVP',
              color: '#2D7A4F',
              status: '✅ Complete',
              items: ['User & MSME onboarding', 'KYC/AML integration', 'PAS-4 document flow', 'Basic investment flow', 'Escrow via RazorpayX', 'Compliance checklist'],
            },
            {
              phase: 'Phase 2 — Full Platform',
              color: '#C9A84C',
              status: '🔄 In Progress',
              items: ['PAS-3 MCA V3 auto-filing', 'Cap table automation', 'eSign via Digio API', 'Allotment certificates', 'Investor dashboard advanced', 'Secondary liquidity module'],
            },
            {
              phase: 'Phase 3 — AI & Scale',
              color: '#7C3AED',
              status: '📋 Planned',
              items: ['AI MSME credit scoring', 'Auto document analysis', 'Investor matching engine', 'SEBI Alternative listing', 'Mobile app (React Native)', 'Tokenized instruments'],
            },
          ].map(p => (
            <div key={p.phase} className="rounded-xl p-4" style={{ background: p.color + '11', border: `1px solid ${p.color}33` }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-xs text-navy">{p.phase}</h3>
                <span className="text-[10px] font-semibold text-slate-500">{p.status}</span>
              </div>
              <ul className="space-y-1.5">
                {p.items.map(item => (
                  <li key={item} className="flex items-center gap-2 text-xs text-slate-600">
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
