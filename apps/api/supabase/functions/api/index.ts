/**
 * Duka System API — /api/v1 (§6) as ONE Supabase Edge Function running Hono.
 * All business logic comes from the shared DukaEngine (bundled to ../_shared/duka.js).
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';
import { z } from 'zod';
import {
  verifyPin, hashPin, isValidPin, runAgent, dayFigures, weeklyNarrative, profitTruth, loanPack, cashPosition, missedDemand,
  reminderTemplate, morningBriefing, eveningReport, DomainError, PermissionError, can, buildDemo, type Role,
} from '../_shared/duka.js';
import { sb, withEngine, loadShop, persist, APPEND_ONLY } from './db.ts';
import { llm, channel, MpesaSmsIngestor, DarajaC2BAdapter } from './adapters.ts';

type Auth = { shopId: string; userId: string; role: Role; deviceId: string };
const SECRET = () => Deno.env.get('APP_JWT_SECRET') ?? 'dev-secret-change-me';
const app = new Hono<{ Variables: { auth: Auth } }>().basePath('/api/v1');
app.use('*', cors({ origin: (o) => o ?? '*', allowHeaders: ['authorization', 'content-type', 'x-device-id'], allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }));

app.onError((err, c) => {
  if (err instanceof PermissionError) return c.json({ error: 'forbidden', action: err.action }, 403);
  if (err instanceof DomainError) return c.json({ error: err.code, data: err.data }, 422);
  if (err instanceof z.ZodError) return c.json({ error: 'invalid', issues: err.issues }, 400);
  console.error(err); return c.json({ error: 'server_error' }, 500);
});

// ─── Auth (§F1) ───────────────────────────────────────────────
const attempts = new Map<string, { n: number; until: number }>();
app.post('/auth/setup', async c => {
  const b = z.object({ shop: z.object({ id: z.string().uuid(), name: z.string().min(2), owner_name: z.string().min(2), phone: z.string().optional(), language: z.enum(['en', 'sw']), mpesa_type: z.string() }), owner: z.object({ id: z.string().uuid(), pin: z.string() }), staff: z.object({ id: z.string().uuid(), name: z.string(), pin: z.string() }).optional(), locations: z.array(z.object({ id: z.string().uuid(), name: z.string(), type: z.string() })).optional(), demo: z.boolean().optional() }).parse(await c.req.json());
  if (!isValidPin(b.owner.pin)) return c.json({ error: 'bad_pin' }, 400);
  if (b.demo) {
    const d = await buildDemo(new Date(), { lang: b.shop.language });
    const changes = Object.entries(d.db).flatMap(([table, rows]) => (rows as any[]).map(row => ({ table, row })));
    await persist(d.shopId, changes as any);
    const { data } = await sb().from('shops').select('shop_code').eq('id', d.shopId).single();
    return c.json({ shopId: d.shopId, shopCode: data?.shop_code, ownerId: d.ownerId, staffId: d.staffId });
  }
  const now = new Date().toISOString();
  await sb().from('shops').insert({ ...b.shop, currency: 'KES', settings_json: { reminderDay: 6, reminderMinBalance: 200, busyMode: false, theme: 'dark' } });
  const users = [{ id: b.owner.id, shop_id: b.shop.id, name: b.shop.owner_name, role: 'owner', pin_hash: await hashPin(b.shop.id, b.owner.pin), active: true }];
  if (b.staff && isValidPin(b.staff.pin)) users.push({ id: b.staff.id, shop_id: b.shop.id, name: b.staff.name, role: 'staff', pin_hash: await hashPin(b.shop.id, b.staff.pin), active: true });
  await sb().from('users').insert(users);
  const locs = b.locations?.length ? b.locations.map(l => ({ ...l, shop_id: b.shop.id, created_at: now })) : [{ id: crypto.randomUUID(), shop_id: b.shop.id, name: 'Duka', type: 'shop', created_at: now }, { id: crypto.randomUUID(), shop_id: b.shop.id, name: 'Store', type: 'store', created_at: now }];
  await sb().from('locations').upsert(locs, { onConflict: 'id' });
  const { data } = await sb().from('shops').select('shop_code').eq('id', b.shop.id).single();
  return c.json({ shopId: b.shop.id, shopCode: data?.shop_code });
});
app.post('/auth/pin-login', async c => {
  const b = z.object({ shopCode: z.string().min(3), userId: z.string().uuid(), pin: z.string(), deviceId: z.string().min(1) }).parse(await c.req.json());
  const key = `${b.shopCode}:${b.userId}`; const a = attempts.get(key);
  if (a && a.until > Date.now()) return c.json({ error: 'locked', retryInSec: Math.ceil((a.until - Date.now()) / 1000) }, 429);
  const { data: shop } = await sb().from('shops').select('id').eq('shop_code', b.shopCode.toUpperCase()).single();
  const { data: user } = shop ? await sb().from('users').select('*').eq('id', b.userId).eq('shop_id', shop.id).eq('active', true).single() : { data: null };
  if (!shop || !user || !(await verifyPin(shop.id, b.pin, user.pin_hash))) {
    const n = (a?.n ?? 0) + 1; attempts.set(key, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 });
    return c.json({ error: 'wrong_pin' }, 401);
  }
  attempts.delete(key);
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  // role: 'authenticated' + shop_id claim → the same token works for Supabase RLS reads when APP_JWT_SECRET = project JWT secret
  const token = await sign({ sub: user.id, role: 'authenticated', app_role: user.role, shop_id: shop.id, device_id: b.deviceId, exp }, SECRET());
  return c.json({ token, exp, user: { id: user.id, name: user.name, role: user.role }, shopId: shop.id });
});

// ─── JWT guard ───────────────────────────────────────────────
app.use('*', async (c, next) => {
  const p = c.req.path;
  if (p.endsWith('/auth/pin-login') || p.endsWith('/auth/setup') || p.includes('/webhooks/') || p.endsWith('/payments/sms-webhook') || p.endsWith('/health')) return next();
  const h = c.req.header('authorization') ?? '';
  try { const t: any = await verify(h.replace(/^Bearer /, ''), SECRET()); c.set('auth', { shopId: t.shop_id, userId: t.sub, role: t.app_role, deviceId: t.device_id }); }
  catch { return c.json({ error: 'unauthorized' }, 401); }
  return next();
});
app.get('/health', c => c.json({ ok: true, llm: llm().name, ts: new Date().toISOString() }));

// ─── Generic read (CRUD reads; writes go through purpose-built routes or /sync) ─
const READABLE = new Set(['products', 'categories', 'customers', 'suppliers', 'purchases', 'purchase_items', 'sales', 'sale_items', 'credit_ledger', 'stock_levels', 'stock_batches', 'stock_moves', 'payments_inbox', 'cash_sessions', 'expenses', 'alerts', 'reminders', 'demand_log', 'stock_counts', 'locations', 'users', 'price_history']);
const OWNER_ONLY = new Set(['price_history', 'expenses', 'cash_sessions', 'purchases', 'purchase_items']);
app.get('/:entity', async c => {
  const e = c.req.param('entity'); const a = c.get('auth');
  if (!READABLE.has(e)) return c.notFound();
  if (OWNER_ONLY.has(e) && a.role !== 'owner') return c.json({ error: 'forbidden' }, 403);
  const cols = e === 'users' ? 'id,name,role,active' : '*';
  const { data, error } = await sb().from(e).select(cols).eq('shop_id', a.shopId).is('deleted_at', null).limit(5000);
  if (error) throw error;
  // Staff never receive cost prices (§8)
  if (e === 'products' && a.role !== 'owner') return c.json((data as any[]).map(({ cost_price: _c, ...r }) => r));
  return c.json(data);
});

// ─── Sales (§F3) — idempotent by client id, accepts offline batches ─
const SaleIn = z.object({ id: z.string().uuid(), lines: z.array(z.object({ productId: z.string().uuid(), qty: z.number().positive(), tier: z.enum(['regular', 'loyal', 'wholesale']).optional() })), payment: z.object({ method: z.enum(['cash', 'mpesa', 'credit', 'split']), cash: z.number().optional(), mpesa: z.number().optional(), credit: z.number().optional(), customerId: z.string().uuid().nullish() }), discount: z.number().optional(), busyLump: z.number().optional(), offlineAt: z.string().optional() });
app.post('/sales', async c => {
  const body = await c.req.json(); const batch = z.array(SaleIn).parse(Array.isArray(body) ? body : [body]);
  const out = await withEngine(c.get('auth'), e => batch.map(s => e.sell(s.lines, s.payment, { id: s.id, discount: s.discount, busyLump: s.busyLump, offlineAt: s.offlineAt })));
  return c.json(out.map(r => ({ id: r.sale.id, total: r.sale.total, warnings: r.warnings })));
});
app.post('/sales/:id/void', async c => { await withEngine(c.get('auth'), e => e.voidSale(c.req.param('id'))); return c.json({ ok: true }); });

// ─── Sync (§13) ───────────────────────────────────────────────
const SYNCABLE = new Set(['locations', 'products', 'categories', 'customers', 'suppliers', 'purchases', 'purchase_items', 'price_history', 'sales', 'sale_items', 'credit_ledger', 'stock_moves', 'stock_batches', 'payments_inbox', 'cash_sessions', 'expenses', 'stock_counts', 'stock_count_items', 'demand_log', 'agent_messages', 'alerts', 'reminders', 'audit_log', 'shops', 'users']);
const Op = z.object({ id: z.string().uuid(), device_id: z.string(), entity: z.string(), entity_id: z.string().uuid(), op: z.enum(['upsert', 'delete']), payload_json: z.record(z.any()), client_ts: z.string() });
app.post('/sync/push', async c => {
  const a = c.get('auth'); const { ops } = z.object({ ops: z.array(Op).max(500) }).parse(await c.req.json());
  const valid = ops.filter(o => SYNCABLE.has(o.entity) && (a.role === 'owner' || !['shops', 'users', 'price_history', 'purchases', 'purchase_items'].includes(o.entity)));
  // 1) dedupe by op id: only ops that insert into the oplog are applied
  const { data: fresh, error } = await sb().from('sync_oplog').upsert(valid.map(o => ({ ...o, shop_id: a.shopId })), { onConflict: 'id', ignoreDuplicates: true }).select('id');
  if (error) throw error;
  const freshIds = new Set((fresh ?? []).map((r: any) => r.id));
  const apply = valid.filter(o => freshIds.has(o.id));
  // 2) apply in client order; append-only tables never overwrite; stock_levels + balance_after are re-derived by DB triggers
  const byTable = new Map<string, any[]>();
  for (const o of apply) { const row = o.op === 'delete' ? { id: o.entity_id, deleted_at: new Date().toISOString() } : { ...o.payload_json, id: o.entity_id }; if (o.entity !== 'shops') row.shop_id = a.shopId; if (!byTable.has(o.entity)) byTable.set(o.entity, []); byTable.get(o.entity)!.push(row); }
  const ORDER = ['shops', 'users', 'locations', 'categories', 'products', 'customers', 'suppliers', 'purchases', 'purchase_items', 'price_history', 'sales', 'sale_items', 'credit_ledger', 'stock_moves', 'stock_batches', 'payments_inbox', 'cash_sessions', 'expenses', 'stock_counts', 'stock_count_items', 'demand_log', 'agent_messages', 'alerts', 'reminders', 'audit_log'];
  for (const t of ORDER) {
    const rows = byTable.get(t); if (!rows) continue;
    const { error: e2 } = await sb().from(t).upsert(rows, { onConflict: 'id', ignoreDuplicates: APPEND_ONLY.has(t) });
    if (e2) { await sb().from('sync_oplog').delete().in('id', [...freshIds]); throw new Error(`${t}: ${e2.message}`); }
  }
  const { data: cur } = await sb().from('sync_oplog').select('seq').eq('shop_id', a.shopId).order('seq', { ascending: false }).limit(1);
  return c.json({ applied: apply.length, skipped: ops.length - apply.length, cursor: cur?.[0]?.seq ?? 0 });
});
app.get('/sync/pull', async c => {
  const a = c.get('auth'); const since = Number(c.req.query('since') ?? 0);
  const { data, error } = await sb().from('sync_oplog').select('seq,entity,entity_id,op,payload_json,device_id').eq('shop_id', a.shopId).gt('seq', since).neq('device_id', a.deviceId).order('seq').limit(1000);
  if (error) throw error;
  const ops = a.role === 'owner' ? data : (data ?? []).map((o: any) => o.entity === 'products' ? { ...o, payload_json: { ...o.payload_json, cost_price: undefined } } : o).filter((o: any) => !['price_history', 'expenses', 'cash_sessions', 'audit_log'].includes(o.entity));
  return c.json({ ops, cursor: data?.length ? data[data.length - 1].seq : since });
});

// ─── M-Pesa (§F5) ─────────────────────────────────────────────
app.post('/payments/sms-webhook', async c => {
  // Called by an SMS-forwarder app on the owner's phone. Auth: shared secret per shop.
  const b = z.object({ text: z.string().min(10), shopId: z.string().uuid(), secret: z.string() }).parse(await c.req.json());
  if (b.secret !== Deno.env.get('SMS_WEBHOOK_SECRET')) return c.json({ error: 'unauthorized' }, 401);
  const text = new MpesaSmsIngestor().toSmsText(b.text); if (!text) return c.json({ error: 'not_mpesa' }, 422);
  const { data: owner } = await sb().from('users').select('id').eq('shop_id', b.shopId).eq('role', 'owner').limit(1).single();
  const r = await withEngine({ shopId: b.shopId, userId: owner!.id, role: 'owner', deviceId: 'sms-webhook' }, e => e.ingestSms(text, 'sms'));
  return c.json({ status: r.payment.status, match: r.match, flags: r.flags });
});
app.post('/payments/paste', async c => { const { text } = z.object({ text: z.string() }).parse(await c.req.json()); const r = await withEngine(c.get('auth'), e => e.ingestSms(text, 'manual')); return c.json({ status: r.payment.status, match: r.match, flags: r.flags, payment: r.payment }); });
app.post('/payments/:id/assign', async c => { const b = z.object({ customerId: z.string().uuid().optional(), saleId: z.string().uuid().optional() }).parse(await c.req.json()); await withEngine(c.get('auth'), e => e.assignPayment(c.req.param('id'), b)); return c.json({ ok: true }); });
app.post('/webhooks/daraja/c2b/:shopId', async c => {
  const text = new DarajaC2BAdapter().toSmsText(await c.req.json()); if (!text) return c.json({ ResultCode: 1, ResultDesc: 'Rejected' });
  const shopId = c.req.param('shopId'); const { data: owner } = await sb().from('users').select('id').eq('shop_id', shopId).eq('role', 'owner').limit(1).single();
  await withEngine({ shopId, userId: owner!.id, role: 'owner', deviceId: 'daraja' }, e => e.ingestSms(text, 'daraja'));
  return c.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

// ─── Inventory & purchases (§F2, §F7) ────────────────────────
app.post('/transfers', async c => { const b = z.object({ productId: z.string().uuid(), qty: z.number().positive(), from: z.enum(['store', 'shop']).default('store'), note: z.string().optional() }).parse(await c.req.json()); const m = await withEngine(c.get('auth'), e => e.transfer(b.productId, b.qty, b.from, b.note)); return c.json(m); });
app.post('/purchases', async c => { const b = z.object({ supplierId: z.string().uuid(), items: z.array(z.object({ productId: z.string().uuid(), qtyBuy: z.number().positive(), costPerBuy: z.number().nonnegative(), expiry: z.string().optional() })), invoiceNo: z.string().optional(), paid: z.number().optional(), dueDate: z.string().optional() }).parse(await c.req.json()); const p = await withEngine(c.get('auth'), e => e.createPurchase(b.supplierId, b.items, b)); return c.json(p); });
app.post('/purchases/:id/receive', async c => { const p = await withEngine(c.get('auth'), e => e.receivePurchase(c.req.param('id'))); return c.json(p); });
app.post('/purchases/draft', async c => { const p = await withEngine(c.get('auth'), e => e.draftOrder()); return c.json(p ?? { none: true }); });

// ─── Reports (§F9) — owner only ───────────────────────────────
const ownerOnly = async (c: any, next: any) => (can(c.get('auth').role, 'reports') ? next() : c.json({ error: 'forbidden' }, 403));
const ro = async <T>(a: Auth, fn: (e: any) => T) => { const { DukaEngine } = await import('../_shared/duka.js'); return fn(new DukaEngine(await loadShop(a.shopId), a)); };
app.get('/reports/daily', ownerOnly, async c => c.json(await ro(c.get('auth'), e => dayFigures(e, c.req.query('date') ?? undefined))));
app.get('/reports/weekly', ownerOnly, async c => c.json(await ro(c.get('auth'), e => ({ ...weeklyNarrative(e, (c.req.query('lang') as any) ?? e.shop.language), missed: missedDemand(e) }))));
app.get('/reports/profit', ownerOnly, async c => c.json(await ro(c.get('auth'), e => { const p = profitTruth(e); return { ...p, top: p.top.map(r => ({ name: r.p.name, profit: r.profit, margin: r.margin, revenue: r.revenue })), wasters: p.wasters.map(r => ({ name: r.p.name, capital: r.capital, profit: r.profit })) }; })));
app.get('/reports/dead-stock', ownerOnly, async c => c.json(await ro(c.get('auth'), e => e.deadStock().map((d: any) => ({ name: d.p.name, qty: d.qty, frozen: d.frozen, lastSold: d.last })))));
app.get('/reports/expiry', ownerOnly, async c => c.json(await ro(c.get('auth'), e => e.expiring(30).map((x: any) => ({ name: x.p.name, qty: x.b.qty, days: x.days, location: x.location, suggestedPrice: x.discount.price })))));
app.get('/reports/cash-position', ownerOnly, async c => c.json(await ro(c.get('auth'), e => cashPosition(e))));
app.get('/reports/loan-pack', ownerOnly, async c => c.json(await ro(c.get('auth'), e => ({ shop: e.shop.name, owner: e.shop.owner_name, generatedAt: new Date().toISOString(), ...loanPack(e) }))));

// ─── Agent (§F10) ─────────────────────────────────────────────
app.post('/agent/message', async c => {
  const a = c.get('auth'); const { text } = z.object({ text: z.string().min(1).max(500) }).parse(await c.req.json());
  const r = await withEngine(a, async e => { e.put('agent_messages', { channel: 'inapp', direction: 'in', body: text, user_id: a.userId } as any); const res = await runAgent(e, text, llm()); e.put('agent_messages', { channel: 'inapp', direction: 'out', body: res.reply, intent: res.call.tool, tool_calls_json: res.call } as any); return res; });
  return c.json({ reply: r.reply, tool: r.call.tool, args: r.call.args, ok: r.ok });
});
// WhatsApp Cloud webhook: verify + inbound messages from the OWNER's number → Duka Brain → reply on WhatsApp
app.get('/webhooks/whatsapp', c => (c.req.query('hub.verify_token') === Deno.env.get('WA_VERIFY_TOKEN') ? c.text(c.req.query('hub.challenge') ?? '') : c.text('forbidden', 403)));
app.post('/webhooks/whatsapp', async c => {
  const body: any = await c.req.json(); const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]; if (!msg?.text?.body) return c.json({ ok: true });
  const from = '0' + String(msg.from).slice(-9);
  const { data: user } = await sb().from('users').select('id,shop_id,role').eq('phone', from).eq('active', true).limit(1).single(); if (!user) return c.json({ ok: true });
  const auth = { shopId: user.shop_id, userId: user.id, role: user.role, deviceId: 'whatsapp' } as Auth;
  const r = await withEngine(auth, e => runAgent(e, msg.text.body, llm()));
  await channel(async () => {}).send({ to: from, body: r.reply, shopId: auth.shopId, kind: 'agent' });
  return c.json({ ok: true });
});

// ─── Jobs (lazy, no cron dependency) ──────────────────────────
async function runJobs(a: Auth) {
  const sent: string[] = [];
  await withEngine(a, async e => {
    e.tick({ reminder: reminderTemplate(e.shop.name), briefing: morningBriefing, evening: eveningReport }).forEach(ch => (e as any).changes?.push?.(ch));
    const ch = channel(async m => { e.put('agent_messages', { channel: 'inapp', direction: 'out', body: `[${m.kind}${m.to ? ' → ' + m.to : ''}] ${m.body}` } as any); });
    for (const r of e.db.reminders.filter((r: any) => r.status === 'queued')) {
      const cust = e.db.customers.find((c: any) => c.id === r.customer_id);
      const res = await ch.send({ to: cust?.phone, body: r.message, shopId: a.shopId, kind: 'reminder' });
      if (res.ok) { e.put('reminders', { id: r.id, status: 'sent', sent_at: new Date().toISOString() } as any); sent.push(r.id); }
    }
  });
  return { remindersSent: sent.length };
}
app.get('/jobs/tick', async c => c.json(await runJobs(c.get('auth'))));
app.post('/jobs/run/:jobName', ownerOnly, async c => {
  const a = c.get('auth'); const job = c.req.param('jobName');
  if (job === 'reconcile') { await sb().rpc('rebuild_stock_levels', { p_shop: a.shopId }); return c.json({ ok: true, job }); }
  return c.json({ ok: true, job, ...(await runJobs(a)) });
});

Deno.serve(app.fetch);
