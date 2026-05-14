'use client';
import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { SME, PlatformStats } from '@/types';
import { formatINR, formatPct } from '@/lib/utils';
import { StatCard, Spinner, Empty } from '@/components/ui';
import { SMECard } from '@/components/SMECard';
import { DealModal } from '@/components/DealModal';

export default function MarketplacePage() {
  const [smes,     setSmes]     = useState<SME[]>([]);
  const [stats,    setStats]    = useState<PlatformStats | null>(null);
  const [sectors,  setSectors]  = useState<string[]>(['All']);
  const [filter,   setFilter]   = useState('All');
  const [search,   setSearch]   = useState('');
  const [selected, setSelected] = useState<SME | null>(null);
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'All') params.set('sector', filter);
      if (search)           params.set('search', search);

      const [s, sec, st] = await Promise.all([
        api.get<SME[]>(`/smes?${params}`),
        api.get<string[]>('/smes/meta/sectors'),
        api.get<PlatformStats>('/analytics/platform'),
      ]);
      setSmes(s); setSectors(sec); setStats(st);
    } catch { /* handled gracefully */ }
    finally { setLoading(false); }
  }, [filter, search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-3xl text-navy mb-1">Live Deals</h1>
        <p className="text-slate-400 text-sm">{smes.length} MSME opportunities · Updated in real-time</p>
      </div>

      {/* Platform stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
          <StatCard icon="💰" value={formatINR(stats.total_raised)}   label="Total Raised"       sub="+23% MoM" />
          <StatCard icon="👥" value={stats.total_investors}           label="Active Investors"   sub={`${stats.new_users_30d} new this month`} />
          <StatCard icon="📈" value={`${formatPct(stats.avg_return)}`} label="Avg. Expected IRR" sub="Across all listings" />
          <StatCard icon="🏛️" value={stats.active_listings}           label="Live Listings"      sub="SEBI-reviewed" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search SMEs…"
            className="form-input pl-9 w-52 h-9 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {sectors.map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                filter === s
                  ? 'bg-navy text-white shadow-sm'
                  : 'bg-white text-slate-500 border border-slate-200 hover:border-amber-400'
              }`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? <Spinner /> : smes.length === 0 ? (
        <Empty icon="🔍" text="No deals match your filters. Try a different sector." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {smes.map(sme => (
            <SMECard key={sme.id} sme={sme} onClick={setSelected} />
          ))}
        </div>
      )}

      {selected && <DealModal sme={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
