# Antigravity Prompt 5B — Fix "Fix Today's Schedule" Time Reading

## Problem

`fix_today_schedule` in `/src/app/api/coach/quick-action/route.ts` reads `new Date()` on the server and tries to convert it to the user's timezone using `profile.timezone`. When `profile.timezone` is null/undefined (common), it falls back to `'UTC'`. A user in IST (UTC+5:30) sees the server time as 09:10 UTC when their local time is 14:40 — so Donna finds "no overdue blocks" or finds blocks from 5.5 hours ago instead of the actual current moment.

The fix: the browser always knows the user's exact local time. Pass `clientDate`, `clientTime`, and `clientTimezone` from the client in the request body, and use them server-side instead of computing from `new Date()`.

**Do not change anything else.** `reduce_today_load` is working correctly — do not touch its logic. Only change the two files below.

---

## File 1 (EDIT): `src/components/coach/CoachChat.tsx`

Find the `handleQuickAction` function. Find the line where `apiClient.post('/api/coach/quick-action', ...)` is called. It currently sends just `{ action }`.

Change it to also send the current local time and timezone from the browser:

**Find:**
```typescript
        const raw = await apiClient.post('/api/coach/quick-action', { action }) as any;
```

**Replace with:**
```typescript
        // Capture current time in the browser — this is always in the user's local timezone
        const _now = new Date();
        const _clientDate = _now.toLocaleDateString('en-CA'); // "YYYY-MM-DD" in local time
        const _clientTime = _now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }); // "HH:MM" in local 24h
        const _clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        const raw = await apiClient.post('/api/coach/quick-action', {
            action,
            clientDate: _clientDate,
            clientTime: _clientTime,
            clientTimezone: _clientTimezone,
        }) as any;
```

---

## File 2 (EDIT): `src/app/api/coach/quick-action/route.ts`

Two changes in this file.

### Change A — Accept clientDate, clientTime, clientTimezone from body

**Find** the destructuring line near the top of the POST handler:
```typescript
        const { action } = body as { action: string };
```

**Replace with:**
```typescript
        const { action, clientDate, clientTime, clientTimezone } = body as {
            action: string;
            clientDate?: string;   // "YYYY-MM-DD" in user's local timezone — sent by browser
            clientTime?: string;   // "HH:MM" 24h in user's local timezone — sent by browser
            clientTimezone?: string; // IANA timezone string e.g. "Asia/Kolkata"
        };
```

### Change B — Use client-provided values for today's date and current time

**Find** the block that computes `today` and `currentTime` (after the profile fetch):
```typescript
        const now = new Date();
        const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
        const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
        const today = dateFormatter.format(now);
        const currentTime = timeFormatter.format(now);
```

**Replace with:**
```typescript
        const now = new Date();

        // Prefer client-supplied values — the browser knows the user's local time exactly.
        // Fall back to server-side calculation only if the client didn't send them (e.g. old client).
        const resolvedTimezone = clientTimezone || profile?.timezone || 'UTC';
        const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: resolvedTimezone, year: 'numeric', month: '2-digit', day: '2-digit' });
        const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: resolvedTimezone, hour: '2-digit', minute: '2-digit', hour12: false });
        const today = clientDate || dateFormatter.format(now);
        const currentTime = clientTime || timeFormatter.format(now);
```

Also update the line below that currently sets `timezone` (used for `remainingDates` etc.) to use `resolvedTimezone`:

**Find:**
```typescript
        const timezone = clientTimezone || profile?.timezone || 'UTC';
```

If this line already exists in the file (from a prior edit), remove it — it's now folded into the block above. If the variable `timezone` is referenced elsewhere in the route, replace those references with `resolvedTimezone`.

---

## Summary

| File | Change |
|------|--------|
| `src/components/coach/CoachChat.tsx` | In `handleQuickAction`: capture `clientDate`, `clientTime`, `clientTimezone` from `new Date()` in the browser before the API call; send them in the POST body |
| `src/app/api/coach/quick-action/route.ts` | Accept `clientDate`, `clientTime`, `clientTimezone` from body; use them as the source of truth for today's date and current time; fall back to server-side Intl calculation only if not provided |

After this fix, "Fix today's schedule" will always compare against the user's actual current local time, regardless of what timezone the server or profile record has set.
