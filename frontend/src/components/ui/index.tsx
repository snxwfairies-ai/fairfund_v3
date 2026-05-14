'use client';
import { progressColor, scoreColor } from '@/lib/utils';

// ─── Progress Bar ─────────────────────────────────────────────────────────────
export function ProgressBar({ value, label = 'Raised' }: { value: number; label?: string }) {
  const color = progressColor(value);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="font-bold text-navy">{value}%</span>
      </div>
      <div className="progress-bar">
        <div className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700`}
             style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

// ─── Score Meter ──────────────────────────────────────────────────────────────
export function ScoreMeter({ score }: { score: number }) {
  const color = scoreColor(score);
  const deg   = (score / 100) * 360;
  return (
    <div className="flex items-center gap-1.5">
      <div style={{
        width: 38, height: 38, borderRadius: '50%',
        background: `conic-gradient(${color} ${deg}deg, #E2E8F0 0deg)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 800, color }}>{score}</span>
        </div>
      </div>
      <span className="text-xs text-slate-400">Score</span>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
export function StatCard({ icon, value, label, sub }: { icon: string; value: string | number; label: string; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-2xl font-display font-normal">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
      {sub && <div className="text-[11px] mt-1" style={{ color: '#C9A84C' }}>{sub}</div>}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
type BadgeVariant = 'green' | 'gold' | 'red' | 'blue' | 'navy' | 'purple';
const BADGE_STYLES: Record<BadgeVariant, string> = {
  green:  'bg-emerald-100 text-emerald-700',
  gold:   'bg-amber-100 text-amber-700',
  red:    'bg-red-100 text-red-700',
  blue:   'bg-blue-100 text-blue-700',
  navy:   'bg-slate-100 text-slate-700',
  purple: 'bg-purple-100 text-purple-700',
};
export function Badge({ children, variant = 'navy' }: { children: React.ReactNode; variant?: BadgeVariant }) {
  return <span className={`badge text-[10px] ${BADGE_STYLES[variant]}`}>{children}</span>;
}

// ─── Loading spinner ──────────────────────────────────────────────────────────
export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-9 h-9 rounded-full border-4 border-slate-200 border-t-amber-500 animate-spin" />
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
export function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <span className="text-4xl mb-3">{icon}</span>
      <p className="text-sm">{text}</p>
    </div>
  );
}
