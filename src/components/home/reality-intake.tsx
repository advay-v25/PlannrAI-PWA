'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Zap, Battery, CheckCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';

interface RealityIntakeProps {
    onUpdate: () => void;
}

export function RealityIntake({ onUpdate }: RealityIntakeProps) {
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (text: string = input) => {
        if (!text.trim()) return;

        setLoading(true);
        // Optimistic UI could show a "Processing..." card
        try {
            // Send to coach for processing
            await apiClient.post('/api/coach/message', {
                message: text,
                source: 'home_reality_intake'
            });

            toast.success("Captured");
            setInput('');
            onUpdate(); // Trigger home refresh to show new suggestions/changes
        } catch (e) {
            toast.error("Failed to capture");
        } finally {
            setLoading(false);
        }
    };

    const handleQuickChip = (type: 'busy' | 'tired' | 'task') => {
        if (type === 'busy') {
            // In a real app, this might open a time picker or prompt
            setInput("I'm busy until ");
            // Focus input
        } else if (type === 'tired') {
            handleSubmit("I'm feeling tired. Adjust my schedule.");
        } else if (type === 'task') {
            setInput("Add task: ");
        }
    };

    return (
        <div className="relative z-50">
            {/* The Input Bar */}
            <motion.div
                layoutId="reality-bar"
                className="relative overflow-hidden rounded-full border border-white/10 bg-white/10 backdrop-blur-xl transition-all focus-within:bg-white/15 focus-within:border-white/20 focus-within:shadow-[0_0_30px_rgba(255,255,255,0.1)]"
            >
                <form
                    onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
                    className="flex items-center pr-2"
                >
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type a change, a thought, or a task..."
                        disabled={loading}
                        className="h-14 w-full bg-transparent px-6 text-base text-white placeholder:text-white/30 focus:outline-none disabled:opacity-50"
                    />

                    <AnimatePresence>
                        {input.length > 0 && (
                            <motion.button
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.8, opacity: 0 }}
                                type="submit"
                                disabled={loading}
                                className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105 active:scale-95"
                            >
                                {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" /> : <ArrowUpIcon />}
                            </motion.button>
                        )}
                    </AnimatePresence>
                </form>
            </motion.div>

            {/* Quick Chips (Only visible when input is empty) */}
            <AnimatePresence>
                {!input && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mt-3 flex justify-center gap-2"
                    >
                        <Chip icon={<Clock className="h-3 w-3" />} label="Busy..." onClick={() => handleQuickChip('busy')} />
                        <Chip icon={<Battery className="h-3 w-3" />} label="Tired" onClick={() => handleQuickChip('tired')} />
                        <Chip icon={<CheckCircle className="h-3 w-3" />} label="Add Task" onClick={() => handleQuickChip('task')} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function Chip({ icon, label, onClick }: any) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-1.5 rounded-full border border-white/5 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}

function ArrowUpIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg>
    )
}
