# PROMPT 24: Render the chain as one SVG so links genuinely interlock, and make the whole card solid

**Visual only.** No data, no percentages, no tier thresholds, no API. All changes in `src/components/weekly-review/day-chain.tsx` (plus its container's background).

---

## §1. Why the interlock is broken — and why margins can never fix it

The component currently renders **one `<svg>` per link** and overlaps them with negative flex margins. That can produce overlap, but it can **never** produce interlocking, because each SVG is its own coordinate space and cannot cut into its neighbour. What you get is rounded rectangles butted together — which is exactly what's on screen.

Real chain links interlock because each link is drawn with a **background-coloured halo behind it**, which erases the part of the neighbouring link that should pass *behind* it. Then alternating links are drawn in two passes so they alternate over and under.

**Render the entire chain as a single `<svg>`.** This is the change that makes everything else work.

## §2. The exact geometry

Use one SVG with `viewBox="0 0 1080 240"`, `width="100%"`, `preserveAspectRatio="xMidYMid meet"`. These are the reference numbers — keep them exactly:

```
CY   = 92            // link centreline
S    = 132           // horizontal spacing per day
X0   = 144           // (1080 - 6*132) / 2  → day centres at X0 + i*S
RX   = 76,  RY = 45  // full link half-width / half-height  (aspect 1.69)
SW   = 13            // full link stroke
BX   = 47,  BY = 28  // broken link — 0.62 of full
BSW  = 12            // broken link stroke
HALO = 7             // how far the halo extends past the link
HSW  = SW + 12       // halo stroke width
```

A link is a rounded rect: `x = cx - rx`, `y = CY - ry`, `width = 2*rx`, `height = 2*ry`, `rx = ry`, `fill="none"`.

### Draw order — this is the whole trick

1. **Broken and future links first.** No halo — they are detached and must not cut into anything.
2. **Then full links in two passes**, by parity of their day index:

```
for parity in [0, 1]:
    for each full link at index i where i % 2 === parity:
        draw halo:  rx = RX + HALO, ry = RY + HALO,
                    stroke = <the card background colour>, strokeWidth = HSW
        draw link:  rx = RX, ry = RY, stroke = <chain colour>, strokeWidth = SW
```

Even-index links are drawn first, odd-index links second — so odd links' halos cut into even links, and the chain reads as alternating over/under. Without the two passes it looks like a flat overlapping ribbon.

**The halo stroke must be the literal solid background colour of the card** (§3), not `transparent` and not a glass token. If it doesn't match exactly, you'll see grey seams at every joint.

### Edge bleed

When `enters_left`, draw two extra full links at `X0 - S` and `X0 - 2*S`. When `exits_right`, at `X0 + 6*S + S` and `+ 2*S`. The SVG viewBox clips them automatically — **do not** add `overflow-hidden` wrappers or negative margins anywhere.

### Labels

Put the day letters and percentages **inside the same SVG** as `<text>`, so they stay locked to link centres at every width:

- Day letter: `x = X0 + i*S`, `y = 172`, `text-anchor="middle"`, font-size 23
- Percentage (broken days only): same `x`, `y = 206`, font-size 19

Do not position them with HTML — that's how they drift out of alignment on resize.

### Delete the old machinery

Remove `FULL_W`, `FULL_H`, `BROKEN_W`, `BROKEN_H`, `INTERLOCK`, the per-link `<Link>` component, the flex row, all the margin arithmetic, and the `overflow-hidden` wrapper. Every one of those is superseded.

**No `filter` / `drop-shadow` anywhere.** Flat strokes only.

## §3. The whole card is solid, not just the chain strip

Prompt 23 said to give only the chain strip a solid background. That was wrong — the result is a black slab floating inside a glass card with the purple ribbon still running behind the streak and the hours.

**The entire Day Chain card gets one solid background:** the header row, the chain, the streak block, and the three hour figures — all on the same solid surface.

- Replace `bg-[var(--glass-bg)]` + `backdrop-blur-xl` on the outer card with a solid `var(--color-bg-primary)`.
- **Remove the separate inner background** added for the chain strip in Prompt 23. There is now exactly one background for the card.
- Keep the card's existing `rounded-3xl`, border and padding.
- The page's purple ribbon must not be visible anywhere inside the card, at any scroll position, in either theme.

## §4. Colours (unchanged from Prompt 23 §5b)

- Dark: links `var(--color-primary)`, card `#050508` via `--color-bg-primary`
- Light: links `var(--color-primary-soft)`, card `#faf8f6` via `--color-bg-primary`
- Driven by the `--chain-color` custom property, not a JS theme check.
- Tier opacities unchanged: 0.85 / 0.55 / 0.30, and `--text-muted` @ 0.5 under 70%.
- Future days: dashed outline, `--text-muted`, opacity 0.3, **no halo**.

---

## §5. Do not touch

Any file other than `day-chain.tsx`. No changes to the data, the tiers, the streak, the hour figures, the Share button, or anything in `chain-service.ts` / `completion.ts`.

---

## Verification (required)

1. `npm run build` passes.
2. **Interlocking is real.** Three consecutive 100% days show links that visibly pass **over and under** each other — alternating, like actual chain links. Not butted rectangles, not a flat overlapping ribbon.
3. **No seams.** Zoom into a joint: the halo colour matches the card background exactly, with no grey or dark fringe.
4. **One background.** The chain, the streak number, `LONGEST N DAYS` and all three hour figures sit on the same solid colour. No purple ribbon visible anywhere inside the card. Confirm in both themes.
5. **Nothing clipped.** Every link, day letter and percentage is fully visible at desktop and mobile width.
6. **Edge bleed intact** — with `enters_left` / `exits_right`, the chain runs off both edges and is clipped by the viewBox.
7. **Labels stay aligned.** Resize the window from mobile to desktop and confirm day letters remain centred under their links throughout.
8. **Broken links still detached**, same size at every tier, only opacity differing, and never haloed into a neighbour.
9. Post before/after screenshots at desktop and mobile, in both themes.

---

## Note for the human

The interlock was never going to work with the old approach. Overlapping two separate SVGs with negative margins just stacks them — the later one paints on top of the earlier one, and you get butted rectangles. Interlocking requires the links to share one coordinate space so a background-coloured halo can erase the part of a neighbour that passes behind. That's the technique in the reference renders you approved, and it needs a single SVG.

The single-SVG version is also less code than what it replaces, and it fixes the label-alignment and clipping problems for free, since everything lives in one scalable coordinate space instead of a flex row of fixed-pixel boxes.
