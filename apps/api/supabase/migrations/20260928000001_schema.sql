-- DukaOS schema (§5). Client-generatable UUIDs, soft delete, updated_by on every table.
-- Money: numeric(12,2) (integer shillings in practice; cost per sell-unit may carry cents).
create extension if not exists pgcrypto;

create type role_t as enum ('owner','staff');
create type location_t as enum ('shop','store');
create type move_reason_t as enum ('purchase','sale','transfer','adjustment','expiry_writeoff','count_correction');
create type pay_method_t as enum ('cash','mpesa','credit','split');
create type tier_t as enum ('regular','loyal','wholesale');

create table shops (
  id uuid primary key, name text not null, owner_name text not null, phone text, currency text not null default 'KES',
  language text not null default 'sw', mpesa_type text not null default 'till', settings_json jsonb not null default '{}'::jsonb,
  shop_code text unique default upper(substr(md5(random()::text),1,6)),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid
);

-- Common columns macro (repeated for clarity; Postgres has no table inheritance we want here)
create table users (id uuid primary key, shop_id uuid not null references shops(id), name text not null, phone text, role role_t not null, pin_hash text not null, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid);
create table locations (id uuid primary key, shop_id uuid not null references shops(id), name text not null, type location_t not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid);
create table categories (id uuid primary key, shop_id uuid not null references shops(id), name text not null, sort int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid);
create table products (id uuid primary key, shop_id uuid not null references shops(id), category_id uuid references categories(id), name text not null, name_sw text, barcode text, image_url text,
  buy_unit text not null, sell_unit text not null, units_per_buy_unit numeric(12,3) not null default 1, wastage_pct numeric(5,2) not null default 0,
  cost_price numeric(12,2) not null default 0, retail_price numeric(12,2) not null, wholesale_price numeric(12,2), loyal_price numeric(12,2),
  reorder_level numeric(12,3) not null default 0, track_expiry boolean not null default false, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid);
create index on products(shop_id); create index on products(barcode);
create table stock_levels (id uuid primary key default gen_random_uuid(), shop_id uuid not null references shops(id), product_id uuid not null references products(id), location_id uuid not null references locations(id), qty numeric(12,3) not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid, unique(product_id, location_id));
create table stock_batches (id uuid primary key, shop_id uuid not null references shops(id), product_id uuid not null references products(id), location_id uuid not null references locations(id), qty numeric(12,3) not null, expiry_date date not null, purchase_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid);
create table stock_moves (id uuid primary key, shop_id uuid not null references shops(id), product_id uuid not null references products(id), from_location uuid references locations(id), to_location uuid references locations(id), qty numeric(12,3) not null check (qty >= 0),
  reason move_reason_t not null, ref_id uuid, note text, user_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid);
