import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, Flame, CheckCircle2, ChevronRight, Construction } from 'lucide-react';
import { HabitStackModal } from './habit-stack-modal';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';

export function HabitStackTile({ isPreview }: { isPreview: boolean }) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [stacks, setStacks] = useState<any[]>([]);
    const supabase = createClient();
    const { showToast } = useToast();
    const [notified, setNotified] = useState(false);

    const loadStacks = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        const { data } = await supabase
            .from('habit_stacks')
            .select('*')
            .eq('user_id', user.id)
            .eq('enabled', true)
            .order('created_at', { ascending: true });
            
        if (data) setStacks(data);
    };

    useEffect(() => {
        if (!isPreview) return;
        loadStacks();
    }, [isPreview]);

    useEffect(() => {
        if (!isPreview || notified || stacks.length === 0) return;
        
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const isMorning = now.getHours() < 12;
        
        if (isMorning) {
            const morningStack = stacks.find(s => s.preferred_window === 'morning' || s.name?.toLowerCase().includes('morning'));
            if (morningStack) {
                const lastCompleted = morningStack.last_completed ? morningStack.last_completed.split('T')[0] : null;
                if (lastCompleted !== todayStr) {
                    showToast(`Don't forget your ${morningStack.name || 'Morning Routine'}!`, 'info');
                    setNotified(true);
                }
            }
        }
    }, [stacks, isPreview, notified, showToast]);

    const handleStackUpdated = () => {
        loadStacks();
    };

    if (!isPreview) {
        return (
            <div className="p-4 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] relative overflow-hidden group min-h-[140px]">
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm z-10 p-4 text-center">
                    <Construction className="w-6 h-6 text-yellow-500 mb-2 opacity-80" />
                    <p className="text-sm font-medium text-white/90">Routines (Coming Soon)</p>
                    <p className="text-xs text-white/50 mt-1">AI generated morning & night routines</p>
                </div>
                <div className="opacity-20 pointer-events-none blur-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <Layers className="w-5 h-5 text-[var(--color-primary)]" />
                        <h3 className="font-semibold text-[var(--text-primary)]">Routines</h3>
                    </div>
                </div>
            </div>
        );
    }

    const totalStreak = stacks.reduce((sum, s) => sum + (s.current_streak || 0), 0);
    const hasMorning = stacks.some(s => s.preferred_window === 'morning');
    const hasEvening = stacks.some(s => s.preferred_window === 'evening');

    return (
        <>
            <motion.div 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsModalOpen(true)}
                className="p-4 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] transition-all cursor-pointer relative overflow-hidden min-h-[140px] flex flex-col"
            >
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Layers className="w-5 h-5 text-[var(--color-primary)]" />
                        <h3 className="font-semibold text-[var(--text-primary)]">Routines</h3>
                    </div>
                    {totalStreak > 0 && (
                        <div className="flex items-center gap-1 text-orange-500 bg-orange-500/10 px-2 py-1 rounded-full text-xs font-bold">
                            <Flame className="w-3.5 h-3.5" />
                            {totalStreak}
                        </div>
                    )}
                </div>

                <div className="flex-1 flex flex-col justify-center">
                    {stacks.length === 0 ? (
                        <div className="text-center text-sm text-[var(--text-secondary)]">
                            <p>No routines active.</p>
                            <span className="text-[var(--color-primary)] text-xs mt-1 block">Tap to create with AI</span>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {hasMorning && (
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-[var(--text-secondary)]">Morning</span>
                                    <CheckCircle2 className={`w-4 h-4 ${stacks.find(s => s.preferred_window === 'morning')?.last_completed?.startsWith(new Date().toISOString().split('T')[0]) ? 'text-green-500' : 'text-[var(--glass-border)]'}`} />
                                </div>
                            )}
                            {hasEvening && (
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-[var(--text-secondary)]">Wind Down</span>
                                    <CheckCircle2 className={`w-4 h-4 ${stacks.find(s => s.preferred_window === 'evening')?.last_completed?.startsWith(new Date().toISOString().split('T')[0]) ? 'text-green-500' : 'text-[var(--glass-border)]'}`} />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </motion.div>

            <AnimatePresence>
                {isModalOpen && (
                    <HabitStackModal 
                        isOpen={isModalOpen} 
                        onClose={() => setIsModalOpen(false)} 
                        stacks={stacks}
                        onUpdated={handleStackUpdated}
                    />
                )}
            </AnimatePresence>
        </>
    );
}
