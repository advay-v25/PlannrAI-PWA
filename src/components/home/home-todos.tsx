'use client';

import { motion } from 'framer-motion';
import { ListTodo, ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useTodos } from '@/hooks/use-todos';

export function HomeTodos() {
    const { lists, isLoading } = useTodos();

    if (isLoading) {
        return (
            <div className="rounded-[2rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl flex items-center justify-center min-h-[100px]">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
            </div>
        );
    }

    const totalPending = lists.reduce((sum, l) => sum + l.todos.filter(t => !t.is_completed).length, 0);
    const totalDone = lists.reduce((sum, l) => sum + l.todos.filter(t => t.is_completed).length, 0);
    const totalTasks = totalPending + totalDone;

    // Show top 3 pending tasks as a preview
    const previewTasks: { title: string; listColor: string | null }[] = [];
    for (const list of lists) {
        for (const todo of list.todos) {
            if (!todo.is_completed && previewTasks.length < 3) {
                previewTasks.push({ title: todo.title, listColor: list.color });
            }
        }
    }

    return (
        <Link href="/app/tasks">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-[2rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl hover:bg-white/[0.07] transition-all cursor-pointer group"
            >
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-orange-500/15">
                            <ListTodo className="w-4 h-4 text-orange-400" />
                        </div>
                        <h3 className="text-xs font-bold uppercase tracking-widest text-white/60">
                            Action Center
                        </h3>
                    </div>
                    <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-white/60 group-hover:translate-x-1 transition-all" />
                </div>

                {/* Stats Row */}
                <div className="flex items-center gap-4 mb-4">
                    <div className="flex-1 text-center">
                        <div className="text-2xl font-bold text-white">{totalPending}</div>
                        <div className="text-[10px] text-white/40 uppercase tracking-wider font-medium">Pending</div>
                    </div>
                    <div className="w-px h-8 bg-white/10" />
                    <div className="flex-1 text-center">
                        <div className="text-2xl font-bold text-emerald-400">{totalDone}</div>
                        <div className="text-[10px] text-white/40 uppercase tracking-wider font-medium">Done</div>
                    </div>
                    <div className="w-px h-8 bg-white/10" />
                    <div className="flex-1 text-center">
                        <div className="text-2xl font-bold text-white/40">{lists.length}</div>
                        <div className="text-[10px] text-white/40 uppercase tracking-wider font-medium">Lists</div>
                    </div>
                </div>

                {/* Task Preview */}
                {previewTasks.length > 0 && (
                    <div className="space-y-1.5 border-t border-white/5 pt-3">
                        {previewTasks.map((task, i) => (
                            <div key={i} className="flex items-center gap-2.5">
                                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: task.listColor || 'var(--color-primary)' }} />
                                <span className="text-xs text-white/60 truncate">{task.title}</span>
                            </div>
                        ))}
                        {totalPending > 3 && (
                            <span className="text-[10px] text-white/30 pl-4">+{totalPending - 3} more</span>
                        )}
                    </div>
                )}

                {totalTasks === 0 && (
                    <p className="text-xs text-white/30 text-center">No tasks yet. Tap to add some.</p>
                )}
            </motion.div>
        </Link>
    );
}
