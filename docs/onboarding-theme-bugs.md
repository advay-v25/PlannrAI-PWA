# Theme & Visual Bug Audit: Landing, Login, Onboarding

## Executive Summary
Signing out of PlannrAI while in "Light" mode causes severe visual regressions on the unauthenticated pages (Landing, Login, Onboarding). Because the theme preference persists in local storage, these pages attempt to render in light mode. However, the outer layouts are hardcoded to dark styling, while inner components attempt to respect the light theme. This creates a mismatched, unreadable UI with invisible text, broken typography, and lost spacing.

**Primary Symptom Reference**: See attached screenshot `docs/assets/theme-bugs/repro-1.png` showing the onboarding screen with dark text on a dark background.

## Root Causes
These issues stem from four systemic architectural gaps rather than one-off styling mistakes:

*   **RC1: Hardcoded Dark Chrome**: `src/app/login/page.tsx`, `src/app/onboarding/page.tsx`, and `src/app/page.tsx` use literal Tailwind classes (e.g., `text-white`, `bg-black/60`) instead of CSS-variable design tokens. Child components (like `GlassCard`) flip correctly to light mode, resulting in invisible text against dark backgrounds.
*   **RC2: Missing `:root` Fallbacks**: In `src/app/globals.css`, non-color tokens (typography, spacing, radius, transitions) are only defined under `.dark` (lines 59-158). In light mode, these variables are completely undefined, breaking the layout globally.
*   **RC3: Tailwind v4 Dark Mode Disconnect**: There is no `@custom-variant dark` declared in `globals.css`. Tailwind v4 defaults `dark:` to `@media (prefers-color-scheme: dark)`, ignoring the `.dark` class that `next-themes` toggles. The 55 instances of `dark:` classes respond to OS preference, not the in-app toggle.
*   **RC4: Mistyped CSS Variables**: Several components reference variables that don't exist (e.g., `--color-text-primary` instead of `--text-primary`).

*Bonus Findings*:
*   **Global Placeholder Override**: `globals.css:398-402` forces `input::placeholder` to `rgba(255,255,255,0.15) !important`, which is invisible on light backgrounds.
*   **Undefined Status Tokens**: Classes like `.cat-future` reference undefined colors like `--color-future`.
*   **Sign-out Mechanics**: The sign-out route (`/api/auth/logout`) doesn't clear `next-themes` localStorage, which is why the light theme survives into the unauthenticated flow.

## Bug Catalog

### 1. Login Page (`/login`)
*   **Severity**: High (Blocks authentication)
*   **Affected Modes**: Light Mode
*   **Location**: `src/app/login/page.tsx:169` (and others)
*   **Current Snippet**: `className="text-xs text-white/40 hover:text-orange-500 transition-colors"`
*   **Root Cause**: [RC1] Hardcoded Dark Chrome
*   **Proposed Fix**: Replace `text-white/40` with `text-[var(--text-muted)]` or generic Tailwind like `text-zinc-500 dark:text-zinc-400`.

### 2. Onboarding Page (`/onboarding`)
*   **Severity**: High (Unreadable text)
*   **Affected Modes**: Light Mode
*   **Location**: `src/app/onboarding/page.tsx` & Child Steps
*   **Current Snippet**: (Inferred from screenshot) Global page wrappers using fixed dark backgrounds.
*   **Root Cause**: [RC1] Hardcoded Dark Chrome + [RC2] Missing typography tokens
*   **Proposed Fix**: Remove fixed dark gradients and apply generic `bg-[var(--color-bg-primary)]`.

### 3. Missing Structural Styling
*   **Severity**: Medium (Visual Polish)
*   **Affected Modes**: Light Mode
*   **Location**: App-wide (`src/app/globals.css:81`)
*   **Current Snippet**: `--font-sans` and `--radius-md` only defined in `.dark`
*   **Root Cause**: [RC2] Missing `:root` Fallbacks
*   **Proposed Fix**: Move all typography, spacing, radius, and transition variables out of `.dark` and into `:root`.

## Cross-Cutting: Mistyped CSS Variables (RC4)
These variables are incorrectly prefixed with `--color-` in various components:

| Mistyped Variable | Correct Variable | Affected Files |
| :--- | :--- | :--- |
| `--color-text-primary` | `--text-primary` | `glass-input.tsx`, `glass-card.tsx`, `glass-toggle.tsx`, etc. |
| `--color-text-secondary` | `--text-secondary` | `glass-input.tsx`, `glass-toggle.tsx` |
| `--color-text-muted` | `--text-muted` | `glass-input.tsx`, `glass-toggle.tsx` |
| `--color-bg-elevated` | *Does not exist* | Multiple components |

## Prioritized Fix Punch List
1.  **RC3 (Tailwind Configuration)**: Add `@custom-variant dark (&:where(.dark, .dark *));` to `globals.css`.
2.  **RC2 (Global Variables)**: Move non-color tokens from `.dark` to `:root` in `globals.css`.
3.  **RC1 (Page Styling)**: Replace hardcoded `text-white`/`bg-black` with theme variables on Landing, Login, and Onboarding pages.
4.  **RC4 (Mistyped Variables)**: Search and replace mistyped variable names across all `src/components/ui/` files.
5.  **Cleanup**: Delete the 9 unreferenced sibling files in `src/app/onboarding/`.
6.  **Product Question**: Should auth pages force a fixed dark theme, or should signing out reset the user's theme preference?

## Appendix: Test Matrix Executed
*(Simulated run based on verified code states)*

| Scenario | Mode | Status | Notes |
| :--- | :--- | :--- | :--- |
| Login Page | In-App Light | FAIL | Text invisible against white backgrounds due to RC1/RC2. |
| Onboarding | In-App Light | FAIL | Typography broken; glass inputs illegible. |
| Landing | In-App Light | FAIL | Gradients hardcoded dark, text hardcoded white. |
| App Shell | In-App Light | PASS | `app/layout.tsx` correctly token-driven. |
| All Pages | System-Dark | PASS | Native fallback triggers correctly. |
