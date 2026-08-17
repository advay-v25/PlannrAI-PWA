# VISUAL-ONLY PROMPT (MOBILE ONLY): PWA status-bar overlap + Mindspace fit-to-width and column arrows

**Two mobile-only visual fixes. Desktop (≥768px) must render byte-for-byte identical — every change is a base-class change with an explicit `md:` reset, or is inside an already `md:hidden` element. No functional, data, PWA-config, or logic changes.**

---

## Fix 1 — App header sits under the iOS status bar in the installed PWA

**Verified root cause:** `src/app/layout.tsx` sets `statusBarStyle: "black-translucent"` (line ~15) and `viewportFit: "cover"` (line ~31). In standalone (home-screen) mode iOS therefore draws app content *behind* the status bar. The mobile header in `src/app/app/layout.tsx` (line ~176) is a fixed `h-14` with no top safe-area padding, so the PlannrAI logo and wordmark render underneath the clock, signal, and battery.

**Fix — that header element only (it is already `md:hidden`, so desktop cannot be affected):**

1. Add top safe-area padding so the bar starts below the status bar: `pt-[env(safe-area-inset-top)]`.
2. Because the height is fixed, the padding alone would squash the contents — change `h-14` to `h-auto min-h-14` (or equivalent) so the header grows by exactly the inset amount. The logo, wordmark, and search button keep their current size, spacing, and alignment; only the whole bar moves down.
3. In a normal browser tab (where `env(safe-area-inset-top)` is 0) the header must look exactly as it does today — no extra gap.
4. Do not change `layout.tsx` viewport/appleWebApp config, the manifest, or the service worker. Do not touch the bottom dock (its `bottom-[calc(1rem+env(safe-area-inset-bottom))]` is already correct).
5. Verify no other always-visible mobile chrome sits under the status bar; if a page renders its own top bar in standalone mode, apply the same inset there — nothing else changes.

---

## Fix 2 — Mindspace is cramped on mobile and column paging isn't discoverable

**Verified root cause (padding stacks three deep):** `src/app/app/tasks/page.tsx` — page header `pt-8 px-8` (line ~108) and board container `px-8 pb-8` (line ~115), plus the card's `rounded-[32px]` frame; then inside `src/components/todos/MindspaceBoard.tsx` — capture header `px-4 md:px-8` (line ~360) and the columns row `px-4 md:px-8` (line ~517). On a 393px phone that leaves roughly 300px of usable board, while each column is `w-[85vw]` (line ~633) — wider than its own container, so columns never align to the visible area and everything reads tiny.

### 2a — Fit the board to the screen width (mobile only)

1. `tasks/page.tsx`: reduce mobile horizontal padding while keeping desktop identical — header `px-4 md:px-8`, board container `px-3 md:px-8` (keep `pt-8`/`pb-8` behavior on desktop; trimming the mobile top/bottom slightly is fine if it helps fit).
2. Card frame: soften the radius on mobile only — `rounded-2xl md:rounded-[32px]` — so the rounded corners stop eating usable width.
3. `MindspaceBoard.tsx`: columns row padding `px-3 md:px-8`; capture header `px-3 md:px-8`.
4. **Column width must match the visible board width**, not the viewport: replace `w-[85vw]` with a width that makes exactly one column fill the scroller's visible area edge-to-edge (minus the small gutter), e.g. a `calc()` accounting for the new paddings or a container-relative width. Desktop keeps `md:w-auto md:flex-1 md:min-w-[200px]` exactly as-is.
5. Acceptance: at 393×852 and 360×780, one column occupies the full board width with only a small even gutter on each side; the capture field, search field, Vault button, and the added/done/rate stat row all fit their row without truncation ("Search your…" must not be cut mid-word); no horizontal page scroll (`document.documentElement.scrollWidth === clientWidth`).

### 2b — Add discoverable column paging arrows (mobile only)

The five columns (Notes, Ideas, Urgent, Work, Personal) are swipeable but users can't tell. Add small, easy-to-tap arrows:

1. **Placement — must never overlay card space:** put them in the strip between the capture/stats header and the columns area (i.e. in the board's header region, below the divider), NOT floating over the columns. Left arrow at the left edge of that strip, right arrow at the right edge, with the current column name and position between them (e.g. `Notes · 1/5`). This row sits above where cards render, so it can never cover a note.
2. **Tap targets:** minimum 44×44px, `md:hidden` so desktop never sees them.
3. **Behavior (presentation-only):** each arrow scrolls the existing scroller by exactly one column width using `scrollTo({ left, behavior: 'smooth' })` on the existing container ref — no state machine, no changes to data, DnD, or column rendering. Disable/dim the left arrow at the first column and the right arrow at the last.
4. **Swiping must keep working exactly as now** — arrows are additive. Keep `snap-x snap-mandatory md:snap-none` and update the displayed index from the scroller's `scroll` event so manual swipes keep the label in sync.
5. Style with existing tokens (`--glass-bg`, `--glass-border`, `--text-secondary`) so both themes are correct automatically.

---

## Scope guard

Allowed files: `src/app/app/layout.tsx` (mobile header element only), `src/app/app/tasks/page.tsx` (padding/radius classes only), `src/components/todos/MindspaceBoard.tsx` (padding, column width, and the new arrow row). Nothing else — no manifest, no `sw.js`, no `layout.tsx` viewport config, no store/API/DnD/logic changes. `npm run build` passes.

## Verification

1. **Installed PWA on iOS (home-screen launch):** logo and wordmark sit fully below the clock/battery with a clean gap; header is not oversized; in a normal Safari tab the header looks unchanged.
2. **Mindspace at 393×852 and 360×780:** one column fills the board width; capture, search, Vault, and stat row all fit; no truncation; no horizontal page scroll; cards render at a comfortable size.
3. **Arrows:** tappable (≥44px), never overlapping cards even with several notes added, page one column per tap, disabled at both ends, label/index stays correct after manual swipes; swipe and drag-to-reorder both still work.
4. **Both themes** correct on every new/changed element.
5. **Desktop 1440×900 screenshots of Home, Mindspace, and the app shell are pixel-identical to before** — confirm via `git diff` that every change carries an `md:` reset or lives inside an `md:hidden` element.
6. PWA still installs and launches standalone; push notifications unaffected.
