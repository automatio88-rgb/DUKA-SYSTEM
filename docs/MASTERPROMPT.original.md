Read MASTERPROMPT fully and check the Reference Image I have shared for you to get the full complete exact and precise Bigger picture of the Smart and powerful Next-generation App I want you to build, then execute it. Do not ask me anything.
 
 
# ═══════════════════════════════════════════════════════════════════
# MASTER PROMPT — PROJECT "DUKAOS"
# The Digital Business Partner for a Kenyan Mini-Mart (Duka)
# Version 1.0 — Autonomous Build Contract
# ═══════════════════════════════════════════════════════════════════
 
## /goal — PRIME DIRECTIVE (READ FIRST)
 
You are an autonomous senior engineering team (architect + full-stack engineer +
product designer + QA) building this ENTIRE project end-to-end WITHOUT asking the
human questions. The human will NOT respond mid-build. You work through every phase,
test everything, fix everything, and only present the finished, running, polished
product when it is COMPLETELY DONE per the Definition of Done (§20).
 
Rules of autonomy:
1. NEVER stop to ask for clarification. Every decision you need is in this document.
   If something is genuinely ambiguous, make the decision a seasoned Kenyan-market
   product engineer would make, record it in DECISIONS.md, and continue.
2. NEVER stop because an external API key is missing. Every external service
   (WhatsApp, M-Pesa, LLM, SMS) MUST be built behind an adapter interface with a
   fully functional MOCK implementation (§12). The system must be 100% buildable,
   runnable, and demoable with zero external credentials.
3. Maintain status.md religiously (§19). Any other agent must be able to pick up
   this project cold from status.md + DECISIONS.md alone.
4. Commit to git after every completed unit of work with meaningful messages.
5. Do not declare victory until §20 is fully checked. Then produce the final
   handover report in status.md and stop.
 
---
 
## 1. CONTEXT — WHO THIS IS FOR (Internalize this. It drives every decision.)
 
The end user is a Kenyan duka (mini-mart) owner. Picture him: standing behind a
counter surrounded by 800+ products floor-to-ceiling, pen in hand, doing mental
math. He also owns a separate STOREHOUSE (backroom/godown) holding bulk stock.
He runs the entire business from his head and a paper notebook ("kitabu") of
customer debts. He works 6:30am–9:30pm, 7 days a week. He has one employee
(a "store boy") he half-trusts. He takes cash and M-Pesa. He has a smartphone
(mid-range Android), lives on WhatsApp, speaks Swahili + English, and has NEVER
used business software. His pains, in order:
1. Customer credit (kitabu) — money owed to him leaks and chasing it is socially awkward
2. Shrinkage — stock/cash disappears and he can't prove why
3. Two-location blindness — shelf runs out while stock sits in the storehouse; things expire silently in the back
4. Zero profit visibility — he knows sales, not profit
5. He is chained to the shop — leaving for one day means losses
 
DESIGN LAW derived from this persona:
- Every interaction ≤ 5 seconds. A common sale = 2 taps.
- If a feature adds work vs. his paper method, it is a failure.
- Must work OFFLINE and sync later. Non-negotiable.
- Swahili/English toggle everywhere. Big touch targets. Readable in sunlight.
- The system must tolerate imperfect data (busy mode, reconcile later) rather
  than demand perfection.
 
---
 
## 2. PRODUCT OVERVIEW — THREE LAYERS
 
**Layer 1 — The App (offline-first PWA):** The owner's premium, professional app.
POS sell screen, inventory (2 locations), digital kitabu, dashboards, reports.
Installable to home screen. Role-based (Owner vs Staff).
 
**Layer 2 — The Agent ("Duka Brain"):** A conversational AI business partner.
In this build it lives as (a) a beautiful in-app chat panel and (b) a
provider-agnostic messaging gateway with a WhatsApp Cloud API adapter (mock mode
default). It parses natural language/Swahili/Sheng commands, executes actions via
tool-calls against the same API, and proactively sends the Daily Report, Morning
Briefing, alerts, and debt reminders.
 
**Layer 3 — Data & Intelligence:** Edge API + database + analytics jobs:
reconciliation engine, reorder intelligence, expiry sentinel, dead-stock radar,
profit engine, anomaly detection, M-Pesa ingestion.
 
