'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { format, addDays, startOfWeek, isSameDay, differenceInMinutes } from 'date-fns';
import { DndContext, useDraggable, useDroppable, DragEndEvent, useSensor, useSensors, MouseSensor, TouchSensor } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { Lock, Check, Plus } from 'lucide-react';
import { calculateLayout, LayoutBlock } from '@/lib/calendar-layout';
import { motion } from 'framer-motion';
import { usePremiumCalendar } from './premium-calendar-styles';

interface WeekGridProps {
    date: Date;
    blocks: any[];
    onBlockMove: (id: string, newDate: string, newStart: string, newEnd: string) => void;
    onBlockSelect: (block: any) => void;
    onCellClick?: (date: string, hour: number) => void;
    viewMode?: 'day' | 'week';
    /**
     * §1: the calendar never goes away during planning. Instead of replacing
     * the grid with a spinner, goal blocks become shimmering ghosts in place
     * while the fixed scaffolding stays solid — so the user watches their own
     * week being rebuilt rather than watching the app disappear.
     */
    planningPhase?: 'generating' | 'applying' | null;
    /**
     * §4b: during apply we already KNOW the new blocks — they are the chosen
     * option's `create_event` payloads. Ghosting those instead of the old ones
     * turns the longest, emptiest phase into the most informative one, and the
     * settle is a transition rather than a swap.
     */
    incomingBlocks?: Array<{ date: string; start_time: string; end_time: string; title?: string; block_type?: string; pillar?: string }>;
    /** Profile waking bounds, for Tier 3's plausible ghosts on an empty week. */
    wakeTime?: string;
    windDownTime?: string;
}

/**
 * §2 Tier 1 — the fixed scaffolding a replan does not touch. `writeWeek`'s
 * clear step spares all of these, so they are not unknown and must never be
 * drawn as placeholders; showing them solid is what makes the ghosting of
 * everything else legible.
 */
function isFixedScaffolding(b: any): boolean {
    if (b.status === 'done') return true;
    return ['anchor', 'meal', 'sleep', 'wind_down', 'routine'].includes(b.block_type);
}

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6am - 11pm
const CELL_HEIGHT = 120;

