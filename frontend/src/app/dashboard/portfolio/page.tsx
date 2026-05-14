'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Investment, PortfolioSummary } from '@/types';
import { formatINR, formatPct } from '@/lib/utils';
import { Badge, Spinner } from '@/components/ui';

interface PortfolioData {
  investments: Investment[];
  summary: PortfolioSummary;
}

function StatusDot({ done }: { done: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-red-50 text-red-500'}`}>
      {done ? '✓ Done' : '⏳ Pending'}
    </span>
  );
}

export default function PortfolioPage() {
  const { user }                = useAuth();
  const [data,    setData]      = useState<PortfolioData | null>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    api.get<PortfolioData>('/portfolio').then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  const { investments = [], summary } = data ?? { investments: [], summary: { total_invested: 0, total_current: 0, total_gain: 0, gain_pct: '0' } };
  const gainPositive = parseFloat(summary.gain_pct) >= 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-3xl text-navy mb-1">My Portfolio</h1>
        <p className="text-slate-400 text-sm">
          {user?.name} ·{' '}
          <span className={user?.kyc_status === 'verified' ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>
            {user?.kyc_status === 'verified' ? '✓ KYC Verified' : '⚠ KYC Pending'}
          </span>
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-7">
        {/* Total invested */}
        <div className="card p-5 border-t-[3px] border-t-navy">
          <p className="text-xs text-slate-400 mb-1">Total Invested</p>
          <p className="font-display text-3xl text-navy">{formatINR(summary.total_invested)}</p>
          <p className="text-xs text-slate-400 mt-1">{investments.length} holding{investments.length !== 1 ? 's' : ''}</p>
        </div>
        {/* Current value */}
        <div className="card p-5 border-t-[3px] border-t-emerald-500">
          <p className="text-xs text-slate-400 mb-1">Current Value</p>
          <p className="font-display text-3xl text-emerald-600">{formatINR(summary.total_current)}</p>
          <p className="text-xs text-slate-400 mt-1">Mark-to-market</p>
        </div>
        {/* Total return */}
        <div className={`card p-5 border-t-[3px] ${gainPositive ? 'border-t-amber-500' : 'border-t-red-500'}`}>
          <p className="text-xs text-slate-400 mb-1">Total Return</p>
          <p className={`font-display text-3xl ${gainPositive ? 'text-amber-600' : 'text-red-600'}`}>
            {gainPositive ? '+' : ''}{formatPct(summary.gain_pct)}
          </p>
          <p className="text-xs text-slate-400 mt-1">{formatINR(Math.abs(summary.total_gain))} gain</p>
        </div>
      </div>

      {/* Holdings table */}
      <div className="card overflow-hidden mb-5">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-sm text-navy">Holdings</h2>
          <Badge variant="navy">{investments.length} positions</Badge>
        </div>

        {investments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-slate-400">
            <span className="text-4xl mb-3">💼</span>
            <p className="text-sm mb-3">No investments yet.</p>
            <Link href="/dashboard/marketplace" className="btn btn-primary btn-sm">Explore Deals →</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-cream text-left">
                  {['Company','Sector','Invested','Current Value','Return','KYC','eSign','Escrow','Status'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-[10px] text-slate-400 font-bold uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {investments.map(inv => {
                  const ret     = parseFloat(String(inv.return_pct ?? 0));
                  const current = parseFloat(String(inv.current_value ?? inv.amount));
                  return (
                    <tr key={inv.id} className="border-t border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-semibold text-navy whitespace-nowrap">{inv.sme_name}</td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{inv.sector}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{formatINR(inv.amount)}</td>
                      <td className="px-4 py-3 text-sm font-semibold">{formatINR(current)}</td>
                      <td className="px-4 py-3 text-sm font-bold" style={{ color: ret >= 0 ? '#2D7A4F' : '#C0392B' }}>
                        {ret >= 0 ? '+' : ''}{formatPct(ret)}
                      </td>
                      <td className="px-4 py-3"><StatusDot done={inv.kyc_verified} /></td>
                      <td className="px-4 py-3"><StatusDot done={inv.esign_completed} /></td>
                      <td className="px-4 py-3"><StatusDot done={inv.escrow_funded} /></td>
                      <td className="px-4 py-3">
                        <span className={`badge text-[10px] ${inv.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Compliance notice */}
      <div className="rounded-xl p-5" style={{ background: '#FEF9EE', border: '1px solid #C9A84C44' }}>
        <h3 className="text-sm font-bold text-navy mb-2">📬 Escrow & Compliance</h3>
        <p className="text-xs text-slate-600 leading-relaxed">
          All investments are held in a regulated escrow account via RazorpayX. PAS-3 filings are
          auto-submitted post-allotment. eSign documents available in the deal room under Documents.
          Allotment certificates issued within 30 days of funding completion per Companies Act §42.
        </p>
      </div>
    </div>
  );
}
