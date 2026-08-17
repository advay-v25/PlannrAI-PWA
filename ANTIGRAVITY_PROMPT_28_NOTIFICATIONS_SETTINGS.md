# FIX PROMPT: Notifications setting — rename, and let users actually turn them off

Small, self-contained fix. Ship before the push build (prompt 29).

## Problems (verified)

1. `src/app/app/settings/page.tsx` labels the control **"Block Notifications"** — reads as *blocking* notifications, not "notifications for schedule blocks".
2. There is no way to turn notifications off. `handleNotifToggle` (~line 551) only requests browser permission; once granted it shows a toast saying "Notifications are already enabled. Manage them in your browser settings." The button becomes a dead status pill.
3. `notifications_enabled` already exists in `profile_preferences` and is accepted by `/api/settings/update` (~line 52) — but nothing reads it. It's the natural backing field for a real toggle.

## Fix

1. **Rename** the row title to **"Notifications"**. Keep the description, but reword to "Get notified before schedule blocks start" (it will also cover Mindspace due dates after prompt 29).
2. **Make it a real toggle** backed by `notifications_enabled`, using the same switch component the rest of Settings uses (e.g. the one on "Weekend Work" / "Ask Before Changing") rather than the current status pill:
   - Permission `default` → toggle appears off; switching it on calls `Notification.requestPermission()` (must stay inside the user-gesture handler — iOS requires this). If granted, set `notifications_enabled: true` via the existing settings-update path and show the existing success toast. If dismissed/denied, leave the toggle off.
   - Permission `granted` → toggle simply reflects and writes `notifications_enabled`. Turning it **off must be instant and app-level**: no browser prompt, no "go to browser settings" toast. This is the core fix.
   - Permission `denied` → show the toggle disabled with helper text "Blocked in your browser settings" (browsers do not allow re-prompting after denial — state it plainly instead of failing silently).
3. **Respect the flag where notifications are produced:** `src/components/home/notification-scheduler.tsx` must not fire when `notifications_enabled` is false. Read the preference from the existing user/settings store — do not add a new fetch.
4. Keep the section placement, icon, and surrounding rows as they are. Both themes must be correct.

## Scope guard

Allowed files: `src/app/app/settings/page.tsx`, `src/components/home/notification-scheduler.tsx`, and the settings component holding this row if it lives outside `page.tsx`. No API/schema changes (`notifications_enabled` is already accepted). No changes to `sw.js`, the manifest, or `use-notifications.ts`. `npm run build` passes.

## Verification

1. Fresh profile (permission `default`): toggle on → OS prompt → accept → toggle stays on, preference persists across reload.
2. Permission granted: toggle off → no prompt, saves instantly, and no block notification fires afterwards (verify with a block due in ~2 minutes). Toggle back on → notifications resume.
3. Permission denied at OS level: toggle renders disabled with the explanatory text, no crash, no misleading toast.
4. Row reads "Notifications" everywhere; no remaining "Block Notifications" string in the codebase.
5. Light and dark mode both correct; desktop and 393×852 both correct.
