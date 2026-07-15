// Single source of truth for chronotype archetype display copy — shared by
// onboarding (step-2-rhythm.tsx) and Settings (core-constraints.tsx) so the
// naming can never drift between the two places a user sees it. The `id`
// values (lark/bear/owl/wolf) are the actual stored enum — they map directly
// onto flow-protocol.ts's `computeDayPhases` chronotype keys — only the
// display label/hint here are meant to change if the copy needs a refresh.
export const CHRONOTYPE_ARCHETYPES = [
    { id: 'lark', label: 'The Lark', hint: 'First light, first strike — sharp the moment you wake' },
    { id: 'bear', label: 'The Bear', hint: 'Steady power through the day, peaking mid-morning' },
    { id: 'owl', label: 'The Owl', hint: 'Slow to start, sharpest once the afternoon turns to evening' },
    { id: 'wolf', label: 'The Wolf', hint: 'A late fire — flat by day, unstoppable after dark' },
] as const;

export type ChronotypeId = typeof CHRONOTYPE_ARCHETYPES[number]['id'];
