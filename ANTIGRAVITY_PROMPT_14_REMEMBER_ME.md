# PROMPT 14: "Remember me" — an installed/returning user must never see the landing page again

Right now a user who has already signed up still lands on the marketing page (`src/app/page.tsx`, the "Get Started Free" hero) in three situations. All three are separate bugs with separate fixes. Fix all three.

| # | Situation | Root cause |
|---|-----------|------------|
| A | Opens the PWA from the iOS/Android home screen icon | `public/manifest.json` has `"start_url": "/"` |
| B | Opens plannr.ai in any browser while logged in | `src/middleware.ts` has no rule for `pathname === '/'` |
| C | Returns after their Supabase session expired / was cleared | Nothing records that this device has ever had an account |

**This prompt deliberately overrides the standard do-not-touch list** — `src/middleware.ts` and `public/sw.js` are both in scope. `src/app/api/**`, `src/stores/**` and `src/lib/**` remain off-limits except where named below.

**Do NOT add a "Remember me" checkbox to the login form.** Supabase sessions already persist by default (`createBrowserClient`, `src/lib/supabase/client.ts`). This is a routing problem, not an auth problem. Do not touch `signInWithPassword`, `signUp`, `signInWithOAuth`, or anything in `src/app/login/page.tsx`.

---

## 1. `public/manifest.json` — fix the launch target

Current file has only `start_url` and no identity fields. Change to:

```json
"id": "/",
"start_url": "/app",
"scope": "/",
"display": "standalone",
"display_override": ["standalone", "minimal-ui"],
"launch_handler": { "client_mode": "navigate-existing" }
```

Keep `name`, `short_name`, `description`, `background_color`, `theme_color`, `orientation`, `icons`, `categories`, `prefer_related_applications` exactly as they are.

**`"id": "/"` is mandatory and must be exactly `/`.** The manifest `id` defaults to `start_url`; every existing install therefore has the computed identity `/`. Pinning `id` to `/` lets `start_url` change without Android treating this as a different app and creating a duplicate install. Do not set `id` to `/app`.

`navigate-existing` means reopening the icon focuses the already-running window instead of cold-restarting at `start_url` — that alone fixes a large share of the reported "it went back to the landing page" behaviour.

---

## 2. `src/middleware.ts` — the redirect rules and the returning-device cookie

Define one constant near the top of the file:

```ts
const REMEMBER_COOKIE = 'plannr_returning';
```

### 2a. Stamp the cookie

Inside the existing `if (user) { … }` branch: if `request.cookies.get(REMEMBER_COOKIE)` is absent, set it on the response —

```
value: '1', httpOnly: true, path: '/', sameSite: 'lax',
maxAge: 60 * 60 * 24 * 365,
secure: process.env.NODE_ENV === 'production'
```

`httpOnly: true` is correct here — only middleware ever reads it, no client JS needs it. (This is the opposite of the existing `csrf_token`, which is intentionally `httpOnly: false` for double-submit. Do not change the CSRF cookie.)

Setting it in middleware is deliberate: password sign-in happens entirely client-side with no server round trip, so there is no single auth handler that could set this. Middleware sees every authenticated request regardless of how the session was created — password, Google, magic link, or any provider added later.

### 2b. Redirect authenticated users off `/`

Inside `if (user) { … }`, after the existing `profiles.onboarding_complete` fetch (reuse the `isOnboarded` value already computed — do **not** add a second query):

- if `pathname === '/'` → redirect to `/app` when `isOnboarded`, else `/onboarding`.

### 2c. Redirect returning-but-logged-out users off `/`

For the `!user` case:

- if `pathname === '/'` and the `REMEMBER_COOKIE` is present → redirect to `/login`.

### 2d. Escape hatch

Skip both `/` redirects when the query string contains `new` (i.e. `/?new=1` always renders the marketing page). This is needed for demos and for checking the landing page while signed in.

### 2e. Match `/` exactly

Use `pathname === '/'`, never `startsWith('/')`. `/legal/privacy`, `/legal/terms`, `/login`, `/forgot-password`, `/reset-password` and `/verify-email` must keep rendering for anonymous visitors, and unauthenticated visitors with no cookie must still get the full landing page so SEO crawlers and shared links are unaffected.

### 2f. CRITICAL — carry cookies onto redirect responses

`NextResponse.redirect()` creates a **new** response. Any cookie previously set on `supabaseResponse` (the refreshed Supabase auth cookies, `csrf_token`, and now `REMEMBER_COOKIE`) is **lost** unless it is copied across.

