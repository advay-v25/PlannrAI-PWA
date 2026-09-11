# PROMPT 15: iOS home screen widget — today's schedule, live, tappable into the app

Build a native iOS home screen widget that renders today's PlannrAI schedule the way the Calendar page's **day** view does, keeps itself current as the day advances, and opens the app to that day when tapped.

This is greenfield native work, not an edit pass. It adds a Capacitor shell + a WidgetKit extension to the existing repo. The Next.js app is **not** being rewritten or restructured.

---

## Why it's built this way (do not "simplify" these decisions)

1. **A home screen widget requires native code.** No web API provides one on iOS; the manifest `widgets` field is Windows-only. Hence the shell.
2. **The widget must open the app, not Safari.** iOS home screen web apps do not capture universal links, *and* an installed web app has a completely separate cookie/localStorage/service-worker jar from Safari. A widget tap that opened Safari would land the user on a logged-out PlannrAI. So the widget and the app must live in the same bundle, and the deep link uses a **custom URL scheme**, not a universal link — no `apple-app-site-association` needed.
3. **The widget must not poll.** WidgetKit `TimelineProvider` accepts a list of future render times. We hand iOS one entry per block boundary for the rest of the day, so it flips from one block to the next at exactly the right minute with zero network, zero background execution, zero battery cost.
4. **The widget reads local shared storage, never the API.** Today's blocks change rarely; *which block is current* is pure clock math the widget does itself. This avoids storing an auth token in the App Group and avoids iOS's widget-refresh budget entirely.

---

## §0. Human prerequisites (Aarav does these — agent must not attempt them)

- Apple Developer Program membership (**$99/year**) — required for App Groups, device installs and any submission.
- Xcode installed, latest stable.
- In the Apple Developer portal, register: App ID `ai.plannr.app`, App ID `ai.plannr.app.TodayWidget`, App Group `group.ai.plannr.shared`.

If any of these are missing, the agent should still complete every code step and stop at the point signing is required, reporting exactly what's blocked. **Do not invent placeholder team IDs or commit signing certificates.**

---

## §1. Capacitor shell

At the repo root:

- Add `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/app`, and `capacitor-widget-bridge` (Capacitor 8.x line — this plugin handles App Group `UserDefaults` writes and `reloadAllTimelines()`; do not hand-roll a bridge).
- `capacitor.config.ts`:
  - `appId: 'ai.plannr.app'`, `appName: 'PlannrAI'`
  - `server: { url: 'https://plannr.ai', cleartext: false }` plus `allowNavigation` for `plannr.ai` and `*.supabase.co`
  - `ios: { contentInset: 'always', backgroundColor: '#050508' }`
- `webDir` points at a **minimal bundled fallback** — a single static `capacitor-fallback/index.html` with the PlannrAI mark and "Can't reach PlannrAI — check your connection", shown when the remote URL fails to load. This is deliberate: it means the binary is never an empty shell.
- `npx cap add ios`. Commit `ios/App/App/capacitor.config.json` and the project files; gitignore `ios/App/Pods`, `ios/App/build`, `DerivedData`.

**Why remote-URL and not a bundled build:** this app is server-rendered with ~110 API routes and an auth middleware. A static export is not a harder option, it is not a possible one without a rewrite. Remote content also means every web deploy updates the native app with no resubmission and no version skew against the API.

---

## §2. The data contract

The web app writes exactly this JSON to App Group key `today_schedule` in suite `group.ai.plannr.shared`. Nothing else. Keep it small — App Group storage is not a database.

```json
{
  "date": "2026-08-18",
  "timezone": "Asia/Calcutta",
  "generatedAt": "2026-08-18T09:12:00Z",
  "blocks": [
    {
      "id": "uuid",
      "title": "Deep Work",
      "start": "09:00",
      "end": "11:30",
      "pillar": "mind",
      "status": "planned"
    }
  ]
}
```

- `start`/`end` are local wall-clock `HH:mm` in the user's `timezone`. Do **not** write UTC instants — the widget renders against the device clock and wall-clock avoids every DST and offset bug.
- `pillar` is one of `mind | body | craft | anchor | meal | break | sleep | default`, resolved using the **existing** `getBlockStyle()` logic in `src/components/calendar/week-grid.tsx` (~line 155): meal/anchor/sleep/break/buffer by `block_type`, `is_locked` → anchor, otherwise `goal.category || goal.pillar || block.pillar`, else `default`.
- `status` is one of `planned | done | missed`.
- Exclude `sleep` blocks from the array entirely — they'd dominate the widget.

---

## §3. Web-side changes (small, surgical)

### 3a. Write shared storage

New file `src/lib/native/widget-sync.ts`:

- Exports `syncWidgetData(blocks, timezone, date)`.
- No-ops immediately unless running inside Capacitor (`Capacitor.isNativePlatform()`), so this is inert on web and adds nothing to the PWA bundle path.
- Maps blocks to the §2 shape, writes via `capacitor-widget-bridge`, then calls `reloadAllTimelines()`.

Call it from **three** places:
1. `src/app/app/page.tsx` — at the end of `fetchHomeData()`, using `effectiveData.schedule_blocks`.
2. `src/app/app/calendar/page.tsx` — after any successful mutation that refetches the day.
3. On Capacitor's `App` `pause` event (register once in the new native provider component) — this covers "user edited their day, then swiped the app away," which is the single most common way the widget would otherwise go stale.

### 3b. Handle the deep link

New client component `src/components/native/native-bridge.tsx`, mounted in `src/app/app/layout.tsx`:

