'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
    Brain, Loader2, RotateCcw, Sparkles, AlertTriangle, Heart, Zap, Clock,
    Flame, CheckCircle2, MessageCircle, ArrowRight, FileText, Thermometer,
    Battery, BatteryLow, Lightbulb, CalendarPlus, Target, Settings
} from 'lucide-react';
import { useBrainDump } from '@/hooks/use-brain-dump';
import { OptionCard } from '@/components/coach/option-card';
import { useState } from 'react';

// ── Quick Action Templates ──

const QUICK_TEMPLATES = [
    { id: 'sick', emoji: '🤒', label: "I'm Sick", color: 'var(--color-error)' },
    { id: 'exhausted', emoji: '😴', label: 'Exhausted', color: 'var(--color-warning)' },
    { id: 'energized', emoji: '⚡', label: 'Energized', color: 'var(--color-success)' },
    { id: 'urgent_task', emoji: '📅', label: 'Urgent Task', color: 'var(--color-primary)' },
    { id: 'new_idea', emoji: '💡', label: 'New Idea', color: 'var(--color-mind)' },
];

// ── Kind Icons & Colors ──

const KIND_ICONS: Record<string, React.ReactNode> = {
    task: <CheckCircle2 className="w-3 h-3 text-[var(--color-primary)]" />,
    commitment: <Clock className="w-3 h-3 text-[var(--color-anchor)]" />,
    worry: <AlertTriangle className="w-3 h-3 text-[var(--color-warning)]" />,
    idea: <Sparkles className="w-3 h-3 text-[var(--color-mind)]" />,
    note: <FileText className="w-3 h-3 text-[var(--text-tertiary)]" />,
    habit: <Flame className="w-3 h-3 text-[var(--color-body)]" />,
    constraint: <Clock className="w-3 h-3 text-[var(--color-error)]" />,
};

const KIND_COLORS: Record<string, string> = {
    task: 'var(--color-primary)',
    commitment: 'var(--color-anchor)',
    worry: 'var(--color-warning)',
    idea: 'var(--color-mind)',
    note: 'var(--text-tertiary)',
    habit: 'var(--color-body)',
    constraint: 'var(--color-error)',
};

const FIT_BADGES: Record<string, { label: string; color: string }> = {
    gentle: { label: 'Gentle', color: 'var(--color-success)' },
    moderate: { label: 'Moderate', color: 'var(--color-warning)' },
    aggressive: { label: 'Aggressive', color: 'var(--color-error)' },
};

// ── Template Prompt Modal ──

function TemplatePromptInput({
    templateId,
    onSubmit,
    onCancel,
}: {
    templateId: string;
    onSubmit: (text: string) => void;
    onCancel: () => void;
}) {
    const [text, setText] = useState('');
    const labels: Record<string, string> = {
        urgent_task: "What's the urgent task and how long will it take?",
        new_idea: "Tell me about your idea!",
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
        >
            <p className="text-sm text-[var(--text-secondary)]">{labels[templateId] || 'Tell me more:'}</p>
            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type here..."
                className="w-full h-24 p-3 text-sm rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]
                    placeholder:text-[var(--text-tertiary)] focus:border-[var(--color-primary)]/30 focus:ring-1 focus:ring-[var(--color-primary)]/10
                    outline-none resize-none transition-all text-[var(--text-primary)]"
                autoFocus
            />
            <div className="flex gap-2">
                <button
                    onClick={() => onSubmit(text)}
                    disabled={!text.trim()}
                    className="flex-1 py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-[var(--color-mind)] to-[var(--color-primary)]
                        text-white disabled:opacity-30 hover:brightness-110 active:scale-[0.98] transition-all"
                >
                    Process
                </button>
                <button
                    onClick={onCancel}
                    className="px-4 py-2.5 rounded-xl text-sm text-[var(--text-secondary)] bg-[var(--glass-bg)] border border-[var(--glass-border)]
                        hover:bg-[var(--glass-bg-hover)] transition-all"
                >
                    Cancel
                </button>
            </div>
        </motion.div>
    );
}

// ── Main Page ──

