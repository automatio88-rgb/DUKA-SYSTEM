# MASTER PROMPT — PROJECT "DUKAOS"
The Digital Business Partner for a Kenyan Mini-Mart (Duka) · Version 1.0 · Autonomous Build Contract

> Stored verbatim-in-spirit as the single source of truth. Re-read before every phase.
> Owner addenda (binding, override the original where they conflict) are at the bottom.

## /goal — PRIME DIRECTIVE
You are an autonomous senior engineering team (architect + full-stack engineer + product designer + QA) building this ENTIRE project end-to-end WITHOUT asking the human questions. Work through every phase, test everything, fix everything, present only when COMPLETE per the Definition of Done (§20).

1. NEVER stop to ask for clarification. Make the call a seasoned Kenyan-market product engineer would make, record it in `DECISIONS.md`, continue.
2. NEVER stop because an external API key is missing. Every external service (WhatsApp, M-Pesa, LLM, SMS) is behind an adapter with a fully functional MOCK (§12). 100% buildable/runnable/demoable with zero credentials.
3. Maintain `status.md` religiously (§19). Any agent must be able to pick up cold from `status.md` + `DECISIONS.md`.
4. Commit after every completed unit of work with meaningful messages.
5. Don't declare victory until §20 is checked. Then write the handover in `status.md`.

## 1. CONTEXT — WHO THIS IS FOR
Kenyan duka owner. 800+ products floor-to-ceiling, pen in hand, mental math. Separate STOREHOUSE (godown) with bulk stock. Runs the business from his head + a paper notebook ("kitabu") of customer debts. 6:30am–9:30pm, 7 days/week. One half-trusted "store boy". Cash + M-Pesa. Mid-range Android, lives on WhatsApp, Swahili + English, never used business software.
Pains in order: 1) customer credit leaks + chasing is awkward, 2) shrinkage he can't prove, 3) two-location blindness (shelf empty while store has stock; silent expiry in back), 4) zero profit visibility, 5) chained to the shop.

DESIGN LAW: every interaction ≤ 5s, common sale = 2 taps; if it adds work vs paper it fails; OFFLINE + sync later (non-negotiable); Swahili/English toggle everywhere; big touch targets; readable in sunlight; tolerate imperfect data (busy mode, reconcile later).

## 2. PRODUCT — THREE LAYERS
- Layer 1 — The App (offline-first): POS, inventory (2 locations), digital kitabu, dashboards, reports. Installable. Roles Owner vs Staff.
- Layer 2 — The Agent "Duka Brain": in-app chat panel + provider-agnostic messaging gateway with WhatsApp Cloud adapter (mock default). NL/Swahili/Sheng commands → tool-calls on the same API. Proactive Daily Report, Morning Briefing, alerts, debt reminders.
- Layer 3 — Data & Intelligence: reconciliation, reorder intelligence, expiry sentinel, dead-stock radar, profit engine, anomaly detection, M-Pesa ingestion.

## 3. TECH STACK
npm workspaces (`apps/web`, `apps/api`, `packages/shared`); React 18 + TS + Vite + vite-plugin-pwa; Tailwind + CSS token vars; Framer Motion; Three.js via @react-three/fiber (lazy, auth/onboarding/empty states only); Zustand + TanStack Query; Dexie + custom sync engine; Recharts; **Backend: Supabase (owner change, replaces Hono-on-Workers + D1)**; PIN device auth + signed JWT; custom i18n dictionaries (en/sw); `LLMProvider` → `MockLLMProvider` (default) + `OpenAICompatProvider` (LLM_BASE_URL, LLM_API_KEY, LLM_MODEL); `MessageChannel` → InApp (default) / WhatsAppCloud (env) / Console (tests); `PaymentIngestor` → MpesaSmsParser (default) / DarajaC2B (env stub); Vitest + Playwright; `npm run dev` boots everything.

## 4. REPO STRUCTURE
`MASTERPROMPT.md, status.md, DECISIONS.md, README.md, package.json, apps/web/src/{app,features,components,design,lib,i18n,three}, apps/api (Supabase edge functions + migrations), packages/shared (zod schemas, types, constants, mpesa parser, i18n dicts)`.

## 5. DATABASE SCHEMA
Client-generatable UUIDs; every table has created_at, updated_at, deleted_at, updated_by.
shops, users(role owner|staff, pin_hash), locations(type shop|store; seeded "Duka","Store"), categories, products(buy_unit, sell_unit, units_per_buy_unit, wastage_pct, cost_price per sell unit, retail/wholesale/loyal price, reorder_level, track_expiry), stock_levels(unique product+location), stock_batches(FEFO, expiry_date), stock_moves(reason purchase|sale|transfer|adjustment|expiry_writeoff|count_correction), suppliers, purchases(draft|received, paid_amount, due_date), purchase_items, price_history, customers(credit_limit, tier regular|loyal|wholesale), sales(status complete|void, payment_method cash|mpesa|credit|split, amounts, device_id, offline_created_at), sale_items(unit_cost_snapshot, price_tier), credit_ledger(charge|payment|adjustment, balance_after), reminders(escalation_level), payments_inbox(source sms|daraja|manual, mpesa_code, status unmatched|matched|suspicious|ignored), cash_sessions(opening_float, expected_cash, counted_cash, variance), expenses, stock_counts, stock_count_items, demand_log, agent_messages, alerts, audit_log, sync_oplog.
Invariants: stock_levels = Σ stock_moves; balance_after recomputed server-side; sales immutable (void = compensating entry); every mutation writes audit_log.

