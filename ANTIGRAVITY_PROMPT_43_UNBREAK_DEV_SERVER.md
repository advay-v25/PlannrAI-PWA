# PROMPT 43: Dev server — what I found, and the two things to fix

I inspected the repo directly. **The code is not broken.** Findings first, then the two real issues.

## What is already verified good

- **`npx tsc --noEmit` exits 0 with zero errors.** No half-applied refactor, no broken signature, no missing import.
- **`next dev` boots** — `✓ Ready in 452ms` on Next.js 16.2.6 / Turbopack.
- **`carry-forward.ts` is cleanly gone**, replaced by `week-copy.ts`. The only remaining mentions are comments. No dangling imports.
- **`week-writer.ts` exists** at `src/lib/services/week-writer.ts`.
- **`@next/swc-darwin-arm64` is installed** and correct for the machine.
- **`package-lock.json` is unmodified**, so dependency state is consistent.

So do not go looking for a compile error — there isn't one.

---

## §1. The `.next` cache had grown to 1.2 GB — already cleared

```
660M  .next/dev
487M  .next/cache
 12M  .next/server
```

A Turbopack cache that size causes slow starts, memory pressure and flaky HMR, and is the most likely explanation for "the local server isn't working". Sequential large refactors with interrupted builds bloat it exactly this way.

**I have already moved it** to `_to_delete/next-cache-<timestamp>/`. Nothing to do here except:

1. Restart the dev server — the first build will be slower than usual while the cache repopulates. That is expected.
2. Delete the `_to_delete/` folder when convenient. I could not remove it directly; the tooling I have can move files but not delete them.

If the server now starts and behaves, this was the cause and §2 is still worth fixing but is not urgent.

## §2. `jest` is used but never declared

`package.json` gained a script:

```json
"test:planner": "jest src/lib/calendar/ai/__tests__/plan-week.test.ts"
```

and the test infrastructure exists — `jest.config.js`, `plan-week.test.ts`, `fixture-context.json`, a `__snapshots__` directory. The `jest` binary resolves today only because something else pulls it in transitively.

**`jest` appears in neither `dependencies` nor `devDependencies`.** The next clean `npm install` will remove it and the golden-week test — the one safeguard we agreed to build in Prompt 41 §5 — will vanish with it.

Add `jest` and its companions (`ts-jest` or `@swc/jest`, `@types/jest`, whatever `jest.config.js` actually requires) to `devDependencies` at the versions currently resolved, and commit the updated lockfile. Then verify:

```
rm -rf node_modules && npm install && npm run test:planner
```

Report whether the test passes. If it does not, say so plainly — a golden-week test that does not run is worse than none, because it looks like coverage.

## §3. If the server still fails after the cache clear

Only then, in this order, posting the actual error each time:

1. `npm run dev` — full output, first error not last line.
2. `lsof -nP -iTCP:3000 -sTCP:LISTEN` — a zombie process holding the port. Kill it, or try `npm run dev -- -p 3001` to confirm.
3. `.env.local` — it was edited during the rate-limit work. Confirm it parses and that the Supabase, Upstash and AI provider keys are present and correctly quoted. One malformed line fails the whole file.
4. `rm -rf node_modules package-lock.json && npm install` — last resort, and only if the lockfile is implicated.

## §4. Commit once it runs

Twenty files are uncommitted across roughly ten prompts. That is why one bad file blocks all testing and why there is no clean fallback point.

```
git add -A && git commit -m "wip: weekly review, planner and rate-limit fixes (prompts 33-42)"
```

---

## Verification (required)

1. `npm run dev` starts. Post the output and the startup time.
2. The app loads — Home, Calendar, Goals, Review all render.
3. `/api/goals` returns goals, not the empty state.
4. `npm run build` passes.
5. `jest` is declared in `devDependencies`, the lockfile is updated, and `npm run test:planner` runs. Report pass or fail.
6. **State whether the cache was the cause.** If the server still fails, give the real error from §3.
7. `_to_delete/` removed.
8. Work committed.

---

## Note for the human

The code is fine — `tsc --noEmit` is completely clean and `next dev` reports `Ready in 452ms`, so there is no broken import or half-applied change from the recent prompts. That was my first suspicion and it was wrong.

What I did find is a **1.2 GB `.next` directory**, 660 MB of it Turbopack's dev cache. That is far past the size where it starts causing slow boots, memory pressure and unreliable hot reload — and repeated large refactors with interrupted builds is exactly how it gets there. I have moved it aside already, so a restart should give you a clean rebuild. The first compile will be slower than usual; that is the cache repopulating, not a problem.

One thing worth fixing while you are there. The golden-week test from Prompt 41 has actually been built — the fixture, the config and the snapshots are all in place — but `jest` itself is not declared in `package.json`. It resolves right now only as a transitive dependency, so the next clean install will silently delete the one guard we put in place against another silent regression.

Note also that I ran these checks inside the Linux workspace that has your folder mounted, not on macOS directly. File-level findings are real; anything about running processes or ports on your Mac I could not see.
