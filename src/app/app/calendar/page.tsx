
'use client';

import { useState } from 'react';
import { useCalendar } from '@/hooks/use-calendar';
import { CalendarLayout } from '@/components/calendar/calendar-layout';
import { ControlStack } from '@/components/calendar/control-stack';
import { WeekGrid } from '@/components/calendar/week-grid';
import { BlockInspector } from '@/components/calendar/block-inspector';
import { useToast } from '@/components/ui/toast';
import { Loader2 } from 'lucide-react';

export default function CalendarPage() {
    const {
        selectedDate,
        blocks,
        isLoading,
        moveBlock,
        updateBlock,
        deleteBlock,
        refresh,
        planWeek,
        optimizeDay
    } = useCalendar();

    const { showToast } = useToast();
    const [selectedBlock, setSelectedBlock] = useState<any>(null);
    const [filters, setFilters] = useState({
        pillars: ['Mind', 'Body', 'Craft'],
        showAnchors: true,
        showMeals: true
    });

    const handleBlockMove = async (id: string, date: string, start: string, end: string) => {
        try {
            await moveBlock(id, date, start, end);
        } catch (e: any) {
            showToast(e.message || "Failed to move block", 'error');
        }
    };

    const handleBlockAction = async (action: string, payload?: any) => {
        if (!selectedBlock) return;

        try {
            switch (action) {
                case 'done':
                    await updateBlock(selectedBlock.id, { status: 'done' });
                    break;
                case 'skip':
                    await updateBlock(selectedBlock.id, { status: 'missed' });
                    break;
                case 'split':
                    showToast("Split functionality coming soon", 'info');
                    break;
                case 'delete':
                    await deleteBlock(selectedBlock.id);
                    setSelectedBlock(null);
                    break;
            }
        } catch (e) {
            console.error(e);
            showToast("Action failed", 'error');
        }
    };

    // Filter Logic
    const filteredBlocks = blocks.filter(b => {
        if (!filters.showAnchors && b.block_type === 'anchor') return false;
        // if (!filters.showMeals && b.block_type === 'meal') return false; // Schema update needed for 'meal' type filtering if not standard
        return true;
    });

    if (isLoading && blocks.length === 0) {
        return (
            <div className="flex h-screen items-center justify-center bg-black text-white/50 gap-3">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-xs font-bold uppercase tracking-widest">Loading Mission Control...</span>
            </div>
        );
    }

    return (
        <div className="h-screen bg-black text-white overflow-hidden">
            <CalendarLayout
                showInspector={!!selectedBlock}

                controlStack={
                    <ControlStack
                        onPlanWeek={async () => {
                            showToast("Analyzing schedule...", "info");
                            await planWeek({ mode: 'balanced', allow_weekend: false });
                        }}
                        onOptimizeDay={async () => {
                            showToast("Optimizing flow...", "info");
                            await optimizeDay();
                            refresh();
                        }}
                        filters={filters}
                        onToggleFilter={(key) => {
                            if (key === 'anchors') setFilters(p => ({ ...p, showAnchors: !p.showAnchors }));
                            if (key === 'meals') setFilters(p => ({ ...p, showMeals: !p.showMeals }));
                        }}
                    />
                }

                weekGrid={
                    <WeekGrid
                        date={selectedDate}
                        blocks={filteredBlocks}
                        onBlockMove={handleBlockMove}
                        onBlockSelect={setSelectedBlock}
                    />
                }

                inspector={
                    <BlockInspector
                        block={selectedBlock}
                        onClose={() => setSelectedBlock(null)}
                        onAction={handleBlockAction}
                    />
                }
            />
        </div>
    );
}
