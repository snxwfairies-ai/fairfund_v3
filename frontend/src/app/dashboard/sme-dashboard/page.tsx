'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { SME, Investment, ComplianceTask } from '@/types';
import { formatINR } from '@/lib/utils';
import { ProgressBar, StatCard, Spinner, Badge } from '@/components/ui';

interface DashboardData {
  sme: SME & { progress_pct: number; days_remaining: number };
  investors: (Investment & { investor_name: string; email: string })[];
  compliance: ComplianceTask[];
  days_left: number;
}

const COMPLIANCE_ICONS: Record<string, string> = {
  done:        '✅',
  in_progress: '🔄',
  pending:     '⏳',
  failed:      '❌',
  waived:      '➖',
};

export default function SMEDashboardPage() {
  const [data,    setData]    = useState<DashboardData | null>(null);
  const [smeId,   setSmeId]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<SME[]>('/smes').then(list => {
      if (list[0]) { setSmeId(list[0].id); }
      else          { setLoading(false); }
    });
  }, []);

  useEffect(() => {
    if (!smeId) return;
    api.get<DashboardData>(`/dashboard/sme/${smeId}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, [smeId]);

  if (loading) return <Spinner />;
  if (!data)   return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
      <span className="text-4xl mb-3">🏢</span>
      <p className="text-sm">No SME data available.</p>
    </div>
  );

  const { sme, investors, compliance, days_left } = data;
  const compDone  = compliance.filter(c => c.status === 'done').length;
  const compTotal = compliance.length;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-3xl text-navy mb-1">{sme.legal_name}</h1>
        <p className="text-slate-400 text-sm">
          CIN: {sme.cin} · Stage: <span className="font-semibold text-navy">{sme.stage}</span>
        </p>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
        <StatCard icon="💰" value={formatINR(sme.raised_so_far)} label="Raised So Far"
          sub={`of ${formatINR(sme.target_raise)} target`} />
        <StatCard icon="👥" value={sme.investor_count} label="Investors" sub="Committed" />
        <StatCard icon="⏳" value={days_left}           label="Days Left"  sub="Until closing" />
        <StatCard icon="⭐" value={`${sme.fairfund_score}/100`} label="FairFund Score" sub="AI-assisted" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

        {/* Fundraise progress */}
        <div className="card p-5">
          <h2 className="font-semibold text-sm text-navy mb-4">Fundraise Progress</h2>
          <ProgressBar value={sme.progress_pct} />
          <div className="grid grid-cols-2 gap-3 mt-4">
            {[
              { l: 'Committed',   v: formatINR(sme.raised_so_far) },
              { l: 'Remaining',   v: formatINR(sme.target_raise - sme.raised_so_far) },
              { l: 'Min. Ticket', v: formatINR(sme.min_investment) },
              { l: 'Closing',     v: new Date(sme.closing_date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) },
            ].map(({ l, v }) => (
              <div key={l} className="bg-cream rounded-lg px-3 py-2">
                <p className="text-xs font-bold text-navy">{v}</p>
                <p className="text-[10px] text-slate-400">{l}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Compliance checklist */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm text-navy">Compliance Checklist</h2>
            <span className="text-xs font-bold text-slate-500">{compDone}/{compTotal} complete</span>
          </div>

          {/* Mini progress */}
          <div className="progress-bar mb-4">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400"
                 style={{ width: `${compTotal > 0 ? (compDone/compTotal)*100 : 0}%` }} />
          </div>

          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {compliance.map(task => (
              <div key={task.id} className="flex items-center gap-2.5 py-1.5 border-b border-slate-50 last:border-0">
                <span className="text-sm flex-shrink-0">{COMPLIANCE_ICONS[task.status] ?? '⏳'}</span>
                <span className="text-xs text-slate-600 flex-1">{task.task_name}</span>
                {task.is_mandatory && task.status !== 'done' && (
                  <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">Required</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Investor table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-sm text-navy">Committed Investors</h2>
          <Badge variant="navy">{investors.length} investors</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-cream">
                {['Investor','Amount','KYC','eSign','Escrow','Status','Date'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {investors.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">No investors yet</td></tr>
              ) : investors.map(inv => (
                <tr key={inv.id} className="border-t border-slate-50 hover:bg-slate-50/40 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-navy">{inv.investor_name}</p>
                    <p className="text-[10px] text-slate-400">{inv.email}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 font-medium">{formatINR(inv.amount)}</td>
                  {[inv.kyc_verified, inv.esign_completed, inv.escrow_funded].map((done, i) => (
                    <td key={i} className="px-4 py-3">
                      <span className={`badge text-[10px] ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                        {done ? '✓ Done' : 'Pending'}
                      </span>
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <span className={`badge text-[10px] ${inv.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[10px] text-slate-400 whitespace-nowrap">
                    {new Date(inv.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
