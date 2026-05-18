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
            <div className="mx-auto max-w-lg">
                <div className="mx-2 mb-2 rounded-2xl bg-[var(--color-bg-secondary)]/80 backdrop-blur-xl border border-[var(--glass-border)] shadow-lg">
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
            <div className="flex items-center gap-2 px-3 py-4 mb-6">
                <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)]/20 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-[var(--color-primary)]" />
                </div>
                <span className="text-lg font-bold text-gradient">PlannrAI</span>
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
