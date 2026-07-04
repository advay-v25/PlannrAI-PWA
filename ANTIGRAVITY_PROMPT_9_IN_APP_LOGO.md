# CORRECTION PROMPT: In-app top-left must show the real PlannrAI star logo — purge the "P" glyph for good

The app sidebar (top-left) still shows the old teal "P" glyph. That mark is dead. The correct brand asset (glowing 4-point star + plus + dot on purple) is **already in the repo** — a previous run overwrote it with the P again, so this prompt includes integrity checks.

## Asset integrity — verify, never modify

These files are already correct. Verify their MD5 hashes FIRST, and verify them again LAST before finishing. If any hash differs at the end, you broke it — restore is not your job; stop and report.

```
2b4d6fa042d2f703ddc2034c6f4e89be  public/logo.png            (1024×1024 star mark)
f9194e44d3d63ef8c7a0bf7cdcc11b31  public/icons/icon-512.png  (512×512 star mark)
0d207e483f580d0ef1f396a962e9a944  public/icons/icon-192.png  (192×192 star mark)
```
`src/app/favicon.ico` is also already the star mark.

Forbidden, no exceptions: regenerating these files, copying ANY file over them, `git checkout`/`git restore` on these paths, "optimizing" them, or creating any new logo image. There is no valid source for a logo anywhere in the repo except these files. If you ever see the teal "P" render anywhere, the bug is a stale reference or cache — never fix it by generating an image.

## Code changes (the only edits allowed)

1. `src/app/app/layout.tsx` — the sidebar brand rows (~lines 79, 91) and mobile/user rows (~line 179) already use `<Image src="/logo.png" …/>`. Confirm all three; if any renders another asset (`icons/icon-*.png`, inline SVG, or anything else), point it to `/logo.png` with the existing size/rounding classes.
2. Sweep the entire app surface for any other visible render of the P: `grep -rn "icon-192\|icon-512\|icon.svg" src/` — metadata/manifest/push-notification references are fine (those files now contain the star anyway); any `<img>`/`<Image>` used as a visible logo must become `/logo.png`. Check especially: login page, onboarding, the boot/loading screen, `home-header.tsx`.
3. `public/sw.js`: bump `CACHE_NAME` one version so every cached copy of the old P (logo.png AND icon pngs are cached by the SW) is purged on next visit. No other sw.js changes.
4. Standard do-not-touch list applies: no edits to `src/stores/**`, `src/lib/**`, `src/app/api/**`, `middleware.ts`, logic, handlers, props.

## Verification (required)

1. Re-run the MD5 check — all three hashes identical to the table above.
2. `npm run build` passes.
3. Run the app and screenshot: desktop sidebar expanded AND collapsed, mobile header at 393×852, browser tab favicon — every one shows the star mark, zero P glyphs anywhere in the product.
4. Report any file you changed; expected diff surface: possibly `src/app/app/layout.tsx` and other logo-reference files, plus the one-line `CACHE_NAME` bump.

Note for the human: the live site keeps showing the P until this build is deployed. After deploy, one normal visit refreshes it (network-first navigations + cache bump); an installed home-screen PWA icon may need re-adding.
