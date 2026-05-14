'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Spinner, Badge } from '@/components/ui';

const PRIORITY_LABEL: Record<number, { text: string; cls: string }> = {
  1: { text: 'Urgent',  cls: 'badge-red' },
  2: { text: 'High',    cls: 'badge-gold' },
  3: { text: 'Medium',  cls: 'badge-blue' },
  4: { text: 'Low',     cls: 'badge-navy' },
};

const STATUS_STYLE: Record<string, string> = {
  queued:       'bg-slate-100 text-slate-600',
  in_review:    'bg-blue-100 text-blue-700',
  approved:     'bg-emerald-100 text-emerald-700',
  rejected:     'bg-red-100 text-red-700',
  info_required:'bg-amber-100 text-amber-700',
};

function ReviewModal({ item, onClose, onSubmit }: any) {
  const [action, setAction]   = useState<'approve'|'reject'|'request_info'>('approve');
  const [notes,  setNotes]    = useState('');
  const [info,   setInfo]     = useState('');
  const [busy,   setBusy]     = useState(false);

  async function submit() {
    if (!notes.trim()) return;
    setBusy(true);
    try {
      await api.put(`/ca/queue/${item.id}/review`, { action, notes, info_required: info || undefined });
      onSubmit();
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(11,29,58,0.72)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="font-display text-xl text-navy mb-1">Review: {item.legal_name}</h3>
        <p className="text-xs text-slate-400 mb-5">Owner: {item.msme_owner} · {item.email}</p>

        <div className="mb-4">
          <label className="form-label">Decision</label>
          <div className="flex gap-2">
            {(['approve','reject','request_info'] as const).map(a => (
              <button key={a} onClick={() => setAction(a)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all capitalize ${
                  action === a
                    ? a === 'approve' ? 'bg-emerald-600 text-white'
                      : a === 'reject' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}>
                {a.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="form-label">Review Notes <span className="text-red-500">*</span></label>
          <textarea className="form-input h-24 resize-none" value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Detailed review notes for audit trail..." />
        </div>

        {action === 'request_info' && (
          <div className="mb-4">
            <label className="form-label">Information Required</label>
            <input className="form-input" value={info} onChange={e => setInfo(e.target.value)}
              placeholder="Specify what documents or info is needed..." />
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="btn btn-outline flex-1">Cancel</button>
          <button onClick={submit} disabled={busy || !notes.trim()}
            className={`btn flex-1 font-bold ${action === 'approve' ? 'btn-primary' : action === 'reject' ? 'bg-red-600 text-white' : 'btn-gold'}`}>
            {busy ? 'Submitting…' : `Submit ${action.replace('_',' ')}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CADashboardPage() {
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<any>(null);

  const load = () => api.get('/dashboard').then(setData).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function startReview(itemId: string) {
    await api.put(`/ca/queue/${itemId}/start`, {});
    load();
  }

  if (loading) return <Spinner />;
  if (!data)   return null;

  const { profile, urgent_queue = [], recent_approvals = [], actions = [], stats } = data;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl text-navy mb-1">CA/CS Dashboard</h1>
        <p className="text-slate-400 text-sm">
          {profile?.professional_type?.toUpperCase()} · {profile?.membership_number} · {profile?.membership_body}
        </p>
      </div>

      {/* Action alerts */}
      {actions.length > 0 && (
        <div className="mb-5 space-y-2">
          {actions.map((a: any, i: number) => (
            <div key={i} className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <span className="text-red-600 font-black">!</span>
              <p className="text-sm text-red-700 font-medium">{a.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
        <div className="card p-5 border-t-[3px] border-t-blue-500">
          <p className="text-xs text-slate-400 mb-1">Queue</p>
          <p className="font-display text-3xl text-navy">{profile?.pending_count ?? urgent_queue.length}</p>
          <p className="text-xs text-slate-400">Active items</p>
        </div>
        <div className="card p-5 border-t-[3px] border-t-amber-500">
          <p className="text-xs text-slate-400 mb-1">In Review</p>
          <p className="font-display text-3xl text-amber-600">{profile?.in_review_count ?? 0}</p>
          <p className="text-xs text-slate-400">Being reviewed</p>
        </div>
        <div className="card p-5 border-t-[3px] border-t-red-500">
          <p className="text-xs text-slate-400 mb-1">Overdue</p>
          <p className="font-display text-3xl text-red-600">{profile?.overdue_count ?? 0}</p>
          <p className="text-xs text-slate-400">Past due date</p>
        </div>
        <div className="card p-5 border-t-[3px] border-t-emerald-500">
          <p className="text-xs text-slate-400 mb-1">Completed</p>
          <p className="font-display text-3xl text-emerald-600">{profile?.verifications_done ?? 0}</p>
          <p className="text-xs text-slate-400">Total verified</p>
        </div>
      </div>

      {/* Queue */}
      <div className="card overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-sm text-navy">Verification Queue</h2>
          <span className="text-xs text-slate-400">Load: {profile?.current_load}/{profile?.max_load}</span>
        </div>
        {urgent_queue.length === 0 ? (
          <p className="p-6 text-center text-slate-400 text-sm">🎉 Queue is clear!</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {urgent_queue.map((item: any) => {
              const isOverdue = item.due_date && new Date(item.due_date) < new Date();
              return (
                <div key={item.id} className={`px-5 py-4 flex items-center justify-between ${isOverdue ? 'bg-red-50/30' : ''}`}>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-navy">{item.legal_name ?? 'Unknown SME'}</p>
                      <span className={`badge text-[9px] ${PRIORITY_LABEL[item.priority]?.cls ?? 'badge-navy'}`}>
                        {PRIORITY_LABEL[item.priority]?.text}
                      </span>
                      {isOverdue && <span className="badge text-[9px] badge-red">OVERDUE</span>}
                    </div>
                    <p className="text-xs text-slate-400">
                      Due: {item.due_date ? new Date(item.due_date).toLocaleDateString('en-IN') : 'N/A'}
                      {' · '}Status: <span className={`badge text-[9px] ${STATUS_STYLE[item.status]}`}>{item.status}</span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {item.status === 'queued' && (
                      <button onClick={() => startReview(item.id)} className="btn btn-outline btn-sm">Start</button>
                    )}
                    <button onClick={() => setReviewing(item)} className="btn btn-primary btn-sm">Review →</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent completed */}
      {recent_approvals.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 font-semibold text-sm text-navy">Recently Completed</div>
          <div className="divide-y divide-slate-50">
            {recent_approvals.map((a: any) => (
              <div key={a.id} className="px-5 py-3 flex items-center justify-between">
                <p className="text-sm text-navy">{a.legal_name}</p>
                <div className="flex items-center gap-2">
                  <span className={`badge text-[10px] ${STATUS_STYLE[a.status]}`}>{a.status}</span>
                  <span className="text-[10px] text-slate-400">{new Date(a.completed_at).toLocaleDateString('en-IN')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {reviewing && (
        <ReviewModal item={reviewing} onClose={() => setReviewing(null)} onSubmit={() => { setReviewing(null); load(); }} />
      )}
    </div>
  );
}