---
 
## 3. TECH STACK (FIXED — do not substitute)
 
| Concern | Choice |
|---|---|
| Monorepo | npm workspaces: apps/web, apps/api, packages/shared |
| Frontend | React 18 + TypeScript + Vite + vite-plugin-pwa |
| Styling | Tailwind CSS + CSS custom properties design tokens |
| Motion | Framer Motion (page transitions, micro-interactions) |
| 3D | Three.js via @react-three/fiber — lazy-loaded, ONLY on auth/onboarding/empty states (§14) |
| State | Zustand + TanStack Query |
| Offline store | Dexie (IndexedDB) + custom sync engine (§13) |
| Charts | Recharts (styled to design system) |
| Backend | Hono (TypeScript) on Cloudflare Workers/Pages | (Changed to superbase)
| Database | Cloudflare D1 (SQLite) via Drizzle ORM; local dev:  wrangler --local |    (changed to superbase)
| Auth | PIN-based device auth + signed session tokens (JWT, hono/jwt) | 
| i18n | Custom lightweight dictionary module (en / sw), no heavy lib | 
| LLM layer | Adapter interface LLMProvider → MockLLMProvider (default, deterministic intent parser) + OpenAICompatProvider (reads LLM_BASE_URL, LLM_API_KEY, LLM_MODEL from env) |
| Messaging | Adapter MessageChannel → InAppChannel (default) + WhatsAppCloudAdapter (env-gated) + ConsoleAdapter (tests) |
| Payments | Adapter PaymentIngestor → MpesaSmsParser (regex engine, default) + DarajaC2BAdapter (env-gated stub) |
| Testing | Vitest (unit), Playwright (E2E smoke on key flows) |
| Local dev | npm run dev boots API (wrangler local) + web (vite) concurrently |
 
If any exact library version conflicts arise, resolve pragmatically and record in
DECISIONS.md.
 
---
 
## 4. REPO STRUCTURE
 
```
dukaos/
├── MASTERPROMPT.md          # this file
├── status.md                # living build log (§19)
├── DECISIONS.md             # every autonomous decision + rationale
├── README.md                # setup, run, deploy, env vars, screenshots
├── package.json             # workspaces root
├── apps/
│   ├── web/                 # React PWA
│   │   └── src/{app,features,components,design,lib,i18n,three}
│   └── api/                 # Hono + D1
│       └── src/{routes,services,agent,adapters,jobs,db}
│       └── migrations/      # numbered SQL migrations
└── packages/shared/         # zod schemas, types, constants, mpesa parser, i18n dicts
```
 
---
 
## 5. DATABASE SCHEMA (Drizzle + SQL migrations; all IDs are client-generatable UUIDs; all tables get created_at, updated_at, deleted_at soft-delete, and updated_by)
 
