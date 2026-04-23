'use client';

import { ActionCenter } from '@/components/todos/ActionCenter';
import { motion } from 'framer-motion';

export default function TasksPage() {
    return (
        <div className="flex flex-col h-[calc(100vh-8rem)]">
            <header className="mb-6">
                <h1 className="text-3xl font-bold tracking-tight text-white">Action Center</h1>
                <p className="text-[var(--text-secondary)] mt-1">
                    Manage your tasks, process your brain dumps, and track your action items.
                </p>
            </header>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex-1 rounded-[2rem] border border-white/10 bg-[var(--glass-bg)] backdrop-blur-xl overflow-hidden"
            >
                <div className="h-full max-w-3xl mx-auto w-full">
                    <ActionCenter />
                </div>
            </motion.div>
        </div>
    );
}
