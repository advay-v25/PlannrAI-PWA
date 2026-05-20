'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
    House,
    Target,
    Calendar,
    Sparkles,
    LineChart,
    Settings,
    ListTodo
} from 'lucide-react';

const TABS = [
    { id: 'home', href: '/app', icon: House, label: 'Today' },
    { id: 'goals', href: '/app/goals', icon: Target, label: 'Goals' },
    { id: 'calendar', href: '/app/calendar', icon: Calendar, label: 'Calendar' },
    { id: 'tasks', href: '/app/tasks', icon: ListTodo, label: 'Tasks' },
    { id: 'coach', href: '/app/coach', icon: Sparkles, label: 'Coach' },
    { id: 'weekly-review', href: '/app/weekly-review', icon: LineChart, label: 'Review' },
    { id: 'settings', href: '/app/settings', icon: Settings, label: 'Settings' },
];

export function TabBar() {
    const pathname = usePathname();

    const getActiveTab = () => {
        if (pathname === '/app') return 'home';
        const segment = pathname.split('/')[2];
        return segment || 'home';
    };

    const activeTab = getActiveTab();

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 safe-bottom">
            <div className="mx-auto max-w-lg relative">
                {/* Sci-Fi Decorative Blinking Dots */}
                <div className="absolute -top-1 right-6 w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.8)] z-50" />
                <div className="absolute top-4 left-4 w-1 h-1 rounded-full bg-purple-500 animate-pulse shadow-[0_0_6px_rgba(168,85,247,0.8)] z-50 delay-75" />
                
                <div className="mx-2 mb-2 rounded-2xl bg-[var(--color-bg-secondary)]/80 backdrop-blur-xl border border-[var(--glass-border)] shadow-lg relative">
                    <div className="flex items-center justify-around py-2">
                        {TABS.map((tab) => {
                            const isActive = activeTab === tab.id;
                            const Icon = tab.icon;

                            return (
                                <Link
                                    key={tab.id}
                                    href={tab.href}
                                    className={cn(
                                        'relative flex flex-col items-center justify-center px-3 py-2 rounded-xl transition-colors',
                                        isActive
                                            ? 'text-[var(--color-primary)]'
                                            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                                    )}
                                >
                                    {isActive && (
                                        <motion.div
                                            layoutId="activeTab"
                                            className="absolute inset-0 rounded-xl bg-[var(--color-primary)]/10"
                                            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                        />
                                    )}
                                    <Icon className="w-5 h-5 relative z-10" />
                                    <span className="text-[10px] mt-0.5 font-medium relative z-10">
                                        {tab.label}
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </div>
        </nav>
    );
}

// Desktop sidebar version
export function SideNav() {
    const pathname = usePathname();

    const getActiveTab = () => {
        if (pathname === '/app') return 'home';
        const segment = pathname.split('/')[2];
        return segment || 'home';
    };

    const activeTab = getActiveTab();

    return (
        <nav className="hidden md:flex flex-col w-64 h-screen fixed left-0 top-0 bg-[var(--color-bg-secondary)]/50 backdrop-blur-xl border-r border-[var(--glass-border)] p-4">
            {/* Logo */}
            <div className="flex items-center gap-2 px-3 py-4 mb-6 relative">
                <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)]/20 flex items-center justify-center relative group">
                    <Sparkles className="w-5 h-5 text-[var(--color-primary)] group-hover:animate-pulse" />
                    {/* Blinking Sci-Fi Dot */}
                    <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 animate-pulse shadow-[0_0_12px_rgba(249,115,22,0.8)]" />
                </div>
                <span className="text-lg font-bold text-gradient relative">
                    PlannrAI
                    <div className="absolute top-1.5 -right-3 w-1 h-1 rounded-full bg-purple-500 animate-pulse shadow-[0_0_6px_rgba(168,85,247,0.8)] delay-150" />
                </span>
            </div>

            {/* Nav Items */}
            <div className="space-y-1 flex-1">
                {TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    const Icon = tab.icon;

                    return (
                        <Link
                            key={tab.id}
                            href={tab.href}
                            className={cn(
                                'relative flex items-center gap-3 px-3 py-3 rounded-xl transition-colors',
                                isActive
                                    ? 'text-[var(--color-primary)]'
                                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--glass-bg)]'
                            )}
                        >
                            {isActive && (
                                <motion.div
                                    layoutId="activeSideNav"
                                    className="absolute inset-0 rounded-xl bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20"
                                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                />
                            )}
                            <Icon className="w-5 h-5 relative z-10" />
                            <span className="font-medium relative z-10">{tab.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
