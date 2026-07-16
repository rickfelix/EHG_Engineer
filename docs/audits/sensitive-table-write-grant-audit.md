# Sensitive-table write-grant audit (defense-in-depth REVOKE)

**SD:** SD-LEO-INFRA-GOV-TABLE-WRITE-GRANT-REVOKE-001 (F7 security, coordinator-directed)
**Date:** 2026-07-16
**Class:** GRANT-layer over-permissioning — anon/authenticated hold redundant write grants; RLS is the sole barrier.

## Finding (live-grounded, pg_class.relacl 2026-07-16)

All 6 chairman-authority / kill-switch tables carry the Supabase-default base grant
`anon = arwdDxtm` **and** `authenticated = arwdDxtm` — i.e. both roles hold **INSERT, UPDATE,
DELETE, TRUNCATE** (plus SELECT/REFERENCES/TRIGGER/MAINTAIN) at the GRANT layer. **RLS is ENABLED on
all 6** (relrowsecurity=true) and is the **sole** write barrier. A single RLS misconfig/policy bug
would expose these tables to anon writes.

| Table | anon write | authenticated write | write RLS policy |
|-------|-----------|---------------------|------------------|
| protocol_constitution | I/U/D/T | I/U/D/T | deny-for-public (no_update/no_delete USING false); service_role bypass |
| leo_feature_flags | I/U/D/T | I/U/D/T | service_role-only (leo_feature_flags_service_role_all) |
| eva_vision_documents | I/U/D/T | I/U/D/T | service_role-only (eva_vision_docs_service_role_all) |
| chairman_decisions | I/U/D/T | I/U/D/T | service_role-only (service_role_all_chairman_decisions) |
| ventures_kill_log | I/U/D/T | I/U/D/T | no permissive write policy → deny (service_role bypass) |
| chairman_directives | I/U/D/T | I/U/D/T | service_role-only + **authenticated INSERT/UPDATE WITH CHECK fn_is_chairman()** |

## Fix — table-specific REVOKE (belt-and-suspenders; RLS unchanged; service_role untouched)

- **FR-1** (protocol_constitution, leo_feature_flags, eva_vision_documents, chairman_decisions, ventures_kill_log):
  `REVOKE INSERT, UPDATE, DELETE, TRUNCATE FROM anon, authenticated`. **Non-breaking** — their write RLS is
  service_role-only / deny-for-public, so no legitimate anon/authenticated write path exists. SELECT kept.
- **FR-2** chairman_directives: it HAS a legitimate authenticated write path (`chairman_directives_insert` /
  `_update`, WITH CHECK `fn_is_chairman()`). GRANT is checked **before** RLS, so a blanket revoke would break
  the chairman app. Instead: `REVOKE INSERT,UPDATE,DELETE,TRUNCATE FROM anon`;
  `REVOKE DELETE,TRUNCATE FROM authenticated`; **KEEP** authenticated INSERT,UPDATE.

## FR-3 — dependency cross-reference

chairman_directives (and every `fn_is_chairman`-gated write) inherits the `fn_is_chairman`
user_metadata privilege-escalation closed by **SD-LEO-INFRA-FN-IS-CHAIRMAN-APP-METADATA-001**
(completed this session, staged). That SD hardens the **identity** layer (authorize off
`raw_app_meta_data`); this SD hardens the **GRANT** layer. Together they close the surface:
a self-elevated user still can't reach chairman_directives (identity), and an RLS bypass still
can't write the 5 no-writer tables (grant). The two migrations are **independent** — either apply
order is safe.

## FR-4 — standing guard

`tests/security/sensitive-table-grants-guard.sql` RAISEs if any anon/authenticated write grant
(INSERT/UPDATE/DELETE/TRUNCATE) exists on the 6 tables except the chairman_directives authenticated
INSERT/UPDATE carve-out — catching a future migration or Supabase default re-grant. **Pre-apply it
correctly RAISEs** (all 6 tables currently fully write-granted); post-apply it PASSES.

## Apply / rollback

- **Apply authority:** CHAIRMAN-ONLY / non-delegatable (REVOKE = access-control / permission change,
  fail-closed). Migration is STAGED (`requires-chairman-apply`, no `@approved-by`). Build worker stages;
  chairman applies.
- **Rollback (chairman-gated):** re-GRANT the exact revoked privileges per table if a legitimate
  anon/authenticated write path is ever found (none exists today). service_role is never touched.
