# DukaOS — Build Status
Updated: 2026-09-28 EAT | Phase: P7 (handover) | Overall: ~85%

## ✅ Done (feature → evidence)
- Shared engine F1–F13 logic → `packages/shared/test/*` **92/92 passing** (run in build sandbox with a Node 22 vitest shim; CI runs real Vitest).
- M-Pesa parser (16 real-format fixtures), Swahili numbers ("mia nne hamsini" = 450), all 6 §F10 utterances execute correctly incl. staff refusal.
- Demo seed: 119 products, 15 debtors, 30 days weekday-patterned sales (Saturday spike), 3 suppliers w/ price memory, expiries, dead stock, staff shortage pattern, unmatched M-Pesa → triggers every alert type (tested).
- Supabase: schema, RLS, stock_levels + balance_after triggers, immutable sales, idempotent sync oplog, Hono edge API (§6 routes, WhatsApp + Daraja webhooks, lazy jobs tick).
- Mobile app: onboarding + demo, PIN lock, Home, POS (3-tap cash sale, busy mode, loose qty, split/credit), Kitabu (statements, reminders via WhatsApp share), Stock (transfers, timeline), M-Pesa inbox, Cash drawer, Purchases/reorder, Reports (daily, weekly narrative, profit, expiry, dead, demand, loan pack), Duka Brain chat, Stock-take, Settings (sw/en, dark/light, export JSON/CSV, PINs).
- Playwright smoke + offline + staff-mode specs written (`e2e/`).

## 🔨 In Progress / ⚠️ Not yet verified
- **`npm install`, typecheck, Vite build and Playwright have NOT been executed**: the build sandbox had no npm registry access. First CI/local run may surface TS/lint fixes in `apps/web`.
- No hosted preview yet: deploy to Netlify (see README) to get a URL.

## 📋 Remaining (ordered)
1. `npm install && npm run check` → fix any compile errors in apps/web.
2. `npm run e2e` → adjust selectors if needed.
3. Netlify deploy + Supabase project link; Lighthouse PWA + bundle-size (<350KB gzip) check.
4. PNG app icons for older Android (SVG icons shipped).
5. Delete `apps/web/src/lib/data.fix.ts` (empty placeholder).

## ⚠️ Known Issues / Tech Debt
- POS cart shows retail price; tier (loyal/wholesale) price is applied at charge by the engine.
- Server loads a whole shop per request (fine for one duka; paginate for large shops).
- `runJobs` in the edge function re-queues drained tick changes via the engine's internal change list.

## 🔑 Env Vars & Mocks
All external services mocked by default (see README table). App is 100% usable with zero credentials (device-only mode).

## 🗺️ For the Next Agent
Business truth = `packages/shared/src/engine.ts`. Web: `apps/web/src/lib/data.ts` (Dexie + engine + oplog), `lib/sync.ts` (push/pull), screens in `src/features/*`. API: `apps/api/supabase/functions/api/index.ts`. Decisions: DECISIONS.md. Spec: MASTERPROMPT.md.

## 5-minute demo script
1. Open app → "Jaribu na duka la mfano" → Juma → PIN 1234. 2. Home: takings receipt, cash position, Saturday peak, alerts (tap "Toa stoo" on a shelf-low item). 3. Uza: tap 2 tiles → Cash ✓. Long-press sugar → 2 kg. 4. Kitabu → Baba Kevin → Andika deni → Mkumbushe (WhatsApp). 5. Zaidi → M-Pesa: paste an SMS from 0711223344 → auto-matched to Mama Njeri. 6. Duka Brain: "Nani ananidai zaidi ya elfu moja?" 7. Ripoti → Tathmini ya wiki, Faili ya mkopo → Print. 8. Lock → Brian PIN 0000: reports/settings are gone.

## Go-live checklist
Supabase project + migrations · function secrets · Netlify env `VITE_API_URL` · WhatsApp template approved · SMS forwarder or Daraja C2B URL registered · change demo PINs.

## Update 2026-10-05 (bot)
- `npm install`, typecheck, lint, 92 unit tests, build, Playwright e2e (3/3) all green.
- Full-stack preview runs in the VM: local Supabase (Docker) + Edge Function API, web served by `scripts/preview-server.mjs` (PWA + `/fn` proxy, `/readyz`).
- Fixes: sheet/overlay exit no longer blocks taps; sync pushes oldest-first + parents before children; server keeps client location ids (`/auth/setup` accepts `locations`, `locations` syncable); failed push un-records ops so retries aren't deduped away.
- Removed `apps/web/src/lib/data.fix.ts`.
- Still to do: real hosting (Netlify + Supabase cloud), PNG icons, real LLM/WhatsApp/Daraja keys.
