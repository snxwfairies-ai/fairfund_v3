'use client';
import { useState, useEffect } from 'react';
import { SME } from '@/types';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import { ProgressBar, Badge } from '@/components/ui';

type Tab = 'overview' | 'financials' | 'documents' | 'invest';

export function DealModal({ sme: init, onClose }: { sme: SME; onClose: () => void }) {
  const { user } = useAuth();
  const [tab,    setTab]    = useState<Tab>('overview');
  const [detail, setDetail] = useState<SME | null>(null);
  const [amount, setAmount] = useState(init.min_investment);
  const [busy,   setBusy]   = useState(false);
  const [done,   setDone]   = useState(false);
  const [toast,  setToast]  = useState('');

  useEffect(() => {
    api.get<SME>(`/smes/${init.id}`).then(setDetail).catch(() => {});
  }, [init.id]);

  const sme = detail ?? init;

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  async function invest() {
    if (amount < sme.min_investment) { showToast(`Min: ${formatINR(sme.min_investment)}`); return; }
    setBusy(true);
    try {
      await api.post('/investments', { sme_id: sme.id, amount: Number(amount) });
      setDone(true);
    } catch (e: any) { showToast(e.message); }
    finally { setBusy(false); }
  }

  const TABS: Tab[] = ['overview', 'financials', 'documents', 'invest'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(11,29,58,0.72)', backdropFilter: 'blur(3px)' }}
         onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
           className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in">

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg,#0B1D3A,#1a3a6e)' }} className="px-7 py-5 text-white">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] tracking-[2px] uppercase mb-1" style={{ color: '#C9A84C' }}>Deal Room</p>
              <h2 className="font-display text-xl mb-1">{sme.legal_name}</h2>
              <p className="text-slate-400 text-xs">{sme.location_city}, {sme.location_state} · {sme.sector} · Est. {sme.founded_year}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white text-lg transition-colors flex items-center justify-center">×</button>
          </div>
          <div className="flex gap-7 mt-4 flex-wrap">
            {[
              { l: 'Target Raise', v: formatINR(sme.target_raise) },
              { l: 'Valuation',    v: formatINR(sme.valuation_pre) },
              { l: 'Est. Return',  v: `${sme.expected_return_min}–${sme.expected_return_max}%` },
              { l: 'Revenue',      v: formatINR(sme.revenue_last_fy) },
            ].map(({ l, v }) => (
              <div key={l}>
                <p className="text-[10px]" style={{ color: '#C9A84C' }}>{l}</p>
                <p className="font-bold text-base">{v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-3 text-xs font-semibold capitalize transition-all border-b-2 ${
                tab === t ? 'text-navy border-amber-500 font-bold' : 'text-slate-400 border-transparent'
              }`}>
              {t}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">

          {tab === 'overview' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">{sme.long_description || sme.short_description}</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { l: 'Team Size',       v: `${sme.team_size} employees` },
                  { l: 'Stage',           v: sme.stage },
                  { l: 'Instrument',      v: sme.instrument },
                  { l: 'Tenure',          v: `${sme.tenure_months} months` },
                  { l: 'Min. Investment', v: formatINR(sme.min_investment) },
                  { l: 'Risk Level',      v: sme.risk_level },
                ].map(({ l, v }) => (
                  <div key={l} className="bg-cream rounded-xl px-4 py-3">
                    <p className="text-[10px] text-slate-400 mb-0.5">{l}</p>
                    <p className="text-sm font-bold text-navy capitalize">{v}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-bold text-navy mb-2">Fundraise Progress</p>
                <ProgressBar value={sme.progress_pct} />
                <p className="text-[10px] text-slate-400 mt-1">{sme.investor_count} investors · {sme.days_remaining} days remaining</p>
              </div>
            </div>
          )}

          {tab === 'financials' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { l: 'Revenue (FY)',  v: formatINR(sme.revenue_last_fy) },
                  { l: 'Pre-Valuation',v: formatINR(sme.valuation_pre) },
                  { l: 'IRR Target',   v: `${sme.expected_return_min}–${sme.expected_return_max}%` },
                ].map(({ l, v }) => (
                  <div key={l} style={{ background: 'linear-gradient(135deg,#0B1D3A,#1a3a6e)' }} className="rounded-xl p-4 text-white">
                    <p className="text-[10px] mb-1" style={{ color: '#C9A84C' }}>{l}</p>
                    <p className="font-bold text-base">{v}</p>
                  </div>
                ))}
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-xs font-bold text-navy mb-2">⚠️ Risk Disclosure</p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Investment in unlisted MSME securities carries risk. This is a private placement under Companies Act 2013 §42. 
                  Past performance does not guarantee future returns. Please read the PAS-4 document carefully before investing. 
                  Maximum 200 investors per offering.
                </p>
              </div>
            </div>
          )}

          {tab === 'documents' && (
            <div className="space-y-2.5">
              {(sme.documents ?? []).map(doc => (
                <div key={doc.id} className="flex items-center justify-between bg-cream rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{doc.requires_kyc ? '🔒' : '📄'}</span>
                    <div>
                      <p className="text-sm font-semibold text-navy">{doc.name}</p>
                      <p className="text-[10px] text-slate-400">{doc.file_type}</p>
                    </div>
                  </div>
                  <button disabled={doc.requires_kyc && user?.kyc_status !== 'verified'}
                    className={`btn btn-sm ${doc.requires_kyc && user?.kyc_status !== 'verified' ? 'btn-outline opacity-50' : 'btn-primary'}`}>
                    {doc.requires_kyc && user?.kyc_status !== 'verified' ? '🔒 Locked' : '⬇ Download'}
                  </button>
                </div>
              ))}
              {(sme.documents?.length ?? 0) === 0 && (
                <p className="text-center text-sm text-slate-400 py-8">Documents loading…</p>
              )}
            </div>
          )}

          {tab === 'invest' && (
            done ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="text-5xl mb-4">🎉</div>
                <h3 className="font-display text-2xl text-navy mb-2">Investment Submitted!</h3>
                <p className="text-sm text-slate-500 max-w-xs mb-6">
                  Complete eSign and escrow transfer to activate your investment. Check your portfolio for next steps.
                </p>
                <button className="btn btn-primary" onClick={onClose}>View Portfolio →</button>
              </div>
            ) : (
              <div className="space-y-4">
                <div style={{ background: 'linear-gradient(135deg,#0B1D3A,#1a3a6e)' }} className="rounded-xl p-5 text-white">
                  <p className="text-xs mb-1" style={{ color: '#C9A84C' }}>Minimum Investment</p>
                  <p className="font-bold text-2xl">{formatINR(sme.min_investment)}</p>
                </div>

                <div>
                  <label className="form-label">Investment Amount (₹)</label>
                  <input type="number" min={sme.min_investment} step={10000} value={amount}
                    onChange={e => setAmount(Number(e.target.value))}
                    className="form-input text-lg font-bold" style={{ borderColor: '#C9A84C' }} />
                </div>

                <div className="bg-cream rounded-xl p-4">
                  <p className="text-xs text-slate-400 mb-2">All transactions protected by:</p>
                  <div className="flex flex-wrap gap-2">
                    {['🏦 RazorpayX Escrow','✅ Digio eSign','🔐 PAN/Aadhaar KYC','📋 PAS-4 Covered'].map(b => (
                      <span key={b} className="bg-white border border-slate-200 rounded-full text-[10px] px-2.5 py-1 text-navy">{b}</span>
                    ))}
                  </div>
                </div>

                <button onClick={invest} disabled={busy}
                  className="w-full py-3.5 rounded-xl font-bold text-navy text-sm disabled:opacity-60 transition-all hover:shadow-lg hover:-translate-y-0.5"
                  style={{ background: 'linear-gradient(135deg,#C9A84C,#E8C96A)' }}>
                  {busy ? 'Processing…' : `Invest ${formatINR(amount)} →`}
                </button>
              </div>
            )
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-navy text-white px-5 py-3 rounded-xl text-sm font-semibold shadow-xl animate-in">
          {toast}
        </div>
      )}
    </div>
  );
}
