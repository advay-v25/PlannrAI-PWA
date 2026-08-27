'use client';

import { motion } from 'framer-motion';
import { Share2 } from 'lucide-react';

export interface ChainDay {
    date: string;
    completion: number;
    total: number;
    complete: number;
    /** The day has not happened yet — never drawn as a link in the chain. */
    is_future?: boolean;
}

export interface ChainResponse {
    days: ChainDay[];
    streak: number;
    longest: number;
    state: 'RUNNING' | 'ENDED';
    enters_left: boolean;
    exits_right: boolean;
    hours: { committed: number; invested: number; recovery: number };
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Full links are large enough to interlock with their neighbours. Broken links
// are the SAME smaller shape at every tier — only opacity varies — so the fade
// reads purely as how close you came, never as a different kind of failure.
//
// Everything below is DERIVED from FULL_W/FULL_H so the relationships hold if
// the size is ever tuned again.
const FULL_W = 56;
const FULL_H = 33; // 1.70 aspect, matching the 152x90 reference link

/** Broken links are 0.62 of full — smaller versions of the same shape, not dots. */
const BROKEN_SCALE = 0.62;
const BROKEN_W = Math.round(FULL_W * BROKEN_SCALE); // 35
const BROKEN_H = Math.round(FULL_H * BROKEN_SCALE); // 20

/**
 * Horizontal overlap between two joined links: 13% of the link width, as in the
 * reference (20px of 152). The previous 14px against a 52px link was a 27%
 * overlap, which merged three consecutive full days into a single mass.
 */
const INTERLOCK = Math.round(FULL_W * 0.13); // 7

const FULL_STROKE = 6;
/** Scaled so line weight reads consistently across both sizes. */
const BROKEN_STROKE = Math.max(2, Math.round(FULL_STROKE * BROKEN_SCALE)); // 4

/** Clear air either side of a detached link — it must never touch a neighbour. */
const BROKEN_GAP = 10;

/**
 * Link colour follows the theme through a CSS custom property, so it swaps with
 * no JS theme check and no reload. next-themes puts `.dark` on <html> (covering
 * the system preference too), and :root is the light default.
 *
 * Light uses the darker orange: --color-primary is only 3.11:1 on the cream
 * surface, while --color-primary-soft is 4.94:1. Dark keeps --color-primary
 * (6.18:1 on #050508). The opacity tiers are unchanged — the darker light-mode
 * orange compensates almost exactly.
 */
const CHAIN_THEME_CSS = `
.chain-scope { --chain-color: var(--color-primary-soft); }
.dark .chain-scope { --chain-color: var(--color-primary); }
`;

/** Opacity tiers for a broken day. Under 70% drops colour entirely. */
function brokenStyle(completion: number): { color: string; opacity: number } {
    const pct = completion * 100;
    if (pct >= 90) return { color: 'var(--chain-color)', opacity: 0.85 };
    if (pct >= 80) return { color: 'var(--chain-color)', opacity: 0.55 };
    if (pct >= 70) return { color: 'var(--chain-color)', opacity: 0.3 };
    return { color: 'var(--text-muted)', opacity: 0.5 };
}

function Link({
    full,
    color,
    opacity,
    dashed = false,
}: {
    full: boolean;
    color: string;
    opacity: number;
    /** A day that has not happened yet: outline only, no solid ring. */
    dashed?: boolean;
}) {
    const w = full ? FULL_W : BROKEN_W;
    const h = full ? FULL_H : BROKEN_H;
    const stroke = full ? FULL_STROKE : BROKEN_STROKE;

    return (
        // No drop-shadow: the glow bloomed adjacent links into one another and
        // overflowed the clipping container, which is what shaved the tops.
        <svg
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            fill="none"
            style={{ opacity }}
        >
            <rect
                x={stroke / 2}
                y={stroke / 2}
                width={w - stroke}
                height={h - stroke}
                rx={(h - stroke) / 2}
                stroke={color}
                strokeWidth={dashed ? 1.5 : stroke}
                strokeDasharray={dashed ? '3 3' : undefined}
                fill="none"
            />
        </svg>
    );
}

/**
 * The Day Chain.
 *
 * Only 100% days join the chain — they interlock at full size. Every partial
 * day is a detached, smaller link with clear air on both sides, so it can never
 * read as connected.
 */
export function DayChain({ chain, loading = false }: { chain: ChainResponse | null; loading?: boolean }) {
    const handleShare = async () => {
        // The server-rendered share image is separate work; this is the hook for it.
        const text = chain
            ? `${chain.streak}-day chain on PlannrAI — longest ${chain.longest} days.`
            : 'My Day Chain on PlannrAI';
        try {
            if (typeof navigator !== 'undefined' && navigator.share) {
                await navigator.share({ title: 'My Day Chain', text });
            } else {
                await navigator.clipboard?.writeText(text);
            }
        } catch {
            /* user dismissed the share sheet */
        }
    };

    if (loading) {
        return (
            <div className="p-6 rounded-3xl bg-[var(--glass-bg)] border border-[var(--glass-border)] animate-pulse">
                <div className="h-20 w-full bg-[var(--glass-border)]/40 rounded-2xl" />
            </div>
        );
    }

    if (!chain) return null;

    const isFull = (d: ChainDay) => !d.is_future && d.total > 0 && d.complete === d.total;

    return (
        <div className="chain-scope p-6 rounded-3xl bg-[var(--glass-bg)] border border-[var(--glass-border)] backdrop-blur-xl">
            <style>{CHAIN_THEME_CSS}</style>
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold tracking-tight">Day Chain</h2>
                <button
                    onClick={handleShare}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm font-medium text-[var(--text-secondary)] transition-colors"
                >
                    <Share2 className="w-4 h-4" /> Share
                </button>
            </div>

            {/* The chain itself. Overflow stays hidden so an entering/exiting
                chain genuinely runs off the edge of the canvas — but the strip
                now carries its own vertical padding, so clipping happens at the
                padding box and no link gets its top shaved.

                The strip is solid rather than glass: on glass the page's purple
                ribbon showed straight through and the chain sat on a shifting
                gradient. --color-bg-primary is a token (#faf8f6 light,
                #050508 dark) so it stays correct in both themes. */}
            <div
                className="relative overflow-hidden -mx-2 px-2 py-5 rounded-2xl"
                style={{ background: 'var(--color-bg-primary)' }}
            >
                {/* The corrected link sizes make the seven-day row wider than a
                    narrow viewport, which would clip a real day at the right
                    edge — a crop that is NOT the deliberate left/right bleed.
                    Scaling the row keeps every day visible at exact proportions;
                    full size returns at sm and above. */}
                <div
                    className="flex items-center justify-center origin-center scale-[0.85] sm:scale-100"
                    style={{ minHeight: FULL_H + 46 }}
                >
                    {/* Runs off the left edge: the chain was already going before Monday */}
                    {chain.enters_left && (
                        <div
                            className="flex items-center shrink-0"
                            style={{ height: FULL_H, marginLeft: -FULL_W / 2, marginRight: -INTERLOCK }}
                        >
                            <Link full color="var(--chain-color)" opacity={1} />
                        </div>
                    )}

                    {chain.days.map((day, i) => {
                        const full = isFull(day);
                        const prevFull = i > 0 ? isFull(chain.days[i - 1]) : chain.enters_left;
                        // Days still to come are drawn as faint placeholders —
                        // showing them as completed links would claim a day that
                        // has not happened.
                        const style = day.is_future
                            ? { color: 'var(--text-muted)', opacity: 0.3 }
                            : full
                              ? { color: 'var(--chain-color)', opacity: 1 }
                              : brokenStyle(day.completion);

                        // Two adjacent 100% days interlock — the ONLY case where
                        // links overlap. Everything else gets clear air, and the
                        // now-larger broken link gets a wider gap so it can never
                        // look joined to a neighbour.
                        const marginLeft = full && prevFull ? -INTERLOCK : full ? 4 : BROKEN_GAP;
                        const marginRight = full ? 0 : BROKEN_GAP;

                        return (
                            <motion.div
                                key={day.date}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="flex flex-col items-center shrink-0"
                                style={{ marginLeft, marginRight }}
                            >
                                <div className="flex items-center" style={{ height: FULL_H }}>
                                    <Link
                                        full={full}
                                        color={style.color}
                                        opacity={style.opacity}
                                        dashed={!!day.is_future}
                                    />
                                </div>
                                <span className="text-[10px] text-[var(--text-muted)] mt-1.5">
                                    {DAY_LETTERS[i]}
                                </span>
                                {/* Percentage shown beneath any broken day */}
                                {!full && !day.is_future && (
                                    <span className="text-[10px] font-medium text-[var(--text-tertiary)] tabular-nums">
                                        {Math.round(day.completion * 100)}%
                                    </span>
                                )}
                            </motion.div>
                        );
                    })}

                    {/* Runs off the right edge: the chain carries into next week */}
                    {chain.exits_right && (
                        <div
                            className="flex items-center shrink-0"
                            style={{ height: FULL_H, marginLeft: -INTERLOCK, marginRight: -FULL_W / 2 }}
                        >
                            <Link full color="var(--chain-color)" opacity={1} />
                        </div>
                    )}
                </div>
            </div>

            {/* Streak */}
            <div className="mt-6 text-center">
                <div className="text-5xl font-black tracking-tighter text-[var(--text-primary)] tabular-nums">
                    {chain.streak}
                </div>
                <div
                    className={`text-[10px] font-bold uppercase tracking-[0.2em] mt-1 ${
                        chain.state === 'RUNNING' ? 'text-[var(--chain-color)]' : 'text-[var(--text-muted)]'
                    }`}
                >
                    Day Chain · {chain.state}
                </div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mt-1">
                    Longest {chain.longest} {chain.longest === 1 ? 'Day' : 'Days'}
                </div>
            </div>

            {/* Descriptive hours — these have no effect on the chain */}
            <div className="mt-6 pt-5 border-t border-[var(--glass-border)] grid grid-cols-3 gap-3 text-center">
                {[
                    { label: 'Committed', value: chain.hours.committed },
                    { label: 'Invested', value: chain.hours.invested },
                    { label: 'Recovery', value: chain.hours.recovery },
                ].map((h) => (
                    <div key={h.label}>
                        <div className="text-xl font-bold text-[var(--text-primary)] tabular-nums">
                            {h.value}h
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mt-0.5">
                            {h.label}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
