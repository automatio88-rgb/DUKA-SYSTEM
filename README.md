# Duka System (DukaOS)
Offline-first mobile business partner for a Kenyan duka: POS, two-location stock, digital kitabu, M-Pesa matching, cash guard, reports and **Duka Brain** (Swahili/English/Sheng agent).

## Run locally
```bash
npm install
npm run dev:web          # phone app only, fully functional offline (device-only mode)
npm run dev              # + Supabase (needs Supabase CLI + Docker)
npm run check            # typecheck + lint + unit tests + build
npm run e2e              # Playwright smoke (Pixel 7 viewport) incl. offline test
npm run android          # Capacitor Android shell
```
Open http://localhost:5173 on your phone (same Wi-Fi) → **Jaribu na duka la mfano** → Owner PIN **1234**, Staff PIN **0000**.

## Layout
- `packages/shared` — ALL business logic (`DukaEngine`), M-Pesa parser, Swahili intent parser, reports, demo seed, i18n, 92 unit tests.
- `apps/web` — React 18 + Vite PWA (Dexie offline store, oplog sync, Framer Motion, GSAP counters, lazy Three.js storefront, Recharts).
- `apps/api/supabase` — Postgres migrations (schema, RLS, stock/ledger triggers) + `api` Edge Function (Hono) exposing `/api/v1`.

## Environment
Web: `VITE_API_URL` (Supabase functions URL, e.g. `https://<ref>.functions.supabase.co/api`), optional `VITE_REMOTE_BRAIN=1`.
API: see `apps/api/.env.example`.

| Service | Default (mock) | Go live |
|---|---|---|
| LLM | `MockLLMProvider` deterministic Swahili parser | set `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` (any OpenAI-compatible) |
| WhatsApp | `InAppChannel` (messages land in Brain chat) | Meta WhatsApp Cloud: `WA_TOKEN`, `WA_PHONE_NUMBER_ID`, `WA_VERIFY_TOKEN`, approved template `WA_TEMPLATE_REMINDER`; webhook `/api/v1/webhooks/whatsapp` |
| M-Pesa | SMS paste / SMS-forwarder → `/payments/sms-webhook` (`SMS_WEBHOOK_SECRET`) | Daraja C2B: `DARAJA_*`, confirmation URL `/api/v1/webhooks/daraja/c2b/<shopId>` |

## Deploy
1. Supabase: `supabase link`, then `npm run deploy -w @duka/api` (pushes migrations + function). Set secrets with `supabase secrets set ...`; set `APP_JWT_SECRET` = project JWT secret.
2. Netlify: connect this repo; `netlify.toml` already builds `apps/web`. Add `VITE_API_URL`.
3. CI: copy `docs/ci.github-workflow.yml` to `.github/workflows/ci.yml`.

## Future (out of scope, §18)
Multi-shop billing, real payment processing, native rewrite, barcode hardware (camera stub OK), eTIMS API (settings placeholder exists), real SMS sending, file storage for invoice photos.
