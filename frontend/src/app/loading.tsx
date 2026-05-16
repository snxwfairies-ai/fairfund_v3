export default function GlobalLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center"
         style={{ background: '#F8FAFC' }}>
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl font-bold animate-pulse"
             style={{ background: 'linear-gradient(135deg,#C9A84C,#E8C96A)', color: '#0B1D3A' }}>F</div>
        <div className="w-7 h-7 rounded-full border-3 border-slate-200 border-t-amber-500 animate-spin"
             style={{ borderWidth: 3 }} />
      </div>
    </div>
  );
}
