'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui';

const ROLE_LABEL: Record<string,string> = { investor:'Investor', sme:'MSME', agent:'Agent', ca_cs:'CA/CS' };
const STATUS_CLS: Record<string,string>  = {
  pending:    'bg-amber-100 text-amber-700',
  invited:    'bg-blue-100 text-blue-700',
  registered: 'bg-emerald-100 text-emerald-700',
};

export default function WaitlistAdminPage() {
  const [data,    setData]    = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [roleFilter, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const load = () => {
    setLoading(true);
    const q = roleFilter ? `?role=${roleFilter}&limit=100` : '?limit=100';
    Promise.all([
      api.get<any>('/waitlist/stats'),
      api.get<any>('/waitlist' + q),
    ]).then(([s, e]: any[]) => {
      setData(s); setEntries(e.entries ?? []);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [roleFilter]);

  async function invite(id: string, name: string) {
    await api.put(`/waitlist/${id}/invite`, {});
    setMsg(`Invited ${name} \u2705`); setTimeout(() => setMsg(''), 3000); load();
  }

  if (loading) return <Spinner />;
  const stats = data?.by_role ?? [];
  const total = data?.total ?? 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl text-navy mb-1">Waitlist</h1>
        <p className="text-slate-400 text-sm">{total} total signups</p>
      </div>
      {msg && <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4 text-sm text-emerald-700">{msg}</div>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
        {stats.map((s: any) => (
          <div key={s.role} className="card p-5">
            <p className="text-xs text-slate-400 mb-1">{ROLE_LABEL[s.role] ?? s.role}</p>
            <p className="font-display text-3xl text-navy">{s.total}</p>
            <p className="text-xs text-slate-400 mt-1">{s.pending} pending \u00b7 {s.invited} invited \u00b7 {s.converted} converted</p>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mb-5">
        {[['All',''],['Investors','investor'],['MSMEs','sme'],['Agents','agent'],['CA/CS','ca_cs']].map(([l,v]) => (
          <button key={v} onClick={() => setRole(v)} className={`btn btn-sm ${roleFilter===v?'btn-primary':'btn-outline'}`}>{l}</button>
        ))}
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="bg-cream">
              {['Name','Email','Role','City','Ticket Size','Source','Status','Joined','Action'].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide whitespace-nowrap">{h}</th>
              )}
            </tr></thead>
            <tbody>
              {entries.length===0
                ? <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">No entries</td></tr>
                : entries.map(e => (
                  <tr key={e.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-sm font-semibold text-navy">{e.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{e.email}</td>
                    <td className="px-4 py-3"><span className="badge text-[10px] badge-navy">{ROLE_LABEL[e.role]}</span></td>
                    <td className="px-4 py-3 text-xs text-slate-500">{e.city||'\u2014'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{e.investment_size||e.raise_amount||'\u2014'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{e.referral_source||'\u2014'}</td>
                    <td className="px-4 py-3"><span className={`badge text-[10px] ${STATUS_CLS[e.status]??'badge-navy'}`}>{e.status}</span></td>
                    <td className="px-4 py-3 text-[10px] text-slate-400 whitespace-nowrap">{new Date(e.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</td>
                    <td className="px-4 py-3">{e.status==='pending'&&<button onClick={()=>invite(e.id,e.name)} className="btn btn-primary btn-sm">Invite</button>}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