- Registers `App.addListener('appUrlOpen', …)`.
- Parses `plannrai://calendar?date=YYYY-MM-DD&block=<uuid>` and routes to `/app/calendar?view=day&date=…&block=…`.
- Registers the `pause` listener from 3a.
- Renders `null`; entirely inert on web.

### 3c. Make the calendar page honour those params

`src/app/app/calendar/page.tsx` currently holds `viewMode` in local state defaulting to `'day'` (line 217) with no URL input. Add: on mount, read `view`, `date` and `block` from `useSearchParams()` — set `viewMode` from `view`, jump the visible day to `date`, and if `block` is present scroll it into view and open its inspector. Default behaviour with no params must be **byte-identical to today**.

---

## §4. The widget extension

New Xcode target `TodayWidget` (bundle `ai.plannr.app.TodayWidget`), App Group `group.ai.plannr.shared`, SwiftUI + WidgetKit.

### 4a. Timeline

`TimelineProvider.getTimeline` must:

1. Read `today_schedule` from the App Group, decode to the §2 shape.
2. If missing, stale (`date` ≠ today in that timezone), or undecodable → return a single placeholder entry reading "Open PlannrAI to sync your day". Never crash, never render an empty box.
3. Build one entry at **each block start and each block end** from now to end of day, plus one at midnight. Each entry carries: the current block (or nil), the next block, and minutes remaining in the current block.
4. Reload policy `.after(nextMidnight)`.

Everything the widget shows is derived from these entries — no timers, no network.

### 4b. Rendering

Match the current calendar block treatment, which is now **neutral card + a 3pt leading accent stripe in the pillar color** (see `PILLAR_COLORS` in `week-grid.tsx`) — not a saturated fill. Port that convention, not the old gradient one.

Exact colors, pre-converted from `src/app/globals.css` so nobody hand-converts HSL:

| Pillar | Token | Hex |
|---|---|---|
| mind | `--color-mind` | `#8013EC` |
| body | `--color-body` | `#1BBB50` |
| craft | `--color-craft` | `#EBAB0A` |
| anchor | `--color-anchor` | `#F94E10` |
| meal / routine | `--color-routine` | `#E9470C` |
| default / primary | `--color-primary` | `#FF5B22` |
| break | — | 40% opacity secondary text, no stripe |

Surfaces: dark `#050508` bg, `#FFFFFF` primary text, `#D4D4D8` secondary. Light `#faf8f6` bg, `#18181b` primary, `#3f3f46` secondary. Support both via `@Environment(\.colorScheme)`.

Families:

- **systemSmall** — current block title, `until 11:30`, a thin progress ring for minutes remaining. If between blocks: next block + countdown. If day complete: "Day complete."
- **systemMedium** — current block prominent, next two beneath, plus a slim full-day bar with the now-marker.
- **systemLarge** — the day column: every remaining block as a card with its accent stripe, current one highlighted, past ones at reduced opacity (mirror `STATUS_STYLES`: done `opacity 0.6`, missed `opacity 0.4` desaturated).
- **accessoryRectangular** (Lock Screen) — `Deep Work · 47m left`.

Empty state (no blocks today): "Nothing scheduled" + "Plan your day" — never a blank widget.

### 4c. Tap target

`.widgetURL(URL(string: "plannrai://calendar?date=\(date)&block=\(currentBlockId)"))`. On `systemLarge` use per-block `Link` so tapping a specific block deep-links to that block. Register `plannrai` under `CFBundleURLTypes` in the app target's `Info.plist`.

---

## §5. Do not touch

`src/app/api/**`, `src/lib/ai/**`, `src/lib/agents/**`, `src/lib/calendar/**`, `src/stores/**`, `src/middleware.ts`, `public/sw.js`, `public/manifest.json`. No changes to auth, no changes to existing calendar rendering or block logic. §3 is additive only — the web app's behaviour outside Capacitor must be unchanged.

Do not add push notifications, Live Activities, or Android in this pass. They're planned separately and will conflict if started here.

---

## Verification (required)

1. `npm run build` passes and the **web** app is unchanged — load `/app` and `/app/calendar` in a normal browser, confirm no console errors from the new native files and no behavioural difference.
2. `npx cap sync ios` succeeds; the Xcode project builds for a real device.
3. In the simulator/device: open the app, then add each widget size. All three render today's real blocks with correct pillar stripes in both light and dark mode.
4. **Time advance test** — set the device clock forward past a block boundary and confirm the widget switches to the next block without opening the app. This is the core requirement; if it fails, the timeline is wrong.
5. Tap each size → app opens on the Calendar day view, correct date, correct block focused. Tap a specific block on `systemLarge` → that block is focused.
6. Kill the app, delete the App Group data, and confirm the widget shows the "Open PlannrAI to sync" placeholder rather than crashing or rendering blank.
7. Airplane mode → app launch shows the bundled fallback page, not a white screen.
8. Report every file added or changed, plus anything blocked on §0 signing.

---

## Note for the human

The widget is populated by the app, so a freshly installed widget stays on the placeholder until PlannrAI is opened once. That's expected and self-resolving.

The remaining staleness case is a schedule that changes while the app is fully closed — an AI reschedule, or an edit made on desktop. Fixing that needs a silent push to wake the app and reload the timeline, which depends on the web push infrastructure that doesn't exist yet. Deliberately out of scope here; the widget is accurate the moment the app is next opened.

App Store Guideline 4.2 (minimum functionality) is the real submission risk for any remote-URL shell. The widget is the strongest argument against a rejection, so submit *with* it rather than shipping a bare wrapper first.
