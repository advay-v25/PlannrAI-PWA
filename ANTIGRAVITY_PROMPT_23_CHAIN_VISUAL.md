# PROMPT 23: Day Chain visual corrections

**Visual only.** Do not change any data, any percentage, `completion.ts`, `chain-service.ts`, the tier thresholds, or any API. Every change is inside `src/components/weekly-review/day-chain.tsx`.

---

## §1. Remove the glow

Line ~66:

```tsx
style={{ opacity, filter: full && !dashed ? `drop-shadow(0 0 6px ${color})` : undefined }}
```

**Delete the `filter` entirely.** Keep `opacity`.

The glow is why adjacent links bloom into one another and read as an orange blob rather than distinct interlocked links. It is also part of why the chain looks clipped — a 6px shadow extends past the SVG box and gets cut by the container's `overflow-hidden`.

## §2. Solid background behind the chain

The card currently uses `bg-[var(--glass-bg)]` with `backdrop-blur-xl`, so the page's purple ribbon shows straight through and the chain sits on a shifting gradient.

Give **the chain strip specifically** a solid background — the outer card can stay glass. On the `relative overflow-hidden -mx-2 px-2` container at ~line 128, set a solid `var(--color-bg-primary)` fill with the same rounded corners as the card's inner radius.

Use the **token**, not a hardcoded `#07070C`. `--color-bg-primary` is `#050508` in dark and `#faf8f6` in light, so it stays correct in both themes; hardcoding the dark value would leave a black slab in light mode. The orange chain reads fine on both.

## §3. Stop the top being cut off

The strip has `overflow-hidden` (needed, so an entering/exiting chain genuinely runs off the edge) but no vertical clearance, so the top of each link is shaved.

- Add generous **vertical padding** to that container — `py-5` or equivalent. Overflow clips at the padding box, so padding buys real clearance.
- Raise `minHeight` on the inner flex from `FULL_H + 28` to comfortably fit the tallest link **plus** the day letter **and** the percentage line beneath it.
- Change `items-start` to `items-center` on that flex row so links sit centred in the band rather than pinned to a clipped top edge.
- **Verify at both desktop and mobile widths** — the strip must never crop a link on any axis except deliberately at the left/right edges.

## §4. Correct the link proportions

Three constants are off against the reference design and it's why the chain reads wrong.

```tsx
const FULL_W = 52;
const FULL_H = 34;
const BROKEN_W = 26;
const BROKEN_H = 18;
const INTERLOCK = 14;
```

**Aspect ratio.** The reference link is 152×90 — a ratio of **1.69**. Current full links are 52/34 = 1.53 and broken are 26/18 = 1.44, so they read as stubby and inconsistent with each other. Set:

```tsx
const FULL_W = 56;
const FULL_H = 33;   // 1.70
```

**Broken links are too small.** The reference had them at **0.62 of full**, not 0.5. Derive them rather than hardcoding, so they can never drift again:

```tsx
const BROKEN_SCALE = 0.62;
const BROKEN_W = Math.round(FULL_W * BROKEN_SCALE);  // 35
const BROKEN_H = Math.round(FULL_H * BROKEN_SCALE);  // 20
```

**Overlap is far too heavy.** `INTERLOCK = 14` against a 52px link is a **27%** overlap; the reference overlapped by **13%** (20px of a 152px link). That is why Monday–Wednesday merge into a single mass. Derive it:

```tsx
const INTERLOCK = Math.round(FULL_W * 0.13);  // 7
```

**Stroke.** Keep the full link at 6 and scale the broken stroke proportionally (≈4) so line weight stays visually consistent between the two sizes.

## §5. The broken link is a plain closed oval

Confirm — and keep — that a broken link is a **plain, closed, rounded oval**: no gap, no notch, no split, nothing on top. It reads as broken purely because it is **smaller and detached**, exactly as settled earlier.

At every tier it is the **identical shape and size**; only `opacity` changes:

