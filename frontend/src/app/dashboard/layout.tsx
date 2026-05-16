'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import type { Notification } from '@/types';
import { api } from '@/lib/api';

const ALL_NAV = [
  { path: '/dashboard/marketplace',    label: 'Marketplace',    icon: '🏛️', roles: ['investor','admin','super_admin','compliance_officer'] },
  { path: '/dashboard/portfolio',      label: 'My Portfolio',   icon: '💼', roles: ['investor'] },
  { path: '/dashboard/sme-dashboard',  label: 'SME Dashboard',  icon: '🏢', roles: ['sme_admin','admin','super_admin'] },
  { path: '/dashboard/sme-create',     label: 'New Listing',    icon: '➕', roles: ['sme_admin'] },
  { path: '/dashboard/agent',          label: 'Agent Hub',      icon: '🤝', roles: ['agent'] },
  { path: '/dashboard/ca',             label: 'Review Queue',   icon: '✅', roles: ['ca_cs'] },
  { path: '/dashboard/admin',          label: 'Admin Panel',    icon: '⚙️', roles: ['admin','super_admin'] },
  { path: '/dashboard/admin/waitlist',   label: 'Waitlist',       icon: '📋', roles: ['admin','super_admin'] },
  { path: '/dashboard/analytics',      label: 'Analytics',      icon: '📊', roles: ['admin','super_admin','compliance_officer','investor'] },
  { path: '/dashboard/compliance',     label: 'Compliance',     icon: '⚖️', roles: ['investor','sme_admin','admin','super_admin','compliance_officer'] },
  { path: '/dashboard/profile',        label: 'My Profile',     icon: '👤', roles: [] },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();

  const [collapsed,    setCollapsed]    = useState(false);
  const NAV = ALL_NAV.filter(n => !n.roles || n.roles.includes(user?.role ?? ''));
  const [notifs,       setNotifs]       = useState<Notification[]>([]);
  const [showNotifs,   setShowNotifs]   = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (user) api.get<Notification[]>('/auth/notifications').then(setNotifs).catch(() => {});
  }, [user]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-t-amber-500 animate-spin" />
      </div>
    );
  }

  const unread = notifs.filter(n => !n.read).length;
  const pageLabel = NAV.find(n => pathname.startsWith(n.path))?.label ?? 'FaireFund';

  return (
    <div className="flex min-h-screen bg-slate-50">

      {/* ── Sidebar ────────────────────────────────────────────────── */}
      <aside style={{ width: collapsed ? 60 : 224, background: 'linear-gradient(180deg,#0B1D3A 0%,#0D2550 100%)' }}
        className="flex flex-col flex-shrink-0 sticky top-0 h-screen overflow-hidden transition-all duration-300 shadow-xl">

        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-white/8">
          <div className="w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center text-lg font-display font-black"
               style={{ background: 'linear-gradient(135deg,#C9A84C,#E8C96A)', color: '#0B1D3A' }}>F</div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className="text-white font-display text-sm font-black tracking-wide whitespace-nowrap">FaireFund</div>
              <div className="text-[10px] tracking-widest uppercase whitespace-nowrap" style={{ color: '#C9A84C' }}>MSME Exchange</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ path, label, icon }) => {
            const active = pathname.startsWith(path);
            return (
              <Link key={path} href={path} title={collapsed ? label : undefined}
                className={`nav-item ${active ? 'active' : ''} no-underline`}>
                <span className="text-base flex-shrink-0">{icon}</span>
                {!collapsed && <span className="text-sm truncate">{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        {!collapsed && (
          <div className="px-4 py-3 border-t border-white/8">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-navy text-sm"
                   style={{ background: 'linear-gradient(135deg,#C9A84C,#E8C96A)' }}>
                {user.name[0]}
              </div>
              <div className="overflow-hidden">
                <p className="text-white text-xs font-semibold truncate">{user.name}</p>
                <p className="text-[10px]" style={{ color: user.kyc_status === 'verified' ? '#4ADE80' : '#FCA5A5' }}>
                  {user.kyc_status === 'verified' ? '✓ KYC Verified' : '⚠ KYC Pending'}
                </p>
              </div>
            </div>
          </div>
        )}

        <button onClick={() => setCollapsed(c => !c)}
          className="py-2.5 text-xs text-white/30 hover:text-white/60 transition-colors border-t border-white/8 bg-white/5">
          {collapsed ? '▶' : '◀ Collapse'}
        </button>
      </aside>

      {/* ── Main ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-auto">

        {/* Topbar */}
        <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-7 py-3.5 flex items-center justify-between shadow-sm">
          <div className="text-sm">
            <span className="text-slate-400">FaireFund / </span>
            <span className="font-bold text-navy">{pageLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge bg-emerald-100 text-emerald-700 text-[10px]">🟢 Live</span>
            <span className="badge bg-slate-100 text-slate-600 text-[10px]">SEBI Compliant</span>

            {/* Notifications */}
            <div className="relative">
              <button onClick={() => setShowNotifs(s => !s)}
                className="relative p-2 rounded-lg border border-slate-200 text-sm hover:border-amber-400 transition-colors">
                🔔
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                    {unread}
                  </span>
                )}
              </button>

              {showNotifs && (
                <div className="absolute right-0 top-10 w-80 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-slate-100 font-semibold text-sm text-navy">Notifications</div>
                  {notifs.length === 0
                    ? <p className="p-4 text-center text-sm text-slate-400">No notifications</p>
                    : notifs.slice(0, 6).map(n => (
                        <div key={n.id} className={`px-4 py-3 border-b border-slate-50 ${!n.read ? 'bg-amber-50/50' : ''}`}>
                          <p className="text-xs font-semibold text-navy">{n.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>
                        </div>
                      ))
                  }
                </div>
              )}
            </div>

            <button onClick={logout} className="btn btn-outline btn-sm">Sign out</button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-7 max-w-[1200px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
