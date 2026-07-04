# PROMPT: Make PlannrAI fully responsive for phones & tablets (presentation-only)

You are working on PlannrAI, a Next.js (App Router) + Tailwind + Supabase PWA. It works **perfectly on desktop Chrome** — do not change any behavior. Your job is to make the existing UI fit and work well on any phone or tablet (iOS Safari, Android Chrome, Samsung Internet), plus one branding change and one loading-resilience fix. Every change must be presentation-only: Tailwind classes, JSX containers, and static assets. Same components, same props, same handlers everywhere.

---

## ABSOLUTE DO-NOT-TOUCH LIST

Do NOT modify, refactor, "clean up," or reorganize any of the following. If a fix seems to require touching them, stop and leave a TODO comment instead:

- `src/stores/**` (zustand stores)
- `src/lib/**` (supabase clients, utils, calendar-layout math, feature flags)
- `src/app/api/**` (all API routes)
- `src/middleware.ts`
- All auth flows, Supabase queries, and `RealtimeSync`
- All event handlers, callbacks, props, state logic, and data fetching in every component — you may move a component into a new container, but its props and handlers must be passed through unchanged
- `package.json` dependencies (no new libraries; dnd-kit, framer-motion, Tailwind already cover everything)
- `.env*`, `next.config.js`, `tsconfig.json`
- Do not rename, move, or delete any existing file except where explicitly stated below
- Do not change any copy/text content except where explicitly stated below

Run `npm run build` (which includes `tsc --noEmit`) after your changes; it must pass with zero new errors.

---

## TASK 0 — Branding: logo in the top-left

The app currently shows the word "PlannrAI" as text only. Put the **logo image first, with the word "PlannrAI" following it**:

1. Add the logo asset: copy `public/icons/icon-512.png` to `public/logo.png` (or use `public/icons/icon.svg` if it renders cleanly on the dark background).
2. `src/app/app/layout.tsx` (~line 79, sidebar header): inside the existing `motion.div` (`flex items-center gap-2`), render the logo `<Image src="/logo.png" alt="PlannrAI" width={28} height={28} className="rounded-lg shrink-0" />` **before** the existing gradient `<span>PlannrAI</span>`. Keep the span and its styling exactly as-is.
3. Collapsed sidebar state: where the header currently shows nothing/alternate content when `isSidebarCollapsed`, show just the logo (28px, centered).
4. `src/app/page.tsx` (line ~166, landing nav): same pattern — logo image before the `<span>PlannrAI</span>`, sized ~24–28px.
5. Use `next/image`. Do not alter the header layout, borders, or the collapse toggle logic.

---

## TASK 1 — Critical mobile fixes

### 1.1 Calendar block inspector unreachable below `lg`
`src/app/app/calendar/page.tsx` (~line 617): inspector aside is `hidden lg:flex`, so on phones/portrait tablets tapping a block does nothing visible.
Fix: below `lg`, render the **same** `<BlockInspector block={selectedBlock} onClose={...} onAction={handleBlockAction} />` in a bottom sheet: wrapper `fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto rounded-t-2xl lg:hidden` over a `fixed inset-0 z-40 bg-black/60` backdrop whose onClick calls the same `onClose` (`setSelectedBlock(null)`). Keep the desktop `hidden lg:flex` aside untouched. Optional: animate with the already-imported framer-motion (`y: "100%" → 0`).

### 1.2 Hover-only controls invisible on touch
The pattern `opacity-0 group-hover:opacity-100` hides action buttons (edit/delete/etc.) that touch users can never reveal. Replace with `opacity-100 md:opacity-0 md:group-hover:opacity-100` in these files (interactive controls only — leave decorative hover effects alone):
`components/todos/MindspaceBoard.tsx` (card edit/delete ~lines 425, 432), `components/home/dashboard-cards.tsx`, `components/home/home-todos.tsx`, `components/home/linear-timeline.tsx`, `components/home/timeline-strip.tsx`, `components/calendar/agenda-view.tsx`, `components/calendar/week-grid.tsx`, `components/calendar/block-inspector.tsx`, `components/calendar/conflict-modal.tsx`, `components/calendar/conflict-resolution-modal.tsx`, `components/goals/goal-card.tsx`, `components/goals/goal-strategy-modal.tsx`, `components/ai-suggestion-chip.tsx`, `components/habit-stacks/habit-stack-wizard.tsx`, `components/onboarding/step-2-time.tsx`, `components/onboarding/step-4-commitments.tsx`.

### 1.3 Mobile bottom dock overflows small phones + no safe area
`src/app/app/layout.tsx` (~line 190): the `md:hidden absolute bottom-6` dock holds 8 fixed `w-12` items (384px) but only ~328px is available on a 360px phone.
Fix: (a) remove the disabled "Review — Soon" item from the **mobile dock only** (keep it in the desktop sidebar); (b) change items from `w-12 h-12` to `flex-1 max-w-12 h-12`; (c) change `bottom-6` to `bottom-[calc(1rem+env(safe-area-inset-bottom))]`.
Note: `src/components/navigation/tab-bar.tsx` is dead code (never imported) — ignore it entirely.

### 1.4 Content hidden behind the floating dock
In `src/app/app/layout.tsx`, the scroll container `<div className="flex-1 overflow-y-auto ...">` needs `pb-28 md:pb-0` so page bottoms (Coach chat composer, Calendar evening rows, Settings last section) clear the dock. Then verify Coach and Calendar (which manage internal full-height layouts) still look right; if the Coach composer is still covered, add `pb-28 md:pb-0` to its own wrapper in `components/coach/CoachChat.tsx` instead.