export default function BrainDumpPage() {
    const {
        input, isLoading, isApplying, response,
        extractedItems, constraints, signals, options, question,
        validation, organized, escalations,
        appliedOptionId, lastUndoToken, error,
        setInput, submitDump, submitTemplate, applyOption, undoLastAction, reset
    } = useBrainDump();

    const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
    const hasResults = response !== null;

    const handleTemplateClick = (id: string) => {
        // Templates that need extra input
        if (id === 'urgent_task' || id === 'new_idea') {
            setPendingTemplate(id);
            return;
        }
        submitTemplate(id);
    };

    const handleTemplateSubmit = (text: string) => {
        if (pendingTemplate) {
            submitTemplate(pendingTemplate, text);
            setPendingTemplate(null);
        }
    };

    return (
        <div className="space-y-6 pt-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-mind)]/10 flex items-center justify-center border border-[var(--color-mind)]/20">
                        <Brain className="w-5 h-5 text-[var(--color-mind)]" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">Brain Dump</h1>
                        <p className="text-xs text-[var(--text-tertiary)]">Unload. I'll organize, validate, and adapt your schedule.</p>
                    </div>
                </div>
                {hasResults && (
                    <button
                        onClick={reset}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                            bg-[var(--glass-bg)] border border-[var(--glass-border)]
                            hover:bg-[var(--glass-bg-hover)] text-[var(--text-secondary)] transition-all"
                    >
                        <Brain className="w-3 h-3" />
                        New Dump
                    </button>
                )}
            </div>

            {/* Input Section */}
            {!hasResults && !isLoading && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                >
                    {/* Quick Action Templates */}
                    {!pendingTemplate && (
                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Quick Actions</p>
                            <div className="flex flex-wrap gap-2">
                                {QUICK_TEMPLATES.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => handleTemplateClick(t.id)}
                                        className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium
                                            bg-[var(--glass-bg)] border border-[var(--glass-border)]
                                            hover:bg-[var(--glass-bg-hover)] hover:border-opacity-50
                                            active:scale-[0.97] transition-all"
                                        style={{ '--hover-color': t.color } as any}
                                    >
                                        <span className="text-base">{t.emoji}</span>
                                        <span className="text-[var(--text-primary)]">{t.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Template Prompt (for urgent_task / new_idea) */}
                    {pendingTemplate && (
                        <TemplatePromptInput
                            templateId={pendingTemplate}
                            onSubmit={handleTemplateSubmit}
                            onCancel={() => setPendingTemplate(null)}
                        />
                    )}

                    {/* Free-form Input */}
                    {!pendingTemplate && (
                        <>
                            <div className="relative">
                                <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Or type anything</p>
                                <textarea
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Tasks, feelings, ideas, frustrations — dump it all here..."
                                    className="w-full h-36 p-4 text-sm font-normal leading-relaxed text-[var(--text-primary)]
                                        bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl
                                        placeholder:text-[var(--text-tertiary)]
                                        focus:border-[var(--color-mind)]/30 focus:ring-1 focus:ring-[var(--color-mind)]/10
                                        outline-none resize-none transition-all"
                                />
                            </div>
                            <button
                                onClick={submitDump}
                                disabled={!input.trim()}
                                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm
                                    bg-gradient-to-r from-[var(--color-mind)] to-[var(--color-primary)]
                                    text-white shadow-lg shadow-[var(--color-mind)]/20
                                    disabled:opacity-30 disabled:cursor-not-allowed
                                    hover:brightness-110 active:scale-[0.98] transition-all"
                            >
                                <Sparkles className="w-4 h-4" />
                                Process My Thoughts
                            </button>
                        </>
                    )}
                </motion.div>
            )}

            {/* Loading */}
            {isLoading && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-16 space-y-4"
                >
                    <div className="w-14 h-14 rounded-full bg-[var(--color-mind)]/10 flex items-center justify-center animate-pulse">
                        <Brain className="w-7 h-7 text-[var(--color-mind)]" />
                    </div>
                    <div className="text-center space-y-1">
                        <p className="text-sm font-medium text-[var(--text-primary)]">Processing your thoughts...</p>
                        <p className="text-xs text-[var(--text-tertiary)]">Validating, organizing, and finding options</p>
                    </div>
                </motion.div>
            )}

            {/* Error */}
            {error && (
                <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded-xl bg-[var(--color-error)]/5 border border-[var(--color-error)]/10"
                >
                    <p className="text-xs text-[var(--color-error)]">{error}</p>
                </motion.div>
            )}

            {/* Results */}
            {hasResults && (
                <AnimatePresence>
                    <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="space-y-5"
                    >
                        {/* ── Emotional Validation ── */}
                        {validation && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-4 rounded-2xl bg-gradient-to-br from-[var(--color-mind)]/5 to-[var(--color-primary)]/5
                                    border border-[var(--color-mind)]/15"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-full bg-[var(--color-mind)]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <Heart className="w-4 h-4 text-[var(--color-mind)]" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <p className="text-sm font-medium text-[var(--text-primary)]">{validation.acknowledgment}</p>
                                        <p className="text-xs text-[var(--text-secondary)]">{validation.reflection}</p>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* ── Organized Thoughts ── */}
                        {organized && Object.keys(organized).length > 0 && (
                            <div className="space-y-3">
                                <h3 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                                    Here's what I heard
                                </h3>

                                {organized.immediate_actions && (
                                    <OrganizedCard
                                        section={organized.immediate_actions}
                                        icon={<Zap className="w-3.5 h-3.5" />}
                                        color="var(--color-error)"
                                    />
                                )}
                                {organized.ideas_to_save && (
                                    <OrganizedCard
                                        section={organized.ideas_to_save}
                                        icon={<Lightbulb className="w-3.5 h-3.5" />}
                                        color="var(--color-mind)"
                                    />
                                )}
                                {organized.emotional_notes && (
                                    <OrganizedCard
                                        section={organized.emotional_notes}
                                        icon={<Heart className="w-3.5 h-3.5" />}
                                        color="var(--color-warning)"
                                    />
                                )}
                                {organized.schedule_adjustments && (
                                    <OrganizedCard
                                        section={organized.schedule_adjustments}
                                        icon={<Clock className="w-3.5 h-3.5" />}
                                        color="var(--color-primary)"
                                    />
                                )}
                            </div>
                        )}

                        {/* ── Extracted Items (legacy compat) ── */}
                        {extractedItems.length > 0 && !organized && (
                            <div className="space-y-2">
                                <h3 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                                    Extracted ({extractedItems.length})
                                </h3>
                                <div className="space-y-1.5">
                                    {extractedItems.map((item, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.05 }}
                                            className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)]"
                                        >
                                            <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                                                style={{ backgroundColor: `${KIND_COLORS[item.kind] || 'var(--text-tertiary)'}10` }}>
                                                {KIND_ICONS[item.kind] || <FileText className="w-3 h-3" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-[var(--text-primary)] truncate">{item.title}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide">{item.kind}</span>
                                                    {item.urgency && item.urgency >= 4 && (
                                                        <span className="text-[10px] text-[var(--color-error)] font-medium">Urgent</span>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Question (clarification) ── */}
                        {question && (
                            <div className="p-4 rounded-2xl bg-[var(--color-warning)]/5 border border-[var(--color-warning)]/10 space-y-3">
                                <div className="flex items-center gap-1.5">
                                    <MessageCircle className="w-3.5 h-3.5 text-[var(--color-warning)]" />
                                    <span className="text-xs font-semibold text-[var(--color-warning)] uppercase tracking-wider">Clarification Needed</span>
                                </div>
                                <p className="text-sm text-[var(--text-primary)]">{question.prompt}</p>
                                {question.choices && (
                                    <div className="flex flex-wrap gap-2">
                                        {question.choices.map(c => (
                                            <button key={c} onClick={() => { setInput(c); reset(); }}
                                                className="px-3 py-1.5 text-xs rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] transition-all"
                                            >
                                                {c}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Options ── */}
                        {options.length > 0 && (
                            <div className="space-y-2">
                                <h3 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                                    What would you like to do?
                                </h3>
                                <div className="space-y-2">
                                    {options.map((option) => (
                                        <div key={option.id} className="space-y-1.5">
                                            <OptionCard
                                                option={{
                                                    ...option,
                                                    description: option.impact || option.title,
                                                }}
                                                isApplying={isApplying}
                                                isApplied={appliedOptionId === option.id}
                                                onApply={() => applyOption(option.id)}
                                            />
                                            {/* Emotional fit + calendar impact badges */}
                                            <div className="flex items-center gap-2 pl-1">
                                                {option.emotional_fit && FIT_BADGES[option.emotional_fit] && (
                                                    <span
                                                        className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                                                        style={{
                                                            backgroundColor: `${FIT_BADGES[option.emotional_fit].color}10`,
                                                            color: FIT_BADGES[option.emotional_fit].color,
                                                        }}
                                                    >
                                                        {FIT_BADGES[option.emotional_fit].label}
                                                    </span>
                                                )}
                                                {option.actions?.calendar_changes && (
                                                    <span className="text-[10px] text-[var(--text-tertiary)]">
                                                        {option.actions.calendar_changes.time_freed > 0
                                                            ? `${option.actions.calendar_changes.time_freed}min freed`
                                                            : option.actions.calendar_changes.blocks_to_add > 0
                                                                ? `${option.actions.calendar_changes.blocks_to_add} block(s) added`
                                                                : ''}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Undo */}
                                {lastUndoToken && appliedOptionId && (
                                    <button
                                        onClick={undoLastAction}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                                            text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                                            bg-[var(--glass-bg)] border border-[var(--glass-border)]
                                            hover:bg-[var(--glass-bg-hover)] transition-all"
                                    >
                                        <RotateCcw className="w-3 h-3" />
                                        Undo Applied Changes
                                    </button>
                                )}
                            </div>
                        )}

                        {/* ── Escalations ── */}
                        {escalations && (escalations.coach || escalations.goals || escalations.settings) && (
                            <div className="space-y-2 pt-2">
                                <h3 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                                    Suggestions
                                </h3>
                                <div className="space-y-2">
                                    {escalations.coach && (
                                        <EscalationCard
                                            icon={<MessageCircle className="w-4 h-4" />}
                                            color="var(--color-primary)"
                                            text={escalations.coach}
                                            action="Talk to Coach"
                                            href="/app/coach"
                                        />
                                    )}
                                    {escalations.goals && (
                                        <EscalationCard
                                            icon={<Target className="w-4 h-4" />}
                                            color="var(--color-mind)"
                                            text={escalations.goals}
                                            action="Review Goals"
                                            href="/app/goals"
                                        />
                                    )}
                                    {escalations.settings && (
                                        <EscalationCard
                                            icon={<Settings className="w-4 h-4" />}
                                            color="var(--color-body)"
                                            text={escalations.settings}
                                            action="Adjust Settings"
                                            href="/app/settings"
                                        />
                                    )}
                                </div>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            )}
        </div>
    );
}

// ── Organized Card Component ──

function OrganizedCard({
    section,
    icon,
    color,
}: {
    section: { title: string; items: string[]; suggestion: string };
    icon: React.ReactNode;
    color: string;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3.5 rounded-xl border transition-all"
            style={{
                backgroundColor: `${color}05`,
                borderColor: `${color}15`,
            }}
        >
            <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}12`, color }}>
                    {icon}
                </div>
                <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>{section.title}</h4>
            </div>
            <ul className="space-y-1 mb-2">
                {section.items.map((item, i) => (
                    <li key={i} className="text-sm text-[var(--text-primary)] flex items-start gap-2">
                        <span className="w-1 h-1 rounded-full mt-2 flex-shrink-0" style={{ backgroundColor: color }} />
                        {item}
                    </li>
                ))}
            </ul>
            <p className="text-xs text-[var(--text-secondary)] italic">{section.suggestion}</p>
        </motion.div>
    );
}

// ── Escalation Card Component ──

function EscalationCard({
    icon,
    color,
    text,
    action,
    href,
}: {
    icon: React.ReactNode;
    color: string;
    text: string;
    action: string;
    href: string;
}) {
    return (
        <div
            className="p-3 rounded-xl border flex items-start gap-3"
            style={{
                backgroundColor: `${color}05`,
                borderColor: `${color}15`,
            }}
        >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}12`, color }}>
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--text-secondary)]">{text}</p>
                <a
                    href={href}
                    className="inline-flex items-center gap-1 mt-1.5 text-xs font-medium transition-colors hover:brightness-110"
                    style={{ color }}
                >
                    {action}
                    <ArrowRight className="w-3 h-3" />
                </a>
            </div>
        </div>
    );
}
