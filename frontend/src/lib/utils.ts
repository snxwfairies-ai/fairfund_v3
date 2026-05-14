export function formatINR(amount: number): string {
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)} Cr`;
  if (amount >= 100_000)    return `₹${(amount / 100_000).toFixed(1)} L`;
  if (amount >= 1_000)      return `₹${(amount / 1_000).toFixed(0)} K`;
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatPct(n: number | string): string {
  return `${parseFloat(String(n)).toFixed(1)}%`;
}

export function daysUntil(dateStr: string): number {
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000));
}

export function progressColor(pct: number): string {
  if (pct >= 90) return 'from-red-500 to-red-400';
  if (pct >= 60) return 'from-amber-500 to-yellow-400';
  return 'from-emerald-600 to-emerald-400';
}

export function scoreColor(score: number): string {
  if (score >= 85) return '#2D7A4F';
  if (score >= 70) return '#C9A84C';
  return '#C0392B';
}

export const SECTOR_COLORS: Record<string, string> = {
  AgriTech:     '#2D7A4F',
  HealthTech:   '#2563EB',
  EdTech:       '#7C3AED',
  CleanTech:    '#059669',
  Logistics:    '#D97706',
  'Food & Agri':'#DC2626',
  FinTech:      '#0891B2',
  RetailTech:   '#9333EA',
};

export function clsx(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
