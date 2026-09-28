-- Invariants (§5) enforced in the database, plus Row Level Security by shop.

-- 1) stock_levels always equals Σ stock_moves (maintained by trigger, never written by clients)
create or replace function apply_stock_move() returns trigger language plpgsql as $$
begin
  if new.deleted_at is not null then return new; end if;
  if new.to_location is not null then
    insert into stock_levels(shop_id, product_id, location_id, qty) values (new.shop_id, new.product_id, new.to_location, new.qty)
    on conflict (product_id, location_id) do update set qty = stock_levels.qty + excluded.qty, updated_at = now();
  end if;
  if new.from_location is not null then
    insert into stock_levels(shop_id, product_id, location_id, qty) values (new.shop_id, new.product_id, new.from_location, -new.qty)
    on conflict (product_id, location_id) do update set qty = stock_levels.qty - new.qty, updated_at = now();
  end if;
  return new;
end $$;
create trigger trg_stock_move after insert on stock_moves for each row execute function apply_stock_move();

-- Full rebuild (used by /jobs/run/reconcile and after bulk imports)
create or replace function rebuild_stock_levels(p_shop uuid) returns void language sql as $$
  delete from stock_levels where shop_id = p_shop;
  insert into stock_levels(shop_id, product_id, location_id, qty)
  select p_shop, product_id, loc, sum(q) from (
    select product_id, to_location loc, qty q from stock_moves where shop_id = p_shop and to_location is not null and deleted_at is null
    union all select product_id, from_location, -qty from stock_moves where shop_id = p_shop and from_location is not null and deleted_at is null
  ) m group by product_id, loc;
$$;

-- 2) credit_ledger.balance_after is recomputed server-side for the whole customer chain
create or replace function recompute_ledger() returns trigger language plpgsql as $$
begin
  update credit_ledger l set balance_after = s.bal from (
    select id, sum(case type when 'charge' then amount when 'payment' then -amount else amount end)
      over (order by created_at, id rows unbounded preceding) bal
    from credit_ledger where customer_id = new.customer_id and deleted_at is null
  ) s where l.id = s.id and l.balance_after is distinct from s.bal;
  return null;
end $$;
create trigger trg_ledger after insert on credit_ledger for each row execute function recompute_ledger();

-- 3) sales are immutable: only status → void, mpesa_pending, reconciled may change
create or replace function guard_sale_update() returns trigger language plpgsql as $$
begin
  if new.total <> old.total or new.cash_amount <> old.cash_amount or new.mpesa_amount <> old.mpesa_amount or new.credit_amount <> old.credit_amount then
    raise exception 'sales are immutable; void and re-ring instead';
  end if;
  return new;
end $$;
create trigger trg_sale_guard before update on sales for each row execute function guard_sale_update();

-- 4) append-only ledgers
create or replace function forbid_update() returns trigger language plpgsql as $$ begin raise exception '% is append-only', tg_table_name; end $$;
create trigger trg_moves_ro before update on stock_moves for each row when (old.deleted_at is not distinct from new.deleted_at) execute function forbid_update();

-- 5) touch updated_at
create or replace function touch() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['shops','users','locations','categories','products','stock_batches','suppliers','purchases','customers','reminders','payments_inbox','cash_sessions','stock_counts','stock_count_items','alerts'] loop
    execute format('create trigger trg_touch_%1$s before update on %1$s for each row execute function touch()', t);
  end loop;
end $$;

-- 6) RLS: every table is scoped to the shop_id claim in the PIN-session JWT (signed with the project JWT secret).
create or replace function current_shop() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'shop_id', '')::uuid $$;
create or replace function current_role_is_owner() returns boolean language sql stable as $$ select coalesce(auth.jwt() ->> 'app_role', '') = 'owner' $$;
do $$ declare t text; begin
  foreach t in array array['users','locations','categories','products','stock_levels','stock_batches','stock_moves','suppliers','purchases','purchase_items','price_history','customers','sales','sale_items','credit_ledger','reminders','payments_inbox','cash_sessions','expenses','stock_counts','stock_count_items','demand_log','agent_messages','alerts','audit_log','sync_oplog'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy shop_read on %I for select using (shop_id = current_shop())', t);
    execute format('create policy shop_write on %I for insert with check (shop_id = current_shop())', t);
  end loop;
end $$;
alter table shops enable row level security;
create policy shop_self on shops for select using (id = current_shop());
-- Owner-only visibility of money internals for staff sessions (defence in depth; the UI hides them too)
create policy owner_audit on audit_log for select using (shop_id = current_shop() and current_role_is_owner());