```sql
shops(id, name, owner_name, phone, currency='KES', language, mpesa_type, settings_json)
users(id, shop_id, name, phone, role ENUM(owner,staff), pin_hash, active)
locations(id, shop_id, name, type ENUM(shop,store))            -- seeded: "Duka", "Store"
categories(id, shop_id, name, sort)
products(id, shop_id, category_id, name, name_sw, barcode?, image_url?,
         buy_unit,              -- e.g. "carton", "50kg bag"
         sell_unit,             -- e.g. "piece", "kg scoop"
         units_per_buy_unit,    -- e.g. 12, 50
         wastage_pct DEFAULT 0, -- loose goods yield loss
         cost_price,            -- per sell_unit, latest
         retail_price, wholesale_price?, loyal_price?,
         reorder_level, track_expiry BOOL, active)
stock_levels(id, product_id, location_id, qty)                 -- unique(product,location)
stock_batches(id, product_id, location_id, qty, expiry_date, purchase_id?)  -- FEFO
stock_moves(id, shop_id, product_id, from_location?, to_location?, qty,
            reason ENUM(purchase,sale,transfer,adjustment,expiry_writeoff,count_correction),
            ref_id?, note?, user_id)
suppliers(id, shop_id, name, phone?, notes?)
purchases(id, shop_id, supplier_id, invoice_no?, invoice_image_url?, total_cost,
          status ENUM(draft,received), paid_amount, due_date?)
purchase_items(id, purchase_id, product_id, qty_buy_units, cost_per_buy_unit, expiry_date?)
price_history(id, product_id, supplier_id?, cost_price, recorded_at)
customers(id, shop_id, name, phone?, credit_limit?, notes?, tier ENUM(regular,loyal,wholesale))
sales(id, shop_id, user_id, customer_id?, total, discount, status ENUM(complete,void),
      payment_method ENUM(cash,mpesa,credit,split), mpesa_amount, cash_amount, credit_amount,
      device_id, offline_created_at)
sale_items(id, sale_id, product_id, qty, unit_price, unit_cost_snapshot, price_tier)
credit_ledger(id, shop_id, customer_id, type ENUM(charge,payment,adjustment),
              amount, balance_after, sale_id?, note?, user_id)
reminders(id, shop_id, customer_id, channel, message, scheduled_at, sent_at?,
          status, escalation_level INT)
payments_inbox(id, shop_id, source ENUM(sms,daraja,manual), raw_text?,
               mpesa_code?, payer_name?, payer_phone?, amount, tx_time,
               matched_sale_id?, matched_customer_id?,
               status ENUM(unmatched,matched,suspicious,ignored))
cash_sessions(id, shop_id, user_id, opened_at, closed_at?, opening_float,
              expected_cash, counted_cash?, variance?, note?)
expenses(id, shop_id, category, amount, note?, user_id)
stock_counts(id, shop_id, location_id, section_name, status, user_id)
stock_count_items(id, count_id, product_id, expected_qty, counted_qty, variance)
demand_log(id, shop_id, text, product_guess?, user_id)          -- "customer asked for X"
agent_messages(id, shop_id, channel, direction ENUM(in,out), body, intent?,
               tool_calls_json?, user_id?)
alerts(id, shop_id, type, severity, title, body, data_json, read_at?)
audit_log(id, shop_id, user_id, action, entity, entity_id, before_json?, after_json?)
sync_oplog(id, shop_id, device_id, entity, entity_id, op, payload_json, client_ts, server_ts)
```
 
Invariants the API must enforce: stock_levels always equals the sum of stock_moves;
credit_ledger.balance_after is recomputed server-side; sales are immutable (void =
compensating entry); every mutation writes audit_log.
 
---
 
## 6. API SURFACE (Hono, /api/v1/..., JWT-protected except auth)
 
Auth: POST /auth/pin-login (shop code + user + PIN → JWT), POST /auth/setup.
CRUD + purpose-built endpoints for every entity above, PLUS:
- POST /sales (idempotent by client id; accepts offline batch)
- POST /sync/push + GET /sync/pull?since= (§13)
- POST /payments/sms-webhook (raw M-Pesa SMS text in → parsed, matched)
- POST /purchases/:id/receive (increments store stock, writes batches, price_history)
- POST /transfers (store↔shop with staff-confirm flow)
- GET /reports/daily?date= GET /reports/weekly GET /reports/profit
  GET /reports/dead-stock GET /reports/expiry GET /reports/cash-position
  GET /reports/loan-pack (6-month P&L + cashflow summary JSON→printable view)
- POST /agent/message (chat in → agent reply + executed actions)
- POST /jobs/run/:jobName (manually triggerable analytics jobs; also a
  GET /jobs/tick endpoint that runs due jobs lazily — NO cron dependency)
 
---
 
## 7. FEATURE MODULES (build in this order; each has acceptance criteria = AC)
 
### F1 — Foundation & Auth
Shop setup wizard (name, owner, language, M-Pesa type), user + PIN creation,
staff user with restricted role. AC: owner and staff can log in on same device;
staff cannot see profit/settings; all actions audit-logged.
 
### F2 — Product Catalog & Two-Location Inventory
Product CRUD with buy-unit→sell-unit conversion, price tiers, categories, images
(placeholder gradient-initial avatars when no photo). Stock per location.
Manual adjustments with reason. AC: creating a purchase and receiving it puts
stock in Store; transfer moves it to Duka; every movement visible in a
per-product movement timeline.
 
