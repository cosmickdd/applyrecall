'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Briefcase, 
  BookOpen, 
  User, 
  Bell, 
  Settings, 
  Send, 
  Puzzle,
  ChevronRight,
  LogOut,
  Sparkles
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const navItems = [
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'Applications', href: '/applications', icon: Briefcase },
  { name: 'Answer Library', href: '/answers', icon: BookOpen },
  { name: 'Spatial View', href: '/glassy', icon: Sparkles },
  { name: 'My Profile', href: '/profile', icon: User },
  { name: 'Reminders', href: '/reminders', icon: Bell },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [summary, setSummary] = useState<any>(null);
  const { user, profile, signOut } = useAuth();

  useEffect(() => {
    api.getSummary().then(setSummary).catch(() => {});
  }, [pathname]);

  const displayName = profile?.full_name || user?.user_metadata?.full_name || (user?.email ? user.email.split('@')[0] : 'Alex Morgan');
  const displayEmail = profile?.email || user?.email || 'alex.morgan@stanford.edu';
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'AM';

  return (
    <aside className="w-[236px] bg-brand-surface border-r border-edge-default flex flex-col justify-between h-screen sticky top-0 select-none z-30">
      <div>
        {/* Brand Header */}
        <div className="h-16 px-5 flex items-center border-b border-edge-default gap-3">
          <div className="w-8 h-8 rounded-btn bg-brand-blue flex items-center justify-center text-white shadow-subtle">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div>
            <span className="font-bold text-[15px] tracking-tight text-ink-primary block leading-none">
              ApplyRecall
            </span>
            <span className="text-[11px] text-ink-muted font-medium mt-1 block">
              Application Memory
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2 rounded-btn text-[13px] font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-light text-brand-blue font-semibold'
                    : 'text-ink-secondary hover:bg-brand-subtle hover:text-ink-primary'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-brand-blue' : 'text-ink-muted'}`} strokeWidth={2} />
                  <span>{item.name}</span>
                </div>
                {item.name === 'Reminders' && summary?.follow_ups_due > 0 && (
                  <span className="bg-brand-blue text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {summary.follow_ups_due}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Tool Connections & User Info */}
      <div className="p-3 border-t border-edge-default space-y-3">
        {/* Connected Tools Status */}
        <Link 
          href="/settings"
          className="block bg-brand-soft hover:bg-brand-subtle border border-edge-default rounded-card p-2.5 space-y-2 transition-colors cursor-pointer group"
          title="Click to manage and pair connections in Settings"
        >
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-ink-secondary group-hover:text-ink-primary font-medium">
              <Puzzle className="w-3.5 h-3.5 text-ink-muted group-hover:text-brand-blue" strokeWidth={2} />
              <span>Extension</span>
            </div>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
              summary?.extension_connected 
                ? 'bg-emerald-100 text-status-success' 
                : 'bg-edge-default text-ink-muted'
            }`}>
              {summary?.extension_connected ? 'Active' : 'Unlinked'}
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-ink-secondary group-hover:text-ink-primary font-medium">
              <Send className="w-3.5 h-3.5 text-ink-muted group-hover:text-sky-600" strokeWidth={2} />
              <span>Telegram Bot</span>
            </div>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
              summary?.telegram_connected 
                ? 'bg-emerald-100 text-status-success' 
                : 'bg-edge-default text-ink-muted'
            }`}>
              {summary?.telegram_connected ? 'Active' : 'Unlinked'}
            </span>
          </div>
        </Link>

        {/* User Card */}
        <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-btn hover:bg-brand-subtle transition-colors">
          <Link href="/profile" className="flex items-center gap-3 overflow-hidden flex-1 cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-brand-blue/10 text-brand-blue font-bold text-xs flex items-center justify-center border border-edge-default flex-shrink-0">
              {initials}
            </div>
            <div className="overflow-hidden flex-1">
              <span className="text-[13px] font-semibold text-ink-primary block truncate leading-tight">
                {displayName}
              </span>
              <span className="text-[11px] text-ink-muted block truncate">
                {displayEmail}
              </span>
            </div>
          </Link>
          <button
            onClick={() => signOut()}
            title="Sign out"
            className="p-1.5 text-ink-muted hover:text-rose-600 hover:bg-rose-50 rounded-btn transition-colors flex-shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
