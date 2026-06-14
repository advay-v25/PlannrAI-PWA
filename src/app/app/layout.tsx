// Removed @ts-nocheck
'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Calendar, Brain, Activity, User, Sparkles, Target, ChevronLeft, ChevronRight } from 'lucide-react';
import { CommandMenu } from '@/components/ui/command-menu';
import { cn } from '@/lib/utils';
import { useUserStore } from '@/stores';
import { createClient } from '@/lib/supabase/client';
import { QuickCaptureFAB } from '@/components/home/quick-capture-fab';
import { ErrorBoundary } from '@/components/error-boundary';
import { RealtimeSync } from '@/components/realtime-sync';

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

    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    const [isPreview, setIsPreview] = useState(false);
    useEffect(() => {
        import('@/lib/featureFlags').then(m => setIsPreview(m.isPreviewEnabled()));
    }, []);

    const navItems = [
        { href: '/app', icon: LayoutDashboard, label: 'Home' },
        { href: '/app/tasks', icon: Brain, label: 'Mindspace' },
        { href: '/app/calendar', icon: Calendar, label: 'Calendar' },
        { href: '/app/goals', icon: Target, label: 'Goals' },
        { href: isPreview ? '/app/weekly-review' : '#', icon: Activity, label: 'Review', disabled: !isPreview, badge: !isPreview ? 'SOON' : undefined },
        { href: '/app/coach', icon: Sparkles, label: 'Coach Hub' },
    ];

    return (
        <ErrorBoundary>
            <div className="flex h-dvh w-full overflow-hidden text-[var(--text-primary)]">
                <RealtimeSync />
            <CommandMenu />

            {/* Desktop Sidebar */}
            <motion.aside 
                initial={false}
                animate={{ 
                    width: isSidebarCollapsed ? 80 : 224,
                }}
                className="hidden md:flex flex-col border-r border-[var(--glass-border)] bg-[var(--color-bg-secondary)]/30 backdrop-blur-xl z-30 relative overflow-visible"
            >
                {/* Collapse Toggle Button */}
                <button
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    className="absolute -right-3 top-16 z-50 w-6 h-6 rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--glass-border-hover)] transition-all shadow-[var(--shadow-sm)]"
                >
                    {isSidebarCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                </button>

                <div className="h-16 flex items-center justify-between px-6 border-b border-[var(--glass-border)] overflow-hidden">
                    <AnimatePresence mode="popLayout">
                        {!isSidebarCollapsed ? (
                            <motion.div 
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="flex items-center gap-2 flex-shrink-0"
                            >
                                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-[var(--text-primary)] to-[var(--text-secondary)] bg-clip-text text-transparent">
                                    PlannrAI
                                </span>
                            </motion.div>
                        ) : (
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="w-6 h-6 rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-orange-500 flex items-center justify-center mx-auto shadow-[0_0_10px_var(--color-primary-glow)] flex-shrink-0"
                            >
                                <span className="text-white text-xs font-bold">P</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <nav className="flex-1 p-4 space-y-2 overflow-hidden mt-2">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={(e) => item.disabled && e.preventDefault()}
                                title={isSidebarCollapsed ? item.label : undefined}
                                className={cn(
                                    "flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all group overflow-hidden whitespace-nowrap",
                                    isActive
                                        ? "bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--color-primary)] shadow-[var(--shadow-sm)]"
                                        : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]",
                                    item.disabled && "opacity-50 cursor-not-allowed hover:bg-transparent hover:text-[var(--text-secondary)]",
                                    isSidebarCollapsed && "justify-center px-0 py-3"
                                )}
                            >
                                <item.icon className={cn("w-5 h-5 flex-shrink-0", isActive ? "text-[var(--color-primary)]" : "text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)]")} />
                                {!isSidebarCollapsed && (
                                    <>
                                        <span className="font-medium text-base flex-1">{item.label}</span>
                                        {item.badge && (
                                            <span className="text-[9px] font-black uppercase tracking-wider bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-2 py-0.5 rounded-full border border-[var(--color-primary)]/20">
                                                {item.badge}
                                            </span>
                                        )}
                                    </>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-[var(--glass-border)] flex flex-col gap-3 overflow-hidden">
                    {/* Pro Upgrade Button */}
                    <Link
                        href="/app/pro"
                        title={isSidebarCollapsed ? "Upgrade to Pro" : undefined}
                        className={cn(
                            "flex items-center gap-3 px-4 py-3 rounded-xl bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 transition-all cursor-pointer group whitespace-nowrap shadow-[0_0_15px_rgba(249,115,22,0.1)]", 
                            isSidebarCollapsed && "justify-center px-0"
                        )}
                    >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-[0_0_10px_rgba(249,115,22,0.5)] flex-shrink-0">
                            <Sparkles className="w-4 h-4 text-white" />
                        </div>
                        {!isSidebarCollapsed && (
                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                <p className="text-sm font-bold text-orange-400 group-hover:text-orange-300 transition-colors truncate flex items-center gap-2">
                                    Upgrade to Pro
                                </p>
                            </div>
                        )}
                    </Link>

                    <Link
                        href="/app/settings"
                        title={isSidebarCollapsed ? "Settings" : undefined}
                        className={cn("flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] transition-all cursor-pointer group whitespace-nowrap", isSidebarCollapsed && "justify-center px-0")}
                    >
                        <div className="w-8 h-8 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center border border-[var(--color-primary)]/20 group-hover:border-[var(--color-primary)] transition-colors flex-shrink-0">
                            <User className="w-4 h-4 text-[var(--color-primary)]" />
                        </div>
                        {!isSidebarCollapsed && (
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate group-hover:text-[var(--color-primary)] transition-colors">{displayName}</p>
                                <p className="text-xs text-[var(--text-tertiary)] truncate">Settings</p>
                            </div>
                        )}
                    </Link>
                </div>
            </motion.aside>

            {/* Content Area */}
            <div className="flex-1 relative">
                {/* Main Content */}
                <main className="relative flex flex-col h-full overflow-hidden">
                    {/* Top System Bar */}
                    <header className="h-14 flex items-center justify-between px-6 border-b border-[var(--glass-border)] bg-[var(--color-bg-secondary)]/50 backdrop-blur-md z-20 md:hidden">
                        {/* Mobile Header Content */}
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
            </div>
            {pathname === '/app' && <QuickCaptureFAB />}
        </div>
        </ErrorBoundary>
    );
}