### F3 — POS Sell Screen (the crown jewel — obsess over this)
Grid of top-40 movers as large tiles (auto-ranked by sales velocity) + instant
fuzzy search (name, Swahili name, barcode). Cart drawer. Payment: Cash / M-Pesa /
Credit (pick customer) / Split. Quick-quantity for loose goods (e.g., "2 kg").
**Busy Mode toggle:** suspends itemized entry; sales captured as lump sums,
flagged for later reconcile. Works fully offline. AC: a 2-item cash sale completes
in ≤ 4 taps; offline sale syncs correctly when API returns; stock decrements from
Duka location; velocity ranking updates.
 
### F4 — Digital Kitabu (Credit)
Customer list with live balances, one-tap "add credit" from POS, payments against
balance, full per-customer statement, credit limit warnings. Reminder engine:
configurable schedule (e.g., Saturdays, balance > X), 3 escalation tones
(gentle/firm/final) in Swahili + English templates, sent via MessageChannel
(mock logs to Alerts inbox + agent chat). AC: charging + paying updates
balance_after chain correctly; reminders generate on schedule via /jobs/tick;
customer statement matches ledger exactly.
 
### F5 — M-Pesa Ingestion
MpesaSmsParser: robust regex engine for real M-Pesa SMS formats (till payment,
send-money received, Pochi) — parse code, amount, payer, time. Webhook + manual
paste UI ("paste M-Pesa message"). Auto-match: amount+time window → open sale or
customer with matching balance; unmatched → inbox for one-tap assignment.
Suspicious-pattern flags (duplicate code, malformed). Include 15+ unit tests with
realistic SMS fixtures. AC: pasting a fixture SMS creates a matched payment and
closes the corresponding credit/sale.
 
### F6 — Cash Sessions & Shrinkage Guard
Open day with float → system computes expected cash (cash sales − payouts) →
close day by entering counted cash → variance logged and trended per user/shift.
Variance trend chart + "unexplained gap" alerts. AC: end-to-end day simulation
produces correct expected cash and variance.
 
### F7 — Purchases, Suppliers & Price Memory
Purchase entry (fast form; invoice image attach field), receive-to-store flow,
supplier price history, "best recent price" hint on reorder, payables (what he
owes) with due-date alerts. AC: two purchases of same product from two suppliers
at different prices → reorder screen shows cheaper supplier hint; margin
recalculates from latest cost.
 
### F8 — Reorder Intelligence, Expiry Sentinel, Dead Stock Radar
Velocity = trailing 28-day sales weighted by weekday. Days-of-stock per product.
Alerts: shelf-low (store has stock → "transfer"), total-low ("draft order",
one tap creates draft purchase), expiry at 30/14/7 days with discount suggestion,
dead stock (no sales 45d) monthly report with frozen-capital total.
AC: seeded demo data triggers each alert type; draft order contains correct
suggested quantities.
 
### F9 — Dashboards & Reports
Owner home: today's sales, profit estimate, cash position (cash + M-Pesa +
receivables − payables), credit outstanding, alert feed. Daily Report (auto at
close/on demand), Weekly Business Review (plain-language narrative, not just
numbers — write it like a smart manager talking), Profit Truth (per product/
category margins, top profit-makers vs shelf-wasters), Loan-Readiness Pack
(printable 6-month P&L + cashflow). AC: all reports render from seed data with
correct math; narrative review reads naturally in both languages.
 
### F10 — The Agent ("Duka Brain")
In-app chat panel (and MessageChannel gateway). Tool-calling architecture:
tools = recordSale, addCredit, recordPayment, transferStock, stockQuery,
debtQuery, priceUpdate, dailyReport, addDemandLog, draftOrder.
MockLLMProvider: deterministic Swahili/English/Sheng intent parser
(pattern + keyword based) that handles at minimum these utterances:
- "Andika deni ya Baba Kevin mia nne hamsini" → addCredit(Baba Kevin, 450)
- "Nimehamisha katoni mbili za maziwa kutoka store" → transferStock(milk, 2 cartons, store→duka)
- "Nani ananidai zaidi ya elfu moja?" → debtQuery(>1000)
- "Ripoti ya leo" / "daily report" → dailyReport()
- "Weka bei ya sukari 65" → priceUpdate(sugar, 65)
- "Mteja ameuliza formula ya watoto" → addDemandLog
OpenAICompatProvider: same tools via real LLM function-calling when env keys
exist. Proactive messages: Morning Briefing (sales forecast hint, low stock,
debts cleared, cash position — warm tone, Swahili greeting) and Evening Daily
Report, generated by /jobs/tick. AC: all mock utterances execute correct tools
and reply in the user's language; briefings generate with real computed data.
 
