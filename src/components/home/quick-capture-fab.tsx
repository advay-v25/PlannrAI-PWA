'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Target, CheckSquare, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function QuickCaptureFAB() {
    const [isOpen, setIsOpen] = useState(false);
    const router = useRouter();

    const actions = [
        { icon: <Target size={20} />, label: 'Goal', onClick: () => { router.push('/app/goals'); setIsOpen(false); } },
        { icon: <CheckSquare size={20} />, label: 'Task', onClick: () => { router.push('/app/calendar'); setIsOpen(false); } },
        { icon: <FileText size={20} />, label: 'Note', onClick: () => { router.push('/app/tasks'); setIsOpen(false); } },
    ];

    return (
        <div 
            className="fixed bottom-6 right-6 md:bottom-10 md:right-10 z-[100]"
        >
            <AnimatePresence>
                {isOpen && (
                    <motion.div 
                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.9 }}
                        transition={{ duration: 0.2 }}
                        className="absolute bottom-16 right-0 flex flex-col gap-3 items-end"
                    >
                        {actions.map((action, i) => (
                            <motion.button
                                key={action.label}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                transition={{ delay: i * 0.05 }}
                                onClick={action.onClick}
                                className="flex items-center gap-3 bg-[var(--glass-bg-elevated)] border border-[var(--glass-border)] hover:border-[var(--color-primary)] text-[var(--text-primary)] px-4 py-3 rounded-full shadow-[var(--shadow-lg)] transition-all group"
                            >
                                <span className="text-sm font-semibold tracking-wide pr-2">{action.label}</span>
                                <div className="text-[var(--text-secondary)] group-hover:text-[var(--color-primary)] transition-colors">
                                    {action.icon}
                                </div>
                            </motion.button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>

            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`p-4 rounded-full shadow-lg transition-all flex items-center justify-center
                    ${isOpen 
                        ? 'bg-[var(--glass-bg-elevated)] border border-[var(--glass-border)] text-[var(--text-primary)] rotate-45' 
                        : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white hover:scale-105'
                    }`}
            >
                <Plus size={24} strokeWidth={2.5} />
            </button>

            {/* Backdrop to close when clicking outside */}
            {isOpen && (
                <div 
                    className="fixed inset-0 z-[-1] bg-black/20 backdrop-blur-[2px]" 
                    onClick={() => setIsOpen(false)}
                />
            )}
        </div>
    );
}
