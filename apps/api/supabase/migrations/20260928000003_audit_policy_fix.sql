-- Policies are OR'd: the generic shop_read on audit_log would let staff read it. Owner-only.
drop policy if exists shop_read on audit_log;