## 6. API SURFACE (`/api/v1`, JWT except auth)
POST /auth/pin-login, POST /auth/setup; CRUD for all entities; POST /sales (idempotent, offline batch); POST /sync/push, GET /sync/pull?since=; POST /payments/sms-webhook; POST /purchases/:id/receive; POST /transfers; GET /reports/{daily,weekly,profit,dead-stock,expiry,cash-position,loan-pack}; POST /agent/message; POST /jobs/run/:jobName; GET /jobs/tick (lazy, no cron dependency).

## 7. FEATURES (build in order; AC = acceptance criteria)
- F1 Foundation & Auth: setup wizard, users + PIN, staff role. AC: owner & staff log in on same device; staff can't see profit/settings; all actions audit-logged.
- F2 Catalog & Two-Location Inventory: buy→sell unit conversion, price tiers, categories, gradient-initial avatars, stock per location, adjustments with reason. AC: receive purchase → Store; transfer → Duka; per-product movement timeline.
- F3 POS (crown jewel): top-40 movers as large tiles (velocity-ranked) + instant fuzzy search (name, Swahili, barcode). Cart drawer. Cash / M-Pesa / Credit / Split. Quick qty for loose goods. Busy Mode (lump sums, reconcile later). Fully offline. AC: 2-item cash sale ≤ 4 taps; offline sale syncs; stock decrements from Duka; velocity updates.
- F4 Digital Kitabu: live balances, one-tap credit from POS, payments, statements, limit warnings; reminder engine (schedule, gentle/firm/final, sw+en) via MessageChannel. AC: balance_after chain correct; reminders on /jobs/tick; statement = ledger.
- F5 M-Pesa Ingestion: regex parser (till, send-money received, Pochi), webhook + paste UI, auto-match amount+time → sale or customer; unmatched inbox; suspicious flags (duplicate, malformed). 15+ fixtures. AC: pasting fixture creates matched payment and closes credit/sale.
- F6 Cash Sessions & Shrinkage Guard: float → expected cash → counted → variance per user/shift, trend chart, unexplained-gap alerts. AC: day simulation correct.
- F7 Purchases, Suppliers, Price Memory: fast purchase form, receive-to-store, supplier price history, best-recent-price hint, payables with due alerts. AC: two suppliers different prices → cheaper hint; margin from latest cost.
- F8 Reorder Intelligence, Expiry Sentinel, Dead Stock: 28-day weekday-weighted velocity, days-of-stock; shelf-low→transfer, total-low→draft order, expiry 30/14/7 with discount, dead stock 45d + frozen capital. AC: seed triggers each alert; draft order quantities correct.
- F9 Dashboards & Reports: home (today sales, profit est., cash position = cash + M-Pesa + receivables − payables, credit outstanding, alerts). Daily Report, Weekly Business Review (narrative like a smart manager), Profit Truth, Loan-Readiness Pack (printable 6-month P&L + cashflow). AC: correct math, narrative natural in both languages.
- F10 Agent "Duka Brain": tools recordSale, addCredit, recordPayment, transferStock, stockQuery, debtQuery, priceUpdate, dailyReport, addDemandLog, draftOrder. Mock parser handles: "Andika deni ya Baba Kevin mia nne hamsini" → addCredit(Baba Kevin,450); "Nimehamisha katoni mbili za maziwa kutoka store" → transferStock(milk,2 cartons,store→duka); "Nani ananidai zaidi ya elfu moja?" → debtQuery(>1000); "Ripoti ya leo"/"daily report" → dailyReport; "Weka bei ya sukari 65" → priceUpdate(sugar,65); "Mteja ameuliza formula ya watoto" → addDemandLog. Proactive Morning Briefing + Evening Report via /jobs/tick.
- F11 Stock-Take & Demand Log: section counts with hidden expected qty, variances → correction moves + alert; demand quick entry → weekly missed-demand report.
- F12 Settings, i18n, Backup: full en/sw, shop profile, price tiers, reminder schedule, JSON + CSV export, PIN management.
- F13 Onboarding & Demo Mode: one click seeds ~120 real Kenyan products, 2 locations, 15 debtors, 30 days weekday-patterned sales, 3 suppliers with price history, pending expiries, dead stock, an unmatched M-Pesa payment.

