
import { CheckCircle2, Circle } from 'lucide-react';

export function TodayChecklist({ tasks, onUpdate }: any) {
    if (!tasks || tasks.length === 0) return null;

    return (
        <div className="space-y-2">
            {tasks.map((task: any) => (
                <div key={task.id} className="group flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
                    <button className="text-white/30 group-hover:text-[var(--color-primary)] transition-colors">
                        <Circle className="w-5 h-5" />
                    </button>
                    <span className="text-sm text-white/80">{task.title}</span>
                    <span className="ml-auto text-xs text-white/30 font-mono">{task.est_minutes}m</span>
                </div>
            ))}
        </div>
    );
}
