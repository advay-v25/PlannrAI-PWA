# REFINEMENT PROMPT: Light mode round 2 — solid readable calendar blocks + unified Coach Hub surfaces

Two targeted refinements to the light-mode pass. Presentation-only; dark mode must remain pixel-identical (achieve via `dark:` variants / theme vars). Standard do-not-touch list applies (`src/stores/**`, `src/lib/**`, `src/app/api/**`, logic/handlers/props). `npm run build` passes.

## 1. Calendar: opaque solid block colors with black text in light mode

Current state (see `PILLAR_COLORS` in `components/calendar/week-grid.tsx` ~lines 25–33): blocks use translucent gradients at 10–15% opacity with light-tinted text (`text-purple-100`, `text-amber-100`, …). On the light theme they render as washed-out ghosts with unreadable white text.

Rework the color map so each entry is **light-first with `dark:` variants preserving today's dark look exactly**:

- **Light mode:** fully opaque solid fills, black text. Pattern per pillar:
  - mind → `bg-purple-200 border-purple-400` · body → `bg-emerald-200 border-emerald-400` · craft → `bg-amber-200 border-amber-400` · meal → `bg-orange-200 border-orange-400` · anchor/locked (e.g. "Work") → `bg-zinc-300 border-zinc-400` · sleep → keep its scheme but solid · break/buffer → `bg-zinc-100 border-[var(--glass-border)]` · default → `bg-violet-200 border-violet-400`
  - text: `text-zinc-900` for titles/times on ALL block types in light mode; secondary meta (pillar label, lock icon) `text-zinc-700`. No transparency on the fill — blocks must be solid cards.
- **Dark mode:** append the current values as `dark:` variants, e.g. `bg-purple-200 dark:bg-gradient-to-br dark:from-purple-500/15 dark:to-indigo-600/10`, `text-zinc-900 dark:text-purple-100`, `border-purple-400 dark:border-purple-400/20`. Keep the `glow` classes dark-only (they're defined for the dark aesthetic — scope them under `.dark` if they bleed into light).
- Keep status modifiers (`done`/`missed`/`cancelled` opacity/saturation) as-is — they read fine over solid fills.
- Apply the SAME treatment everywhere block colors are defined: search `grep -rn "PILLAR_COLORS\|from-purple-500/15" src/` — at minimum the week/day grid, `agenda-view.tsx`, `block-inspector.tsx` (its pillar chips), and any color map inside `app/app/calendar/page.tsx`. Day view uses the same component so it inherits automatically — verify.
- Calendar header row (TODAY / date / Day-Week toggle / Optimize / Plan Week / export / +): in the screenshot these are washed out in light mode. Ensure they use `text-[var(--text-primary)]`/`-secondary` and `bg-[var(--glass-bg)] border-[var(--glass-border)]`, with the active view toggle and primary actions keeping their orange fills. Every control clearly legible on white.

## 2. Coach Hub: white rail + one continuous chat surface

Current light mode: the left conversation rail is still dark, and the chat header (Donna bar) + bottom composer strip are dark while the message canvas is light — three clashing bands.

1. **Left rail** (`COACH HUB`, `+`, New Chat, RECENTS list in `CoachChat.tsx`/`CoachDashboard.tsx`): light mode = white surface with black text — `bg-[var(--color-bg-primary)] border-r border-[var(--glass-border)]`, headings `text-[var(--text-tertiary)]`, items `text-[var(--text-primary)]` with `hover:bg-[var(--glass-bg-hover)]`; timestamps `text-[var(--text-tertiary)]`. New Chat keeps its orange-tinted style (works on white). Dark mode unchanged via `dark:` variants.
2. **Header + composer match the canvas:** whatever background the message canvas uses in light mode, the top Donna bar and the bottom composer strip must use the SAME background (no darker bands): same `bg-[var(--color-bg-…)]` token, separated only by a subtle `border-b`/`border-t border-[var(--glass-border)]`. The composer *input field* itself stays a distinct glass pill (`bg-[var(--glass-bg)] border-[var(--glass-border)]`, placeholder `text-[var(--text-tertiary)]`) with the orange focus ring. Donna's name/status: `text-[var(--text-primary)]`/`-secondary`.
3. Dark mode: all three surfaces keep their current appearance exactly.

## Verification (required)

1. Light mode screenshots: Calendar week view AND day view — every block a solid opaque card with black title/time text, header controls legible; Coach Hub — white rail with black text, header/canvas/composer one continuous light surface with only hairline borders.
2. Contrast: block title text on every pillar color ≥ 4.5:1 (zinc-900 on the 200-level fills passes).
3. Dark mode screenshots of the same screens: pixel-identical to current production.
4. `npm run build` + lint pass; diffs confined to classNames/inline styles (and `globals.css` only if scoping glow classes).