// Pillar colors using CSS variables for consistency across pages.
//
// Two distinct visual treatments by category:
//  - Fixed/structural blocks (anchor/meal/sleep) stay FILLED and translucent
//    — a layered "satin" wash (diagonal glass-sheen over a color tint) plus
//    a solid 3px accent stripe on the leading edge, so these read as solid,
//    settled parts of the day.
//  - Planned/goal blocks (mind/body/craft/default) are outline-first: a
//    neutral glass background with NO pillar-colored fill, and a thicker,
//    stronger-opacity border carrying the pillar identity instead — this
//    keeps the grid calmer at a glance (a week full of solid-colored tiles
//    reads as "jarring") while a thick, well-defined outline is still
//    unambiguous per pillar, especially against the border-only lookalikes.
//
// IMPORTANT: these must be fully-literal strings, not built via template
// interpolation of a color variable — Tailwind's build-time scanner only
// picks up class names it can find as literal text in the source, so a
// helper like `` `border-[${cssVar}]/55` `` would silently compile to
// nothing. Also note `var(--x)/NN` opacity shorthand only works on
// Tailwind's own color utilities (e.g. `border-[var(--x)]/55`) — inside a
// raw arbitrary `[background:...]` property it is NOT valid CSS and
// silently drops the whole declaration, so those use color-mix() instead
// (the same technique Tailwind itself compiles that shorthand down to).
const PILLAR_COLORS: Record<string, { bg: string; border: string; borderWidth?: string; text: string; metaText: string; dot: string; glow: string; edge: string }> = {
    // A full-perimeter saturated color ring around a near-white card reads
    // as a coloring-book sticker, not a premium app — so every block type
    // now shares the SAME thin, mostly-neutral border, and each pillar's
    // color is demoted to a single restrained left accent stripe (the same
    // convention Google Calendar/Notion Calendar/Fantastical use), plus a
    // subtle top-highlight/bottom-shade bevel and a tight outer glow for
    // depth. One consistent border language across all types = "unified";
    // color as an accent rather than an outline = "clean" instead of loud.
    mind: {
        bg: 'bg-[#FFFFFF] dark:bg-[#1B1B20]',
        border: 'border border-[#E7E4DC] dark:border-[#2A2A31]',
        text: 'text-[#7C6FC0] dark:text-[#A99CE0]',
        metaText: 'text-[#7C6FC0] dark:text-[#A99CE0]',
        dot: 'bg-[#7C6FC0] dark:bg-[#A99CE0]',
        edge: '',
        glow: '',
    },
    body: {
        bg: 'bg-[#FFFFFF] dark:bg-[#1B1B20]',
        border: 'border border-[#E7E4DC] dark:border-[#2A2A31]',
        text: 'text-[#5F9377] dark:text-[#8FBFA3]',
        metaText: 'text-[#5F9377] dark:text-[#8FBFA3]',
        dot: 'bg-[#5F9377] dark:bg-[#8FBFA3]',
        edge: '',
        glow: '',
    },
    craft: {
        bg: 'bg-[#FFFFFF] dark:bg-[#1B1B20]',
        border: 'border border-[#E7E4DC] dark:border-[#2A2A31]',
        text: 'text-[#B9954C] dark:text-[#D6BB80]',
        metaText: 'text-[#B9954C] dark:text-[#D6BB80]',
        dot: 'bg-[#B9954C] dark:bg-[#D6BB80]',
        edge: '',
        glow: '',
    },
    anchor: {
        bg: 'bg-[#FFFFFF] dark:bg-[#1B1B20]',
        border: 'border border-[#E7E4DC] dark:border-[#2A2A31]',
        text: 'text-[#6E7889] dark:text-[#9AA4B5]',
        metaText: 'text-[#6E7889] dark:text-[#9AA4B5]',
        dot: 'bg-[#6E7889] dark:bg-[#9AA4B5]',
        edge: '',
        glow: '',
    },
    routine: {
        bg: 'bg-[#FFFFFF] dark:bg-[#1B1B20]',
        border: 'border border-[#E7E4DC] dark:border-[#2A2A31]',
        text: 'text-[#6E7889] dark:text-[#9AA4B5]',
        metaText: 'text-[#6E7889] dark:text-[#9AA4B5]',
        dot: 'bg-[#6E7889] dark:bg-[#9AA4B5]',
        edge: '',
        glow: '',
    },
    wind_down: {
        bg: 'bg-[#FFFFFF] dark:bg-[#1B1B20]',
        border: 'border border-[#E7E4DC] dark:border-[#2A2A31]',
        text: 'text-[#6E7889] dark:text-[#9AA4B5]',
        metaText: 'text-[#6E7889] dark:text-[#9AA4B5]',
        dot: 'bg-[#6E7889] dark:bg-[#9AA4B5]',
        edge: '',
        glow: '',
    },
    meal: {
        bg: 'bg-[#FFFFFF] dark:bg-[#1B1B20]',
        border: 'border border-[#E7E4DC] dark:border-[#2A2A31]',
        text: 'text-[#B97F6E] dark:text-[#D6A797]',
        metaText: 'text-[#B97F6E] dark:text-[#D6A797]',
        dot: 'bg-[#B97F6E] dark:bg-[#D6A797]',
        edge: '',
        glow: '',
    },
    sleep: {
        bg: 'bg-[#FFFFFF] dark:bg-[#1B1B20]',
        border: 'border border-[#E7E4DC] dark:border-[#2A2A31]',
        text: 'text-[#6E7889] dark:text-[#9AA4B5]',
        metaText: 'text-[#6E7889] dark:text-[#9AA4B5]',
        dot: 'bg-[#6E7889] dark:bg-[#9AA4B5]',
        glow: '',
        edge: '',
    },
    break: {
        bg: 'bg-[#FFFFFF] dark:bg-[#1B1B20]',
        border: 'border border-[#E7E4DC] dark:border-[#2A2A31]',
        text: 'text-[#8F8C84] dark:text-[#8B8B96]',
        metaText: 'text-[#8F8C84] dark:text-[#8B8B96]',
        dot: 'bg-[#8F8C84] dark:bg-[#8B8B96]',
        glow: '',
        edge: '',
    },
    default: {
        bg: 'bg-[#FFFFFF] dark:bg-[#1B1B20]',
        border: 'border border-[#E7E4DC] dark:border-[#2A2A31]',
        text: 'text-[#7C6FC0] dark:text-[#A99CE0]',
        metaText: 'text-[#7C6FC0] dark:text-[#A99CE0]',
        dot: 'bg-[#7C6FC0] dark:bg-[#A99CE0]',
        edge: '',
        glow: '',
    },
};

