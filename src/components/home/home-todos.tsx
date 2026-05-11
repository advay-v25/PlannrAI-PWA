'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ListTodo, ArrowRight, Sparkles, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useTodos } from '@/hooks/use-todos';
import { Skeleton } from '@/components/ui/skeleton';

// Status badge component showing task health
function TaskStatusBadge({ pending, done }: { pending: number; done: number }) {
  const total = pending + done;
  const ratio = total > 0 ? done / total : 0;
  if (ratio >= 0.8) return <div className="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-400/10 text-emerald-400 border border-emerald-400/30">Thriving</div>;
  if (ratio >= 0.5) return <div className="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-yellow-400/10 text-yellow-400 border border-yellow-400/30">Balanced</div>;
  if (done === 0 && pending > 0) return <div className="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-orange-400/10 text-orange-400 border border-orange-400/30">Start</div>;
  return <div className="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-zinc-400/10 text-zinc-400 border border-zinc-400/30">Flow</div>;
}

export function HomeTodos() {
  const { todos, isLoading } = useTodos();

  if (isLoading) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="rounded-[2rem] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-5 backdrop-blur-xl flex flex-col gap-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton variant="avatar" className="w-8 h-8" />
              <Skeleton variant="text" className="w-20" />
            </div>
            <Skeleton variant="text" className="w-16" />
          </div>
          <div className="flex items-center gap-6">
            <Skeleton variant="text" className="w-16" />
            <Skeleton variant="text" className="w-16" />
          </div>
          <Skeleton variant="card" className="h-24" />
        </motion.div>
      </AnimatePresence>
    );
  }

  const totalPending = todos.filter(t => !t.is_completed).length;
  const totalDone = todos.filter(t => t.is_completed).length;
  const totalTasks = totalPending + totalDone;

  // Show top 3 pending tasks as a preview
  const previewTasks: { title: string; priority: string }[] = [];
  for (const todo of todos) {
    if (!todo.is_completed && previewTasks.length < 3) {
      previewTasks.push({ title: todo.title, priority: todo.priority || 'medium' });
    }
  }

  // Calculate productivity ratio for motivational copy
  const productivity = totalTasks > 0 ? (totalDone / totalTasks) * 100 : 0;
  const completionRate = totalTasks > 0 ? Math.round((totalPending / totalTasks) * 100) : 0;

  return (
    <Link href="/app/tasks">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        whileHover={{ 
          scale: 1.01, 
          transition: { type: "spring", stiffness: 200, damping: 20 }
        }}
        whileTap={{ scale: 0.98 }}
        className="relative rounded-[2.5rem] border border-[var(--glass-border)] bg-[var(--color-bg-tertiary)]/40 p-6 backdrop-blur-xl hover:bg-[var(--glass-bg-hover)] transition-all cursor-pointer group overflow-hidden"
      >
        {/* Ambient glow effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary)]/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        <div className="relative z-10">
          {/* Header with status */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <motion.div 
                className="p-2 rounded-xl bg-gradient-to-br from-[var(--color-primary)]/15 to-[var(--color-primary)]/5 border border-[var(--color-primary)]/20"
                whileHover={{ rotate: 5, scale: 1.1 }}
              >
                <ListTodo className="w-5 h-5 text-[var(--color-primary)]" />
              </motion.div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text-primary)]">
                  Protocol
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <TaskStatusBadge pending={totalPending} done={totalDone} />
                  {totalTasks > 0 && (
                    <span className="text-[10px] text-[var(--text-tertiary)]">
                      {Math.round(productivity)}%
                    </span>
                  )}
                </div>
              </div>
            </div>
            <motion.div 
              className="flex items-center gap-2"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Sparkles className="w-3 h-3 text-[var(--color-body)] opacity-70" />
              <ArrowRight className="w-4 h-4 text-[var(--text-tertiary)] group-hover:text-[var(--color-primary)] group-hover:translate-x-1 transition-all duration-300" />
            </motion.div>
          </div>

          {/* Stats with progress indicator */}
          <motion.div 
            className="flex items-center gap-6 mb-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex-1 text-center relative">
              <motion.div 
                className="text-3xl font-black bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent"
                animate={{ scale: [0.9, 1] }}
                transition={{ type: "spring", stiffness: 200 }}
              >
                {totalPending}
              </motion.div>
              <div className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mt-1">Pending</div>
              {productivity > 70 && <TrendingUp className="w-3 h-3 text-emerald-400 absolute -top-1 -right-1" />}
            </div>
            
            <div className="flex-1">
              <div className="relative bg-[var(--glass-bg)] rounded-full h-2 overflow-hidden">
                <motion.div 
                  className="absolute inset-0 bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-mind)] rounded-full"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: productivity / 100 }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  style={{ transformOrigin: 'left' }}
                />
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-[var(--text-tertiary)]">
                <span>{totalDone} done</span>
                <span>{totalTasks} total</span>
              </div>
            </div>
            
            <div className="flex-1 text-center">
              <motion.div 
                className="text-3xl font-black bg-gradient-to-r from-[var(--color-body)] to-[var(--color-body)]/70 bg-clip-text text-transparent"
                animate={{ scale: [0.9, 1] }}
                transition={{ type: "spring", stiffness: 200 }}
              >
                {totalDone}
              </motion.div>
              <div className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mt-1">Complete</div>
            </div>
          </motion.div>

          {/* AI-generated insight */}
          <motion.div 
            className="text-[11px] text-[var(--text-tertiary)] italic text-center mb-4 px-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            {productivity === 100 && totalTasks > 0 && (
              <span>🎉 System at peak optimization</span>
            )}
            {productivity >= 50 && productivity < 100 && (
              <span>⚡ Strong momentum - {completionRate}% capacity remaining</span>
            )}
            {productivity < 50 && totalTasks > 0 && (
              <span>💡 Focus energy strategically to maximize throughput</span>
            )}
            {totalTasks === 0 && (
              <span>✨ Define your first protocol to activate the system</span>
            )}
          </motion.div>

          {/* Task Preview with priority indicators */}
          <AnimatePresence>
            {previewTasks.length > 0 && (
              <motion.div 
                className="space-y-3 border-t border-[var(--glass-border)] pt-4"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                {previewTasks.map((task, i) => (
                  <motion.div 
                    key={i}
                    className="flex items-center gap-3 group/task"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * i }}
                    whileHover={{ x: 2 }}
                  >
                    <motion.div 
                      className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        task.priority === 'high' && "bg-[var(--color-craft)]",
                        task.priority === 'medium' && "bg-[var(--color-anchor)]",
                        task.priority === 'low' && "bg-[var(--color-routine)]"
                      )}
                      whileHover={{ scale: 2 }}
                    />
                    <span className="text-xs text-[var(--text-secondary)] truncate flex-1 group-hover/task:text-[var(--text-primary)] transition-colors">
                      {task.title}
                    </span>
                  </motion.div>
                ))}
                {totalPending > 3 && (
                  <motion.div 
                    className="text-[11px] text-[var(--primary)] flex items-center justify-center gap-1 pt-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>+{totalPending - 3} protocols queued</span>
                    <motion.span 
                      className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]"
                      animate={{ scale: [1, 1.5, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </Link>
  );
}

function cn(...classes: Array<string | undefined | null | false>) {
  return classes.filter(Boolean).join(' ');
}
