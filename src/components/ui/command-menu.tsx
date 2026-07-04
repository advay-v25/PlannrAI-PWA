
'use client';

import * as React from 'react';
import { Command } from 'cmdk';
import { Search, Brain, Calendar, ArrowRight, Zap, Map } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { apiClient } from '@/lib/api-client';

export function CommandMenu() {
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const router = useRouter();

    // Toggle with Cmd+K and custom event
    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((open) => !open);
            }
        };
        const customOpen = () => setOpen(true);
        document.addEventListener('keydown', down);
        window.addEventListener('open-command-menu', customOpen);
        return () => {
            document.removeEventListener('keydown', down);
            window.removeEventListener('open-command-menu', customOpen);
        };
    }, []);

    const runCommand = React.useCallback((command: () => void) => {
        setOpen(false);
        command();
    }, []);

    // Handle AI Execution
    const executeAI = async () => {
        if (!search) return;
        setLoading(true);
        try {
            // Optimistic close
            setOpen(false);
            // We would call the coach API here, but for now we'll just log
            console.log('Executing AI Command:', search);

            // Allow time for "execution" feel
            await new Promise(r => setTimeout(r, 500));

            // Call the Coach Message API
            await apiClient.post('/api/coach/message', { message: search });

            // Refresh to show changes
            router.refresh();
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
            setSearch('');
        }
    };

    return (
        <Command.Dialog
            open={open}
            onOpenChange={setOpen}
            label="Global Command Menu"
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[640px] bg-[#0A0A0C] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
            overlayClassName="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        >
            <div className="flex items-center border-b border-white/10 px-4">
                <Search className="w-5 h-5 text-white/40 mr-2" />
                <Command.Input
                    value={search}
                    onValueChange={setSearch}
                    placeholder="Type a command or ask Plannr..."
                    className="flex-1 h-14 bg-transparent text-lg text-white placeholder:text-white/20 outline-none"
                />
                {loading && <div className="animate-spin w-4 h-4 border-2 border-white/20 border-t-white rounded-full" />}
            </div>

            <Command.List className="max-h-[300px] overflow-y-auto p-2 scroll-py-2">
                <Command.Empty className="py-6 text-center text-sm text-white/40">
                    {search ? (
                        <button
                            onClick={executeAI}
                            className="flex items-center justify-center gap-2 mx-auto px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-white"
                        >
                            <Brain className="w-4 h-4 text-[var(--color-primary)]" />
                            Ask AI to "{search}"
                            <span className="text-xs text-white/30 ml-2">↵</span>
                        </button>
                    ) : (
                        "No results found."
                    )}
                </Command.Empty>

                <Command.Group heading="Navigation" className="text-xs text-white/30 font-medium px-2 py-1.5 mb-1 bg-transparent">
                    <Command.Item
                        onSelect={() => runCommand(() => router.push('/app'))}
                        className="flex items-center gap-2 px-3 py-2.5 text-sm text-white/80 rounded-lg aria-selected:bg-white/10 aria-selected:text-white cursor-pointer"
                    >
                        <Map className="w-4 h-4" />
                        Go to Home
                    </Command.Item>
                    <Command.Item
                        onSelect={() => runCommand(() => router.push('/app/calendar'))}
                        className="flex items-center gap-2 px-3 py-2.5 text-sm text-white/80 rounded-lg aria-selected:bg-white/10 aria-selected:text-white cursor-pointer"
                    >
                        <Calendar className="w-4 h-4" />
                        Go to Calendar
                    </Command.Item>
                    <Command.Item
                        onSelect={() => runCommand(() => router.push('/app/settings'))}
                        className="flex items-center gap-2 px-3 py-2.5 text-sm text-white/80 rounded-lg aria-selected:bg-white/10 aria-selected:text-white cursor-pointer"
                    >
                        <Zap className="w-4 h-4" />
                        Go to Settings
                    </Command.Item>
                </Command.Group>

                <Command.Group heading="Actions" className="text-xs text-white/30 font-medium px-2 py-1.5 mb-1 mt-2 bg-transparent">
                    <Command.Item
                        onSelect={() => runCommand(() => router.push('/app/calendar?view=week'))}
                        className="flex items-center gap-2 px-3 py-2.5 text-sm text-white/80 rounded-lg aria-selected:bg-white/10 aria-selected:text-white cursor-pointer"
                    >
                        <ArrowRight className="w-4 h-4" />
                        Plan This Week
                    </Command.Item>
                </Command.Group>

                {search && (
                    <Command.Group heading="Intelligence" className="text-xs text-white/30 font-medium px-2 py-1.5 mb-1 mt-2 bg-transparent">
                        <Command.Item
                            onSelect={executeAI}
                            className="flex items-center gap-2 px-3 py-2.5 text-sm text-white/80 rounded-lg aria-selected:bg-[var(--color-primary)]/20 aria-selected:text-[var(--color-primary)] cursor-pointer group"
                        >
                            <Brain className="w-4 h-4 group-aria-selected:animate-pulse" />
                            <span>Ask Coach: <span className="text-white">"{search}"</span></span>
                        </Command.Item>
                    </Command.Group>
                )}

            </Command.List>

            <div className="border-t border-white/5 px-4 py-2 flex justify-between items-center text-[10px] text-white/30">
                <div className="flex gap-2">
                    <span>Use arrows to navigate</span>
                    <span>↵ to select</span>
                </div>
                <div>
                    VisionOS Unified Command
                </div>
            </div>
        </Command.Dialog>
    );
}
