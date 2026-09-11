'use client';

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

/* ── Geometry ────────────────────────────────────────────────────────────
 * The whole chain is ONE svg. Separate per-link svgs can only ever stack —
 * the later one paints over the earlier one — which is why negative margins
 * produced butted rectangles rather than interlocking links. Sharing one
 * coordinate space is what lets a background-coloured halo erase the part of
 * a neighbour that passes behind.
 */
const VB_W = 1080;
const VB_H = 240;

const CY = 92; // link centreline
const S = 132; // horizontal spacing per day
const X0 = 144; // (1080 - 6*132) / 2 → day centres at X0 + i*S

const RX = 76; // full link half-width
const RY = 45; // full link half-height (aspect 1.69)
const SW = 13; // full link stroke

const BX = 47; // broken link half-width  (0.62 of full)
const BY = 28; // broken link half-height
const BSW = 12; // broken link stroke

const HALO = 7; // how far the halo extends past the link
const HSW = SW + 12; // halo stroke width

const LETTER_Y = 172;
const PCT_Y = 206;

/**
 * The halo must be the card's literal solid background colour. A glass token
 * or `transparent` leaves a grey fringe at every joint.
 */
const CARD_BG = 'var(--color-bg-primary)';

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

/** A link is a stadium: a rounded rect whose corner radius is its half-height. */
function linkRect(
    key: string,
    cx: number,
    rx: number,
    ry: number,
    stroke: string,
    strokeWidth: number,
    opacity: number,
    dashed = false
) {
    return (
        <rect
            key={key}
            x={cx - rx}
            y={CY - ry}
            width={rx * 2}
            height={ry * 2}
            rx={ry}
            ry={ry}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            opacity={opacity}
            strokeDasharray={dashed ? '10 8' : undefined}
        />
    );
}

/** Negative-safe parity, so bleed links at index -1/-2 keep alternating. */
const parityOf = (i: number) => ((i % 2) + 2) % 2;

/**
 * The Day Chain.
 *
 * Only 100% days join the chain — they interlock, alternating over and under.
 * Every partial day is a detached, smaller link with clear air on both sides,
 * so it can never read as connected.
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
            <div
                className="p-6 rounded-3xl border border-[var(--glass-border)] animate-pulse"
                style={{ background: CARD_BG }}
            >
                <div className="h-20 w-full bg-[var(--glass-border)]/40 rounded-2xl" />
            </div>
        );
    }

    if (!chain) return null;

    const isFull = (d: ChainDay) => !d.is_future && d.total > 0 && d.complete === d.total;

    // ── Build the draw list ──────────────────────────────────────────────
    type Slot = { i: number; cx: number; kind: 'full' | 'broken' | 'future'; day?: ChainDay };
    const slots: Slot[] = chain.days.map((day, i) => ({
        i,
        cx: X0 + i * S,
        kind: day.is_future ? 'future' : isFull(day) ? 'full' : 'broken',
        day,
    }));

    // Edge bleed: extra full links running off each side. The viewBox clips
    // them — no overflow wrappers or negative margins involved.
    if (chain.enters_left) {
        slots.push({ i: -1, cx: X0 - S, kind: 'full' });
        slots.push({ i: -2, cx: X0 - 2 * S, kind: 'full' });
    }
    if (chain.exits_right) {
        slots.push({ i: 7, cx: X0 + 7 * S, kind: 'full' });
        slots.push({ i: 8, cx: X0 + 8 * S, kind: 'full' });
    }

    const fulls = slots.filter((s) => s.kind === 'full');
    const detached = slots.filter((s) => s.kind !== 'full');

    return (
        // One solid background for the entire card — header, chain, streak and
        // hours all sit on the same surface. Glass here let the page's purple
        // ribbon run behind the streak and the hour figures.
        <div
            className="chain-scope p-6 rounded-3xl border border-[var(--glass-border)]"
            style={{ background: CARD_BG }}
        >
            <style>{CHAIN_THEME_CSS}</style>

            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold tracking-tight">Day Chain</h2>
                <button
                    onClick={handleShare}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm font-medium text-[var(--text-secondary)] transition-colors"
                >
                    <Share2 className="w-4 h-4" /> Share
                </button>
            </div>

            <svg
                width="100%"
                viewBox={`0 0 ${VB_W} ${VB_H}`}
                preserveAspectRatio="xMidYMid meet"
                fill="none"
                role="img"
                aria-label={`Day chain: ${chain.streak} day streak`}
            >
                {/* 1. Detached links first — no halo, so they never cut into a
                       neighbour and never read as connected. */}
                {detached.map((s) => {
                    const day = s.day!;
                    if (s.kind === 'future') {
                        return linkRect(
                            `f-${s.i}`,
                            s.cx,
                            BX,
                            BY,
                            'var(--text-muted)',
                            BSW,
                            0.3,
                            true
                        );
                    }
                    const st = brokenStyle(day.completion);
                    return linkRect(`b-${s.i}`, s.cx, BX, BY, st.color, BSW, st.opacity);
                })}

                {/* 2. Full links in two parity passes. Even indices are laid
                       down first; the odd links' halos then bite into them, so
                       the chain alternates over and under instead of reading as
                       a flat overlapping ribbon. */}
                {[0, 1].map((parity) => (
                    <g key={`pass-${parity}`}>
                        {fulls
                            .filter((s) => parityOf(s.i) === parity)
                            .map((s) => (
                                <g key={`l-${s.i}`}>
                                    {linkRect(
                                        `halo-${s.i}`,
                                        s.cx,
                                        RX + HALO,
                                        RY + HALO,
                                        CARD_BG,
                                        HSW,
                                        1
                                    )}
                                    {linkRect(`link-${s.i}`, s.cx, RX, RY, 'var(--chain-color)', SW, 1)}
                                </g>
                            ))}
                    </g>
                ))}

                {/* 3. Labels live in the same coordinate space, so they stay
                       locked to link centres at every width. */}
                {chain.days.map((day, i) => {
                    const full = isFull(day);
                    return (
                        <g key={`t-${day.date}`}>
                            <text
                                x={X0 + i * S}
                                y={LETTER_Y}
                                textAnchor="middle"
                                fontSize={23}
                                fill="var(--text-muted)"
                            >
                                {DAY_LETTERS[i]}
                            </text>
                            {!full && !day.is_future && (
                                <text
                                    x={X0 + i * S}
                                    y={PCT_Y}
                                    textAnchor="middle"
                                    fontSize={19}
                                    fontWeight={500}
                                    fill="var(--text-tertiary)"
                                >
                                    {Math.round(day.completion * 100)}%
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>

            {/* Streak */}
            <div className="mt-2 text-center">
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
