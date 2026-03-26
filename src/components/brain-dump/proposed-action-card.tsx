'use client';

import { useState } from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { CalendarPatch } from '@/types/calendar-patch';
import { ArrowRight, Sparkles, X, Clock, Calendar, AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useToast } from '@/components/ui/toast';

interface ProposedActionCardProps {
    action: {
        label: string;
        patch: CalendarPatch;
        reasoning: string;
    };
    onApply: () => void;
    onDismiss: () => void;
}

export function ProposedActionCard({ action, onApply, onDismiss }: ProposedActionCardProps) {
    const [isApplying, setIsApplying] = useState(false);
    const { showToast } = useToast();

    const handleApply = async () => {
        setIsApplying(true);
        try {
            const res = await fetch('/api/calendar/apply-patch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patch: action.patch }),
            });

            const data = await res.json();
            if (data.ok || data.success) {
                showToast(`✅ ${action.label} applied`, 'success');
                onApply();
            } else {
                showToast(data.error || 'Failed to apply', 'error');
            }
        } catch (e) {
            showToast('Failed to apply action', 'error');
        } finally {
            setIsApplying(false);
        }
    };

    // Standard CalendarPatch structure uses 'changes'
    const changes = action.patch.changes || [];
    const firstChange: any = changes[0];

    const op = firstChange?.op || '';
    const isConstraint = op === 'CREATE_ANCHOR';
    const isMove = op === 'MOVE';
    const isHide = op === 'HIDE';

    return (
        <GlassCard padding="sm" className={`border-l-4 ${isConstraint ? 'border-l-[var(--color-warning)]' : 'border-l-[var(--color-primary)]'}`}>
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${isConstraint ? 'bg-[var(--color-warning)]/20 text-[var(--color-warning)]' : 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]'
                        }`}>
                        {isConstraint ? <AlertTriangle className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                    </div>
                    <span className="text-sm font-bold">{action.label}</span>
                </div>
                <button onClick={onDismiss} className="text-[var(--text-tertiary)] hover:text-white transition-colors">
                    <X className="w-3 h-3" />
                </button>
            </div>

            <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
                {action.reasoning}
            </p>

            {/* Mini Preview */}
            <div className="bg-[var(--glass-bg)] rounded-lg p-2 mb-3 text-xs font-mono text-[var(--text-muted)]">
                {isMove && firstChange && (
                    <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        <span>Reschedule to {format(parseISO(firstChange.new_start_ts), 'h:mm a')}</span>
                    </div>
                )}
                {isConstraint && firstChange && (
                    <div className="flex items-center gap-2">
                        <Calendar className="w-3 h-3" />
                        <span>Fixed: {format(parseISO(firstChange.start_ts), 'h:mm a')}</span>
                    </div>
                )}
                {isHide && (
                    <span>Clearing schedule slot...</span>
                )}
            </div>

            <GlassButton
                variant="primary"
                size="sm"
                className="w-full text-xs h-8"
                onClick={handleApply}
                disabled={isApplying}
            >
                {isApplying ? 'Applying...' : 'Execute Change'}
                {!isApplying && <ArrowRight className="w-3 h-3 ml-1" />}
            </GlassButton>
        </GlassCard>
    );
}
