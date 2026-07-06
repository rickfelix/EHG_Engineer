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
- Recurring inconsistency: estate `search_path` pinning has **14 distinct forms**,
  and none of the common ones position `pg_temp` explicitly last — the actual
  hardening that matters for definer functions (unless positioned, `pg_temp` is
  implicitly searched FIRST for relations; CVE-2018-1058 class). Several estate
  definer precedents also never revoke PUBLIC EXECUTE and one authorizes on
  `current_user` (dead code inside a definer). This reference is the corrective,
  not a citation of existing estate practice.
- Process: DDL is chairman-gated (`requires_chairman_apply` pre-flagged at sourcing);
  migrations stage with a DOWN stanza and apply at a cutover, never on merge.

**Task shape a delegate will face**: create a governed table + its gated RPC for a
new entity (different names, possibly a different validation surface), preserving
every invariant in the application guide.