## 8. ROLES
Owner: everything. Staff: POS, transfer-confirm, stock counts, kitabu entries, demand log. Staff CANNOT see profit/cost/reports, edit prices, void, delete, view variance trends. Owner-only areas are HIDDEN in staff mode.

## 12. ADAPTERS
LLMProvider, MessageChannel, PaymentIngestor: interface + production-quality mock (default) + env-gated real. Document env vars + go-live in README.

## 13. OFFLINE-FIRST SYNC
Writes → Dexie first with client UUID + client_ts, queued in oplog. Push batch → server applies idempotently (dedupe op id) → pull since cursor. LWW by server receipt EXCEPT stock (derived from union of moves) and credit (recomputed from ledger). Sync pill (synced/syncing/offline/N pending). PWA precache, installable, airplane-mode E2E. AC: offline sales → online → zero loss/dupes (automated test).

## 14. DESIGN SYSTEM — "NEXT-GENERATION, ZERO AI SLOP"
Name in-app: **Duka System**. Premium fintech × warm Kenyan market.
BANNED: purple→blue gradients, emoji icons, Bootstrap cards, stock illustrations, centered-everything, gray-on-gray, walls of identical stat cards, Tailwind blue-500 brand, Lorem ipsum.
Tokens: deep ink orange (primary), warm amber #F5A623 (accent), cream #FAF6EF (light bg), charcoal #121417 (dark bg), terracotta #C4502C (alerts), success #1F8A5B. DARK MODE DEFAULT, light available.
Type: Sora (display), Inter (body), IBM Plex Mono (money, tabular). Money `KSh 1,234`.
Radius 16 cards / 12 controls; soft layered shadows; 8% borders.
Motion: fade+8px page transitions 220ms custom bezier, staggered lists, springy POS taps, animated counters, spring cart drawer, drawn-check success. Respect prefers-reduced-motion.
3D: ONE lazy Three.js scene: low-poly duka storefront (shelves, brand awning, soft light, float) from primitives on auth/onboarding (small on empty states). Not in main bundle. Static fallback when hardwareConcurrency ≤ 4 or no WebGL. NEVER on POS.
Charts: branded Recharts, rounded bars, soft gradients, annotated peaks ("Saturday spike").
POS: tiles ≥ 88px, thumb-zone bottom actions, press states, sunlight contrast.

## 15. i18n
`packages/shared/i18n/{en,sw}.ts`, every string keyed, real shopkeeper Swahili ("Deni", "Bidhaa", "Ripoti ya Leo", "Weka Sale", "Wateja wanaodaiwa").

## 16. TESTING
Vitest: money, ledger chain, stock derivation, velocity/reorder, FEFO, M-Pesa (15+ fixtures), sync idempotency, mock-LLM intents, permissions. Playwright smoke: login → demo seed → cash sale → credit sale → M-Pesa paste → transfer → close cash → daily report; + offline sale. `npm run check` = typecheck + lint + tests + build. Bundle < 350KB gzip excl. 3D.

## 17. PHASES
P0 scaffold/tokens/migrations/auth · P1 F1–F3 + sync + seed · P2 F4–F6 · P3 F7–F9 · P4 F10–F11 · P5 F12–F13 · P6 design pass, motion, 3D, dark/light, Swahili QA · P7 tests green, README, handover.

## 18. NOT IN SCOPE
Multi-shop billing, real payments, native Android app, barcode hardware (camera stub OK), eTIMS API (compliant-style receipt + placeholder), real SMS, file storage backend. Note as "future".

## 19. status.md PROTOCOL
Header (Updated, Phase, Overall %), Done (with evidence), In Progress, Remaining, Known Issues, Env Vars & Mocks, For the Next Agent.

## 20. DEFINITION OF DONE
npm install && npm run dev boots; npm run check green; F1–F13 ACs; Playwright incl. offline; Demo Mode shows everything; full sw + en; dark + light; design audit; agent utterances; docs complete; handover with 5-minute demo script + go-live checklist.

---
## OWNER ADDENDA (binding)
1. **Backend = Supabase** (Postgres + Edge Functions + RLS). **Frontend hosting = Netlify.** Hosting happens after the build is complete.
2. **This is a MOBILE APP, not a web app.** Mobile-first everything: thumb-zone reachability, bottom navigation, bottom sheets, safe areas, 48dp+ targets, one-handed use. (Decision: installable PWA + Capacitor Android shell. See DECISIONS.md.)
3. Skills to apply: GSAP skills, Material 3 skill, frontend-ui-ux (oh-my-openagent), premium-frontend-ui (awesome-copilot), Anthropic frontend-design, shadcn skill.
4. Reference image: a duka owner in a green t-shirt behind his counter writing in a notebook, walls of Sunlight, Maltina, tins and sachets floor to ceiling. That is our user and our visual soul.
5. Push small commits to GitHub repo `automatio88-rgb/DUKA-SYSTEM` and provide a preview link.
