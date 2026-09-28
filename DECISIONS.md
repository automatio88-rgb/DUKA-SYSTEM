# DECISIONS.md

See commit history for D1–D20 detail. Summary:
- D1 Supabase (Postgres+RLS+Hono edge function) replaces Workers/D1. D2 Netlify hosting.
- D3 Mobile app = installable PWA + Capacitor Android shell; phone-frame layout, bottom nav, bottom sheets, 48dp+ targets.
- D4 One shared DukaEngine runs offline on the phone, on the server and in tests.
- D5 Stock never stored client-side; derived from moves; server trigger keeps stock_levels.
- D6 Integer shillings. D7 Primary "deep ink orange" = #D9480F. D8 Dark default.
- D9 Framer Motion for state motion, GSAP for counters/report reveals. D10 Material 3 ergonomics, hand-rolled shadcn-style primitives.
- D11 Loan pack merges live months with 5 months of notebook history. D12 Busy-mode COGS estimated at trailing margin.
- D13 M-Pesa match order: phone → pending sale amount±15min → name+balance. D14 M-Pesa POS sales stay pending until SMS confirms.
- D15 SHA-256 PIN hash + 5-try lockout + 12h JWT (role authenticated + shop_id claim for RLS). D16 Reminder tone by days since last payment (14/30).
- D17 Tests executed in sandbox via Node 22 vitest shim (92/92); CI runs Vitest.
- D18 3D scene lazy + SVG fallback (≤4 cores / no WebGL / reduced motion). D19 Airtime as products. D20 Preview = Netlify deploy (sandbox had no network to host).
- D21 CI workflow shipped in docs/ (token lacked `workflow` scope).
- D22 Duka Brain runs locally (mock parser) by default so it works offline; `VITE_REMOTE_BRAIN=1` routes to the API/LLM.
- D23 Server default locations are retired by trigger when the phone's own location ids sync in.
- D24 On-device `tick()` on login/focus replaces cron for alerts, reminders, briefings.
- D25 Reminders sent via WhatsApp share link (wa.me) from the phone until WhatsApp Cloud keys exist.
