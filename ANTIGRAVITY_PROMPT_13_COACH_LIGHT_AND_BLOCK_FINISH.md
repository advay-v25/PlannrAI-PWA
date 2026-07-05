# CORRECTION PROMPT: Coach Hub light-mode surfaces + restore the premium block finish in both themes

Two corrections to the last pass. Presentation-only, standard do-not-touch list (`src/stores/**`, `src/lib/**`, `src/app/api/**`, logic/handlers/props). `npm run build` passes.

## 1. Calendar blocks — the solid flat colors were a mistake; restore the premium finish

The last pass replaced the block styling with fully saturated flat solids (bright purple/orange/green, white text) in BOTH themes. That destroyed the original soft glassy aesthetic. Fix both directions:

**Dark mode: restore the ORIGINAL block styling exactly** — recover it from git history for `components/calendar/week-grid.tsx` (`PILLAR_COLORS`) and any other file the last pass touched (`agenda-view.tsx`, `block-inspector.tsx`, calendar page). The original dark map for reference:

```
mind:    bg-gradient-to-br from-purple-500/15 to-indigo-600/10 · border-purple-400/20 · text-purple-100 · dot bg-purple-400 · glow block-glow-mind
body:    from-emerald-400/15 to-teal-600/10 · border-emerald-400/20 · text-emerald-100 · dot bg-emerald-400 · glow block-glow-body
craft:   from-amber-400/15 to-orange-600/10 · border-amber-400/20 · text-amber-100 · dot bg-amber-400 · glow block-glow-craft
anchor:  bg-zinc-700/30 · border-zinc-500/15 · text-zinc-300 · dot bg-zinc-500 · glow block-glow-anchor
meal:    from-orange-300/12 to-rose-500/8 · border-orange-400/15 · text-orange-200 · dot bg-orange-400 · glow block-glow-routine
break:   bg-transparent · border-[var(--glass-border)] · text-[var(--text-tertiary)]
default: from-violet-400/15 to-purple-600/10 · border-violet-400/20 · text-violet-200 · dot bg-violet-400 · glow block-glow-routine
```
(plus the `sleep` entry — take it from git.) These become the `dark:` variants.

**Light mode: the SAME finish, translated** — not flat solids. Same structure per pillar: soft translucent gradient fill + tinted border + subtle glow, but tuned for a white canvas with dark readable text:

- Fill: same gradient pattern at light-friendly strength, e.g. mind `bg-gradient-to-br from-purple-500/20 to-indigo-500/10` (renders as pale lavender on white), body from emerald, craft from amber, meal from orange/rose, anchor `bg-zinc-400/20`, break transparent.
- Border: pillar color at ~30–40% (`border-purple-500/30`, …).
- Text: dark per pillar for titles/times — `text-purple-950`, `text-emerald-950`, `text-amber-950`, `text-orange-950`, `text-zinc-700` for anchor — all ≥ 4.5:1 on the pale fills. Pillar label (MIND/BODY/…) one step lighter (e.g. `text-purple-700`).
- Glow: the `block-glow-*` classes are tuned for dark. Add light-mode variants in `globals.css` (scope current ones under `.dark`): same colored shadow at lower alpha, e.g. `box-shadow: 0 4px 16px rgba(168,85,247,0.15)` — enough to keep the premium floating feel without haze.
- Status modifiers (done/missed/cancelled) unchanged.

Result: dark mode looks exactly like it originally did; light mode looks like the same design system on white — soft pastel glass cards with dark text, not neon solids.

## 2. Coach Hub light mode — beige rail, one white surface everywhere else

Current light mode still shows a dark rail and dark top/bottom bands around a light middle. Target look:

1. **Conversation rail (chat history sidebar):** warm beige so it *slightly* stands out from the page — light mode `bg-[#F6F1E7]` (or an equally warm `stone-100`-class tone) with `border-r border-[var(--glass-border)]`; all text black/dark: headings `text-zinc-500`, conversation titles `text-zinc-900`, timestamps `text-zinc-500`. New Chat keeps its orange-tinted pill. Dark mode: unchanged (current dark rail), via `dark:` variants.
2. **Everything else is ONE white surface:** the top bar (Donna header), the message canvas, and the bottom composer strip must all use the same background as the canvas (`var(--color-bg-primary)` / white) — no gray or dark bands top or bottom. Separate them only with hairline `border-[var(--glass-border)]`. Donna's name and all header/canvas text: black (`text-[var(--text-primary)]`), secondary lines `text-[var(--text-secondary)]`.
3. **Composer input:** on the white strip, the input pill itself should be a subtle contrast — `bg-zinc-100 border border-[var(--glass-border)]`, placeholder `text-zinc-400`, typed text black, orange focus ring. Send button orange.
4. Suggestion cards, welcome heading ("How shall we architect today?") stay as-is from the previous pass (orange-tinted cards, black heading) — just make sure both cards use the same orange-tinted treatment (screenshot shows one gray, one orange; unify to the orange style).
5. Dark mode Coach Hub: pixel-identical to current dark rendering.

## Verification (required)

1. Light mode screenshots: Calendar week + day — blocks read as soft pastel glass cards with dark text (compare side-by-side with dark mode: same visual language); Coach Hub — beige rail, white header/canvas/composer as one continuous surface, black text, orange accents.
2. Dark mode screenshots: Calendar blocks byte-for-byte match the ORIGINAL styling (verify against git history / production), Coach Hub unchanged.
3. Contrast ≥ 4.5:1 for block titles and all Coach text in light mode.
4. Build + lint pass; diffs confined to classNames/inline styles/`globals.css` glow scoping.
