# FIX PROMPT: Make light mode actually work — Calendar, Goals, Coach, loading screens

Light mode is currently broken on several pages because components hardcode dark-theme colors (`text-white`, `bg-black/40`, `bg-zinc-900`, `border-white/10`, `bg-white/[0.03]`, …) instead of using the theme system. The theme system is already correct: `src/app/globals.css` defines light-mode CSS variables at `:root` and dark overrides under `.dark` (`--color-bg-primary/secondary/tertiary`, `--glass-bg`, `--glass-border`, `--text-primary/secondary/tertiary/muted`, pillar colors, etc.). The fix is mechanical: replace hardcoded colors with those variables so both themes work from one set of classes.

**Golden rules:**
- **Dark mode must look pixel-identical to today.** Using the CSS variables achieves this automatically (they resolve to the current dark values under `.dark`). Where a variable doesn't match exactly, keep the current dark value via a `dark:` variant and add the light value as the base class.
- Presentation-only: className/style changes and `globals.css` additions. Standard do-not-touch list: `src/stores/**`, `src/lib/**`, `src/app/api/**`, `middleware.ts`, logic, handlers, props. `npm run build` passes.
- Orange (`--color-primary`) stays the accent in BOTH themes: active toggles, highlighted/suggestion cards, primary buttons are orange by default.
- Every text/background pairing must be clearly readable in light mode (aim WCAG AA ≥ 4.5:1 for body text).

**Mechanical substitution guide** (apply everywhere in the files below):
| Hardcoded | Replace with |
|---|---|
| `text-white`, `text-white/90` | `text-[var(--text-primary)]` |
| `text-white/50`–`/70` | `text-[var(--text-secondary)]` |
| `text-white/30`–`/40` | `text-[var(--text-tertiary)]` |
| `bg-black`, `bg-[#0a0a0c]`, `bg-zinc-900` | `bg-[var(--color-bg-primary)]` or `-secondary` |
| `bg-black/20`–`/60` (panels, headers, rails) | `bg-[var(--color-bg-secondary)]/60` or `bg-[var(--glass-bg)]` |
| `bg-white/[0.01–0.09]` | `bg-[var(--glass-bg)]` (or `-hover`) |
| `border-white/[0.04–0.1]` | `border-[var(--glass-border)]` |
| `hover:bg-white/5` | `hover:bg-[var(--glass-bg-hover)]` |

## 1. Calendar (`src/app/app/calendar/page.tsx` ~81 instances, `components/calendar/week-grid.tsx` ~25, `block-inspector.tsx` ~35, plus `add-block` modal in page.tsx)

Screenshot symptom: in light mode the time gutter, grid background, header bar, and side areas stay black while the rest of the app is light.

- Apply the substitution table to all four surfaces: page shell (`bg-transparent text-white` root, header bar, progress row), week/day grid (time gutter `bg-black/20`, day headers `bg-black/40`, hour lines `border-white/[0.04]`), block inspector panel, mini-calendar popover, and the Add Block modal (`bg-zinc-900`).
- `calendar-galaxy-bg` (in `globals.css` / `premium-calendar-styles.tsx`): keep it in dark mode, but in light mode it must resolve to a clean light surface — scope the galaxy/nebula background under `.dark` and give the base (light) version a subtle `var(--color-bg-secondary)` wash.
- Schedule blocks are translucent color tints — verify block title/time text uses `var(--text-primary)`/`-secondary` so it's readable on light backgrounds; keep each block's pillar tint.
- Sticky time gutter and day-header backgrounds must use opaque theme surfaces (`var(--color-bg-primary)`) so content scrolling under them stays hidden in both themes.

## 2. Goals (`src/app/app/goals/page.tsx`, `components/goals/goal-card.tsx` ~23 instances)

Screenshot symptom: expanded goal cards are washed out — white text and white sliders on a light card.