create index on stock_moves(shop_id, product_id);
create table suppliers (id uuid primary key, shop_id uuid not null references shops(id), name text not null, phone text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid);
create table purchases (id uuid primary key, shop_id uuid not null references shops(id), supplier_id uuid references suppliers(id), invoice_no text, invoice_image_url text, total_cost numeric(12,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','received')), paid_amount numeric(12,2) not null default 0, due_date date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid);
create table purchase_items (id uuid primary key, shop_id uuid not null references shops(id), purchase_id uuid not null references purchases(id), product_id uuid not null references products(id), qty_buy_units numeric(12,3) not null, cost_per_buy_unit numeric(12,2) not null, expiry_date date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid);
create table price_history (id uuid primary key, shop_id uuid not null references shops(id), product_id uuid not null references products(id), supplier_id uuid references suppliers(id), cost_price numeric(12,2) not null, recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid);
create table customers (id uuid primary key, shop_id uuid not null references shops(id), name text not null, phone text, credit_limit numeric(12,2), notes text, tier tier_t not null default 'regular',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid);
create table sales (id uuid primary key, shop_id uuid not null references shops(id), user_id uuid, customer_id uuid references customers(id), total numeric(12,2) not null, discount numeric(12,2) not null default 0,
  status text not null default 'complete' check (status in ('complete','void')), payment_method pay_method_t not null,
  mpesa_amount numeric(12,2) not null default 0, cash_amount numeric(12,2) not null default 0, credit_amount numeric(12,2) not null default 0,
  device_id text, offline_created_at timestamptz not null, busy_lump boolean not null default false, reconciled boolean not null default true, mpesa_pending boolean not null default false, void_of uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid);
create index on sales(shop_id, offline_created_at);
create table sale_items (id uuid primary key, shop_id uuid not null references shops(id), sale_id uuid not null references sales(id), product_id uuid not null references products(id), qty numeric(12,3) not null, unit_price numeric(12,2) not null, unit_cost_snapshot numeric(12,2) not null, price_tier tier_t not null default 'regular',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid);
create table credit_ledger (id uuid primary key, shop_id uuid not null references shops(id), customer_id uuid not null references customers(id), type text not null check (type in ('charge','payment','adjustment')),
  amount numeric(12,2) not null, balance_after numeric(12,2) not null default 0, sale_id uuid, note text, method text, user_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid);
create index on credit_ledger(customer_id, created_at);
create table reminders (id uuid primary key, shop_id uuid not null references shops(id), customer_id uuid not null references customers(id), channel text not null, message text not null, scheduled_at timestamptz not null, sent_at timestamptz,
  status text not null default 'queued', escalation_level int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid);
create table payments_inbox (id uuid primary key, shop_id uuid not null references shops(id), source text not null check (source in ('sms','daraja','manual')), raw_text text, mpesa_code text, payer_name text, payer_phone text,
  amount numeric(12,2) not null, tx_time timestamptz not null, matched_sale_id uuid, matched_customer_id uuid, status text not null check (status in ('unmatched','matched','suspicious','ignored')), flag text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid);
create index on payments_inbox(shop_id, mpesa_code);
create table cash_sessions (id uuid primary key, shop_id uuid not null references shops(id), user_id uuid, opened_at timestamptz not null, closed_at timestamptz, opening_float numeric(12,2) not null, expected_cash numeric(12,2) not null default 0,
  counted_cash numeric(12,2), variance numeric(12,2), note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid);
create table expenses (id uuid primary key, shop_id uuid not null references shops(id), category text not null, amount numeric(12,2) not null, note text, user_id uuid, session_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid);
create table stock_counts (id uuid primary key, shop_id uuid not null references shops(id), location_id uuid references locations(id), section_name text not null, status text not null default 'open', user_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid);
create table stock_count_items (id uuid primary key, shop_id uuid not null references shops(id), count_id uuid not null references stock_counts(id), product_id uuid not null references products(id), expected_qty numeric(12,3) not null, counted_qty numeric(12,3) not null default 0, variance numeric(12,3) not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid);
create table demand_log (id uuid primary key, shop_id uuid not null references shops(id), text text not null, product_guess text, user_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid);
create table agent_messages (id uuid primary key, shop_id uuid not null references shops(id), channel text not null, direction text not null check (direction in ('in','out')), body text not null, intent text, tool_calls_json jsonb, user_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid);
create table alerts (id uuid primary key, shop_id uuid not null references shops(id), type text not null, severity text not null, title text not null, body text not null, data_json jsonb, read_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid);
create table audit_log (id uuid primary key, shop_id uuid not null references shops(id), user_id uuid, action text not null, entity text not null, entity_id uuid, before_json jsonb, after_json jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, updated_by uuid);
create table sync_oplog (seq bigserial unique, id uuid primary key, shop_id uuid not null references shops(id), device_id text not null, entity text not null, entity_id uuid not null, op text not null check (op in ('upsert','delete')),
  payload_json jsonb not null, client_ts timestamptz not null, server_ts timestamptz not null default now());
create index on sync_oplog(shop_id, seq);
