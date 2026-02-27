# PlannrAI Production Readiness Checklist

## ✅ Phase 1: AI Infrastructure
- [x] `OPENROUTER_API_KEY` set in environment
- [x] `GROQ_API_KEY` set in environment
- [x] `src/lib/ai/unified-client.ts` compiled
- [x] Groq primary + OpenRouter fallback working
- [x] Robust JSON parsing (5 fallback levels)
- [x] Timeout handling (10s fast, 20s smart)
- [x] Color-coded logging

**Test:** `GET /api/test-ai`

---

## ✅ Phase 2: Calendar Context
- [x] `src/lib/calendar/context-builder.ts` compiled
- [x] Parallel data fetch (profile, goals, commitments, blocks)
- [x] Capacity analysis (overcommitment detection)
- [x] Performance metrics (7-day completion rate)
- [x] Safe defaults when data missing

**Test:** `GET /api/test-context`

---

## ✅ Phase 3: Plan Week AI
- [x] `src/lib/calendar/ai/plan-week.ts` compiled
- [x] 3 variants (Balanced, Front-Loaded, Sustainable)
- [x] Respects sleep hours + wind-down
- [x] Includes meals and buffers
- [x] Deterministic fallback when AI fails

**Test:** `POST /api/calendar/plan-week`

---

## ✅ Phase 4: Optimize Day AI
- [x] `src/lib/calendar/ai/optimize-day.ts` compiled
- [x] Energy-aware options
- [x] Fixed block detection (never moves locked blocks)
- [x] Deterministic fallback

**Test:** `POST /api/calendar/optimize-day`

---

## ✅ Phase 5: API Routes
- [x] `/api/calendar/plan-week` — generates variants
- [x] `/api/calendar/optimize-day` — generates options
- [x] `/api/calendar/apply-schedule` — applies add/update/remove
- [x] `/api/patch/apply` — applies PatchService patches
- [x] All routes auth-protected via `secureApiRoute`
- [x] Error handling returns `apiError` with codes

---

## ✅ Phase 6: Frontend Integration
- [x] `PlanWeekModal` compatible with API format
- [x] `DayOptimizerModal` compatible with API format
- [x] `useCalendar` hook orchestrates the flow
- [x] Loading states with animated spinners
- [x] Error states close modal gracefully

---

## ✅ Phase 7: Other AI Features
- [x] Brain Dump — migrated to `callAI` (unified-client)
- [x] Expert Strategy — `/api/goals/generate-strategy`
- [x] Goal Suggestions — `/api/ai/suggest-goals` (Groq)
- [x] Coach — `/api/ai/execute` with existing channels
- [x] Weekly Review — existing routes intact

---

## ✅ Phase 8: Testing
- [x] `scripts/test-ai-system.ts` — 12 endpoint tests
- [x] `npm run test:ai` script added
- [x] `npm run build` passes (exit 0)

---

## 🔐 Security
- [x] API keys in environment variables only
- [x] All routes check authentication
- [x] RLS on all Supabase tables
- [x] Audit logging on sensitive actions

---

## 📊 Performance Targets
| Feature | Target | Fallback |
|---------|--------|----------|
| Plan Week | < 25s | Deterministic schedule |
| Optimize Day | < 15s | "Keep Current" option |
| Brain Dump | < 20s | Basic extraction |
| Expert Strategy | < 25s | Generic strategy |
| Apply Schedule | < 5s | N/A |

---

## 🚀 Deployment

```bash
# 1. Build
npm run build

# 2. Push
git push origin main

# 3. Vercel auto-deploys from main

# 4. Verify
curl https://your-app.vercel.app/api/test-ai
```

---

## ✅ Existing Features Preserved
- [x] Goals page loads
- [x] Calendar page loads
- [x] Coach page loads
- [x] Brain Dump page loads
- [x] Weekly Review page loads
- [x] Settings page loads
- [x] Onboarding works
- [x] Auth (login/logout) works
