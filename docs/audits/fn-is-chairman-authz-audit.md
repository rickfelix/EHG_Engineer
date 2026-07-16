# Authorization Audit — `raw_user_meta_data` privilege escalation

**SD:** SD-LEO-INFRA-FN-IS-CHAIRMAN-APP-METADATA-001 (SECURITY-CRITICAL, coordinator-sourced)
**Date:** 2026-07-16
**Auditor:** fleet worker Alpha (opus/xhigh), EXEC phase
**Class:** authenticated-user privilege escalation via user-writable metadata

## Vulnerability

Supabase exposes `auth.users.raw_user_meta_data` as the **user-writable** `user_metadata` surface:
any authenticated user can set it with `supabase.auth.updateUser({ data: { role: 'chairman' } })`.
Any authorization decision that reads `raw_user_meta_data` for a role check is therefore
**self-elevatable** by any authenticated user. The fix is to authorize off `raw_app_meta_data`
(`app_metadata`), which is settable **only** by the service role / admin API.

## Executed verification (pre-apply, live DB, read-only introspection)

| Check | Result |
|-------|--------|
| `fn_is_chairman()` body | reads `u.raw_user_meta_data->>'role' IN ('chairman','admin','owner') OR ...->'roles' @> '"chairman"'` — **VULNERABLE** |
| `total_users` | 3 |
| `user_meta_chairman` | **2** |
| `app_meta_chairman` | **0** — sequencing hazard: flipping the read before backfill locks out both real chairmen |
| RLS policies gating on `fn_is_chairman` | **21** across **16** tables |
| Other SECURITY DEFINER functions reading `raw_user_meta_data` | none (only `fn_is_chairman`) |
| RLS policies reading `raw_user_meta_data` **directly** (not via `fn_is_chairman`) | **1** — `public.archetype_benchmarks.archetype_benchmarks_admin` (same vuln class) |

## Blast radius — 21 `fn_is_chairman`-gated policies (16 tables)

agent_registry(chairman_read_agents), agents(agents_chairman_full_access),
ai_gen_dwell_tracking(ai_gen_dwell_chairman_select), ai_gen_provenance(ai_gen_provenance_chairman_select),
chairman_decisions(chairman_decisions_select_policy),
chairman_directives(chairman_directives_insert / _select / _update),
gvos_adherence_logs(gvos_adherence_logs_select_chairman), legal_templates(legal_templates_write),
public_portfolio("Chairman can manage portfolio"), sd_proposals(sd_proposals_select),
tool_usage_ledger(chairman_read_ledger), venture_artifacts(venture_artifacts_delete_policy),
venture_gvos_profile(_delete / _insert / _select / _update _chairman),
venture_revenue_entries(venture_revenue_entries_insert_chairman),
venture_stage_work(venture_stage_work_delete_policy), ventures_kill_log(ventures_kill_log_select).

## Second finding — folded in (FR-4)

`public.archetype_benchmarks.archetype_benchmarks_admin` (cmd=ALL, roles=public) authorizes
directly off `users.raw_user_meta_data->>'role' = ANY('admin','chairman')` — the **same** exploit,
independent of `fn_is_chairman`. Per FR-4 ("in-scope siblings folded in"), and because it shares the
same `raw_app_meta_data` backfill enabler, it is fixed in this SD (migration `_c_`) rather than
deferred, so the vulnerability class is closed completely.

## Backfill targets (legitimate chairman identities)

- `69c8aa7a-7661-48ed-9779-746fa6290873` — rickfelix2000@gmail.com (chairman)
- `48d7ec58-faf9-4772-ba72-fb0c2fb297da` — test@ehg.dev (chairman)

> Note: `test@ehg.dev` currently holds chairman. It is backfilled to avoid lockout (preserving the
> status quo, per the no-lockout acceptance criterion). Whether a test account *should* retain
> chairman is a separate access-governance question for the chairman — **out of scope** for this SD.

## Deliverables (all STAGED — chairman applies, in order)

1. `database/migrations/20260716_a_backfill_chairman_app_metadata.sql` — backfill (idempotent, readback-verified). **Apply first.**
2. `database/migrations/20260716_b_fn_is_chairman_read_app_metadata.sql` — `fn_is_chairman` reads `raw_app_meta_data`. Apply after (1).
3. `database/migrations/20260716_c_archetype_benchmarks_admin_read_app_metadata.sql` — archetype policy reads `raw_app_meta_data`. Apply after (1).
4. `tests/security/fn-is-chairman-app-metadata.acceptance.sql` — post-apply acceptance assertions.

**Apply authority:** CHAIRMAN-ONLY / non-delegatable (access-control change, permission class). The
build worker stages only; the migrations carry no `@approved-by` tag. **Rollback** (chairman-gated):
`CREATE OR REPLACE` the prior `fn_is_chairman` body / recreate the archetype policy against
`raw_user_meta_data`; the additive backfill can be left in place.

## Acceptance criteria → coverage

| Criterion | Covered by |
|-----------|-----------|
| Exploit closed (self-set user_metadata → NOT chairman) | migrations `_b_`/`_c_`; acceptance checks (1),(4) + behavioral E2E |
| No chairman lockout | migration `_a_` (backfill + readback); acceptance check (2) |
| 21-policy spot-check authorizes correctly | `fn_is_chairman` contract preserved (signature/SECURITY DEFINER/search_path unchanged); acceptance check (1) |
| Sequencing hazard neutralized | apply order enforced in headers + `_a_` readback assertion |
| No other authz path reads user_metadata | this audit (only `fn_is_chairman` + `archetype_benchmarks_admin`, both fixed) |
| Staged, chairman-only apply | all migrations `requires-chairman-apply`, no `@approved-by` |
