
import { CheckCircle2, Circle } from 'lucide-react';

export function TodayChecklist({ tasks, onUpdate }: any) {
    if (!tasks || tasks.length === 0) return null;

    return (
        <div className="space-y-2">
            {tasks.map((task: any) => (
                <div key={task.id} className="group flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--glass-bg)] transition-colors cursor-pointer">
                    <button className="text-[var(--text-secondary)] group-hover:text-[var(--color-primary)] transition-colors">
                        <Circle className="w-5 h-5" />
                    </button>
                    <span className="text-sm text-[var(--text-secondary)]">{task.title}</span>
                    <span className="ml-auto text-xs text-[var(--text-secondary)] font-mono">{task.est_minutes}m</span>
                </div>
            ))}
        </div>
    );
}