// Some meals (e.g. a user-defined recurring "Breakfast" set up the same way
// as a fixed commitment like "College") get created via the commitments/
// anchor path rather than the AI meal generator, storing them as block_type
// 'anchor' instead of 'meal' — but they should still read visually as a
// meal, not collapse into the generic gray anchor treatment used for actual
// fixed commitments. Match on title so this only catches genuine meals.
const MEAL_TITLE_PATTERN = /^(breakfast|lunch|dinner|snack)s?$/i;

function getBlockColors(block: any) {
    // block_type identity takes priority over lock status — a locked meal
    // (e.g. a protected breakfast slot) must still read as a meal block, not
    // collapse into the generic gray anchor treatment. Only truly
    // uncategorized locked blocks fall back to anchor styling.
    if (block.block_type === 'meal' || (block.block_type === 'anchor' && MEAL_TITLE_PATTERN.test((block.title || '').trim()))) {
        return PILLAR_COLORS.meal;
    }
    if (block.block_type === 'anchor') return PILLAR_COLORS.anchor;
    if (block.block_type === 'sleep') return PILLAR_COLORS.sleep;
    if (block.block_type === 'routine') return PILLAR_COLORS.routine;
    if (block.block_type === 'wind_down') return PILLAR_COLORS.wind_down;
    if (block.block_type === 'break' || block.block_type === 'buffer') return PILLAR_COLORS.break;
    if (block.is_locked) return PILLAR_COLORS.anchor;
    const pillar = (block.goal?.category || block.goal?.pillar || block.pillar || '').toLowerCase();
    return PILLAR_COLORS[pillar] || PILLAR_COLORS.default;
}

const STATUS_STYLES: Record<string, string> = {
    done: 'opacity-60 saturate-50',
    missed: 'opacity-40 saturate-0',
    cancelled: 'opacity-25 saturate-0 line-through',
};

