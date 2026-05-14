'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

type Step = 'company' | 'deal' | 'financials' | 'review';
const STEPS: Step[] = ['company','deal','financials','review'];

const STEP_LABELS: Record<Step, string> = {
  company: '🏢 Company Details',
  deal: '💰 Deal Terms',
  financials: '📊 Financials',
  review: '✅ Review & Submit',
};

const SECTORS = ['AgriTech','HealthTech','EdTech','CleanTech','Logistics','Food & Agri','FinTech','RetailTech','Manufacturing','Other'];

export default function SMECreatePage() {
  const router = useRouter();
  const [step, setStep]     = useState<Step>('company');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [form, setForm]     = useState({
    // Company
    legal_name: '', cin: '', gstin: '', sector: '', location_city: '', location_state: '',
    website: '', founded_year: '', team_size: '',
    // Deal
    stage: '', instrument: 'equity', target_raise: '', min_investment: '', valuation_pre: '',
    expected_return_min: '', expected_return_max: '', tenure_months: '', closing_date: '',
    // Financials
    revenue_last_fy: '', ebitda_last_fy: '', revenue_growth_pct: '',
    // Content
    short_description: '', long_description: '',
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const idx = STEPS.indexOf(step);

  async function submit() {
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        founded_year:         parseInt(form.founded_year),
        team_size:            parseInt(form.team_size),
        target_raise:         parseFloat(form.target_raise),
        min_investment:       parseFloat(form.min_investment),
        valuation_pre:        parseFloat(form.valuation_pre),
        expected_return_min:  parseFloat(form.expected_return_min),
        expected_return_max:  parseFloat(form.expected_return_max),
        tenure_months:        parseInt(form.tenure_months),
        revenue_last_fy:      parseFloat(form.revenue_last_fy),
        ebitda_last_fy:       form.ebitda_last_fy ? parseFloat(form.ebitda_last_fy) : undefined,
        revenue_growth_pct:   form.revenue_growth_pct ? parseFloat(form.revenue_growth_pct) : undefined,
      };
      await api.post('/smes', payload);
      router.push('/dashboard/sme-dashboard');
    } catch(e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="font-display text-3xl text-navy mb-1">Create Funding Listing</h1>
        <p className="text-slate-400 text-sm">Your listing will be reviewed by admin and CA/CS before going live.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-7">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center flex-1">
            <button onClick={() => i < idx && setStep(s)}
              className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0 transition-all ${
                i < idx ? 'bg-emerald-500 text-white cursor-pointer' : i === idx ? 'bg-navy text-white ring-2 ring-amber-400 ring-offset-1' : 'bg-slate-200 text-slate-400 cursor-default'
              }`}>{i < idx ? '✓' : i+1}</button>
            {i < STEPS.length-1 && <div className={`flex-1 h-0.5 mx-1 ${i < idx ? 'bg-emerald-500' : 'bg-slate-200'}`} />}
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400 mb-5 font-semibold">{STEP_LABELS[step]}</p>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-700">{error}</div>}

      <div className="card p-6">
        {step === 'company' && (
          <div className="space-y-4">
            <div><label className="form-label">Legal Name <span className="text-red-500">*</span></label><input className="form-input" value={form.legal_name} onChange={set('legal_name')} placeholder="AgriTech Solutions Pvt Ltd" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="form-label">CIN Number</label><input className="form-input" value={form.cin} onChange={set('cin')} placeholder="U01000MH2021PTC12345" /></div>
              <div><label className="form-label">GSTIN</label><input className="form-input" value={form.gstin} onChange={set('gstin')} /></div>
            </div>
            <div><label className="form-label">Sector <span className="text-red-500">*</span></label>
              <select className="form-input" value={form.sector} onChange={set('sector')}>
                <option value="">Select sector…</option>
                {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="form-label">City <span className="text-red-500">*</span></label><input className="form-input" value={form.location_city} onChange={set('location_city')} /></div>
              <div><label className="form-label">State <span className="text-red-500">*</span></label><input className="form-input" value={form.location_state} onChange={set('location_state')} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="form-label">Founded Year <span className="text-red-500">*</span></label><input className="form-input" type="number" value={form.founded_year} onChange={set('founded_year')} min="1900" max="2025" /></div>
              <div><label className="form-label">Team Size <span className="text-red-500">*</span></label><input className="form-input" type="number" value={form.team_size} onChange={set('team_size')} min="1" /></div>
            </div>
            <div><label className="form-label">Short Description <span className="text-red-500">*</span></label><textarea className="form-input h-20 resize-none" value={form.short_description} onChange={set('short_description')} maxLength={300} placeholder="One paragraph about your business…" /></div>
          </div>
        )}

        {step === 'deal' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="form-label">Stage <span className="text-red-500">*</span></label>
                <select className="form-input" value={form.stage} onChange={set('stage')}>
                  <option value="">Select…</option>
                  {['Seed','Seed+','Pre-Series A','Series A','Series B'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div><label className="form-label">Instrument</label>
                <select className="form-input" value={form.instrument} onChange={set('instrument')}>
                  <option value="equity">Equity</option>
                  <option value="debt">Debt</option>
                  <option value="convertible">Convertible Note</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="form-label">Target Raise (₹) <span className="text-red-500">*</span></label><input className="form-input" type="number" value={form.target_raise} onChange={set('target_raise')} placeholder="4500000" /></div>
              <div><label className="form-label">Min. Investment (₹) <span className="text-red-500">*</span></label><input className="form-input" type="number" value={form.min_investment} onChange={set('min_investment')} placeholder="50000" /></div>
            </div>
            <div><label className="form-label">Pre-money Valuation (₹) <span className="text-red-500">*</span></label><input className="form-input" type="number" value={form.valuation_pre} onChange={set('valuation_pre')} placeholder="32000000" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="form-label">Expected Return Min (%) <span className="text-red-500">*</span></label><input className="form-input" type="number" value={form.expected_return_min} onChange={set('expected_return_min')} placeholder="18" /></div>
              <div><label className="form-label">Expected Return Max (%)</label><input className="form-input" type="number" value={form.expected_return_max} onChange={set('expected_return_max')} placeholder="22" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="form-label">Tenure (months) <span className="text-red-500">*</span></label><input className="form-input" type="number" value={form.tenure_months} onChange={set('tenure_months')} placeholder="24" /></div>
              <div><label className="form-label">Closing Date</label><input className="form-input" type="date" value={form.closing_date} onChange={set('closing_date')} /></div>
            </div>
          </div>
        )}

        {step === 'financials' && (
          <div className="space-y-4">
            <div><label className="form-label">Revenue Last FY (₹) <span className="text-red-500">*</span></label><input className="form-input" type="number" value={form.revenue_last_fy} onChange={set('revenue_last_fy')} placeholder="1800000" /></div>
            <div><label className="form-label">EBITDA Last FY (₹)</label><input className="form-input" type="number" value={form.ebitda_last_fy} onChange={set('ebitda_last_fy')} /></div>
            <div><label className="form-label">Revenue Growth % (YoY)</label><input className="form-input" type="number" value={form.revenue_growth_pct} onChange={set('revenue_growth_pct')} placeholder="35" /></div>
            <div><label className="form-label">Long Description</label><textarea className="form-input h-32 resize-none" value={form.long_description} onChange={set('long_description')} placeholder="Detailed description of your business, traction, team, and use of funds…" /></div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
              📋 You'll upload supporting documents (financials, PAS-4, etc.) after creating the listing.
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 mb-4">Review your listing before submitting. You can still edit after creation.</p>
            {[
              { label: 'Company',     val: form.legal_name },
              { label: 'Sector',      val: form.sector },
              { label: 'Location',    val: `${form.location_city}, ${form.location_state}` },
              { label: 'Target Raise', val: `₹${parseFloat(form.target_raise||'0').toLocaleString('en-IN')}` },
              { label: 'Min. Invest',  val: `₹${parseFloat(form.min_investment||'0').toLocaleString('en-IN')}` },
              { label: 'Valuation',   val: `₹${parseFloat(form.valuation_pre||'0').toLocaleString('en-IN')}` },
              { label: 'Returns',     val: `${form.expected_return_min}–${form.expected_return_max}%` },
              { label: 'Tenure',      val: `${form.tenure_months} months` },
              { label: 'Revenue FY',  val: `₹${parseFloat(form.revenue_last_fy||'0').toLocaleString('en-IN')}` },
            ].map(({ label, val }) => (
              <div key={label} className="flex justify-between py-2 border-b border-slate-50">
                <span className="text-xs text-slate-400">{label}</span>
                <span className="text-sm font-semibold text-navy">{val}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-5">
        {idx > 0 && (
          <button onClick={() => setStep(STEPS[idx-1])} className="btn btn-outline flex-1">← Back</button>
        )}
        {idx < STEPS.length - 1 ? (
          <button onClick={() => setStep(STEPS[idx+1])} className="btn btn-primary flex-1">Next →</button>
        ) : (
          <button onClick={submit} disabled={saving} className="btn btn-gold flex-1 justify-center font-bold">
            {saving ? 'Creating…' : 'Create Listing →'}
          </button>
        )}
      </div>
    </div>
  );
}
