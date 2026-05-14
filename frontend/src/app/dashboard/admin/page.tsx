'use client';
import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import { StatCard, Spinner, Badge } from '@/components/ui';

type AdminTab = 'overview' | 'kyc' | 'smes' | 'investments' | 'audit';

function ConfirmModal({ title, msg, onConfirm, onClose }: any) {
  const [loading, setLoading] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(11,29,58,0.72)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="font-display text-lg text-navy mb-2">{title}</h3>
        <p className="text-sm text-slate-500 mb-5">{msg}</p>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn btn-outline flex-1">Cancel</button>
          <button onClick={async () => { setLoading(true); await onConfirm(); setLoading(false); onClose(); }}
            disabled={loading} className="btn btn-primary flex-1">{loading ? 'Processing…' : 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [tab,     setTab]     = useState<AdminTab>('overview');
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<any>(null);
  const [msg,     setMsg]     = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get<any>('/admin/dashboard').then((d: any) => setData(d.data ?? d)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toast = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  async function approveKYC(id: string) {
    await api.put(`/admin/kyc/${id}/approve`, {});
    toast('KYC approved ✅'); load();
  }
  async function rejectKYC(id: string, reason = 'Documents unclear') {
    await api.put(`/admin/kyc/${id}/reject`, { reason });
    toast('KYC rejected'); load();
  }
  async function approveSME(id: string) {
    await api.put(`/admin/smes/${id}/approve`, { risk_level: 'medium', score: 75, notes: 'Admin approved' });
    toast('SME approved ✅'); load();
  }
  async function rejectSME(id: string) {
    await api.put(`/admin/smes/${id}/reject`, { reason: 'Insufficient documentation' });
    toast('SME rejected'); load();
  }
  async function settleInvestment(id: string) {
    await api.put(`/admin/investments/${id}/settle`, {});
    toast('Investment allotted ✅'); load();
  }
  async function runReconcile() {
    const r = await api.post('/transactions/reconcile', {});
    const d = (r as any).data ?? r;
    toast(`Reconcile: ${d.stuck_investments} stuck, ${d.imbalanced_accounts} imbalanced`);
  }

  const TABS: { key: AdminTab; label: string; icon: string }[] = [
    { key: 'overview',    label: 'Overview',    icon: '📊' },
    { key: 'kyc',         label: 'KYC Queue',   icon: '🔐' },
    { key: 'smes',        label: 'SME Review',  icon: '🏢' },
    { key: 'investments', label: 'Investments', icon: '💰' },
    { key: 'audit',       label: 'Audit Log',   icon: '📋' },
  ];

  if (loading) return <Spinner />;

  const { platform, pending_kyc = [], pending_verification = [], recent_flags = [], stuck_transactions = [], actions = [] } = data ?? {};

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl text-navy mb-1">Admin Panel</h1>
        <p className="text-slate-400 text-sm">Platform management · Full access</p>
      </div>

      {msg && <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4 text-sm text-emerald-700 font-medium">{msg}</div>}

      {/* Critical action alerts */}
      {actions.length > 0 && (
        <div className="space-y-2 mb-5">
          {actions.map((a: any, i: number) => (
            <div key={i} className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-sm text-red-700 font-medium">🚨 {a.label}</p>
              <button onClick={() => setTab(a.urgency === 'critical' ? 'investments' : 'kyc')} className="btn btn-sm" style={{ background: '#C0392B', color: 'white' }}>View →</button>
            </div>
          ))}
        </div>
      )}

      {/* Platform stats */}
      {platform && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatCard icon="🏛️" value={platform.active_listings ?? 0}  label="Active Listings" />
          <StatCard icon="👥" value={platform.total_investors ?? 0}  label="Verified Investors" sub={`+${platform.new_users_30d ?? 0} this month`} />
          <StatCard icon="💰" value={formatINR(platform.total_raised ?? 0)} label="Total Raised" />
          <StatCard icon="✅" value={platform.verified_investors ?? 0} label="KYC Verified" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-5 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-all ${tab === t.key ? 'text-navy border-amber-500' : 'text-slate-400 border-transparent'}`}>
            <span>{t.icon}</span>{t.label}
            {t.key === 'kyc'  && pending_kyc.length   > 0 && <span className="ml-1 bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">{pending_kyc.length}</span>}
            {t.key === 'smes' && pending_verification.length > 0 && <span className="ml-1 bg-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">{pending_verification.length}</span>}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm text-navy">Stuck Transactions</h2>
              <button onClick={runReconcile} className="btn btn-outline btn-sm">🔧 Run Reconcile</button>
            </div>
            {stuck_transactions.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">✅ No stuck transactions</p>
            ) : stuck_transactions.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between py-2 border-b border-slate-50">
                <div>
                  <p className="text-sm font-medium text-navy">{formatINR(t.amount)} · {t.txn_type}</p>
                  <p className="text-[10px] text-slate-400">{new Date(t.created_at).toLocaleString('en-IN')}</p>
                </div>
                <span className="badge badge-red text-[10px]">{t.status}</span>
              </div>
            ))}
          </div>
          {recent_flags.length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold text-sm text-navy mb-3">Recent Flags</h2>
              {recent_flags.map((f: any, i: number) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-50 text-sm">
                  <span className="text-red-500 font-black">!</span>
                  <span className="text-navy">{f.action}</span>
                  <span className="text-slate-400 text-xs ml-auto">{new Date(f.created_at).toLocaleDateString('en-IN')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* KYC Queue */}
      {tab === 'kyc' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 font-semibold text-sm text-navy">KYC Pending ({pending_kyc.length})</div>
          {pending_kyc.length === 0 ? (
            <p className="p-8 text-center text-slate-400 text-sm">✅ No pending KYC reviews</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {pending_kyc.map((u: any) => (
                <div key={u.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-navy">{u.name}</p>
                    <p className="text-xs text-slate-400">{u.email} · {u.role} · {new Date(u.created_at).toLocaleDateString('en-IN')}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirm({ title: 'Reject KYC', msg: `Reject KYC for ${u.name}?`, onConfirm: () => rejectKYC(u.id) })}
                      className="btn btn-sm" style={{ background: '#FEE2E2', color: '#C0392B' }}>Reject</button>
                    <button onClick={() => setConfirm({ title: 'Approve KYC', msg: `Approve KYC for ${u.name}?`, onConfirm: () => approveKYC(u.id) })}
                      className="btn btn-primary btn-sm">Approve ✓</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SME Review */}
      {tab === 'smes' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 font-semibold text-sm text-navy">SMEs Pending Review ({pending_verification.length})</div>
          {pending_verification.length === 0 ? (
            <p className="p-8 text-center text-slate-400 text-sm">✅ No SMEs pending review</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {pending_verification.map((v: any) => (
                <div key={v.id} className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-navy">{v.legal_name}</p>
                    <p className="text-xs text-slate-400">Owner: {v.owner} · Priority: {v.priority}</p>
                    <span className={`badge text-[9px] mt-1 ${v.status === 'in_review' ? 'badge-blue' : 'badge-gold'}`}>{v.status}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirm({ title: 'Reject SME', msg: `Reject ${v.legal_name}?`, onConfirm: () => rejectSME(v.sme_id ?? v.id) })}
                      className="btn btn-sm" style={{ background: '#FEE2E2', color: '#C0392B' }}>Reject</button>
                    <button onClick={() => setConfirm({ title: 'Approve SME', msg: `Approve ${v.legal_name}?`, onConfirm: () => approveSME(v.sme_id ?? v.id) })}
                      className="btn btn-primary btn-sm">Approve ✓</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Investments */}
      {tab === 'investments' && <InvestmentsTab onSettle={settleInvestment} toast={toast} />}

      {/* Audit log */}
      {tab === 'audit' && <AuditTab />}

      {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function InvestmentsTab({ onSettle, toast }: any) {
  const [investments, setInvestments] = useState<any[]>([]);
  const [statusFilter, setFilter]     = useState('FUNDS_LOCKED');

  useEffect(() => {
    api.get(`/admin/investments?status=${statusFilter}`)
      .then(d => setInvestments((d as any).data ?? d)).catch(() => {});
  }, [statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {['FUNDS_LOCKED','ALLOTTED','REFUNDED','DEFAULTED'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-outline'}`}>{s}</button>
        ))}
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="bg-cream">
              {['Investor','Company','Amount','Status','Actions'].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] text-slate-400 font-bold uppercase">{h}</th>)}
            </tr></thead>
            <tbody>
              {investments.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">No investments found</td></tr>
              ) : investments.slice(0, 20).map((inv: any) => (
                <tr key={inv.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-sm">{inv.investor_name}</td>
                  <td className="px-4 py-3 text-sm font-medium text-navy">{inv.sme_name}</td>
                  <td className="px-4 py-3 text-sm">{formatINR(inv.amount)}</td>
                  <td className="px-4 py-3"><span className={`badge text-[10px] ${inv.status === 'ALLOTTED' ? 'badge-green' : inv.status === 'FUNDS_LOCKED' ? 'badge-gold' : 'badge-navy'}`}>{inv.status}</span></td>
                  <td className="px-4 py-3">
                    {inv.status === 'FUNDS_LOCKED' && (
                      <button onClick={() => onSettle(inv.id)} className="btn btn-primary btn-sm">Settle →</button>
                    )}
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

function AuditTab() {
  const [logs, setLogs] = useState<any[]>([]);
  useEffect(() => {
    api.get<any>('/admin/audit?limit=50').then((d: any) => setLogs((d as any).data ?? d)).catch(() => {});
  }, []);
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="bg-cream">{['Action','Type','Time'].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] text-slate-400 font-bold uppercase">{h}</th>)}</tr></thead>
          <tbody>
            {logs.map((l: any, i: number) => (
              <tr key={i} className="border-t border-slate-50 text-sm">
                <td className="px-4 py-2.5 font-mono text-xs text-navy">{l.action}</td>
                <td className="px-4 py-2.5 text-slate-500">{l.entity_type}</td>
                <td className="px-4 py-2.5 text-slate-400 text-xs">{new Date(l.created_at).toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
