'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import { StatCard, Spinner, Badge } from '@/components/ui';

const STATUS_BADGE: Record<string, string> = {
  pending:   'badge-navy',
  kyc_done:  'badge-blue',
  invested:  'badge-gold',
  converted: 'badge-green',
  inactive:  'badge-red',
};

export default function AgentDashboardPage() {
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard').then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!data)   return null;

  const { profile, funnel, referrals = [], recent_commissions = [], actions = [] } = data;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl text-navy mb-1">Agent Dashboard</h1>
        <p className="text-slate-400 text-sm">
          Referral Code: <span className="font-bold text-amber-600 tracking-widest">{profile?.referral_code}</span>
          {' · '}Tier: <span className="font-bold text-navy capitalize">{profile?.commission_tier}</span>
          {' · '}Rate: <span className="font-bold text-emerald-600">{profile?.commission_rate_pct}%</span>
        </p>
      </div>

      {/* Action items */}
      {actions.length > 0 && (
        <div className="mb-5 space-y-2">
          {actions.map((a: any, i: number) => (
            <div key={i} className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <span className="text-amber-600 font-bold text-sm">→</span>
              <p className="text-sm text-navy font-medium">{a.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
        <StatCard icon="👥" value={profile?.total_referrals ?? 0}         label="Total Referrals"        sub={`${funnel?.converted} converted`} />
        <StatCard icon="📈" value={formatINR(profile?.total_aum ?? 0)}    label="Total AUM Referred"     sub="Assets Under Management" />
        <StatCard icon="💰" value={formatINR(profile?.commission_earned ?? 0)} label="Commission Earned"  sub="Gross" />
        <StatCard icon="🏦" value={formatINR(profile?.commission_outstanding ?? 0)} label="Pending Payout" sub="Awaiting approval" />
      </div>

      {/* Conversion funnel */}
      <div className="card p-5 mb-5">
        <h2 className="font-semibold text-sm text-navy mb-4">Conversion Funnel</h2>
        <div className="flex items-end gap-2">
          {[
            { label: 'Referred',   count: funnel?.total,    color: '#94A3B8' },
            { label: 'KYC Done',   count: funnel?.kyc_done, color: '#2563EB' },
            { label: 'Invested',   count: funnel?.invested,  color: '#C9A84C' },
          ].map(({ label, count, color }) => {
            const maxH = 100;
            const h    = funnel?.total > 0 ? Math.round((count / funnel.total) * maxH) : 0;
            return (
              <div key={label} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs font-bold text-navy">{count}</span>
                <div style={{ height: `${h}px`, background: color, minHeight: 8 }}
                     className="w-full rounded-t-md transition-all" />
                <span className="text-[10px] text-slate-400 text-center">{label}</span>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-slate-400 mt-3 text-center">Conversion rate: <strong>{funnel?.conversion_rate}%</strong></p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Referrals */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 font-semibold text-sm text-navy">Recent Referrals</div>
          <div className="divide-y divide-slate-50">
            {referrals.slice(0, 8).map((r: any) => (
              <div key={r.referred_user_id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-navy">{r.name}</p>
                  <p className="text-[10px] text-slate-400">{new Date(r.created_at).toLocaleDateString('en-IN')}</p>
                </div>
                <div className="flex items-center gap-2">
                  {r.total_invested > 0 && <span className="text-xs font-bold text-emerald-600">{formatINR(r.total_invested)}</span>}
                  <span className={`badge text-[10px] ${STATUS_BADGE[r.status] ?? 'badge-navy'}`}>{r.status}</span>
                </div>
              </div>
            ))}
            {referrals.length === 0 && <p className="p-5 text-sm text-slate-400 text-center">No referrals yet. Share your code!</p>}
          </div>
        </div>

        {/* Commissions */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 font-semibold text-sm text-navy">Recent Commissions</div>
          <div className="divide-y divide-slate-50">
            {recent_commissions.slice(0, 8).map((c: any) => (
              <div key={c.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-navy">{c.sme_name}</p>
                  <p className="text-[10px] text-slate-400">Invest: {formatINR(c.investment_amount)} · Rate: {c.rate_pct}%</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-emerald-600">{formatINR(c.commission_amount)}</p>
                  <span className={`badge text-[10px] ${c.status === 'paid' ? 'badge-green' : 'badge-gold'}`}>{c.status}</span>
                </div>
              </div>
            ))}
            {recent_commissions.length === 0 && <p className="p-5 text-sm text-slate-400 text-center">No commissions yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