Every `return NextResponse.redirect(...)` in this file — the new ones *and* the four that already exist — must copy the cookies over first, e.g.:

```ts
const redirect = NextResponse.redirect(redirectUrl);
supabaseResponse.cookies.getAll().forEach(c => redirect.cookies.set(c));
return redirect;
```

Without this the `REMEMBER_COOKIE` is never persisted on the exact requests that matter, and — separately — the existing redirects can drop a refreshed Supabase session and silently log the user out. Factor this into a small local helper rather than repeating it six times.

### 2g. No redirect loops

Verify by hand before finishing: authed+onboarded `/` → `/app` (no further redirect); authed+not-onboarded `/` → `/onboarding` (no further redirect); unauth+cookie `/` → `/login` (`/login` only redirects when a user exists, so it terminates); unauth+no cookie `/` → renders.

---

## 3. `src/app/api/auth/logout/route.ts` — one-line guarantee

The logout handler clears an explicit list of Supabase cookie names. **`plannr_returning` must NOT be added to that list.** Surviving logout is the entire point — a signed-out returning user should land on `/login`, not on the marketing page. Add a short comment saying so, so a future pass doesn't "helpfully" clear it. No other change to this file.

---

## 4. `public/sw.js` — two fixes that this change makes mandatory

1. **Bump `CACHE_NAME`** from `plannrai-offline-cache-v4` to `…-v5`. Installed users currently have the landing-page HTML for `/` sitting in the v4 cache and would keep getting it offline.

2. **Do not cache redirected navigations.** The navigate branch does `cache.put(event.request, responseToCache)`. `cache.put()` **rejects** when the response has `redirected === true`. The moment `/` starts redirecting, this throws a TypeError on every launch and breaks the offline fallback for that route. Guard it:

```js
if (networkResponse.ok && !networkResponse.redirected) {
    const responseToCache = networkResponse.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache)).catch(() => {});
}
```

Add a `.catch(() => {})` to the cache-first `cache.put` in the assets branch too. No other `sw.js` changes — leave the push/notificationclick handlers alone.

---

## 5. Register the service worker globally

`/sw.js` is currently registered in only two places: `src/app/app/settings/page.tsx` (~line 563) and `src/hooks/use-notifications.ts`. A user who never opens Settings and never enables notifications **has no service worker at all** — no offline support, no push, no cache.

Create `src/components/pwa/service-worker-register.tsx`:

- `'use client'`, renders `null`
- on mount: if `'serviceWorker' in navigator`, `navigator.serviceWorker.register('/sw.js')`, `.catch` swallowed to a `console.warn`
- guard against running during SSR

Mount it in `src/app/layout.tsx` inside `<body>` alongside the existing `<GlobalInputSanitizer />`. Leave the two existing registration calls in place — `register()` is idempotent and returns the existing registration.

---

## Verification (required)

1. `npm run build` passes (it runs `tsc --noEmit` first).
2. Manual matrix — for each row confirm the landing page appears **only** in the last two:

   | State | `/` should go to |
   |---|---|
   | Logged in, onboarded | `/app` |
   | Logged in, not onboarded | `/onboarding` |
   | Logged out, has visited before (cookie set) | `/login` |
   | Never visited (no cookie, no session) | landing page renders |
   | Any state, `/?new=1` | landing page renders |

3. Confirm in DevTools → Application → Cookies that `plannr_returning` is present after login, and **still present** after hitting Log out.
4. Log in, then navigate around the app and confirm you are not signed out — this proves 2f (cookie carry-over on redirects) works.
5. DevTools → Application → Service Workers: registered on a cold visit to `/` without ever opening Settings. Console clean — specifically **no `Cannot cache a response with redirected flag` / TypeError** on launch.
6. `/legal/privacy` and `/legal/terms` still load while signed out.
7. Report every file changed. Expected surface: `public/manifest.json`, `src/middleware.ts`, `public/sw.js`, `src/app/layout.tsx`, `src/app/api/auth/logout/route.ts` (comment only), and one new file `src/components/pwa/service-worker-register.tsx`.

---

## Note for the human

iOS snapshots the web app manifest **at install time**. The `start_url` change therefore only affects *new* installs — every home screen icon already on a phone will keep requesting `/`. The middleware redirect in §2 is what actually fixes existing users; §1 just saves new ones a redirect hop. Nobody needs to delete and re-add their icon.
