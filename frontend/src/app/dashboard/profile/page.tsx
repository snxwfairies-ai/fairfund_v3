'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Spinner, Badge } from '@/components/ui';

const STEPS = ['register','profile','kyc','verification','approval','active'] as const;
const STEP_LABELS: Record<string, string> = {
  register: 'Registered', profile: 'Profile', kyc: 'KYC', verification: 'Verification', approval: 'Approval', active: 'Active',
};

function StepTracker({ currentStep }: { currentStep: string }) {
  const idx = STEPS.indexOf(currentStep as any);
  return (
    <div className="flex items-center gap-1 mb-6">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center flex-1">
          <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0 transition-all ${
            i < idx  ? 'bg-emerald-500 text-white' :
            i === idx ? 'bg-navy text-white ring-2 ring-amber-400 ring-offset-1' :
            'bg-slate-200 text-slate-400'
          }`}>{i < idx ? '✓' : i + 1}</div>
          {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-1 ${i < idx ? 'bg-emerald-500' : 'bg-slate-200'}`} />}
        </div>
      ))}
    </div>
  );
}

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [profile,  setProfile]  = useState<any>(null);
  const [onboarding, setOnboarding] = useState<any>(null);
  const [kycStatus,  setKycStatus]  = useState<any>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [tab,      setTab]      = useState<'profile'|'kyc'|'onboarding'>('profile');
  const [form,     setForm]     = useState({ name: '', phone: '', address_city: '', address_state: '', annual_income_band: '' });
  const [kycForm,  setKycForm]  = useState({ pan: '', aadhaar_last4: '', bank_account_number: '', bank_ifsc: '' });
  const [msg,      setMsg]      = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/users/me'),
      api.get('/onboarding/status'),
      api.get('/users/me/kyc'),
    ]).then(([p, o, k]: any[]) => {
      setProfile(p); setOnboarding(o); setKycStatus(k);
      setForm({ name: p.name ?? '', phone: p.phone ?? '', address_city: p.address_city ?? '', address_state: p.address_state ?? '', annual_income_band: p.annual_income_band ?? '' });
    }).finally(() => setLoading(false));
  }, []);

  async function saveProfile() {
    setSaving(true);
    try {
      await api.put('/users/me', form);
      setMsg('Profile updated ✅');
      refreshUser();
      setTimeout(() => setMsg(''), 3000);
    } catch(e: any) { setMsg(e.message); }
    finally { setSaving(false); }
  }

  async function submitKYC() {
    setSaving(true);
    try {
      await api.post('/users/me/kyc', kycForm);
      setMsg('KYC submitted — under review ✅');
      const o = await api.get('/onboarding/status');
      setOnboarding(o);
      setTimeout(() => setMsg(''), 4000);
    } catch(e: any) { setMsg(e.message); }
    finally { setSaving(false); }
  }

  async function advanceOnboarding() {
    setSaving(true);
    try { const r: any = await api.post('/onboarding/advance', {}); setOnboarding((prev: any) => ({ ...prev, current_step: r.to })); setMsg(`Advanced to ${r.to} ✅`); }
    catch(e: any) { setMsg(e.message); }
    finally { setSaving(false); }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl text-navy mb-1">My Profile</h1>
        <p className="text-slate-400 text-sm">{user?.email} · <span className={`font-semibold ${user?.kyc_status === 'verified' ? 'text-emerald-600' : 'text-amber-600'}`}>{user?.kyc_status?.replace('_',' ')}</span></p>
      </div>

      {/* Onboarding tracker */}
      {onboarding && onboarding.current_step !== 'active' && (
        <div className="card p-5 mb-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Onboarding Progress</p>
          <StepTracker currentStep={onboarding.current_step} />
          {onboarding.blockers?.length > 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs font-bold text-amber-700 mb-1">Complete to advance:</p>
              {onboarding.blockers.map((b: string, i: number) => <p key={i} className="text-xs text-amber-600">• {b}</p>)}
            </div>
          ) : (
            <button onClick={advanceOnboarding} disabled={saving}
              className="btn btn-gold btn-sm w-full justify-center">
              {saving ? 'Processing…' : `Advance to ${onboarding.next_step} →`}
            </button>
          )}
        </div>
      )}

      {msg && <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4 text-sm text-emerald-700">{msg}</div>}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-5">
        {(['profile','kyc','onboarding'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-3 text-sm font-semibold capitalize transition-all border-b-2 ${tab === t ? 'text-navy border-amber-500' : 'text-slate-400 border-transparent'}`}>
            {t === 'kyc' ? 'KYC Documents' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {tab === 'profile' && (
        <div className="card p-6 max-w-lg">
          <div className="grid grid-cols-2 gap-4 mb-5">
            {[['name','Full Name'],['phone','Phone'],['address_city','City'],['address_state','State']].map(([k,label]) => (
              <div key={k}>
                <label className="form-label">{label}</label>
                <input className="form-input" value={(form as any)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
              </div>
            ))}
            <div className="col-span-2">
              <label className="form-label">Annual Income Band</label>
              <select className="form-input" value={form.annual_income_band} onChange={e => setForm(f => ({ ...f, annual_income_band: e.target.value }))}>
                <option value="">Select…</option>
                {['10L-25L','25L-50L','50L-1Cr','1Cr+'].map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
          <button onClick={saveProfile} disabled={saving} className="btn btn-primary w-full justify-center">
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      )}

      {/* KYC tab */}
      {tab === 'kyc' && (
        <div className="card p-6 max-w-lg">
          {kycStatus?.kyc_status === 'verified' ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">✅</div>
              <h3 className="font-display text-xl text-navy mb-1">KYC Verified</h3>
              <p className="text-sm text-slate-400">PAN: {kycStatus.pan_submitted ? '●●●●●●●' : 'Not submitted'}</p>
              {kycStatus.aadhaar_masked && <p className="text-sm text-slate-400">Aadhaar: {kycStatus.aadhaar_masked}</p>}
            </div>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 text-xs text-amber-700">
                KYC is required before you can invest. We store only the last 4 digits of Aadhaar.
              </div>
              <div className="space-y-4 mb-5">
                <div><label className="form-label">PAN Number <span className="text-red-500">*</span></label><input className="form-input uppercase" value={kycForm.pan} onChange={e => setKycForm(f => ({ ...f, pan: e.target.value }))} placeholder="ABCDE1234F" /></div>
                <div><label className="form-label">Aadhaar Last 4 digits</label><input className="form-input" value={kycForm.aadhaar_last4} onChange={e => setKycForm(f => ({ ...f, aadhaar_last4: e.target.value }))} maxLength={4} placeholder="1234" /></div>
                <div><label className="form-label">Bank Account Number</label><input className="form-input" value={kycForm.bank_account_number} onChange={e => setKycForm(f => ({ ...f, bank_account_number: e.target.value }))} /></div>
                <div><label className="form-label">Bank IFSC</label><input className="form-input uppercase" value={kycForm.bank_ifsc} onChange={e => setKycForm(f => ({ ...f, bank_ifsc: e.target.value }))} placeholder="SBIN0001234" /></div>
              </div>
              <button onClick={submitKYC} disabled={saving || !kycForm.pan} className="btn btn-primary w-full justify-center">
                {saving ? 'Submitting…' : 'Submit KYC'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Onboarding history tab */}
      {tab === 'onboarding' && (
        <div className="card overflow-hidden max-w-lg">
          <div className="px-5 py-3 border-b border-slate-100 font-semibold text-sm text-navy">Onboarding History</div>
          <div className="divide-y divide-slate-50">
            {(onboarding?.history ?? []).map((h: any, i: number) => (
              <div key={i} className="px-5 py-3 flex items-center gap-3">
                <span className="text-emerald-500 text-sm">✓</span>
                <div>
                  <p className="text-sm font-medium text-navy capitalize">{h.from_step} → {h.to_step}</p>
                  <p className="text-[10px] text-slate-400">{new Date(h.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