- Apply the substitution table to card text, labels (`GOAL TITLE`, `PILLAR`, …), inputs, and date fields.
- **Sliders take the goal's pillar color** (the component already receives `pillarColor`): replace `accent-white` on both range inputs (~lines 216, 230) with `style={{ accentColor: pillarColor }}` and give the track `bg-[var(--glass-border)]` (keep). The readout values (`2d`, `120m`) → `text-[var(--text-primary)]` with the number in `pillarColor`.
- Energy Demand / Priority segmented controls: selected segment = `pillarColor` background (inline style) with white text; unselected = `text-[var(--text-secondary)]` on `bg-[var(--glass-bg)]`. Same treatment for "View Expert Strategy" (keep its orange), Pause/Delete rows.
- The goal card's colored left bar and border already use pillar color — keep.

## 3. Coach (`components/coach/CoachChat.tsx` ~70, `CoachOptionCard.tsx`, `CoachMessageBubble.tsx`, `ConfirmationModal.tsx`, `ProactiveBanner.tsx`)

Screenshot symptom: in light mode the chat canvas is white but suggestion cards/labels are near-invisible, while the conversation rail and composer stay black.

- Conversation rail (left pane: "COACH HUB", New Chat, RECENTS): substitution table — `bg-[var(--color-bg-secondary)]`, text vars, `New Chat` stays orange-accented.
- Chat header, canvas, and composer: theme surfaces + text vars. Composer input container: `bg-[var(--glass-bg)] border-[var(--glass-border)]`, placeholder `text-[var(--text-tertiary)]`, keep the orange focus ring.
- Suggestion/option cards ("Reduce today's load", "Fix today's schedule"): **orange by default in both themes** — `bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30`, title `text-[var(--color-primary)]`, description `text-[var(--text-secondary)]`. Hover: `/20` tint.
- Donna's message bubbles: `bg-[var(--glass-bg)]` + text vars; user bubbles keep the orange fill with white text (works in both themes).

## 4. Loading screens — all of them

- Boot screen ("PLANNRAI OS" terminal card) in `src/app/app/page.tsx`: keep the terminal aesthetic but theme it — page bg `var(--color-bg-primary)`, card `bg-[var(--glass-bg)] border-[var(--glass-border)]`, body text `var(--text-primary)`/`-secondary`; keep the purple/orange accent colors for SYS/SYNC/OPT tags and the progress gradient (they read fine on both).
- `components/calendar/calendar-skeleton.tsx` (~19 instances) and every other `animate-pulse` skeleton that uses `bg-black`/`bg-white/5`: use `bg-[var(--glass-bg)]` blocks on `var(--color-bg-primary)` — they'll render correctly in both themes.
- The orbiting spinner: keep orange/purple arcs; ensure the backdrop uses the theme bg, not `#000`.

## 5. Sweep the rest

Run `grep -rn "text-white\|bg-black\|bg-zinc-9\|border-white/" src/app/app src/components --include=*.tsx` and triage every remaining hit on app-surface pages (Home, Mindspace, Settings, modals, toasts, dock, sidebar). Skip: marketing/landing/auth pages (intentionally always-dark cosmic styling) and anything inside an always-dark surface (e.g. elements layered on the nebula background). When in doubt: if the element sits on a theme surface, use the variables.

## Verification (required)

1. Toggle light mode and screenshot every route: `/app`, `/app/calendar` (day + week + block inspector open + Add Block modal), `/app/tasks`, `/app/goals` (card expanded), `/app/coach`, `/app/settings` — no black patches, no white-on-white/invisible text or controls anywhere.
2. Goals: sliders and segmented controls visibly colored per goal pillar in light mode; each goal's controls match its accent color.
3. Coach: suggestion cards orange-tinted and readable; rail, header, composer all light.
4. Force each page's loading state (throttle or reload): all skeletons/boot screen render light.
5. Toggle back to dark mode and screenshot the same routes: **visually identical to current production dark mode** — this is a hard requirement.
6. `npm run build` + lint pass; zero diffs outside classNames/inline styles/`globals.css`.
