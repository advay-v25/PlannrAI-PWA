'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Calendar, Brain, Activity, User, Sparkles, Menu } from 'lucide-react';
import { ChatInterface } from '@/components/agent/chat-interface';
import { cn } from '@/lib/utils';

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [isCoachOpen, setIsCoachOpen] = useState(false);

    const navItems = [
        { href: '/app', icon: LayoutDashboard, label: 'Home' },
        { href: '/app/calendar', icon: Calendar, label: 'Time' },
        { href: '/app/brain-dump', icon: Brain, label: 'Dump' },
        { href: '/app/weekly-review', icon: Activity, label: 'Review' },
        { href: '/app/settings', icon: User, label: 'Me' },
    ];

    return (
        <div className="flex h-dvh w-full overflow-hidden bg-[var(--color-bg-primary)] text-[var(--text-primary)]">

            {/* Desktop Sidebar */}
            <aside className="hidden md:flex flex-col w-64 border-r border-[var(--glass-border)] bg-[var(--color-bg-secondary)]/30 backdrop-blur-xl z-30">
                <div className="h-14 flex items-center px-6 border-b border-[var(--glass-border)]">
                    <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-mind)] bg-clip-text text-transparent">
                        PlannrAI
                    </span>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all group",
                                    isActive
                                        ? "bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--color-primary)] shadow-[var(--shadow-sm)]"
                                        : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]"
                                )}
                            >
                                <item.icon className={cn("w-5 h-5", isActive ? "text-[var(--color-primary)]" : "text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)]")} />
                                <span className="font-medium">{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-[var(--glass-border)]">
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                        <div className="w-8 h-8 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center border border-[var(--color-primary)]/20">
                            <User className="w-4 h-4 text-[var(--color-primary)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">User</p>
                            <p className="text-xs text-[var(--text-tertiary)] truncate">Pro Plan</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Content Area */}
            <main className={cn(
                "flex-1 relative flex flex-col transition-all duration-300 ease-in-out",
                isCoachOpen ? "mr-[400px]" : "mr-0"
            )}>

                {/* Top System Bar */}
                <header className="h-14 flex items-center justify-between px-6 border-b border-[var(--glass-border)] bg-[var(--color-bg-secondary)]/50 backdrop-blur-md z-20">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-pulse-slow" />
                        <span className="text-xs font-mono text-[var(--text-tertiary)] uppercase tracking-widest">Neural OS v2.0</span>
                    </div>

                    <button
                        onClick={() => setIsCoachOpen(!isCoachOpen)}
                        className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all",
                            isCoachOpen
                                ? "bg-[var(--color-primary)]/10 border-[var(--color-primary)] text-[var(--color-primary)]"
                                : "bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-white"
                        )}
                    >
                        <Sparkles className="w-4 h-4" />
                        <span className="text-xs font-medium hidden sm:inline">AI Coach</span>
                    </button>
                </header>

                {/* Scrollable Page Content */}
                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[var(--glass-border)]">
                    <div className="max-w-5xl mx-auto p-4 pb-32 md:pb-10">
                        {children}
                    </div>
                </div>

                {/* Bottom Navigation Dock (Mobile First) */}
                <nav className="md:hidden absolute bottom-6 left-4 right-4 h-16 glass-panel rounded-full flex items-center justify-around px-2 z-30">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex flex-col items-center justify-center w-12 h-12 rounded-full transition-all",
                                    isActive ? "text-[var(--color-primary)] bg-[var(--color-primary)]/10" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                                )}
                            >
                                <item.icon className="w-5 h-5" />
                            </Link>
                        );
                    })}
                </nav>
            </main>

            {/* AI Coach Drawer - Always mounted, slides in */}
            <aside className={cn(
                "fixed inset-y-0 right-0 w-[400px] glass-panel border-l border-[var(--glass-border)] shadow-2xl z-40 transform transition-transform duration-300 ease-in-out",
                isCoachOpen ? "translate-x-0" : "translate-x-full"
            )}>
                <ChatInterface onClose={() => setIsCoachOpen(false)} />
            </aside>

            {/* Desktop Sidebar (Optional - using bottom/top for now for cleaner 'OS' feel, but can add if requested) */}
        </div>
    );
}
