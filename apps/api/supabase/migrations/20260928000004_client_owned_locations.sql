-- The phone creates its own Duka/Store location ids offline. /auth/setup also seeds two defaults.
-- When the client's location of the same type syncs in, retire the unused server default so there is
-- exactly one live location per (shop, type) and stock moves reference the client's ids.
create or replace function retire_duplicate_location() returns trigger language plpgsql as $$
begin
  update locations l set deleted_at = now()
   where l.shop_id = new.shop_id and l.type = new.type and l.id <> new.id and l.deleted_at is null
     and not exists (select 1 from stock_moves m where m.from_location = l.id or m.to_location = l.id);
  return new;
end $$;
create trigger trg_location_dedupe after insert on locations for each row execute function retire_duplicate_location();