### F11 — Stock-Take Assistant & Demand Log
Rolling counts: pick a section → count list with expected quantities hidden until
entry → variances computed, corrections posted, shrinkage linked to F6 trends.
Demand log: one tap + text/voice-note-style quick entry → weekly "missed demand"
report. AC: a count with deliberate variance produces correction moves + alert.
 
### F12 — Settings, i18n, Backup
Language toggle (en/sw — FULL translation of UI strings via dictionary files),
shop profile, price tier config, reminder schedule config, data export
(full JSON + CSV per entity), PIN management. AC: every screen renders correctly
in Swahili; export downloads valid files.
 
### F13 — Onboarding & Demo Mode
First-run wizard. **Demo Mode:** one click seeds a realistic Kenyan duka —
~120 products (real names: Sunlight 2in1, Jogoo/Soko unga 2kg, Maltina cans,
Blue Band 250g, Kasuku, Omo, Mumias sugar loose, Fanta/Coke 500ml, bread, milk
ESL 500ml, Rooster matches, KCC ghee, Ariel, Colgate, Dettol, Panadol, Always,
Pampers, airtime scratch cards…), 2 locations stocked, 15 customers with credit
balances, 30 days of sales history with weekday patterns, 3 suppliers with price
history, pending expiries, dead stock, an unmatched M-Pesa payment — enough that
EVERY feature and alert demonstrates itself instantly. AC: fresh install →
Demo Mode → every dashboard, report, and alert type shows meaningful data.
 
---
 
## 8. ROLES & PERMISSIONS
Owner: everything. Staff: POS sales, transfers-confirm, stock counts, kitabu
entries, demand log. Staff CANNOT: see profit/cost prices/reports, edit prices,
void sales, delete anything, view variance trends. Every staff action stamped.
UI must gracefully hide (not just disable) owner-only areas in staff mode.
 
---
 
## 12. ADAPTER PATTERN (the key to keyless autonomy)
Every external dependency = interface + mock (default) + real (env-gated):
- LLMProvider → Mock (deterministic) / OpenAI-compatible (LLM_* env)
- MessageChannel → InApp (default) / WhatsAppCloud (WA_* env) / Console
- PaymentIngestor → SmsParser (default, pure code) / Daraja stub (DARAJA_* env)
Mock behavior must be production-quality, not lorem-ipsum. Document all env vars
in README with "how to go live" instructions.
 
---
 
## 13. OFFLINE-FIRST SYNC ENGINE
- All writes go to Dexie first with client UUID + client_ts, queued in an oplog.
- Background sync: push oplog batch → server applies idempotently (dedupe by op id),
  returns authoritative state; pull changes since cursor.
- Conflict policy: last-write-wins by server receipt EXCEPT stock quantities,
  which are always derived from the union of stock_moves (movements merge, never
  overwrite). Credit balances recomputed server-side from ledger.
- UI: subtle sync-status pill (synced / syncing / offline / N pending).
- PWA: precache app shell, runtime cache, installable manifest with proper icons,
  works with airplane-mode E2E test.
AC: create sales offline → go online → data reconciles with zero loss/dupes
(covered by an automated test).
 
---
 
## 14. DESIGN SYSTEM — "NEXT-GENERATION, ZERO AI SLOP" (BINDING)
 
**Identity:** Name in-app: **Duka System**. Feel: premium fintech meets warm Kenyan
market. Confident, crafted, trustworthy — NOT a generic dashboard template.
 
**Anti-slop laws (violations = rework):**
- BANNED: default purple-to-blue gradients on white, generic emoji as icons,
  Bootstrap-looking cards, cheesy stock illustrations, centered-everything
  layouts, gray-on-gray sameness, walls of identical stat cards, default
  Tailwind blue-500 as brand color, "Lorem ipsum" anywhere.
- Every screen must have deliberate visual hierarchy, real spacing rhythm
  (4/8pt scale), and at least one crafted signature detail.
 
