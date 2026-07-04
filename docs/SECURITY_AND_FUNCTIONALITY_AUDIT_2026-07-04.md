# PlannrAI — Security & Functionality Audit

Date: 2026-07-04
Scope: `PlannrAI-PWA` (Next.js App Router, Supabase, ~100 API routes)

The good news first: most of the app is built on a solid `secureApiRoute` wrapper that
enforces auth, rate limiting, CSRF (double-submit cookie), CORS origin checks, body-size
limits, and security headers by default. RLS is broadly enabled, most queries are correctly
scoped by `user_id`, and TypeScript compiles clean (`tsc --noEmit` passes). The issues below
are the places that fall *outside* that safe path.

---

## CRITICAL

### 1. `GET /api/debug` — unauthenticated cross-user data leak
`src/app/api/debug/route.ts`

This route is not wrapped in `secureApiRoute`, has **no auth check**, uses the
**service-role key** (which bypasses Row Level Security), and queries `coach_messages`
with **no `user_id` filter**:

```ts
const supabase = createServerClient(URL, SUPABASE_SERVICE_ROLE_KEY || ANON_KEY, ...);
const { data: messages } = await supabase
    .from('coach_messages')
    .select('id, role, content, ...')
    .order('created_at', { ascending: false })
    .limit(10);
```

Anyone on the internet hitting `/api/debug` gets the 10 most recent coach messages of
**any user**, in plaintext. Coach messages contain personal planning/emotional content.
Middleware explicitly skips `/api`, so nothing gates it.

**Fix:** delete this route (or gate it behind auth + `NODE_ENV==='development'` and always
scope to the caller's `user_id` with the anon/authenticated client).

---

## HIGH

### 2. `coach/apply` and `coach/undo` bypass the security wrapper
`src/app/api/coach/apply/route.ts`, `src/app/api/coach/undo/route.ts`

Both are hand-rolled `POST` handlers instead of `secureApiRoute`. They do their own
`auth.getUser()` check, but as a result they are **missing CSRF protection and the CORS
origin check** that every other mutation gets. `coach/undo` additionally has **no rate
limiting**. These endpoints mutate the schedule (apply/undo patches), so they're exactly the
kind of state-changing route CSRF is meant to protect.

**Fix:** move both onto `secureApiRoute(..., { requireAuth: true, requireCsrf: true, rateLimit: 'aiCoach' })`.

### 3. `patch-service` applies client-controlled fields verbatim (mass-assignment + stored-XSS path)
`src/lib/services/patch-service.ts` — `update_todo`, `update_event`, `update_goal` cases

`coach/apply` accepts a client-supplied `patch` object and passes its ops to
`PatchService`. The update handlers do:

```ts
const fields = op.fields || op.payload;
await supabase.from('todos').update(fields).eq('id', id).eq('user_id', userId);
```

`fields` is written with no allow-list and no sanitization. The dedicated `POST /api/todos`
route deliberately runs `description` through `sanitize-html`, but this patch path skips it.
Meanwhile `MindspaceBoard.tsx` renders `todo.description` with
`dangerouslySetInnerHTML` (lines ~416, ~603). So a crafted patch can store an unsanitized
`description` (e.g. `<img onerror=...>`) that is later rendered as live HTML — a stored XSS
sink. It's primarily self-XSS today (own data, own session), but it's a real bypass of the
sanitizer the rest of the app relies on, plus a mass-assignment risk (arbitrary columns).

**Fix:** allow-list updatable columns in each patch handler and run rich-text fields through
`sanitize-html` there too; sanitize again at the `dangerouslySetInnerHTML` sink
(DOMPurify) as defense-in-depth.

---

## MEDIUM

### 4. Rate-limiter identifier is client-spoofable
`src/lib/security/rate-limiter.ts` — `getClientIP()`

For unauthenticated endpoints (login/signup rate-limit pre-check, `behavior/signal`) the
limit key is derived from `x-forwarded-for` / `x-real-ip`, taking the first value. An
attacker can rotate that header to get a fresh bucket per request, defeating the auth
brute-force / email-flood limits. On Vercel you should trust only the platform-provided
client IP, not arbitrary forwarded headers.

### 5. Auth rate-limit check "fails open"
`src/app/api/auth/rate-limit/route.ts`

On any internal error the handler returns `{ allowed: true }`. Combined with #4, the login
throttle is soft — an attacker who can make the limiter error (or spoof IPs) bypasses it.
Consider failing closed for auth actions.

### 6. `behavior/signal` is intentionally unauthenticated
`src/app/api/behavior/signal/route.ts` (`requireAuth: false`)

It writes behavior events using `context.userId`, which is `''` for anonymous callers.
Either it silently drops data or writes orphan rows, and it's an unauthenticated write
endpoint. The trailing code comment ("Allow unauth for onboarding signals? User said...")
suggests this was never resolved. Confirm it needs to be public; if not, require auth.

### 7. Service-role client used where the user client would do
`home/energy-checkin`, `onboarding/complete`, `coach/apply` construct an admin
(service-role) Supabase client. These *do* filter by `userId`, so there's no leak today,
but every service-role usage removes the RLS safety net — a future missing `.eq('user_id', ...)`
becomes a cross-tenant bug instead of being blocked by RLS. Prefer the request-scoped
authenticated client unless admin privileges are genuinely required (only `delete-account`
truly needs it).

### 8. CSP is report-only and permissive
`next.config.js`

The Content-Security-Policy is `Content-Security-Policy-Report-Only` (never enforced) and
allows `'unsafe-inline'` + `'unsafe-eval'` for scripts. Given the `dangerouslySetInnerHTML`
sink in #3, an enforced CSP would be a meaningful mitigation. Move to an enforcing CSP and
tighten `script-src`.

---

## LOW / HOUSEKEEPING

- **`supabase/.temp/*` is committed to git** (`pooler-url`, `project-ref`, `linked-project.json`).
  No password is present (pooler URL is user@host only, project-ref is already public in the
  Supabase URL), so this is not a secret leak — but these are local CLI state files that
  shouldn't be tracked. Add `supabase/.temp/` to `.gitignore` and `git rm --cached` them.
- **Secrets in `.env.local` are correctly gitignored** and not committed — good. The two
  base64 JWT strings found in `src/lib/supabase/{client,server}.ts` are harmless placeholders
  used only when env vars are missing during build.
- **Many stray root files** (`test-*.ts/js`, `screenshot*.js`, `mask_earth*.py`, `dev.log`,
  `server.log`, `push_out.txt`, `.qoder/`, `.gemini/`, `.kiro/`, multiple `*.bak`). These are
  dev scratch; the test scripts hardcode use of the service-role key from `.env.local`. Clean
  them out of the deployed tree.
- **`getClientIP` fallback returns `127.0.0.1`**, which would collapse all users into one
  rate-limit bucket in any environment where the header is absent.

---

## Verified OK (spot-checked, no action needed)

- Default API path: auth + CSRF + rate limit + CORS + size limit + error sanitization all
  enforced by `secureApiRoute`.
- User-scoped queries: `export-data`, `analytics/overview`, `todos`, `habit-stacks/[id]`,
  `coach/history`, `coach/conversations`, `profile` all filter by `user_id`/`id`.
- Account deletion requires typed confirmation + CSRF + strict rate limit.
- Coach message rendering (`CoachMessageBubble.tsx`) uses a safe React-element markdown
  renderer, not `innerHTML`.
- `profile PUT` uses a field allow-list with per-field validation.
- `tsc --noEmit` passes cleanly.
