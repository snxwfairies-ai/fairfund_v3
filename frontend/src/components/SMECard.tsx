'use client';
import { useState } from 'react';
import { SME } from '@/types';
import { formatINR, SECTOR_COLORS } from '@/lib/utils';
import { ProgressBar, ScoreMeter } from '@/components/ui';

export function SMECard({ sme, onClick }: { sme: SME; onClick: (s: SME) => void }) {
  const [hovered, setHovered] = useState(false);
  const sc = SECTOR_COLORS[sme.sector] ?? '#C9A84C';

  return (
    <div
      onClick={() => onClick(sme)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ borderColor: hovered ? '#C9A84C' : '#E2E8F0', transform: hovered ? 'translateY(-3px)' : 'none' }}
      className="card p-5 cursor-pointer transition-all duration-200 relative overflow-hidden hover:shadow-md border-[1.5px]">

      {/* Sector accent bar */}
      <div style={{ background: sc }} className="absolute top-0 inset-x-0 h-[3px]" />

      {/* Tag badge */}
      <div style={{ background: sme.tag_color, top: 12, right: 12 }}
           className="absolute text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide">
        {sme.tag}
      </div>

      <div className="flex justify-between items-start mb-2 mt-1">
        <div className="pr-16">
          <h3 className="font-bold text-navy text-[13px] leading-snug mb-1">{sme.legal_name}</h3>
          <div className="flex items-center gap-2">
            <span style={{ background: sc + '22', color: sc }} className="text-[10px] font-bold px-2 py-0.5 rounded-full">
              {sme.sector}
            </span>
            <span className="text-[10px] text-slate-400">📍 {sme.location_city}</span>
          </div>
        </div>
        <ScoreMeter score={sme.fairefund_score} />
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed mb-3">{sme.short_description}</p>

      <ProgressBar value={sme.progress_pct} />

      <div className="grid grid-cols-3 gap-2 mt-3">
        {[
          { label: 'Raise',       val: formatINR(sme.target_raise) },
          { label: 'Return',      val: `${sme.expected_return_min}–${sme.expected_return_max}%` },
          { label: 'Min. Invest', val: formatINR(sme.min_investment) },
        ].map(({ label, val }) => (
          <div key={label} className="bg-cream rounded-lg py-1.5 text-center">
            <div className="text-[11px] font-bold text-navy">{val}</div>
            <div className="text-[9px] text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-3">
        <span className="text-[10px] text-slate-400">👥 {sme.investor_count} investors</span>
        <span className="text-[10px] text-slate-400">⏳ {sme.days_remaining}d left</span>
        <button className="btn btn-primary btn-sm text-[11px]">View Deal →</button>
      </div>
    </div>
  );
}