### 1.5 Touch drag fights scrolling
`components/calendar/week-grid.tsx` line ~116: only `PointerSensor { distance: 5 }` is registered. Add `TouchSensor` with `activationConstraint: { delay: 250, tolerance: 8 }` alongside it (import from `@dnd-kit/core`; additive — do not change the PointerSensor or `handleDragEnd`). Add `touch-action: manipulation` (Tailwind `touch-manipulation`) to draggable block elements.

### 1.6 Command menu has no mobile entry point
`components/ui/command-menu.tsx` opens only via ⌘K. Add a search icon button to the existing mobile header (the "Neural OS" bar in `src/app/app/layout.tsx`) that opens the same menu. Simplest presentation-only wiring: in `command-menu.tsx`, also listen for a custom event (`window.addEventListener('open-command-menu', ...)` → `setOpen(true)`) and have the header button do `window.dispatchEvent(new Event('open-command-menu'))`. Do not change any command logic.

---

## TASK 2 — Fit & polish

2.1 Replace viewport-height units: in `src/app/page.tsx`, `src/app/login/page.tsx`, `src/app/login/error.tsx`, `src/app/onboarding/page.tsx`, `src/app/verify-email/page.tsx`, `src/app/forgot-password/page.tsx`, `src/app/reset-password/page.tsx`, `src/app/set-password/page.tsx`, `src/app/legal/layout.tsx`, `src/app/app/page.tsx`, `src/app/app/pro/page.tsx`, `src/app/app/weekly-review/page.tsx`, `src/components/calendar/calendar-skeleton.tsx`: change `min-h-screen` → `min-h-screen min-h-dvh` and `h-screen` → `h-screen h-dvh` (keep both classes; the first is the legacy fallback).

2.2 `src/app/app/settings/page.tsx` (~line 106): `max-w-6xl mx-auto py-8` → `max-w-6xl mx-auto px-4 md:px-6 py-8`.

2.3 `components/todos/MindspaceBoard.tsx`: columns (~line 463) `min-w-[200px]` → `min-w-[85vw] sm:min-w-[280px] md:min-w-[200px]`; add `snap-x snap-mandatory` to the `overflow-x-auto` scroller (~line 346) and `snap-center` to columns; header (~line 215) `pt-10 pb-6 px-8` → `pt-6 pb-6 px-4 md:pt-10 md:px-8`.

2.4 `components/coach/CoachChat.tsx`: composer wrapper `px-8` (~line 760) → `px-4 md:px-8`; suggestion toast `bottom-24` (~line 752) → `bottom-32 md:bottom-24`.

2.5 Inputs: on text/email/password/textarea inputs in login, settings, add-block modal, and the Mindspace note editor, use `text-base md:text-sm` so iOS never auto-zooms on focus. In `src/app/layout.tsx` viewport export, change `maximumScale: 1, userScalable: false` to `maximumScale: 5, userScalable: true` (accessibility).

2.6 `public/manifest.json`: `"orientation": "portrait-primary"` → `"orientation": "any"` (unlocks tablet landscape for the installed PWA).

---

## TASK 3 — Loading-resilience: retry fallback instead of infinite skeleton

Observed bug: if the Supabase client can't hydrate on the client (blocked cookies/storage, flaky network), pages sit on the `animate-pulse` skeleton forever with no feedback.

Fix (presentation-layer only — do NOT touch stores, supabase clients, or fetching logic):
- Create `src/components/ui/loading-timeout.tsx`: a small client component that wraps skeleton/loading UI. It takes `children` (the skeleton) and starts a ~12s timer on mount. If still mounted when the timer fires, it overlays a small centered panel: "Still loading… something may have gone wrong." with two buttons: **Retry** → `window.location.reload()`, and **Sign in again** → `<Link href="/login">`. Style it with the existing glass-panel look.
- Wrap the main loading skeletons with it (wherever `isLoading` renders a skeleton on Home `src/app/app/page.tsx`, Calendar `src/app/app/calendar/page.tsx`, and any shared skeleton like `calendar-skeleton.tsx`). The wrapper unmounts with the skeleton when real data arrives, so it never fires in the normal path.

---

## VERIFICATION (required)

1. `npm run build` passes (tsc + next build), `npm run lint` introduces no new errors.
2. Use the browser tooling to test at these viewports; on every route (`/`, `/login`, `/app`, `/app/calendar`, `/app/tasks`, `/app/goals`, `/app/coach`, `/app/settings`, `/onboarding`) assert `document.documentElement.scrollWidth <= window.innerWidth` and take a screenshot:
   - 360×780, 375×667, 393×852, 412×915 (phones)
   - 768×1024 and 1024×768 (tablet — the `md`/`lg` boundaries)
   - 1440×900 (desktop — must be pixel-identical in behavior to before)
3. Functional tap-through at 393×852: tap a calendar block → bottom sheet inspector opens and its actions work; long-press-drag a block to a new hour; edit and delete a Mindspace card; send a Coach message with the composer fully visible; open the command menu from the header button; logo + "PlannrAI" visible top-left.
4. Confirm zero diffs in `src/stores`, `src/lib`, `src/app/api`, `middleware.ts`.

## ACCEPTANCE CRITERIA

- No horizontal scroll or clipped content on any route at any tested viewport.
- All previously hover-only actions reachable by tap.
- Desktop (≥1024px) rendering and behavior unchanged.
- Logo precedes the "PlannrAI" wordmark in the sidebar and landing nav.
- Skeleton screens show a Retry / Sign-in fallback after ~12s instead of hanging forever.