export function WeekGrid({ date, blocks, onBlockMove, onBlockSelect, onCellClick, viewMode = 'week', planningPhase = null, incomingBlocks, wakeTime, windDownTime }: WeekGridProps) {
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    const days = viewMode === 'week'
        ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
        : [date]; // Day view = single column
    const gridRef = useRef<HTMLDivElement>(null);

    // Current time marker
    const [nowTop, setNowTop] = useState(0);
    const [nowDayIndex, setNowDayIndex] = useState(-1);

    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            const minutes = now.getHours() * 60 + now.getMinutes();
            setNowTop(((minutes - 6 * 60) / 60) * CELL_HEIGHT);
            const idx = days.findIndex(d => isSameDay(d, now));
            setNowDayIndex(idx);
        };
        updateTime();
        const interval = setInterval(updateTime, 60000);
        return () => clearInterval(interval);
    }, [days]);

    // Auto-scroll to current time and today's column on mount
    const scrolledRef = useRef(false);
    useEffect(() => {
        if (gridRef.current && nowTop > 0 && nowDayIndex >= 0 && !scrolledRef.current) {
            let left = 0;
            if (viewMode === 'week' && nowDayIndex > 0) {
                 left = Math.max(0, 56 + (nowDayIndex * 110) - 60);
            }
            gridRef.current.scrollTo({ top: Math.max(0, nowTop - 200), left, behavior: 'smooth' });
            scrolledRef.current = true;
        }
    }, [nowTop, nowDayIndex, viewMode]);

    // Pre-compute layout per day
    const dayLayouts = useMemo(() => {
        const layouts = new Map<number, Map<string, LayoutBlock>>();
        days.forEach((day, i) => {
            const dayStr = format(day, 'yyyy-MM-dd');
            const dayBlocks = blocks.filter(b => b.date === dayStr);
            layouts.set(i, calculateLayout(dayBlocks, CELL_HEIGHT));
        });
        return layouts;
    }, [blocks, days]);

    // §3: ghost geometry comes from the SAME calculateLayout, the same
    // CELL_HEIGHT and the same 06:00 offset as the real blocks. There are two
    // ways to draw a rectangle at 14:30 on Wednesday, and a second layout
    // function would drift the first time anyone touched either constant — the
    // symptom being a jump at the exact moment the plan lands.
    const ghostsByDay = useMemo(() => {
        const out = new Map<number, Array<{ key: string; block: any; layout: LayoutBlock }>>();
        if (!planningPhase) return out;

        const toMins = (t: string) => {
            const [h, m] = String(t).split(':').map(Number);
            return (h || 0) * 60 + (m || 0);
        };
        const toTime = (m: number) =>
            `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

        days.forEach((day, i) => {
            const dayStr = format(day, 'yyyy-MM-dd');
            const dayBlocks = blocks.filter(b => b.date === dayStr);
            const fixed = dayBlocks.filter(isFixedScaffolding);

            let source: any[];
            if (planningPhase === 'applying' && incomingBlocks) {
                // §4b Tier 2': ghosts of the NEW blocks, titles and all.
                source = incomingBlocks
                    .filter(b => b.date === dayStr && b.block_type === 'goal')
                    .map((b, n) => ({ ...b, id: `incoming-${dayStr}-${n}` }));
            } else {
                // Tier 2: the goal blocks about to be replaced, at their
                // existing positions, so the week keeps its familiar
                // silhouette while the new plan is computed.
                source = dayBlocks
                    .filter(b => !isFixedScaffolding(b) && b.block_type === 'goal')
                    .map(b => ({ ...b, ghostTitle: null }));
            }

            // §2 Tier 3: an empty target week would otherwise draw nothing and
            // look broken. Sketch plausible ghosts inside the user's real
            // waking bounds, avoiding the Tier 1 scaffolding. An impression,
            // not a prediction.
            if (source.length === 0 && planningPhase === 'generating') {
                const wake = toMins(wakeTime || '07:00');
                const end = toMins(windDownTime || '22:00');
                const busy = fixed.map(b => ({ s: toMins(b.start_time), e: toMins(b.end_time) }));
                const synthetic: any[] = [];
                let cursor = wake;
                let n = 0;
                while (cursor < end - 60 && synthetic.length < 4) {
                    const clash = busy.find(x => x.s < cursor + 90 && x.e > cursor);
                    if (clash) { cursor = clash.e + 30; continue; }
                    synthetic.push({
                        id: `tier3-${dayStr}-${n++}`,
                        date: dayStr,
                        start_time: toTime(cursor),
                        end_time: toTime(Math.min(cursor + 90, end)),
                        block_type: 'goal',
                        pillar: ['craft', 'mind', 'body'][n % 3],
                        isTier3: true,
                    });
                    cursor += 90 + 75;
                }
                source = synthetic;
            }

            if (source.length === 0) { out.set(i, []); return; }

            // Laid out against the fixed blocks too, so a ghost never lands on
            // top of an anchor that is staying put.
            const layoutMap = calculateLayout([...fixed, ...source], CELL_HEIGHT);
            out.set(i, source.map(b => {
                const l = layoutMap.get(b.id);
                if (!l) return null;
                return {
                    key: b.id,
                    block: b,
                    layout: { ...l, top: l.top - (6 * CELL_HEIGHT) },
                };
            }).filter(Boolean) as Array<{ key: string; block: any; layout: LayoutBlock }>);
        });
        return out;
    }, [planningPhase, incomingBlocks, blocks, days, wakeTime, windDownTime]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;

        const block = blocks.find(b => b.id === active.id);
        if (!block) return;

        const parts = (over.id as string).split('-');
        const dayIndex = parseInt(parts[1]);
        const hour = parseInt(parts[2]);
        const targetDate = format(days[dayIndex], 'yyyy-MM-dd');

        // Snap to the nearest 15 min based on where within the hour cell the
        // block was actually dropped — previously this always reset to :00
        // regardless of drop position, so small in-hour nudges were silent
        // no-ops and crossing a cell boundary always jumped a full 60 min.
        const activeRect = active.rect.current.translated;
        const overRect = over.rect;
        let snappedMinutes = 0;
        if (activeRect && overRect) {
            const offsetPx = activeRect.top - overRect.top;
            const minutesWithinHour = (offsetPx / CELL_HEIGHT) * 60;
            snappedMinutes = Math.min(45, Math.max(0, Math.round(minutesWithinHour / 15) * 15));
        }

        const duration = differenceInMinutes(
            new Date(`2000-01-01T${block.end_time}`),
            new Date(`2000-01-01T${block.start_time}`)
        );

        // Plain minute-of-day math instead of round-tripping through Date
        // objects — the old Date-based approach silently rolled past
        // midnight into "00:30" for a drop near the end of the day, producing
        // an end time earlier than the start time on the same date. Clamp
        // to 23:59 instead since blocks don't span across midnight.
        const startTotalMinutes = hour * 60 + snappedMinutes;
        const endTotalMinutes = Math.min(23 * 60 + 59, startTotalMinutes + duration);
        const toHHMM = (totalMinutes: number) =>
            `${Math.floor(totalMinutes / 60).toString().padStart(2, '0')}:${(totalMinutes % 60).toString().padStart(2, '0')}`;
        const targetStart = toHHMM(startTotalMinutes);
        const targetEnd = toHHMM(endTotalMinutes);

        // Skip if the block would land back in the exact slot it started
        // in — `active.id !== over.id` used to guard this but can never be
        // false (a block id and a "cell-x-y" id never match), so it never
        // actually caught a no-op drop and fired an unnecessary API call.
        if (block.date === targetDate && block.start_time?.slice(0, 5) === targetStart) return;

        onBlockMove(active.id as string, targetDate, targetStart, targetEnd);
    };

    // MouseSensor (not PointerSensor) alongside TouchSensor: PointerSensor
    // also fires for touch pointer events, which raced against TouchSensor's
    // 250ms long-press delay and could win the "is this a drag or a scroll"
    // decision — causing accidental drags when a user tried to scroll the
    // grid on mobile. Splitting mouse and touch onto dedicated sensors
    // removes that race entirely.
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
    );

    return (
        <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
            <div className={cn("h-full relative no-scrollbar overscroll-contain [-webkit-overflow-scrolling:touch] [touch-action:pan-x_pan-y]", viewMode === 'day' ? "overflow-y-auto overflow-x-hidden" : "overflow-auto")} ref={gridRef}>
                <div className="calendar-galaxy-bg" />

                {/* Day Headers */}
                <div className="sticky top-0 z-20 flex border-b border-[var(--glass-border)] bg-[var(--color-bg-primary)] shadow-lg">
                    <div className="w-14 shrink-0 sticky left-0 z-30 bg-[var(--color-bg-primary)] border-r border-[var(--glass-border)]" />
                    {days.map((day, i) => {
                        const isToday = isSameDay(day, new Date());
                        const dayStr = format(day, 'yyyy-MM-dd');
                        const dayBlocks = blocks.filter(b => b.date === dayStr);
                        const done = dayBlocks.filter(b => b.status === 'done').length;
                        return (
                            <div key={i} className={cn(
                                "flex-1 text-center py-3 border-r border-[var(--glass-border)] last:border-r-0 transition-colors relative",
                                viewMode === 'day' ? 'min-w-0 max-w-full' : 'min-w-[110px]'
                            )}>
                                <div className="flex flex-col items-center gap-1">
                                    <div className={cn(
                                        "text-[10px] uppercase font-bold tracking-widest",
                                        isToday ? "text-orange-400" : "text-[var(--text-tertiary)]"
                                    )}>
                                        {format(day, 'EEE')}
                                    </div>
                                    <div className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all shadow-inner",
                                        isToday ? "bg-gradient-to-tr from-orange-500/80 to-purple-500/80 text-white dark:text-[var(--text-primary)] backdrop-blur-md border border-white/40 dark:border-white/30 shadow-[0_0_15px_rgba(249,115,22,0.4)]" : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg)]"
                                    )}>
                                        {format(day, 'd')}
                                    </div>
                                    {dayBlocks.length > 0 && (
                                        <div className="text-[9px] text-[var(--text-tertiary)] font-mono">
                                            <span className={done === dayBlocks.length ? "text-emerald-400/80 drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]" : ""}>
                                                {done}/{dayBlocks.length}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Grid Body */}
                <div
                    className="flex relative"
                    style={{ minHeight: HOURS.length * CELL_HEIGHT }}
                    aria-busy={planningPhase ? 'true' : undefined}
                >
                    {planningPhase && (
                        <span className="sr-only" role="status" aria-live="polite">
                            {planningPhase === 'applying' ? 'Applying your plan' : 'Generating your week'}
                        </span>
                    )}

                    {/* Time Column */}
                    <div className="w-14 shrink-0 sticky left-0 z-10 bg-[var(--color-bg-primary)] border-r border-[var(--glass-border)]">
                        {HOURS.map(h => (
                            <div key={h} className="border-b border-dashed border-[var(--glass-border)] text-[10px] text-[var(--text-tertiary)] text-right pr-2 pt-1 font-mono"
                                style={{ height: CELL_HEIGHT }}>
                                {h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}
                            </div>
                        ))}
                    </div>

                    {/* Day Columns */}
                    {days.map((day, dayIndex) => {
                        const dayStr = format(day, 'yyyy-MM-dd');
                        const dayBlocks = blocks.filter(b => b.date === dayStr);
                        const layoutMap = dayLayouts.get(dayIndex) || new Map();
                        const isToday = isSameDay(day, new Date());
                        const isPast = day < new Date(new Date().setHours(0,0,0,0));

                        return (
                            <div key={dayIndex} className={cn(
                                "flex-1 border-r border-[var(--glass-border)] last:border-r-0 relative transition-colors",
                                viewMode === 'day' ? 'min-w-0 max-w-full' : 'min-w-[110px]',
                                isToday && "bg-[var(--glass-bg)]",
                                isPast && "bg-[var(--glass-bg)] opacity-80"
                            )}>
                                {/* Hour Droppables */}
                                {HOURS.map(h => (
                                    <DroppableHour
                                        key={h}
                                        dayIndex={dayIndex}
                                        hour={h}
                                        onClick={() => onCellClick?.(format(day, 'yyyy-MM-dd'), h)}
                                    />
                                ))}

                                {/* Block Overlays */}
                                {dayBlocks.map((block, index) => {
                                    const layout = layoutMap.get(block.id);
                                    if (!layout) return null;
                                    // §2: while planning, the goal blocks in
                                    // flux give way to ghosts; the fixed
                                    // scaffolding stays rendered for real,
                                    // dimmed, because it genuinely survives.
                                    if (planningPhase && !isFixedScaffolding(block)) return null;
                                    const adjustedLayout = {
                                        ...layout,
                                        top: layout.top - (6 * CELL_HEIGHT)
                                    };
                                    const card = (
                                        <BlockCard
                                            key={block.id}
                                            block={block}
                                            layout={adjustedLayout}
                                            onClick={() => onBlockSelect(block)}
                                            isDayView={viewMode === 'day'}
                                            index={index}
                                        />
                                    );
                                    // Only wrapped while planning. `display:
                                    // contents` keeps the card's absolute
                                    // positioning resolving against the day
                                    // column, and leaving the idle path
                                    // completely untouched avoids putting a
                                    // structural change anywhere near
                                    // drag-and-drop for no reason.
                                    return planningPhase ? (
                                        <div key={block.id} className="contents plan-scaffold-dim">{card}</div>
                                    ) : card;
                                })}

                                {/* §2/§3: the ghost layer. Same stacking
                                    context as BlockCard, pointer-events: none,
                                    and rendered WITHOUT unmounting the grid —
                                    unmounting loses scroll position, which is
                                    exactly where the user is looking. */}
                                {(ghostsByDay.get(dayIndex) || []).map(({ key, block, layout }, gi) => {
                                    const colors = getBlockColors(block);
                                    return (
                                        <div
                                            key={key}
                                            className="absolute pointer-events-none z-20 plan-ghost"
                                            style={{
                                                top: layout.top,
                                                height: Math.max(layout.height - 4, 18),
                                                left: `calc(${(layout.colIndex / layout.totalCols) * 100}% + 3px)`,
                                                width: `calc(${(1 / layout.totalCols) * 100}% - 6px)`,
                                                // §5: sweep Monday → Sunday so it
                                                // reads as progress, not a stuck screen.
                                                animationDelay: `${dayIndex * 60 + gi * 30}ms`,
                                            }}
                                        >
                                            <div className={cn(
                                                'relative w-full h-full rounded-lg overflow-hidden skeleton-shimmer',
                                                colors.border,
                                                colors.bg,
                                            )}>
                                                {/* §2: pillar colour at low opacity. A week of grey
                                                    boxes would lose exactly the information this
                                                    change exists to add — a Gym ghost must still
                                                    read as a body block. */}
                                                <div className={cn('absolute inset-0 opacity-[0.18]', colors.dot)} />
                                                <div className={cn('absolute left-0 top-0 bottom-0 w-[3px] opacity-60', colors.dot)} />
                                                {block.title ? (
                                                    <div className="relative px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)] truncate opacity-80">
                                                        {block.title}
                                                    </div>
                                                ) : (
                                                    <div className={cn('relative m-2 h-2 w-2/3 rounded opacity-30', colors.dot)} />
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Current Time Line — gradient */}
                                {dayIndex === nowDayIndex && nowTop > 0 && (
                                    <div
                                        className="absolute left-[-56px] right-0 z-30 pointer-events-none flex items-center"
                                        style={{ top: nowTop - 6 }}
                                    >
                                        <div className="w-14 text-[10px] text-orange-600 dark:text-orange-400 font-bold text-right pr-2 shrink-0 drop-shadow-[0_0_8px_rgba(251,146,60,0.8)]">
                                            {format(new Date(), 'HH:mm')}
                                        </div>
                                        <div className="flex-1 relative flex items-center">
                                            <div className="w-3 h-3 rounded-full bg-orange-500 dark:bg-orange-400 animate-pulse shadow-[0_0_15px_rgba(251,146,60,0.8)] -ml-1.5 shrink-0" />
                                            <div className="flex-1 h-[2px] bg-gradient-to-r from-orange-600 dark:from-orange-500 via-[#d90479] to-purple-500 shadow-[0_0_15px_rgba(249,115,22,0.5)]" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </DndContext>
    );
}

function DroppableHour({ dayIndex, hour, onClick }: { dayIndex: number; hour: number; onClick?: () => void }) {
    const { setNodeRef, isOver } = useDroppable({ id: `cell-${dayIndex}-${hour}` });
    return (
        <div
            ref={setNodeRef}
            onClick={onClick}
            className={cn(
                "border-b border-dashed border-[var(--glass-border)] dark:border-white/[0.03] transition-colors cursor-pointer group",
                isOver ? "bg-purple-500/20 border-l-2 border-purple-400/60 shadow-[inset_0_0_20px_rgba(168,85,247,0.15)]" : "hover:bg-[var(--glass-bg)]"
            )}
            style={{ height: CELL_HEIGHT }}
        >
            <div className="opacity-100 md:opacity-0 md:group-hover:opacity-100 flex items-center justify-center h-full transition-opacity">
                <Plus className="w-3 h-3 text-[var(--text-tertiary)]" />
            </div>
        </div>
    );
}

function BlockCard({ block, layout, onClick, isDayView, index = 0 }: { block: any; layout: LayoutBlock; onClick: () => void; isDayView?: boolean; index?: number }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: block.id,
        disabled: block.is_locked || block.block_type === 'anchor' || block.block_type === 'meal' || block.block_type === 'sleep'
    });

    const colors = getBlockColors(block);
    const isDone = block.status === 'done';
    const isMissed = block.status === 'missed' || block.status === 'cancelled';

    const widthPercent = 100 / layout.totalCols;
    const leftPercent = widthPercent * layout.colIndex;
    const gap = isDayView ? 4 : 2;

    // dnd-kit's `transform` is a pointer *delta*, not an absolute position —
    // it must be layered on top of the block's resting top/left/width, never
    // replace them. Swapping the whole style object here used to make the
    // block jump to a hardcoded size/position the instant a drag started,
    // before jerking into following the cursor.
    const restingStyle: React.CSSProperties = {
        top: `${layout.top}px`,
        height: `${Math.max(layout.height, 28)}px`,
        left: `calc(${leftPercent}% + ${gap}px)`,
        width: `calc(${widthPercent}% - ${gap * 2}px)`
    };

    const style: React.CSSProperties = transform ? {
        ...restingStyle,
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
    } : restingStyle;

    const animatingBlocks = usePremiumCalendar(state => state.animatingBlocks);
    const animBlock = animatingBlocks.find(b => b.id === block.id);
    const [isHidden, setIsHidden] = useState(() => {
        return animBlock ? Date.now() < animBlock.showAfter : false;
    });

    useEffect(() => {
        if (animBlock && Date.now() < animBlock.showAfter) {
            setIsHidden(true);
            const delay = animBlock.showAfter - Date.now();
            const timer = setTimeout(() => setIsHidden(false), delay);
            return () => clearTimeout(timer);
        } else {
            setIsHidden(false);
        }
    }, [animBlock]);

    return (
        <motion.div
            ref={setNodeRef}
            initial={isHidden ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
            animate={isHidden ? { opacity: 0 } : { opacity: 1, scale: 1 }}
            transition={transform ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 30, delay: isHidden ? 0 : index * 0.05 }}
            style={style}
            {...listeners}
            {...attributes}
            onClick={() => { if (!isDragging) onClick(); }}
            className={cn(
                "absolute rounded-xl overflow-hidden cursor-pointer flex flex-col touch-manipulation",
                "transition-all duration-300 hover:scale-[1.03] hover:z-20 group backdrop-blur-xl shadow-lg",
                isDragging ? "opacity-60 z-50 shadow-[0_20px_40px_rgba(249,115,22,0.4)] ring-2 ring-orange-400/80 scale-[1.05]" : colors.edge,
                colors.bg, colors.border, colors.borderWidth, colors.glow,
                STATUS_STYLES[block.status] || ''
            )}
        >
            <div className="p-2.5 h-full flex flex-col relative z-10">
                <div className="flex items-start justify-between gap-1.5">
                    <span className={cn(
                        "text-[12px] font-bold leading-tight tracking-tight flex-1",
                        isDayView ? "text-[13px]" : "",
                        colors.text,
                        isMissed && "line-through opacity-70"
                    )}>
                        {block.title || block.context || 'Untitled'}
                    </span>
                    {isDone && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                    {(block.block_type === 'anchor' || block.block_type === 'meal') && <Lock className={cn("w-3 h-3 shrink-0", colors.metaText)} />}
                </div>

                {/* Time display — always show in day view, or when block is tall enough */}
                {(isDayView || layout.height > 35) && (
                    <div className="text-[10px] font-mono mt-0.5 text-[#8F8C84] dark:text-[#8B8B96]">
                        {block.start_time?.slice(0, 5)} - {block.end_time?.slice(0, 5)}
                    </div>
                )}

                {layout.height > 60 && (
                    <div className="mt-auto pt-1 flex items-center justify-between border-t border-[var(--glass-border)]">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", colors.dot)} aria-hidden="true" />
                            <div className={cn("text-[9px] font-bold uppercase tracking-wider truncate", colors.metaText)}>
                                {block.goal?.category || block.goal?.pillar || block.pillar || block.block_type || 'general'}
                            </div>
                        </div>
                        {isDone && (
                            <div className="text-[9px] text-emerald-400/60 font-bold">DONE</div>
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );
}
