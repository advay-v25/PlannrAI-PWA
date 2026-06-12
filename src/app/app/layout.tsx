// Removed @ts-nocheck
'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Calendar, Brain, Activity, User, Sparkles, Menu, Target, ListTodo } from 'lucide-react';
import { CoachChat } from '@/components/coach/CoachChat';
import { CommandMenu } from '@/components/ui/command-menu';
import { cn } from '@/lib/utils';
import { useUserStore } from '@/stores';
import { RealTimeIndicator } from '@/components/ui/real-time-indicator';
import { createClient } from '@/lib/supabase/client';

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { profile, setProfile } = useUserStore();
    const supabase = useMemo(() => createClient(), []);
    const displayName = profile?.full_name?.split(' ')[0] || profile?.full_name || 'User';

    // Hydrate profile in layout so it's available on every page
    useEffect(() => {
        if (profile) return; // Already loaded
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
            if (data) setProfile(data);
        })();
    }, [profile, supabase, setProfile]);

    const [isCoachOpen, setIsCoachOpen] = useState(false);

    const isPreview = process.env.NEXT_PUBLIC_IS_PREVIEW_BUILD === 'true';

    const navItems = [
        { href: '/app', icon: LayoutDashboard, label: 'Home' },
        { href: '/app/goals', icon: Target, label: 'Goals' },
        { href: '/app/tasks', icon: ListTodo, label: 'Tasks' },
        { href: '/app/calendar', icon: Calendar, label: 'Calendar' },
        { href: isPreview ? '/app/weekly-review' : '#', icon: Activity, label: 'Review', disabled: !isPreview, badge: !isPreview ? 'SOON' : undefined },
    ];

    return (
        <div className="flex h-dvh w-full overflow-hidden text-[var(--text-primary)]">
            <CommandMenu />

            {/* Desktop Sidebar */}
            <aside className="hidden md:flex flex-col w-64 border-r border-[var(--glass-border)] bg-[var(--color-bg-secondary)]/30 backdrop-blur-xl z-30">
                <div className="h-14 flex items-center justify-between px-6 border-b border-[var(--glass-border)]">
                    <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-mind)] bg-clip-text text-transparent">
                        PlannrAI
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-scifi-blink" />
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={(e) => item.disabled && e.preventDefault()}
                                className={cn(
                                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all group",
                                    isActive
                                        ? "bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--color-primary)] shadow-[var(--shadow-sm)]"
                                        : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]",
                                    item.disabled && "opacity-50 cursor-not-allowed hover:bg-transparent hover:text-[var(--text-secondary)]"
                                )}
                            >
                                <item.icon className={cn("w-5 h-5", isActive ? "text-[var(--color-primary)]" : "text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)]")} />
                                <span className="font-semibold text-sm flex-1">{item.label}</span>
                                {item.badge && (
                                    <span className="text-[9px] font-black uppercase tracking-wider bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-2 py-0.5 rounded-full border border-[var(--color-primary)]/20">
                                        {item.badge}
                                    </span>
                                )}
                            </Link>
                        );
                    })}

                    {/* AI Coach Button in Sidebar */}
                    <button
                        onClick={() => setIsCoachOpen(!isCoachOpen)}
                        className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group",
                            isCoachOpen
                                ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20"
                                : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]"
                        )}
                    >
                        <Sparkles className={cn("w-5 h-5", isCoachOpen ? "text-[var(--color-primary)]" : "text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)]")} />
                        <span className="font-semibold text-sm flex-1 text-left">Coach Hub</span>
                    </button>
                </nav>

                <div className="p-4 border-t border-[var(--glass-border)] flex flex-col gap-3">
                    {/* Pro Upgrade Button */}
                    <Link
                        href="/app/pro"
                        className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-[var(--color-primary)]/10 to-orange-500/10 border border-[var(--color-primary)]/30 hover:border-[var(--color-primary)]/60 transition-all cursor-pointer group"
                    >
                        <div className="w-8 h-8 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center group-hover:scale-110 transition-transform shadow-[0_0_10px_rgba(250,204,21,0.2)]">
                            <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                            <p className="text-sm font-bold text-[var(--color-primary)] truncate flex items-center gap-2">
                                Upgrade to Pro
                            </p>
                        </div>
                    </Link>

                    <Link
                        href="/app/settings"
                        className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] transition-all cursor-pointer group"
                    >
                        <div className="w-8 h-8 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center border border-[var(--color-primary)]/20 group-hover:border-[var(--color-primary)] transition-colors">
                            <User className="w-4 h-4 text-[var(--color-primary)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate group-hover:text-[var(--color-primary)] transition-colors">{displayName}</p>
                            <p className="text-xs text-[var(--text-tertiary)] truncate">Settings</p>
                        </div>
                    </Link>
                </div>
            </aside>

  {/* Content Area with AI Coach - Using CSS Grid for fluid animations */}
  <div className="flex-1 grid grid-cols-[1fr] transition-[grid-template-columns] duration-300 ease-in-out">
    {/* Main Content */}
    <main className="relative flex flex-col overflow-hidden">
      {/* Top System Bar */}
      <header className="h-14 flex items-center justify-between px-6 border-b border-[var(--glass-border)] bg-[var(--color-bg-secondary)]/50 backdrop-blur-md z-20 md:hidden">
        {/* Mobile Header Content - simplified since Sidebar handles desktop */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-pulse-slow" />
          <span className="text-xs font-mono text-[var(--text-tertiary)] uppercase tracking-widest">Neural OS</span>
        </div>
      </header>

      {/* Scrollable Page Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[var(--glass-border)]">
        {children}
      </div>

      {/* Bottom Navigation Dock (Mobile Only) */}
      <nav className="md:hidden absolute bottom-6 left-4 right-4 h-16 glass-panel rounded-full flex items-center justify-around px-2 z-30">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(e) => item.disabled && e.preventDefault()}
              className={cn(
                "flex flex-col items-center justify-center w-12 h-12 rounded-full transition-all",
                isActive ? "text-[var(--color-primary)] bg-[var(--color-primary)]/10" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
                item.disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <item.icon className="w-5 h-5" />
            </Link>
          );
        })}
        {/* Mobile Coach Button */}
        <button
          onClick={() => setIsCoachOpen(!isCoachOpen)}
          className={cn(
            "flex flex-col items-center justify-center w-12 h-12 rounded-full transition-all",
            isCoachOpen ? "text-[var(--color-primary)] bg-[var(--color-primary)]/10" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          )}
        >
          <Sparkles className="w-5 h-5" />
        </button>
        {/* Mobile Settings Link */}
        <Link
          href="/app/settings"
          className={cn(
            "flex flex-col items-center justify-center w-12 h-12 rounded-full transition-all",
            pathname === '/app/settings' ? "text-[var(--color-primary)] bg-[var(--color-primary)]/10" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          )}
        >
          <User className="w-5 h-5" />
        </Link>
      </nav>
    </main>

    {/* AI Coach Drawer - Always mounted, slides in */}
    <aside className={cn(
        "fixed inset-y-0 right-0 w-[400px] glass-panel border-l border-[var(--glass-border)] shadow-2xl z-40 transform transition-transform duration-300 ease-in-out",
        isCoachOpen ? "translate-x-0" : "translate-x-full"
    )}>
        <CoachChat onClose={() => setIsCoachOpen(false)} />
    </aside>
  </div>
        </div>
    );
}