| Completion | Colour | Opacity |
|---|---|---|
| 90–99% | `--color-primary` | 0.85 |
| 80–89% | `--color-primary` | 0.55 |
| 70–79% | `--color-primary` | 0.30 |
| Under 70% | `--text-muted` | 0.50 |

`brokenStyle()` already does this — leave the thresholds alone. Only verify no shape variation crept in.

## §5b. Light mode uses the darker orange

`--color-primary` (`#FF5B22`) measures **2.93:1** against the light surface `#faf8f6` — below the 3:1 floor for a graphic element. It looks washed out and loses authority on cream.

Use **`--color-primary-soft`** (`#C73905`, **4.94:1**) for the chain **in light mode only**. Dark mode keeps `--color-primary` exactly as it is.

Implement with a CSS custom property rather than a JS theme check, so it follows the theme automatically and works in both `data-theme` and `prefers-color-scheme` cases:

```css
--chain-color: var(--color-primary);        /* :root / dark */
--chain-color: var(--color-primary-soft);   /* light */
```

Then reference `var(--chain-color)` everywhere the component currently hardcodes `var(--color-primary)` for a **link**. Leave the `DAY CHAIN · RUNNING` label and other primary-coloured text on `--color-primary` unless it reads poorly on cream — check and say what you found.

**The opacity tiers do not change.** Verified by measurement — the darker light-mode orange compensates almost exactly:

| Tier | Dark contrast | Light contrast |
|---|---|---|
| 90–99% @ 0.85 | 4.87:1 | 3.95:1 |
| 80–89% @ 0.55 | 2.58:1 | 2.40:1 |
| 70–79% @ 0.30 | 1.50:1 | 1.57:1 |

The faintest tier is faint in *both* modes by design, and light is marginally *better*. Do not add a separate light-mode opacity ramp.

## §6. Air around broken links

With `INTERLOCK` corrected, re-check the margins at ~line 165:

```tsx
const marginLeft = full && prevFull ? -INTERLOCK : full ? 4 : 8;
const marginRight = full ? 0 : 8;
```

A broken link must have **clear air on both sides** — it must never appear to touch a neighbour. With the larger `BROKEN_W`, raise the broken-link margins if 8px no longer leaves a visible gap. Two adjacent 100% days should be the **only** case where links overlap.

---

## §7. Do not touch

Any file other than `day-chain.tsx`. No API changes, no tier-threshold changes, no changes to what counts as complete.

Do not remove the `overflow-hidden` — the left/right edge bleed depends on it.

Do not change the streak number, the hour figures, the Share button, or the day letters and percentages.

---

## Verification (required)

1. `npm run build` passes.
2. **No glow anywhere.** Full links are flat solid strokes; no `drop-shadow` or `filter` remains in the file.
3. **Solid background** behind the chain strip — the purple page ribbon does not show through it. Check in **both** light and dark themes; neither should look wrong.
3b. **Light mode uses `--color-primary-soft` for links, dark mode uses `--color-primary`.** Toggle the theme and confirm the swap happens automatically with no reload, via CSS rather than a JS branch.
4. **Nothing is clipped vertically.** Screenshot the chain at desktop and mobile width and confirm the full height of every link, the day letter and the percentage are all visible.
5. **Edge bleed still works** — with `enters_left` / `exits_right` true, the chain still runs off the left/right edges.
6. **Interlock reads correctly.** Three consecutive 100% days show three *distinguishable* links that visibly interlock — not one merged blob.
7. **Broken links have air on both sides** and never appear joined to a neighbour.
8. **All broken links are the same size and shape**; only their opacity differs. Compare an 86% day against a 72% day.
9. Post before/after screenshots of the same week.

---

## Note for the human

The glow was doing most of the damage: it bloomed adjacent links together *and* overflowed the clipping container, which is why the tops looked shaved. The 27% interlock made it worse — at that overlap, three consecutive full links genuinely have no visible separation.

The broken links being 0.5 scale instead of 0.62 with a different aspect ratio is why they read as small dark dots rather than smaller versions of the same link. Deriving both from `FULL_W` means the relationship holds if the size is ever tuned again.
