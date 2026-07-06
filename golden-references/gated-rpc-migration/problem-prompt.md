# Problem — gated RPC + staged migration pair

**Domain**: a venture needs a *gated write path*: clients may never INSERT directly
into a governed table; every write goes through one RPC that validates arguments,
enforces authorization, and returns a verifiable result. The schema change that
introduces the table + RPC ships as a **staged, chairman-gated migration** (never
auto-applied).

**Reuse evidence** (why this domain earned a golden reference):
- Recurring bug class: `supabase-js` **silently swallows CHECK/enum violations** on
  insert/update — writes appear to succeed while the row never lands. The estate has
  shipped multiple fixes for this exact class.
- Recurring surprise: `SECURITY DEFINER` functions **bypass RLS** on every table they
  touch — a policy on the table does not protect a definer function's writes.
- Recurring inconsistency: estate `search_path` pinning has **14 distinct forms**; the
  most common (`SET search_path = public`) is *weaker* than the hardened remediation
  lineage (`''` / `pg_catalog, public`) introduced by
  `database/migrations/20251216_fix_security_definer_views.sql`.
- Process: DDL is chairman-gated (`requires_chairman_apply` pre-flagged at sourcing);
  migrations stage with a DOWN stanza and apply at a cutover, never on merge.

**Task shape a delegate will face**: create a governed table + its gated RPC for a
new entity (different names, possibly a different validation surface), preserving
every invariant in the application guide.