**Tokens:**
- Palette: deep ink orange (primary), warm amber #F5A623` (accent —
  the color of maize/sunlight), cream #FAF6EF (light bg), charcoal #121417
  (dark bg), terracotta #C4502C (alerts), success #1F8A5B.
  Dark mode is the DEFAULT (shops are used at night); light mode available.
- Typography: display **"Sora"**, body **"Inter"**, numbers/tabular
  **"IBM Plex Mono"** for money figures (Google Fonts, self-host via fontsource).
  Money always formatted KSh 1,234 with tabular numerals.
- Radius 16px cards / 12px controls; layered soft shadows; borders at 8% opacity.
 
**Motion (Framer Motion):** page transitions (fade+8px slide, 220ms,
custom cubic-bezier), staggered list entrances, springy tap feedback on POS
tiles, animated number counters on dashboard, cart drawer with spring physics,
success states with a drawn-check micro-animation. Respect
prefers-reduced-motion. Nothing gratuitous — motion communicates state.
 
**3D (tasteful, performance-budgeted):** ONE signature Three.js scene, lazy-loaded:
the auth/onboarding screen features a slowly rotating low-poly stylized duka
storefront (shelves, awning in brand colors, soft studio lighting, gentle float)
built from primitives/procedural geometry — no heavy GLB downloads. Also used on
empty states at small scale. Must not ship in the main bundle; must degrade to a
static gradient illustration on low-end devices (detect via
navigator.hardwareConcurrency <= 4 or WebGL failure). POS screen: NO 3D ever.
 
**Data-viz:** custom-styled Recharts — brand colors, rounded bars, soft area
gradients, annotated peaks ("Saturday spike"), no default gridlines-everywhere.
 
**POS ergonomics:** tiles ≥ 88px tall, thumb-zone actions bottom-anchored,
haptic-feel press states, high contrast for sunlight readability.
 
---
 
## 15. i18n
packages/shared/i18n/{en.ts,sw.ts} — every UI string keyed. Swahili must be
real, natural shopkeeper Swahili (e.g., "Deni", "Bidhaa", "Ripoti ya Leo",
"Weka Sale", "Wateja wanaodaiwa"), not machine-literal. Agent replies and
reminder/report templates localized in both.
 
---
 
## 16. TESTING & QUALITY GATES
- Vitest: money math, credit ledger chain, stock derivation from moves, velocity
  & reorder calc, FEFO batch logic, M-Pesa SMS parser (15+ fixtures), sync
  idempotency, mock-LLM intent parsing (all §F10 utterances), permissions.
- Playwright smoke: login → demo seed → make sale (cash) → make credit sale →
  record M-Pesa paste → transfer stock → close cash session → view daily report.
  Plus one offline-mode sale test.
- npm run check = typecheck + lint + unit tests + build, all green.
- Performance: web bundle (excl. lazy 3D chunk) < 350KB gzip; Lighthouse PWA
  installable; POS interaction under 100ms.
 
---
 
## 17. BUILD PHASES (execute sequentially; update status.md at every gate)
- **P0** Scaffold monorepo, tooling, CI-ready scripts, design tokens, DB migrations, auth. 
- **P1** F1–F3 (foundation, inventory, POS) + offline sync + demo seed v1.
- **P2** F4–F6 (kitabu, M-Pesa, cash guard).
- **P3** F7–F9 (purchases, intelligence, reports).
- **P4** F10–F11 (agent, stock-take, demand).
- **P5** F12–F13 (settings, i18n completion, onboarding, demo mode final).
- **P6** Design excellence pass (every screen against §14), motion polish, 3D
  scene, dark/light QA, Swahili QA.
- **P7** Full test suite green, README (setup + go-live guide for WhatsApp/
  Daraja/LLM keys + deploy notes for Cloudflare), final status.md handover.
Gate rule: do not start a phase until the previous phase's ACs pass.
 
---
 
## 18. WHAT NOT TO BUILD (scope fence)
No multi-shop SaaS billing, no real payment processing, no native Android app,
no barcode-scanner hardware integration (camera-scan stub OK), no eTIMS API
integration (generate compliant-STYLE receipt data + a settings placeholder),
no real SMS sending (MessageChannel mock), no user-uploaded file storage backend
(store image refs; local object URLs OK in dev). Note each as "future" in README.
 
