'use client';
import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { api } from '@/lib/api';
import { PlatformStats } from '@/types';
import { formatINR, SECTOR_COLORS } from '@/lib/utils';
import { Spinner } from '@/components/ui';

const CHART_COLORS = Object.values(SECTOR_COLORS);

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-navy text-white px-3 py-2 rounded-lg text-xs shadow-xl">
      <p className="font-bold mb-0.5">{label}</p>
      <p style={{ color: '#C9A84C' }}>₹{payload[0].value}L raised</p>
    </div>
  );
}

export default function AnalyticsPage() {
  const [stats,   setStats]   = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<PlatformStats>('/analytics/platform').then(setStats).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!stats)  return null;

  const monthlyData = stats.monthly.map(m => ({ ...m, amount: Math.round(m.amount / 100_000) }));
  const sectorData  = stats.sectors.map(s => ({ name: s.sector, value: Math.round(parseFloat(String(s.raised)) / 100_000) }));
  const totalRaised = sectorData.reduce((a, s) => a + s.value, 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-3xl text-navy mb-1">Platform Analytics</h1>
        <p className="text-slate-400 text-sm">FaireFund · Real-time overview</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-7">
        <div className="card p-5">
          <p className="text-xs text-slate-400 mb-1">Total Raised (Platform)</p>
          <p className="font-display text-3xl text-navy">{formatINR(stats.total_raised)}</p>
          <p className="text-xs text-emerald-600 font-semibold mt-1">↑ +23% month-on-month</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-slate-400 mb-1">Verified Investors</p>
          <p className="font-display text-3xl text-emerald-600">{stats.verified_investors ?? stats.total_investors}</p>
          <p className="text-xs text-slate-400 mt-1">+{stats.new_users_30d} new this month</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-slate-400 mb-1">Avg. Expected Return</p>
          <p className="font-display text-3xl" style={{ color: '#C9A84C' }}>{stats.avg_return}% p.a.</p>
          <p className="text-xs text-slate-400 mt-1">Weighted across active listings</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

        {/* Monthly fundraise bar chart */}
        <div className="card p-5">
          <h2 className="font-semibold text-sm text-navy mb-5">Monthly Fundraise Volume (₹ Lakh)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData} margin={{ top: 0, right: 8, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#C9A84C" />
                  <stop offset="100%" stopColor="#0B1D3A" />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(201,168,76,0.06)' }} />
              <Bar dataKey="amount" fill="url(#barGrad)" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Sector pie chart */}
        <div className="card p-5">
          <h2 className="font-semibold text-sm text-navy mb-5">Sector Distribution</h2>
          {sectorData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={sectorData} cx="45%" cy="50%"
                  outerRadius={80} innerRadius={45}
                  dataKey="value" paddingAngle={3}>
                  {sectorData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [`₹${v}L`, 'Raised']} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="space-y-3 pt-2">
              {stats.sectors.map((s, i) => {
                const pct = totalRaised > 0 ? Math.round((parseFloat(String(s.raised)) / 100_000 / totalRaised) * 100) : 0;
                return (
                  <div key={s.sector}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600">{s.sector}</span>
                      <span className="font-bold text-navy">{pct}%</span>
                    </div>
                    <div className="progress-bar">
                      <div style={{ width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }}
                           className="h-full rounded-full" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Top SMEs table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-sm text-navy">Top Listings by FaireFund Score</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-cream">
                {['Rank','Company','Score','Raised','Target','Progress'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.top_smes.map((s, i) => {
                const pct = s.target_raise > 0 ? Math.round((s.raised_so_far / s.target_raise) * 100) : 0;
                return (
                  <tr key={s.name} className="border-t border-slate-50 hover:bg-slate-50/40 transition-colors">
                    <td className="px-4 py-3 text-sm font-black text-slate-300">#{i + 1}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-navy">{s.name}</td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-black" style={{
                        color: s.score >= 85 ? '#2D7A4F' : s.score >= 70 ? '#C9A84C' : '#C0392B',
                      }}>{s.score}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{formatINR(s.raised_so_far)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{formatINR(s.target_raise)}</td>
                    <td className="px-4 py-3" style={{ minWidth: 130 }}>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 progress-bar">
                          <div style={{ width: `${pct}%` }}
                               className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-400" />
                        </div>
                        <span className="text-xs font-bold text-navy">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
