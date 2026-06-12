'use client';

import { useMemo, useState } from 'react';
import { CoachOption } from '@/types/coach-v4';
import { DailyGrid } from '@/components/calendar/daily-grid';
import { applyPatchToBlocks } from '@/lib/patch-utils';
import { format } from 'date-fns';
import { useCalendar } from '@/hooks/use-calendar';

export function InteractivePreview({
    option,
    onApply,
    onCancel
}: {
    option: CoachOption;
    onApply: (editedOption: CoachOption) => void;
    onCancel: () => void;
}) {
    const { blocks } = useCalendar();
    
    // We maintain a local copy of edited ops if the user drags/drops
    // For now, we'll just preview the AI's ops. 
    // In a full implementation, dragging a block would update localOps.
    const [localOps, setLocalOps] = useState<any[]>(option.patch?.ops || option.patch?.operations || []);

    const previewBlocks = useMemo(() => {
        // filter blocks for target day (assuming today for simplicity, or we can look at the patch's target_date)
        const targetDate = new Date(); 
        const todayStr = format(targetDate, 'yyyy-MM-dd');
        const dayBlocks = blocks.filter(b => b.date === todayStr);
        
        if (!localOps || localOps.length === 0) return dayBlocks;
        return applyPatchToBlocks(dayBlocks, localOps);
    }, [blocks, localOps]);

    const handleBlockMove = (blockId: string, newStartTime: string, newEndTime: string) => {
        // Create an update_event operation if the block was moved
        setLocalOps(prev => {
            const newOps = [...prev];
            // Check if there's already an operation for this block
            const existingIdx = newOps.findIndex(o => o.event_id === blockId || o.payload?.id === blockId);
            
            if (existingIdx >= 0) {
                // Merge into existing operation
                newOps[existingIdx] = {
                    ...newOps[existingIdx],
                    op: newOps[existingIdx].op || 'update_event', // preserve op type if create
                    payload: {
                        ...(newOps[existingIdx].payload || {}),
                        start_time: newStartTime,
                        end_time: newEndTime
                    }
                };
            } else {
                // Add new update operation
                newOps.push({
                    op: 'update_event',
                    event_id: blockId,
                    payload: {
                        start_time: newStartTime,
                        end_time: newEndTime
                    }
                });
            }
            return newOps;
        });
    };

    const handleApply = () => {
        // Pass the modified option back
        onApply({
            ...option,
            patch: {
                ...option.patch,
                ops: localOps
            }
        });
    };

    return (
        <div className="h-full flex flex-col bg-bg-primary rounded-xl overflow-hidden border border-white/10 m-4 shadow-2xl relative">
            <div className="absolute inset-0 bg-mesh-gradient opacity-20 pointer-events-none" />
            
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md relative z-10">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-bold uppercase tracking-widest border border-primary/30">Preview Mode</span>
                        <h2 className="text-sm font-bold text-white">{option.title}</h2>
                    </div>
                    <p className="text-xs text-foreground/50 max-w-md truncate">{option.description}</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={onCancel} className="px-4 py-2 text-xs font-bold text-foreground/50 hover:text-foreground transition-colors">
                        Cancel
                    </button>
                    <button onClick={handleApply} className="px-6 py-2 text-xs font-bold bg-primary text-white rounded-full hover:brightness-110 shadow-glow transition-all">
                        Approve & Apply
                    </button>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 relative z-0">
                <div className="max-w-3xl mx-auto h-full">
                    {/* Re-using DailyGrid but marking blocks as preview */}
                    <DailyGrid 
                        date={new Date()}
                        blocks={previewBlocks}
                        onBlockMove={handleBlockMove}
                    />
                </div>
            </div>
        </div>
    );
}