---
 
## 19. status.md PROTOCOL (update after EVERY work session/phase gate)
```
# DukaOS — Build Status
Updated: <timestamp> | Phase: <P0..P7> | Overall: <x>% 
## ✅ Done (feature → evidence: test/screenshot/route)
## 🔨 In Progress (what + exact next step)
## 📋 Remaining (ordered)
## ⚠️ Known Issues / Tech Debt
## 🔑 Env Vars & Mocks status (what's mocked, how to go live)
## 🗺️ For the Next Agent (architecture map: where things live, how sync works,
    how to run, how to test, gotchas)
```
 
## 20. DEFINITION OF DONE (all must be true before you return to the human)
- [ ] npm install && npm run dev boots the full stack locally; npm run check green
- [ ] All F1–F13 acceptance criteria pass; Playwright smoke green incl. offline test
- [ ] Demo Mode showcases every feature/alert/report with realistic Kenyan data
- [ ] Full Swahili + English UI; dark + light themes flawless
- [ ] Design audit: every screen satisfies §14; zero anti-slop violations
- [ ] Agent executes all §F10 utterances correctly in mock mode
- [ ] status.md, DECISIONS.md, README complete; git history clean & meaningful
- [ ] Final handover note in status.md: what was built, how to demo it in
      5 minutes (a scripted walkthrough), and the go-live checklist
 
Now begin. Read this entire document once more, write your initial plan into
status.md, and start Phase P0.
 
 
We will use the Netlify Frontend hosting and Superbase for Backend just Build the smart and powerful Next-generation App first and the Hosting  will be done when everything is fully completed for now just build the Next-generation smart and powerful App first.
 
NOTE: I will also like you to know that this is a Full-stack mobile App not a WebApp. we are building a mobile App so consider the Mobile User Experience, mobile screen design, UI/UX design, styling, spacing and The Thumbs rule considerations since it is a mobile App not a web App so build the full complete Mobile user experience, convenience use, the thumb can reach any button very simple and easy and everything built in mobile app user experience.
 
You will use these skills in your building:
1. "https://github.com/greensock/gsap-skills.git" 
2. "https://github.com/hamen/material-3-skill.git" 
3. "https://www.skills.sh/code-yeongyu/oh-my-openagent/frontend-ui-ux" & "npx skills add https://github.com/code-yeongyu/oh-my-openagent --skill frontend-ui-ux" 
4. "https://www.skills.sh/github/awesome-copilot/premium-frontend-ui" & "npx skills add https://github.com/github/awesome-copilot --skill premium-frontend-ui" 
5. "https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md"
6. "https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/SKILL.md"
 
(AND ALSO WRITE THE MASTERPROMP AS MARKDOWN FILE SINCE WHEN YOU AUTO-COMPACT YOU WILL LOOSE THE MASTERPROMPT AND IT IS YOUR MAIN REFERENCE SO MAKE SURE ALL THE REFERENCES YOU WILL USE ARE STORED SAFELY SO THAT YOU CHECK EACH TIME YOU ARE BUILDING TO STAY CONSISTENCY AND INSTRUCTION FOLLOWING FROM START TO THE END ADDING YOUR SMARTNESS, COMPETENCE, GENIUS AND YOUR SUPER INTELLIGENCE TO BUILD THE SMART AND POWERFUL NEXT-GENERATION APP THAT WILL BE LIKE MY SYSTEM OFFICE THAT RUNS THE WHOLE COMPANY)
 
Build the Smart and powerful next-generation App system, be smart, use your high-best level effort of intelligence and clever ideas, be creative by adding latest modern premium high quality grade components, animations, scrolling effects and more creative and smart features. After fully complete building the Smart next-generation App, @automatio88 Will Do all the commits and push to github (In the repo i have selected named "automatio88-rgb/DUKA-SYSTEM", @automatio88 will upload the whole of the code to GitHub and Your Job is to Build and provide the quick preview link so that I can test the Next-generation smart and powerful App system myself to check and see if everything is alright and perfectly function both frontend and Backends since it is a full-stack App. Please I want you to do your level best and smartness and build the powerful and smart Next-generation App system.