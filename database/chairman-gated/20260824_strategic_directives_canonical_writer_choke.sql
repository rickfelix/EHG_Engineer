-- SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 — canonical-writer choke on
-- public.strategic_directives_v2 (status / current_phase / completion_date)
-- Target DB: EHG_Engineer consolidated (dedlbzhpgkmetvhbkyzq)
--
-- @approved-by: codestreetlabs@gmail.com
-- @approval-record: Chairman verbal at terminal 2026-08-24T12:43Z — "A on all" (11-item ceremony sitting, Adam 0549d739, branch ceremony/20260824-sitting)
-- @approval-record: APPLY HELD by packet terms — approved today, applies only after 13 writers wired + Golf-2 branch merged (Solomon-verified precondition).
--   approval on record. See database/chairman-gated/README.md: the approver header must match
--   `git config user.email` at apply time and is checked against the chairman-approval record.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Per the SD's TR-1, ZERO live DDL apply occurs during its EXEC phase. Everything in this file was
-- proven against an EPHEMERAL vanilla PostgreSQL 16 with a hand-stubbed ~10-object narrow schema
-- (tests/ddl/strategic-directives-canonical-writer-choke-ddl.db.test.js), never against the real
-- table. If this file is ever found APPLIED without an @approved-by line above, that is itself a
-- policy violation worth signaling, independent of whether the DDL is otherwise correct.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- APPLY-TIME REQUIREMENT — lock_timeout (TR-2). NOT OPTIONAL.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CREATE TRIGGER takes an ACCESS EXCLUSIVE lock on strategic_directives_v2, which blocks READS as
-- well as writes. (The ADD COLUMN is no longer in this file — it moved to the step-1 column
-- migration, whose header carries this same requirement.) Measured live: service_role and
-- postgres (the roles migrations connect as) have NO lock_timeout configured, unlike authenticator's
-- 8s — so a lock taken while the fleet is active would QUEUE INDEFINITELY behind existing traffic
-- (seq_scan=377,874 measured on this table) rather than failing fast, hanging every worker session.
--
-- The applying session MUST therefore run, in the same session, before any statement below:
--
--     SET lock_timeout = '3s';
--
-- If the apply aborts with SQLSTATE 55P03 (lock_not_available), that is the guard WORKING. Retry
-- during a quiet window; do not remove the timeout to "get it through".
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EXPLICIT NON-COVERAGE (TR-4) — this is a CHOKE POINT, NOT AN ABSOLUTE BARRIER
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The threat model (FR-3) is ACCIDENTAL / DRIFTED non-canonical writes: a forgotten code path, a
-- copy-pasted UPDATE that omits the stamp, a new script written without awareness of the convention.
-- That is the class of bug this SD exists to catch. It does NOT defend against:
--
--   1. An owner-role `ALTER TABLE ... DISABLE TRIGGER` bypass. Confirmed live: the repo already
--      contains scripts/database-architect-execute-via-psql.sh, which does exactly this.
--   2. CI steps or operators running psql directly against production.
--   3. RLS-silenced ANON-key writers — scripts/update-directive-status.js (`npm run update-status`),
--      scripts/leo-orchestrator-enforced.js (`npm run leo:execute`) and templates/create-handoff.js
--      all write via lib/supabase-client.js's unconditionally-ANON createSupabaseClient(). RLS on
--      this table grants anon table-level UPDATE but has no anon-covering UPDATE policy, so their
--      writes are ALREADY silent 0-row no-ops. They are deliberately NOT in the registry below:
--      allowlisting a writer that is dead by RLS would be a privilege expansion disguised as a
--      compatibility shim.
--   4. A SERVICE_ROLE caller that deliberately reverse-engineers and copies an exact registry stamp
--      string. Measured live 2026-08-24: policy service_role_all_strategic_directives_v2, cmd ALL,
--      qual `true`, plus rolbypassrls=true. Such a caller already holds the ALTER TABLE ...
--      DISABLE TRIGGER bypass in item 1, so forging a stamp gains it nothing it did not already have.
--
--   5. AN `authenticated` CALLER — a DIFFERENT role with DIFFERENT reasoning from item 4, listed
--      separately because folding the two together is what produced the original, too-narrow claim.
--      It does NOT rely on DISABLE TRIGGER access. Measured live 2026-08-24 (evidence:
--      database/evidence/canonical-writer-choke/deploy-order-and-role-surface.json):
--        - a table-level UPDATE grant, AND
--        - a PERMISSIVE UPDATE policy, venture_update_strategic_directives_v2, with qual
--          `((venture_id IS NULL) OR fn_user_has_venture_access(venture_id))`.
--      Nearly every SD carries venture_id IS NULL, so `authenticated` can UPDATE nearly every row,
--      and can enumerate the valid identities through the EXECUTE grant on
--      sd_canonical_writer_policy() below. THE GUARD ADDS NO PROTECTION AGAINST THIS ROLE either.
--      NOT A PRIVILEGE EXPANSION INTRODUCED HERE, and the distinction matters: BEFORE this guard,
--      `authenticated` could already write any lifecycle column with no stamp required at all. Its
--      capability is unchanged; the registry EXECUTE grant is a PREREQUISITE for its writes to be
--      evaluated at all rather than failing on permission-denied, not a new door. Stated as its own
--      item because a reader given only item 4 would infer a boundary against authenticated users
--      that does not exist.
--      (`anon` is genuinely different and IS blocked: it holds the table-level UPDATE grant but no
--      anon UPDATE policy, so RLS filters every row — see item 3.)
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — TWO MODES, both fully documented here (no re-review of the SD required to back out)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- MODE 1 — POST-APPLY OPERATIONAL BACKOUT (apply succeeded; an unexpected writer is being rejected
--          in production, or allowlist coverage turns out incomplete). See the companion
--          ..._DOWN.sql for the exact statements. In short:
--
--            DROP TRIGGER IF EXISTS aaa_enforce_canonical_lifecycle_write ON public.strategic_directives_v2;
--            DROP TRIGGER IF EXISTS zzz_enforce_canonical_lifecycle_write_final ON public.strategic_directives_v2;
--            DROP FUNCTION IF EXISTS public.enforce_canonical_lifecycle_write();
--            DROP FUNCTION IF EXISTS public.sd_canonical_writer_policy(text);
--
--          THE lifecycle_write_token COLUMN IS DELIBERATELY RETAINED, NOT DROPPED. This is SAFE and
--          requires NO writer-side change: every JS/RPC writer that continues sending the stamp
--          post-rollback simply writes an ordinary, now-unvalidated column. Nothing breaks, and no
--          data is lost. Dropping the column instead would break every stamped writer instantly
--          (PGRST204 — see the column migration's header for the live measurement).
--
--          ⚠️  CONSEQUENCE FOR RE-APPLY: because the column and the writers both survive while zzz_
--          (the only at-rest NULLer) does not, stamps ACCUMULATE at rest for the whole rollback
--          window. Re-applying is therefore NOT simply "run the UP file again with no state to
--          worry about" — it must clear those inherited stamps before arming aaa_, or the guard
--          re-arms blind on the hottest rows. The UP file's own $reset_at_rest$ block does exactly
--          that and asserts zero remain, so a re-apply is safe by construction; this note exists so
--          nobody removes that block believing it to be a first-apply no-op. It is a no-op on the
--          FIRST apply only.
--
--          POST-ROLLBACK VERIFICATION STEP (run it, do not assume): execute one real canonical
--          writer's UPDATE against the reverted schema — e.g. `node scripts/handoff.js execute
--          LEAD-TO-PLAN <SD>` on a scratch SD — and confirm it succeeds with the guard gone. That
--          proves no writer-side coupling to the trigger's presence was introduced.
--
--          SCOPE OF MODE 1: the DB GUARD OBJECTS ONLY (2 triggers + 2 functions). The amended
--          fn_atomic_*_transition / auto_transition_status / cascade-function bodies below, and the
--          stamp-setting payloads in scripts/modules/handoff/**, are LEFT AS-IS — they harmlessly
--          continue sending a now-unvalidated value. Reverting those is NOT part of this rollback
--          and is intentionally out of scope; if a regression is ever traced to a function-body
--          edit itself rather than to the guard, that is an ordinary `git revert`.
--
--          FR-7/FR-8 SCOPE NOTE: the dead-code deletions (markSDComplete(), complete-orchestrator.js)
--          and the scanner/test restructuring are NOT reverted by MODE 1. Both are correct
--          independent of the guard's presence — the deleted code was dead regardless, and neither
--          the advisory scanner nor the restructured test asserts anything about the trigger
--          existing.
--
-- MODE 2 — PARTIAL-APPLY RECOVERY (the apply failed partway, e.g. the registry landed but a
--          CREATE TRIGGER errored). EVERY statement below is existence-guarded — CREATE OR REPLACE
--          FUNCTION, DROP TRIGGER IF EXISTS before CREATE TRIGGER — and the $reset_at_rest$ block
--          re-establishes NULL-at-rest on every run, so this file is safely RE-RUNNABLE FROM THE
--          TOP with no manual cleanup. Before re-attempting, run this verification query to see
--          exactly which objects already exist. stamp_column must read 1 BEFORE you start: it is
--          created by the step-1 migration, never by this file, and this file aborts without it.
--
--            SELECT
--              (SELECT count(*) FROM information_schema.columns
--                WHERE table_schema='public' AND table_name='strategic_directives_v2'
--                  AND column_name='lifecycle_write_token')                        AS stamp_column,
--              (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--                WHERE n.nspname='public' AND p.proname='sd_canonical_writer_policy') AS registry_fn,
--              (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--                WHERE n.nspname='public' AND p.proname='enforce_canonical_lifecycle_write') AS guard_fn,
--              (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
--                WHERE c.relname='strategic_directives_v2' AND NOT t.tgisinternal
--                  AND t.tgname IN ('aaa_enforce_canonical_lifecycle_write',
--                                   'zzz_enforce_canonical_lifecycle_write_final')) AS guard_triggers;
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SDCW1 REACHES CALLERS VERBATIM — MEASURED, NOT ASSUMED (TS-29 Stage 1, 2026-08-24)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The whole error-discrimination design rests on a custom 5-character SQLSTATE in the UNASSIGNED
-- range surviving PostgREST's error-translation layer. Every prior datapoint measured STANDARD
-- codes, which was never the case in doubt, and no function in the live estate raises a custom code
-- to probe against. So it was measured directly, against a THROWAWAY scratch table carrying a
-- trigger identical in shape to this one — never against strategic_directives_v2:
--
--   scripts/sdcw1-sqlstate-roundtrip-probe.mjs
--   database/evidence/canonical-writer-choke/TS-29-stage1-sqlstate-roundtrip.json
--
-- Result: a rejection arrives at supabase-js as {code:'SDCW1', message, details, hint} with code and
-- message VERBATIM, at HTTP 400 — PostgREST maps an unknown SQLSTATE to Bad Request, NOT 500, so a
-- rejection will not read as a server fault in logs or dashboards. A lost CAS race arrives as
-- error:null with data:[]. `error !== null` therefore genuinely discriminates the two, and no
-- message-text fallback is required.
--
-- STAGE 2, part of THIS ceremony: after applying, re-run the same three assertions against the REAL
-- guard on strategic_directives_v2. Stage 1 proves the PostgREST layer; only Stage 2 proves it for
-- this trigger on this table.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY TWO TRIGGERS AND NOT ONE (FR-2, measured — not reasoned)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- aaa_ ALONE IS NOT SUFFICIENT. status_auto_transition (BEFORE ROW, position 6 of 35 under
-- COLLATE "C") ASSIGNS NEW.status when current_phase IN ('EXEC','PLAN') AND progress >= 100. A
-- client writing only `progress`/`current_phase` therefore reaches status='pending_approval' with
-- no stamp at all: aaa_ inspects NEW at position 1, sees status unchanged, and passes — and firing
-- FIRST is exactly what makes that invisible to it. lib/sd-park.js is a live, load-bearing caller
-- that deliberately depends on this path.
--
-- The fix is a companion zzz_-prefixed BEFORE ROW trigger that re-checks the FINAL NEW value after
-- every other BEFORE ROW trigger has run. zzz_ is FULLY GENERIC — it knows nothing about
-- status_auto_transition or any other sibling — so it also catches a FUTURE trigger #36 written by
-- an author unaware of this convention. status_auto_transition itself is amended below to SELF-STAMP
-- (a truthful identity claim: it genuinely is the author of that specific status assignment when the
-- client did not write status), which is what lets a fully-generic zzz_ allow it.
--
-- Rejected alternatives, recorded so they are not re-litigated: folding auto_transition_status's
-- logic into the guard (highest blast radius, does not generalize to sibling #36, couples two
-- unrelated change cadences); making zzz_ aware of auto_transition_status specifically (a second
-- representation that drifts, and functionally whitelists derived transitions).
--
-- A THIRD, NARROWER change (not rejected -- separately directed): auto_transition_status's own
-- function body, amended below (section 4), now carries an IS DISTINCT FROM guard on current_phase
-- and progress. This is unrelated to the choke design above -- it is a live-measured, independent bug
-- in that function itself (relayed via the 06:01Z coordinator ceremony-packet, sourced from an Adam
-- flag-review and confirmed by risk-agent): with no WHEN clause on its own BEFORE UPDATE trigger and
-- no IS DISTINCT FROM guard in its body, ANY write to a row already satisfying (current_phase, progress
-- >= 100) -- including a metadata-only write that touches neither column -- re-derived and silently
-- reverted status to 'pending_approval', even overwriting a status a human/handoff had deliberately set
-- to something else afterward (e.g. cancelled/completed). Staged in this same file rather than a
-- separate ceremony because this trigger's table is already open here.
--
-- NOTE ON NAMING: trg_aaa_sync_type_change_reason is in-repo proof this convention has silently
-- FAILED before — it carries an "aaa" infix but is prefixed "trg_", so it sorts at position 11, not
-- first. The "aaa"/"zzz" must be the LEADING characters. The $verify$ block at the bottom of this
-- file asserts the bound continuously at apply time.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- NO pg_trigger_depth() EXEMPTION (FR-6 reversal)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The originally-designed `pg_trigger_depth() > 1` blanket exemption is DROPPED, not kept. Its
-- premise — "a cascading write already happened inside an already-guarded top-level transaction" —
-- is FALSE for CROSS-TABLE cascades: update_sd_after_exec_completion, update_sd_after_lead_evaluation,
-- update_sd_after_plan_validation and update_sd_progress_from_phases are trigger functions on OTHER
-- tables, so the top-level write is depth 1 on a table this guard does not protect. Confirmed live:
-- update_sd_progress_from_phases is the ONLY DB-side writer of completion_date in the entire estate,
-- and ANY writer that flips the last sd_phase_tracking.is_complete to true would mark an SD completed
-- with completion_date set, entirely unstamped, exempted purely by depth. (This table has a
-- documented phantom-completion history — scripts/audit-phantom-completions.js exists because of it.)
--
-- Instead each of those 4 functions, plus complete_orchestrator_sd(), carries its OWN distinct
-- registry identity. That is ONE enforcement mechanism instead of two, makes a FUTURE cascade fail
-- LOUDLY by default rather than silently inheriting an exemption, and gives phantom-completion audits
-- a queryable discriminator between a phase-tracking cascade and a handoff.js LEAD-FINAL-APPROVAL.
--
-- The absence of any pg_trigger_depth() reference in the guard is itself asserted by $verify$ below.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- APPLY (chairman ceremony — two separate invocations; this file lives outside database/migrations/)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- THIS IS STEP 3 OF 3. Two prerequisites, and only the first is machine-enforced:
--   STEP 1 — database/chairman-gated/20260824_strategic_directives_lifecycle_write_token_column.sql
--            must already be applied. This file's $precondition$ block aborts if it is not.
--   STEP 2 — the code branch stamping scripts/modules/handoff/** must already be deployed, AND the
--            13 registered-but-unwired writers listed under the registry below must be wired.
--            NOT machine-enforced (this file cannot see the deployed code): applying with those
--            unwired takes sd:cancel / sd:reactivate / sd:recover / sd:park offline. The
--            $verify$ block at the bottom RAISEs a WARNING naming every one of them.
--
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token from above> node scripts/apply-migration.js \
--     "database/chairman-gated/20260824_strategic_directives_canonical_writer_choke.sql" \
--     --prod-deploy --allow-any-path
--
--   ...with `SET lock_timeout = '3s';` established in the applying session first (see above).
--
-- ROLLBACK FILE: 20260824_strategic_directives_canonical_writer_choke_DOWN.sql
-- DDL PROOF:     tests/ddl/strategic-directives-canonical-writer-choke-ddl.db.test.js
-- WRITER TABLE:  database/evidence/SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001-writer-inventory.md
-- FUNCTION DIFFS: database/evidence/canonical-writer-choke/*.{before,after}.sql + *.diff.txt
--
-- NOTE: this file deliberately contains NO BEGIN;/COMMIT;. scripts/apply-migration.js wraps the
-- whole file in its own transaction (`if (useTx) await auditClient.query('BEGIN')`); a nested
-- COMMIT; here would end that outer transaction early, before the audit row is written.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 1. PRECONDITION — the stamp column must ALREADY exist (STEP 1 of the deploy order)
-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- The column is created by a SEPARATE, smaller, independently-appliable migration:
--   database/chairman-gated/20260824_strategic_directives_lifecycle_write_token_column.sql
--
-- It lives there and not here because the CODE branch that stamps scripts/modules/handoff/** cannot
-- merge until the column exists, and it must not have to wait on this file's much larger review.
-- Measured live (zero-write probe): a PostgREST UPDATE whose payload names a column absent from the
-- schema cache returns PGRST204 BEFORE matching any row — so with the branch merged and the column
-- missing, all 12 wired sites hard-fail on their first real call, and because PGRST204 is not SDCW1
-- the two compensation paths silently swallow it. See that file's header for the full measurement.
--
-- This block makes the dependency ENFORCED rather than documented: applying this file out of order
-- aborts here, before any object is created.
DO $precondition$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'strategic_directives_v2'
       AND column_name = 'lifecycle_write_token'
  ) THEN
    RAISE EXCEPTION
      'canonical-writer choke: strategic_directives_v2.lifecycle_write_token does not exist. Apply '
      'database/chairman-gated/20260824_strategic_directives_lifecycle_write_token_column.sql FIRST '
      '(step 1 of 3 — see that file''s DEPLOY ORDER header), then re-run this ceremony.';
  END IF;
END
$precondition$;


-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 2. THE REGISTRY (FR-5) — single source of truth for "who may write lifecycle state"
-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- Modeled EXACTLY on the existing handoff_actor_policy(created_by) SSOT pattern (verified live: an
-- inline VALUES clause in the function body, NO backing table, amended via CREATE OR REPLACE
-- FUNCTION). Two — and only two — consumers exist: (1) the guard trigger's own validation query,
-- and (2) test fixtures. BOTH derive the writer list by CALLING this function at run time. A
-- consumer that hardcodes writer_identity strings anywhere else is a defect, not a shortcut; the
-- DDL test enforces that mechanically.
--
-- Calling with p_writer_identity => NULL returns the WHOLE registry (that is what lets a test
-- enumerate it rather than hand-copy it). Calling with a value returns 0 or 1 rows, which is what
-- the trigger's EXISTS() predicate needs.
--
-- capability_flags is graded rather than a bare boolean, matching handoff_actor_policy's own shape:
--   surface           — where the write physically originates
--   protected_columns — which of the 3 protected columns this writer actually touches
--   stamp_wired       — whether the writer's CODE currently sends the stamp. FALSE means the
--                       registry entry exists but the caller has not been amended yet. THIS IS
--                       QUERYABLE ON PURPOSE: see the PRE-APPLY BLOCKER note below.
--
-- ⚠️  PRE-APPLY BLOCKER, STATED HERE SO IT CANNOT BE MISSED. This SD's FR-4 scopes EXEC's stamp
--     wiring to the handoff pipeline (13 own-UPDATE sites + the 2 RPCs) and to the DB-resident
--     functions amended in this file. Every OTHER allowlisted writer below is registered but NOT
--     yet wired (stamp_wired=false). Applying this migration while those remain unwired WILL break
--     them — `npm run sd:cancel`, `sd:reactivate`, `sd:recover`, `sd:park`/`sd:unpark` and the fleet
--     libs would start raising SDCW1. Wiring them is a prerequisite of the apply ceremony, not of
--     this file. Enumerate what is still outstanding with:
--
--       SELECT writer_identity, capability_flags->>'surface', notes
--         FROM public.sd_canonical_writer_policy()
--        WHERE (capability_flags->>'stamp_wired')::boolean IS NOT TRUE
--        ORDER BY writer_identity;
--
CREATE OR REPLACE FUNCTION public.sd_canonical_writer_policy(p_writer_identity text DEFAULT NULL)
 RETURNS TABLE(writer_identity text, capability_flags jsonb, notes text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  WITH registry(writer_identity, capability_flags, notes) AS (
    VALUES
      -- ── THE CANONICAL WRITER ────────────────────────────────────────────────────────────────
      ('handoff.js'::text,
       '{"surface":"handoff_pipeline","protected_columns":["status","current_phase","completion_date"],"stamp_wired":true}'::jsonb,
       'The declared canonical writer. ONE identity covering all 12 reachable own-UPDATE sites across 11 files under scripts/modules/handoff/** -- including BOTH rollback/compensation branches (lead-to-plan/state-transitions.js rollbackSdState, plan-to-exec/state-transitions.js rollbackState), which are the compensating write for the same transition, not a distinct writer.'::text),

      -- ── handoff.js''s two atomic RPC entry points (own identities: they issue their own UPDATE) ─
      ('fn_atomic_lead_to_plan_transition',
       '{"surface":"db_function","protected_columns":["status","current_phase"],"stamp_wired":true}'::jsonb,
       'SECURITY DEFINER RPC invoked by scripts/modules/handoff/executors/lead-to-plan/atomic-transitions.js. Sets current_phase=PLAN_PRD, status=in_progress and the stamp in ONE UPDATE.'),
      ('fn_atomic_exec_to_plan_transition',
       '{"surface":"db_function","protected_columns":["status","current_phase"],"stamp_wired":true}'::jsonb,
       'SECURITY DEFINER RPC invoked by scripts/modules/handoff/executors/exec-to-plan/atomic-transitions.js. Sets current_phase=EXEC_COMPLETE, status=active and the stamp in ONE UPDATE.'),

      -- ── IN-TABLE TRIGGER SELF-STAMP (FR-1) ──────────────────────────────────────────────────
      ('auto_transition_status',
       '{"surface":"db_trigger","protected_columns":["status"],"stamp_wired":true}'::jsonb,
       'BEFORE ROW trigger on this very table (status_auto_transition, position 6). Derives status=pending_approval from current_phase+progress. Self-stamps ONLY when the token is still NULL at that point in the chain, so a genuine client-supplied identity earlier in the same statement is never overwritten.'),

      -- ── CASCADE WRITERS (FR-6) — each carries its OWN identity, no depth exemption ───────────
      ('update_sd_after_exec_completion',
       '{"surface":"db_trigger_cascade","protected_columns":["status"],"stamp_wired":true}'::jsonb,
       'AFTER ROW UPDATE trigger on exec_implementation_sessions. Cross-table cascade: the top-level write is depth 1 on a table this guard does not protect, which is exactly why a depth-based exemption was unsafe.'),
      ('update_sd_after_lead_evaluation',
       '{"surface":"db_trigger_cascade","protected_columns":["status"],"stamp_wired":true}'::jsonb,
       'AFTER ROW INSERT trigger on lead_evaluations. Cross-table cascade, same rationale.'),
      ('update_sd_after_plan_validation',
       '{"surface":"db_trigger_cascade","protected_columns":["status"],"stamp_wired":true}'::jsonb,
       'AFTER ROW INSERT trigger on plan_technical_validations. Cross-table cascade, same rationale.'),
      ('update_sd_progress_from_phases',
       '{"surface":"db_trigger_cascade","protected_columns":["current_phase","status","completion_date"],"stamp_wired":true}'::jsonb,
       'AFTER ROW INSERT/UPDATE trigger on sd_phase_tracking. THE ONLY DB-side writer of completion_date in the entire estate. Registering it distinctly is what lets a phantom-completion audit tell a phase-tracking cascade apart from a handoff.js LEAD-FINAL-APPROVAL completion.'),
      ('complete_orchestrator_sd',
       '{"surface":"db_function","protected_columns":["status","current_phase"],"stamp_wired":true}'::jsonb,
       'SECURITY DEFINER RPC. Both a cascade target AND directly callable at depth 1, so it needs an explicit registry entry regardless of any depth reasoning. Two UPDATE sites (pending_approval staging; final completed/COMPLETED), both stamped.'),

      -- ── OTHER protected-column DB FUNCTIONS (writer-inventory 1a, disposition=allowlist) ─────
      ('complete_business_evaluation',
       '{"surface":"db_function","protected_columns":["status","current_phase"],"stamp_wired":false}'::jsonb,
       'SECURITY INVOKER. Zero live JS call sites (invoked from DB only). NOT YET WIRED -- see the PRE-APPLY BLOCKER note above.'),
      ('request_business_evaluation',
       '{"surface":"db_function","protected_columns":["status","current_phase"],"stamp_wired":false}'::jsonb,
       'SECURITY INVOKER. Zero live JS call sites. NOT YET WIRED.'),
      ('fn_rollback_sd_hierarchy',
       '{"surface":"db_function","protected_columns":["status"],"stamp_wired":false}'::jsonb,
       'SECURITY DEFINER. Cancels a descendant tree. Zero live JS call sites. NOT YET WIRED.'),
      ('delete_venture',
       '{"surface":"db_function","protected_columns":["status"],"stamp_wired":false}'::jsonb,
       'SECURITY DEFINER. Cascades venture deletion to SD status=cancelled. Live caller: lib/deleteVentureFully.js. NOT YET WIRED.'),
      ('kill_venture',
       '{"surface":"db_function","protected_columns":["status"],"stamp_wired":false}'::jsonb,
       'SECURITY DEFINER. Cascades venture kill to SD status=cancelled. NOT YET WIRED.'),

      -- ── OPERATOR / RECOVERY TOOLS (writer-inventory 1d, disposition=allowlist) ───────────────
      ('sd:cancel',
       '{"surface":"operator_tool","protected_columns":["status","current_phase"],"stamp_wired":false}'::jsonb,
       'scripts/cancel-sd.js, live via `npm run sd:cancel`. NOT YET WIRED -- applying before this is wired takes sd:cancel offline.'),
      ('sd:reactivate',
       '{"surface":"operator_tool","protected_columns":["status"],"stamp_wired":false}'::jsonb,
       'scripts/reactivate-sd.js, live via `npm run sd:reactivate`. Writes status ONLY -- it READS current_phase for audit but never writes it. NOT YET WIRED.'),
      ('sd:recover',
       '{"surface":"operator_tool","protected_columns":["status","current_phase"],"stamp_wired":false}'::jsonb,
       'scripts/sd-recover.js, live via `npm run sd:recover`. Disaster-recovery tool. NOT YET WIRED.'),
      ('sd:verify',
       '{"surface":"operator_tool","protected_columns":["status","current_phase","completion_date"],"stamp_wired":false}'::jsonb,
       'scripts/sd-verify.js, live via `npm run sd:verify`. NOT YET WIRED.'),
      ('sd-park.js',
       '{"surface":"operator_tool","protected_columns":["status"],"stamp_wired":false}'::jsonb,
       'lib/sd-park.js park()/unpark(), raw pg, live via `npm run sd:park` / `sd:unpark`. Writes status ONLY, and DELIBERATELY depends on status_auto_transition firing off the progress column -- the exact unstamped derived path zzz_ + the self-stamp exist to keep working. NOT YET WIRED.'),
      ('leo:continuous',
       '{"surface":"operator_tool","protected_columns":["status","current_phase","completion_date"],"stamp_wired":false}'::jsonb,
       'scripts/leo-continuous.js, live via `npm run leo:continuous`. NOT YET WIRED.'),
      ('stale-session-sweep.cjs',
       '{"surface":"operator_tool","protected_columns":["status","current_phase"],"stamp_wired":false}'::jsonb,
       'scripts/stale-session-sweep.cjs, 5 distinct write sites. NOT YET WIRED.'),

      -- ── FLEET / EVA LIBS (writer-inventory 1d, disposition=allowlist) ────────────────────────
      ('sd-revert.js',
       '{"surface":"fleet_lib","protected_columns":["status","current_phase"],"stamp_wired":false}'::jsonb,
       'lib/sd/revert.js -- reverts an SD to draft/LEAD. NOT YET WIRED.'),
      ('release-work-item.mjs',
       '{"surface":"fleet_lib","protected_columns":["status","current_phase"],"stamp_wired":false}'::jsonb,
       'lib/fleet/release-work-item.mjs. NOT YET WIRED.'),
      ('reap-orphaned-provisioning.js',
       '{"surface":"fleet_lib","protected_columns":["status"],"stamp_wired":false}'::jsonb,
       'lib/eva/bridge/reap-orphaned-provisioning.js -- cancels orphaned orchestrator trees. NOT YET WIRED.'),
      ('lifecycle-sd-bridge.js',
       '{"surface":"fleet_lib","protected_columns":["status"],"stamp_wired":false}'::jsonb,
       'lib/eva/lifecycle-sd-bridge.js -- cancels on hierarchy-creation rollback. NOT YET WIRED.'),
      ('orchestrator-child-completion.js',
       '{"surface":"fleet_lib","protected_columns":["status"],"stamp_wired":false}'::jsonb,
       'lib/utils/orchestrator-child-completion.js -- sets ready_for_final. NOT YET WIRED.'),
      ('SDGitStateReconciler.js',
       '{"surface":"fleet_lib","protected_columns":["status"],"stamp_wired":false}'::jsonb,
       'scripts/modules/shipping/SDGitStateReconciler.js. NOT YET WIRED.')
  )
  SELECT r.writer_identity, r.capability_flags, r.notes
  FROM registry r
  WHERE p_writer_identity IS NULL OR r.writer_identity = p_writer_identity
$function$;

-- EXECUTE grant is stated EXPLICITLY rather than left to ALTER DEFAULT PRIVILEGES. The guard trigger
-- runs as the INVOKER, so every role that can UPDATE this table must be able to call the registry —
-- a silent default-privileges revoke would otherwise turn every legitimate write into a
-- permission-denied. `anon` is deliberately EXCLUDED: RLS drops every anon UPDATE (zero rows
-- qualify) before any BEFORE ROW trigger fires, so anon can never reach this lookup, and the
-- allowlist is not something an anon key should be able to enumerate.
GRANT EXECUTE ON FUNCTION public.sd_canonical_writer_policy(text) TO service_role, authenticated;


-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 3. THE GUARD (FR-1, FR-2, FR-3) — ONE function, TWO triggers
-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- One function deliberately: aaa_ and zzz_ run IDENTICAL validation logic, and a second copy of it
-- would be a second representation free to drift. TG_ARGV[0] is the only difference — 'final'
-- additionally performs the NULL-at-rest cleanup, which only the LAST guard may do.
--
-- Guard condition uses `IS DISTINCT FROM`, NEVER Postgres's `UPDATE OF <cols>` syntax: UPDATE OF
-- fires when a column is MENTIONED in the SET clause, not when its value actually CHANGES, and
-- supabase-js sends whole patch objects — so UPDATE OF would false-reject every write that happens
-- to carry an unchanged lifecycle column.
--
-- progress / progress_percentage / phase_progress / is_working_on are NOT protected and are never
-- referenced here. progress_percentage is DB-recalculated by auto_calculate_progress(); progress has
-- a load-bearing dependent in lib/sd-park.js; is_working_on is owned by 7 claim RPCs plus
-- sync_is_working_on_with_session.
--
-- FAIL-CLOSED on could-not-check: if the registry lookup itself errors (function missing, malformed,
-- or raising), Postgres's own BEFORE-trigger semantics abort the entire UPDATE. That is stated here
-- deliberately rather than left as an unremarked side-effect — it is the correct choice for a guard
-- whose whole purpose is a hard DB-level guarantee, and it is the OPPOSITE of the fail-open patterns
-- used elsewhere in this table's trigger estate for infrastructure tolerance.
--
-- MESSAGE TEXTS ARE LOAD-BEARING AND MUST NOT CHANGE CASUALLY. Exactly two exist, and NEITHER may
-- ever contain the substring "0 rows": scripts/modules/handoff/skip-and-continue.js:148 discriminates
-- success from failure with `if (updateError.message.includes('0 rows'))`, so a collision there would
-- silently report a genuine stamp rejection as success. $verify$ below asserts this mechanically.
-- The two cases share ONE SQLSTATE (SDCW1) and are distinguished by MESSAGE, per FR-1.
-- DETAIL additionally names the firing guard via TG_NAME, which is what makes "aaa_ rejected this"
-- and "zzz_ rejected this" distinguishable to a test without changing MESSAGE.
CREATE OR REPLACE FUNCTION public.enforce_canonical_lifecycle_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_protected_changed boolean;
BEGIN
  v_protected_changed :=
        NEW.status          IS DISTINCT FROM OLD.status
     OR NEW.current_phase   IS DISTINCT FROM OLD.current_phase
     OR NEW.completion_date IS DISTINCT FROM OLD.completion_date;

  IF v_protected_changed THEN
    IF NEW.lifecycle_write_token IS NULL THEN
      RAISE EXCEPTION 'missing canonical-writer stamp on protected-column write'
        USING ERRCODE = 'SDCW1',
              DETAIL  = format(
                'guard=%s sd=%s status:%s->%s current_phase:%s->%s completion_date:%s->%s',
                TG_NAME, NEW.id,
                OLD.status, NEW.status,
                OLD.current_phase, NEW.current_phase,
                OLD.completion_date, NEW.completion_date),
              HINT    = 'Set lifecycle_write_token to your registry identity in the SAME UPDATE statement. Enumerate valid identities with: SELECT writer_identity FROM public.sd_canonical_writer_policy();';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.sd_canonical_writer_policy(NEW.lifecycle_write_token)
    ) THEN
      RAISE EXCEPTION 'stamp value not present in canonical-writer registry'
        USING ERRCODE = 'SDCW1',
              DETAIL  = format('guard=%s sd=%s rejected_identity=%L', TG_NAME, NEW.id, NEW.lifecycle_write_token),
              HINT    = 'Enumerate valid identities with: SELECT writer_identity FROM public.sd_canonical_writer_policy();';
    END IF;
  END IF;

  -- NULL-at-rest cleanup (FR-3). UNCONDITIONAL, deliberately: it must run even when no protected
  -- column changed, because otherwise a coordination-only write that happened to carry a stamp
  -- would leave a valid value at rest for the NEXT unstamped write to inherit.
  IF TG_ARGV[0] = 'final' THEN
    NEW.lifecycle_write_token := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

-- BOTH guards are dropped BEFORE either is created, and the at-rest reset runs in the gap. Order is
-- load-bearing three ways: the reset below must not be evaluated by a live guard; there must be no
-- moment where aaa_ exists without zzz_ (which would be a guard with no NULL-at-rest enforcer); and
-- on a re-apply the stale definitions must be gone before the new ones land.
DROP TRIGGER IF EXISTS aaa_enforce_canonical_lifecycle_write ON public.strategic_directives_v2;
DROP TRIGGER IF EXISTS zzz_enforce_canonical_lifecycle_write_final ON public.strategic_directives_v2;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- AT-REST RESET — required for RE-APPLY-AFTER-ROLLBACK safety, a no-op on first apply
-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- On a first apply this clears ZERO rows: the column migration asserts the column is NULL
-- everywhere at creation. It exists for the SECOND apply, and that case is not hypothetical.
--
-- MODE 1 rollback drops zzz_ -- the ONLY thing that nulls the stamp at rest -- while deliberately
-- RETAINING both the column and every stamping writer. So throughout the rollback window each
-- canonical write leaves a REGISTRY-VALID stamp sitting in the row, on precisely the rows the
-- pipeline touches most. Re-create aaa_ over that state and the next UNSTAMPED protected-column
-- write to such a row inherits NEW.lifecycle_write_token = OLD.lifecycle_write_token = 'handoff.js',
-- which validates -- the guard re-arms BLIND, resurrecting the exact F1b stale-stamp-reuse bug
-- FR-3's NULL-at-rest requirement was written to close, on the hottest rows in the table.
--
-- SIDE EFFECT, STATED PLAINLY: this is a real UPDATE, so for each matching row it fires the table's
-- full BEFORE/AFTER ROW trigger estate (updated_at bumps, audit rows, notifications). The
-- `IS NOT NULL` predicate is what bounds it -- zero rows on first apply, and afterwards only rows
-- written during a rollback window. It is deliberately NOT a DISABLE TRIGGER / DROP-and-re-ADD
-- COLUMN trick: the former is the exact bypass TR-4 discloses as this guard's boundary, and the
-- latter would break the column migration's independence and invalidate PostgREST's schema cache
-- mid-flight.
-- THE RESET WRITES ONLY lifecycle_write_token -- no protected column appears in its SET clause, so
-- it is safe against BOTH guards: aaa_ and zzz_ evaluate `protected changed` as FALSE and pass it
-- through, and zzz_'s NULL-at-rest assignment is a no-op on a value already being set to NULL. That
-- holds even on a partial re-run where one trigger somehow survived.
--
-- BUT A SIBLING CAN STILL TURN IT INTO A PROTECTED-COLUMN WRITE, and that is not hypothetical.
-- status_auto_transition (BEFORE ROW, position 6) has NO TG_OP guard and NO IS DISTINCT FROM: it
-- fires on EVERY update and unconditionally assigns NEW.status := 'pending_approval' whenever
-- current_phase IN ('EXEC','PLAN') AND progress >= 100. So on such a row this maintenance statement
-- would SILENTLY FLIP A LIFECYCLE STATUS -- during a guard ceremony, in bulk, with no operator
-- intent. Refusing is the only honest answer; a ceremony that quietly mutates lifecycle state is
-- precisely what this SD exists to make impossible.
--
-- Believed unreachable TODAY, and the reason is worth writing down because it is what makes the
-- check cheap rather than paranoid: the same UPDATE that leaves a stamp behind also runs
-- status_auto_transition, so any stamped row inside that predicate already has
-- status='pending_approval'. The reachable exception is a row that entered the predicate WITHOUT an
-- UPDATE -- an INSERT, a restore, or a load run with triggers disabled -- since the trigger is
-- BEFORE UPDATE only. Six lines to convert that into a loud refusal instead of a silent flip.
DO $reset_at_rest$
DECLARE
  v_cleared    bigint;
  v_left       bigint;
  v_would_flip bigint;
  v_flip_ids   text;
BEGIN
  SELECT count(*), string_agg(id, ', ' ORDER BY id)
    INTO v_would_flip, v_flip_ids
    FROM public.strategic_directives_v2
   WHERE lifecycle_write_token IS NOT NULL
     AND current_phase IN ('EXEC', 'PLAN')
     AND progress >= 100
     AND status IS DISTINCT FROM 'pending_approval';

  IF v_would_flip > 0 THEN
    RAISE EXCEPTION
      'canonical-writer choke: clearing the at-rest stamp on % row(s) would make status_auto_transition '
      'silently flip their status to ''pending_approval'' (they sit at current_phase IN (EXEC,PLAN) with '
      'progress >= 100). Refusing to mutate lifecycle state as a side effect of a maintenance statement. '
      'Resolve these by hand first, then re-run: %', v_would_flip, v_flip_ids;
  END IF;

  UPDATE public.strategic_directives_v2
     SET lifecycle_write_token = NULL
   WHERE lifecycle_write_token IS NOT NULL;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  -- An INDEPENDENT re-count, not a restatement of the UPDATE's own ROW_COUNT: the two answer
  -- different questions, and only this one can observe a row the UPDATE never reached.
  SELECT count(*) INTO v_left
    FROM public.strategic_directives_v2 WHERE lifecycle_write_token IS NOT NULL;
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'canonical-writer choke: % row(s) still carry a stamp at rest after the reset — the guard would re-arm blind. Refusing to deploy.', v_left;
  END IF;

  IF v_cleared > 0 THEN
    RAISE NOTICE 'canonical-writer choke: cleared % inherited at-rest stamp(s) before arming the guard (expected only on a re-apply after a MODE 1 rollback).', v_cleared;
  END IF;
END
$reset_at_rest$;

-- aaa_ is FIRST among all 35 existing BEFORE ROW triggers under COLLATE "C" (the collation Postgres
-- itself uses -- relcache.c orders same-timing triggers with strcmp(), i.e. byte order, NOT the
-- database's default collation). Earliest existing name is auto_assign_sequence_rank; 'a' (0x61) <
-- 'u' (0x75) at byte 1. No existing name begins with a digit or an uppercase letter.
CREATE TRIGGER aaa_enforce_canonical_lifecycle_write
  BEFORE UPDATE ON public.strategic_directives_v2
  FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_lifecycle_write('early');

-- zzz_ is LAST among all BEFORE ROW triggers under COLLATE "C" (latest existing name is
-- validate_child_sd_sequence; 'z' > 'v'). This is the one that sees the FINAL NEW tuple, and the
-- only one that nulls the stamp at rest.
CREATE TRIGGER zzz_enforce_canonical_lifecycle_write_final
  BEFORE UPDATE ON public.strategic_directives_v2
  FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_lifecycle_write('final');


-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 4. AMENDED FUNCTION BODIES
-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- EVERY definition below is the LIVE body captured via pg_get_functiondef() immediately before
-- modification, with ONLY the enumerated stamp lines inserted -- never retyped from memory or copied
-- from an older migration file. (A stale migration-file copy of a live RPC produced a real
-- authentication-bypass risk on a prior SD in this same session; that is why this is mechanical.)
--
-- BEFORE / AFTER / DIFF artifacts:  database/evidence/canonical-writer-choke/
-- Generator (exactly-once anchor matching, throws on drift):
--   scripts/one-off/gen-canonical-writer-stamp-amendments.mjs
-- The DDL test asserts each *.after.sql body appears VERBATIM below, so a later hand-edit that
-- drifts from the captured artifact fails CI rather than shipping silently.


-- auto_transition_status: live pg_get_functiondef() capture + the stamp edit ONLY. Provenance, capture
-- timestamp and per-line diff: database/evidence/canonical-writer-choke/auto_transition_status.{before,after}.sql
-- and auto_transition_status.diff.txt. Deliberately no timestamp inline -- one representation, in the artifacts.
CREATE OR REPLACE FUNCTION public.auto_transition_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
      BEGIN
        -- SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 ceremony-packet amendment (Adam flag-review,
        -- risk-agent live-measured): status_auto_transition is BEFORE UPDATE with no WHEN clause and this
        -- function had no IS DISTINCT FROM guard, so it recomputed status on EVERY update to a row already
        -- satisfying (current_phase, progress>=100) -- including metadata-only writes that never touched
        -- either column. That silently reverted a row a human/handoff had deliberately moved to a DIFFERENT
        -- status afterward (e.g. cancelled/completed) back to 'pending_approval'. Only recompute when THIS
        -- write actually changed current_phase or progress. (Staged here, not a separate ceremony, per
        -- coordinator packet-fragmentation call -- this trigger's table is already open in this migration.)
        IF NEW.current_phase IS NOT DISTINCT FROM OLD.current_phase
           AND NEW.progress IS NOT DISTINCT FROM OLD.progress THEN
          RETURN NEW;
        END IF;

        -- Fix: Use current_phase instead of phase
        IF NEW.current_phase = 'EXEC' AND NEW.progress >= 100 THEN
          IF NEW.lifecycle_write_token IS NULL THEN
            NEW.lifecycle_write_token = 'auto_transition_status';
          END IF;
          NEW.status = 'pending_approval';
        END IF;

        -- FIX: Changed from 'pending_lead_approval' to 'pending_approval'
        IF NEW.current_phase = 'PLAN' AND NEW.progress >= 100 THEN
          IF NEW.lifecycle_write_token IS NULL THEN
            NEW.lifecycle_write_token = 'auto_transition_status';
          END IF;
          NEW.status = 'pending_approval';
        END IF;

        RETURN NEW;
      END;
      $function$;


-- fn_atomic_lead_to_plan_transition: live pg_get_functiondef() capture + the stamp edit ONLY. Provenance, capture
-- timestamp and per-line diff: database/evidence/canonical-writer-choke/fn_atomic_lead_to_plan_transition.{before,after}.sql
-- and fn_atomic_lead_to_plan_transition.diff.txt. Deliberately no timestamp inline -- one representation, in the artifacts.
CREATE OR REPLACE FUNCTION public.fn_atomic_lead_to_plan_transition(p_sd_id text, p_session_id text, p_request_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_sd_uuid       UUID;
  v_pre_state     JSONB;
  v_post_state    JSONB;
  v_audit_id      UUID;
  v_request_id    TEXT;
  v_sd_row        RECORD;
  v_lock_acquired BOOLEAN;
BEGIN
  -- Generate request_id for idempotency if not provided.
  v_request_id := COALESCE(
    p_request_id,
    p_sd_id || '-' || p_session_id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT
  );

  -- Idempotency: prior success for this request_id returns immediately.
  SELECT id INTO v_audit_id
    FROM sd_transition_audit
   WHERE request_id = v_request_id
     AND status = 'completed';

  IF v_audit_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent_hit', true,
      'message', 'Transition already completed',
      'audit_id', v_audit_id
    );
  END IF;

  -- Resolve SD UUID from id (legacy text) or sd_key.
  SELECT uuid_id INTO v_sd_uuid
    FROM strategic_directives_v2
   WHERE id = p_sd_id OR sd_key = p_sd_id
   LIMIT 1;

  IF v_sd_uuid IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'SD not found: ' || p_sd_id
    );
  END IF;

  -- Advisory lock scoped per-SD (transaction-scoped, auto-released).
  v_lock_acquired := pg_try_advisory_xact_lock(hashtext(p_sd_id));
  IF NOT v_lock_acquired THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Concurrent transition in progress',
      'code', 'CONCURRENT_LOCK'
    );
  END IF;

  -- Capture pre-state with row-level lock.
  SELECT id, status, current_phase, transition_version, progress
    INTO v_sd_row
    FROM strategic_directives_v2
   WHERE uuid_id = v_sd_uuid
   FOR UPDATE;

  v_pre_state := jsonb_build_object(
    'sd_id', p_sd_id,
    'sd_status', v_sd_row.status,
    'sd_phase', v_sd_row.current_phase,
    'sd_version', v_sd_row.transition_version,
    'sd_progress', v_sd_row.progress
  );

  -- Create audit record (in_progress).
  INSERT INTO sd_transition_audit (
    sd_id, transition_type, session_id, request_id, pre_state, status
  )
  VALUES (
    v_sd_uuid, 'LEAD_TO_PLAN', p_session_id, v_request_id,
    v_pre_state, 'in_progress'
  )
  RETURNING id INTO v_audit_id;

  -- ============================== ATOMIC PROMOTION ============================
  UPDATE strategic_directives_v2
     SET current_phase     = 'PLAN_PRD',
         status            = 'in_progress',
         lifecycle_write_token = 'fn_atomic_lead_to_plan_transition',
         transition_version = COALESCE(transition_version, 1) + 1,
         updated_at        = NOW()
   WHERE uuid_id = v_sd_uuid;
  -- ============================================================================

  v_post_state := jsonb_build_object(
    'sd_phase', 'PLAN_PRD',
    'sd_status', 'in_progress'
  );

  UPDATE sd_transition_audit
     SET status       = 'completed',
         post_state   = v_post_state,
         completed_at = NOW()
   WHERE id = v_audit_id;

  RETURN jsonb_build_object(
    'success', true,
    'audit_id', v_audit_id,
    'pre_state', v_pre_state,
    'post_state', v_post_state
  );

EXCEPTION WHEN OTHERS THEN
  IF v_audit_id IS NOT NULL THEN
    UPDATE sd_transition_audit
       SET status       = 'failed',
           error_details = jsonb_build_object(
             'code', SQLSTATE,
             'message', SQLERRM,
             'detail', COALESCE(v_pre_state, '{}'::JSONB)
           ),
           completed_at = NOW()
     WHERE id = v_audit_id;
  END IF;
  RAISE;
END;
$function$;


-- fn_atomic_exec_to_plan_transition: live pg_get_functiondef() capture + the stamp edit ONLY. Provenance, capture
-- timestamp and per-line diff: database/evidence/canonical-writer-choke/fn_atomic_exec_to_plan_transition.{before,after}.sql
-- and fn_atomic_exec_to_plan_transition.diff.txt. Deliberately no timestamp inline -- one representation, in the artifacts.
CREATE OR REPLACE FUNCTION public.fn_atomic_exec_to_plan_transition(p_sd_id text, p_prd_id text, p_session_id text, p_request_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_sd_uuid UUID;
  v_prd_uuid UUID;
  v_pre_state JSONB;
  v_post_state JSONB;
  v_audit_id UUID;
  v_request_id TEXT;
  v_sd_row RECORD;
  v_prd_row RECORD;
  v_lock_acquired BOOLEAN;
  v_stories_updated INTEGER;
BEGIN
  -- Generate request_id for idempotency if not provided
  v_request_id := COALESCE(p_request_id, p_sd_id || '-' || p_session_id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT);

  -- Check for duplicate request (idempotency)
  SELECT id INTO v_audit_id
  FROM sd_transition_audit
  WHERE request_id = v_request_id AND status = 'completed';

  IF v_audit_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent_hit', true,
      'message', 'Transition already completed',
      'audit_id', v_audit_id
    );
  END IF;

  -- Resolve SD UUID from id or sd_key
  SELECT uuid_id INTO v_sd_uuid
  FROM strategic_directives_v2
  WHERE id = p_sd_id OR sd_key = p_sd_id
  LIMIT 1;

  IF v_sd_uuid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'SD not found: ' || p_sd_id);
  END IF;

  -- Resolve PRD UUID if provided
  IF p_prd_id IS NOT NULL AND p_prd_id != '' THEN
    SELECT uuid_id INTO v_prd_uuid
    FROM product_requirements_v2
    WHERE prd_id = p_prd_id OR uuid_id::TEXT = p_prd_id
    LIMIT 1;
  END IF;

  -- Acquire advisory lock (transaction-scoped, auto-releases on commit/rollback)
  v_lock_acquired := pg_try_advisory_xact_lock(hashtext(p_sd_id));

  IF NOT v_lock_acquired THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Concurrent transition in progress',
      'code', 'CONCURRENT_LOCK'
    );
  END IF;

  -- Capture pre-state
  SELECT id, status, current_phase, transition_version, progress
  INTO v_sd_row
  FROM strategic_directives_v2
  WHERE uuid_id = v_sd_uuid
  FOR UPDATE; -- Row-level lock

  v_pre_state := jsonb_build_object(
    'sd_id', p_sd_id,
    'sd_status', v_sd_row.status,
    'sd_phase', v_sd_row.current_phase,
    'sd_version', v_sd_row.transition_version,
    'sd_progress', v_sd_row.progress
  );

  -- Add PRD state if exists
  IF v_prd_uuid IS NOT NULL THEN
    SELECT prd_id, status, phase
    INTO v_prd_row
    FROM product_requirements_v2
    WHERE uuid_id = v_prd_uuid
    FOR UPDATE;

    v_pre_state := v_pre_state || jsonb_build_object(
      'prd_id', p_prd_id,
      'prd_status', v_prd_row.status,
      'prd_phase', v_prd_row.phase
    );
  END IF;

  -- Create audit record (in_progress)
  INSERT INTO sd_transition_audit (sd_id, transition_type, session_id, request_id, pre_state, status)
  VALUES (v_sd_uuid, 'EXEC_TO_PLAN', p_session_id, v_request_id, v_pre_state, 'in_progress')
  RETURNING id INTO v_audit_id;

  -- === ATOMIC TRANSITIONS START ===

  -- Step 1: Update user stories to validated/completed
  -- FIX: Cast v_sd_uuid to text because user_stories.sd_id is varchar(50), not UUID
  UPDATE user_stories
  SET
    status = CASE WHEN status = 'in_progress' THEN 'completed' ELSE status END,
    implementation_status = 'validated',
    updated_at = NOW()
  WHERE sd_id = v_sd_uuid::text
  AND status IN ('in_progress', 'draft', 'ready');

  GET DIAGNOSTICS v_stories_updated = ROW_COUNT;

  -- Step 2: Update PRD status to verification
  IF v_prd_uuid IS NOT NULL THEN
    UPDATE product_requirements_v2
    SET
      status = 'verification',
      phase = 'verification',
      updated_at = NOW()
    WHERE uuid_id = v_prd_uuid;
  END IF;

  -- Step 3: Update SD phase to EXEC_COMPLETE
  -- FIX: Use 'active' instead of 'verification' (not valid in strategic_directives_v2_status_check)
  UPDATE strategic_directives_v2
  SET
    current_phase = 'EXEC_COMPLETE',
    status = 'active',
    lifecycle_write_token = 'fn_atomic_exec_to_plan_transition',
    transition_version = COALESCE(transition_version, 1) + 1,
    updated_at = NOW()
  WHERE uuid_id = v_sd_uuid;

  -- === ATOMIC TRANSITIONS END ===

  -- Capture post-state
  v_post_state := jsonb_build_object(
    'sd_phase', 'EXEC_COMPLETE',
    'sd_status', 'active',
    'prd_status', 'verification',
    'stories_updated', v_stories_updated
  );

  -- Update audit record to completed
  UPDATE sd_transition_audit
  SET
    status = 'completed',
    post_state = v_post_state,
    completed_at = NOW()
  WHERE id = v_audit_id;

  RETURN jsonb_build_object(
    'success', true,
    'audit_id', v_audit_id,
    'stories_updated', v_stories_updated,
    'pre_state', v_pre_state,
    'post_state', v_post_state
  );

EXCEPTION WHEN OTHERS THEN
  -- Log error to audit table
  IF v_audit_id IS NOT NULL THEN
    UPDATE sd_transition_audit
    SET
      status = 'failed',
      error_details = jsonb_build_object(
        'code', SQLSTATE,
        'message', SQLERRM,
        'detail', COALESCE(v_pre_state, '{}'::JSONB)
      ),
      completed_at = NOW()
    WHERE id = v_audit_id;
  END IF;

  -- Re-raise to trigger transaction rollback
  RAISE;
END;
$function$;


-- complete_orchestrator_sd: live pg_get_functiondef() capture + the stamp edit ONLY. Provenance, capture
-- timestamp and per-line diff: database/evidence/canonical-writer-choke/complete_orchestrator_sd.{before,after}.sql
-- and complete_orchestrator_sd.diff.txt. Deliberately no timestamp inline -- one representation, in the artifacts.
CREATE OR REPLACE FUNCTION public.complete_orchestrator_sd(sd_id_param character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sd RECORD;
  is_orch BOOLEAN;
  children_done BOOLEAN;
  total_children INT;
  completed_children INT;
  cancelled_children INT;
  children_without_handoffs INT;
  child_quality_issues JSONB;
  lead_to_plan_accepted_at TIMESTAMPTZ;
  retro_exists BOOLEAN;
  lfa_witness_exists BOOLEAN;
  completion_narrative TEXT;
BEGIN
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SD not found: ' || sd_id_param);
  END IF;

  IF sd.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'message', 'SD already completed', 'sd_id', sd_id_param);
  END IF;

  is_orch := is_orchestrator_sd(sd_id_param);
  IF NOT is_orch THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not an orchestrator SD (has no children)', 'sd_id', sd_id_param);
  END IF;

  -- SD-LEO-FIX-ORCHESTRATOR-LEAF-ROUTER-001 (incorporated from 20260711 (c)):
  -- cancelled is a terminal disposition, same as completed.
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('completed', 'cancelled')),
    COUNT(*) FILTER (WHERE status = 'cancelled')
  INTO total_children, completed_children, cancelled_children
  FROM strategic_directives_v2
  WHERE parent_sd_id = sd_id_param;

  children_done := (completed_children = total_children);
  IF NOT children_done THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Not all children completed: %s/%s', completed_children, total_children),
      'completed_children', completed_children,
      'total_children', total_children
    );
  END IF;

  -- PCVP (incorporated from 20260711 (c)): only 'completed' children (never 'cancelled')
  -- are required to have handoff evidence.
  SELECT COUNT(*) INTO children_without_handoffs
  FROM strategic_directives_v2 child
  WHERE child.parent_sd_id = sd_id_param
    AND child.status = 'completed'
    AND NOT EXISTS (
      SELECT 1 FROM sd_phase_handoffs h
      WHERE h.sd_id = child.id AND h.status = 'accepted'
    );
  IF children_without_handoffs > 0 THEN
    SELECT jsonb_agg(jsonb_build_object(
      'sd_key', child.sd_key, 'title', child.title,
      'issue', 'No accepted handoff records found'
    ))
    INTO child_quality_issues
    FROM strategic_directives_v2 child
    WHERE child.parent_sd_id = sd_id_param
      AND child.status = 'completed'
      AND NOT EXISTS (
        SELECT 1 FROM sd_phase_handoffs h
        WHERE h.sd_id = child.id AND h.status = 'accepted'
      );
    RETURN jsonb_build_object(
      'success', false,
      'error', format('PCVP: %s child(ren) completed without handoff evidence', children_without_handoffs),
      'children_without_handoffs', children_without_handoffs,
      'quality_issues', child_quality_issues,
      'hint', 'Each child SD must have at least one accepted handoff in sd_phase_handoffs'
    );
  END IF;

  -- SD-FDBK-FIX-ORCHESTRATOR-GHOST-COMPLETE-001: canonical completion-retro check
  -- (mirrors scripts/modules/handoff/retro-filters.js): retro_type='SD_COMPLETION',
  -- not tagged as a handoff-time retro, created after LEAD-TO-PLAN acceptance
  -- (fallback: SD creation time).
  SELECT COALESCE(
    (SELECT accepted_at FROM sd_phase_handoffs
     WHERE sd_id = sd_id_param AND from_phase = 'LEAD' AND to_phase = 'PLAN' AND status = 'accepted'
     ORDER BY accepted_at DESC LIMIT 1),
    sd.created_at,
    to_timestamp(0)
  ) INTO lead_to_plan_accepted_at;

  SELECT EXISTS (
    SELECT 1 FROM retrospectives
    WHERE sd_id = sd_id_param
      AND retro_type = 'SD_COMPLETION'
      AND (retrospective_type IS NULL OR retrospective_type = 'SD_COMPLETION')
      AND created_at > lead_to_plan_accepted_at
  ) INTO retro_exists;

  IF NOT retro_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'SD-completion retrospective required (retro_type=SD_COMPLETION, created after LEAD-TO-PLAN acceptance)',
      'hint', 'Run the RETRO sub-agent to generate a retro_type=SD_COMPLETION retrospective, then re-run'
    );
  END IF;

  -- Completion witness: a genuine accepted LEAD-FINAL-APPROVAL handoff row WRITTEN BY
  -- THE EXECUTOR. created_by is the discriminator: privileged actors (ADMIN_OVERRIDE,
  -- the legacy auto-complete actor) can insert accepted rows via handoff_actor_policy(),
  -- so an unqualified EXISTS would be forgeable with a single INSERT.
  -- (Actor names deliberately not spelled out here: this comment lives inside prosrc and
  -- scripts/orchestrator-rpc-enforcement-status.mjs greps the live body for markers.)
  SELECT EXISTS (
    SELECT 1 FROM sd_phase_handoffs
    WHERE sd_id = sd_id_param
      AND handoff_type = 'LEAD-FINAL-APPROVAL'
      AND status = 'accepted'
      AND created_by IN ('UNIFIED-HANDOFF-SYSTEM', 'unified-handoff-system')
  ) INTO lfa_witness_exists;

  IF NOT lfa_witness_exists THEN
    -- Stage for the real executor instead of fabricating completion.
    -- is_working_on is deliberately NOT cleared: the LFA executor's canonical handoff
    -- insert (created_by='UNIFIED-HANDOFF-SYSTEM') does not skip the claim check, and
    -- enforce_is_working_on_for_handoffs rejects the insert when is_working_on is false
    -- (parity with completeStandardSD's staging behavior).
    UPDATE strategic_directives_v2
    SET status = 'pending_approval', lifecycle_write_token = 'complete_orchestrator_sd', updated_at = now()
    WHERE id = sd_id_param AND status <> 'completed';

    RETURN jsonb_build_object(
      'success', false,
      'staged', true,
      'error', 'LEAD-FINAL-APPROVAL required before completion — SD staged at pending_approval',
      'hint', format('Run: node scripts/handoff.js execute LEAD-FINAL-APPROVAL %s', COALESCE(sd.sd_key, sd_id_param)),
      'sd_id', sd_id_param
    );
  END IF;

  -- Genuine LEAD-FINAL evidence exists — completion is legitimate.
  completion_narrative := CASE WHEN cancelled_children = 0
    THEN format('All %s child SDs completed with verified handoff evidence. Quality verified across all children.', total_children)
    ELSE format('%s of %s child SDs completed with verified handoff evidence; %s cancelled (a terminal disposition, not a quality failure — cancelled children never require handoff evidence).', completed_children - cancelled_children, total_children, cancelled_children)
  END;

  UPDATE strategic_directives_v2
  SET status = 'completed', current_phase = 'COMPLETED', is_working_on = false, lifecycle_write_token = 'complete_orchestrator_sd', updated_at = now()
  WHERE id = sd_id_param;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Orchestrator completed (LEAD-FINAL-APPROVAL verified): %s', completion_narrative),
    'sd_id', sd_id_param,
    'completed_children', completed_children - cancelled_children,
    'cancelled_children', cancelled_children,
    'quality_verified', cancelled_children = 0
  );
END;
$function$;


-- update_sd_after_exec_completion: live pg_get_functiondef() capture + the stamp edit ONLY. Provenance, capture
-- timestamp and per-line diff: database/evidence/canonical-writer-choke/update_sd_after_exec_completion.{before,after}.sql
-- and update_sd_after_exec_completion.diff.txt. Deliberately no timestamp inline -- one representation, in the artifacts.
CREATE OR REPLACE FUNCTION public.update_sd_after_exec_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    -- Update SD status when implementation is completed
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        UPDATE strategic_directives_v2
        SET
            status = CASE
                WHEN NEW.quality_score >= 90 THEN 'implementation_complete'
                WHEN NEW.quality_score >= 75 THEN 'implementation_complete'
                ELSE 'implementation_review_required'
            END,
            lifecycle_write_token = 'update_sd_after_exec_completion',
            updated_at = NOW()
        WHERE id = NEW.sd_id;
    END IF;

    RETURN NEW;
END;
$function$;


-- update_sd_after_lead_evaluation: live pg_get_functiondef() capture + the stamp edit ONLY. Provenance, capture
-- timestamp and per-line diff: database/evidence/canonical-writer-choke/update_sd_after_lead_evaluation.{before,after}.sql
-- and update_sd_after_lead_evaluation.diff.txt. Deliberately no timestamp inline -- one representation, in the artifacts.
CREATE OR REPLACE FUNCTION public.update_sd_after_lead_evaluation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    -- Update SD status based on LEAD decision
    UPDATE strategic_directives_v2
    SET
        status = CASE
            WHEN NEW.final_decision = 'APPROVE' THEN 'active'
            WHEN NEW.final_decision = 'REJECT' THEN 'rejected'
            WHEN NEW.final_decision IN ('CONDITIONAL', 'CLARIFY') THEN 'pending_revision'
            ELSE status -- Keep current status for DEFER/CONSOLIDATE
        END,
        lifecycle_write_token = 'update_sd_after_lead_evaluation',
        updated_at = NOW()
    WHERE id = NEW.sd_id;

    RETURN NEW;
END;
$function$;


-- update_sd_after_plan_validation: live pg_get_functiondef() capture + the stamp edit ONLY. Provenance, capture
-- timestamp and per-line diff: database/evidence/canonical-writer-choke/update_sd_after_plan_validation.{before,after}.sql
-- and update_sd_after_plan_validation.diff.txt. Deliberately no timestamp inline -- one representation, in the artifacts.
CREATE OR REPLACE FUNCTION public.update_sd_after_plan_validation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    -- Update SD status based on PLAN validation decision
    UPDATE strategic_directives_v2
    SET
        status = CASE
            WHEN NEW.final_decision = 'APPROVE' THEN 'validated'
            WHEN NEW.final_decision = 'REJECT' THEN 'technical_review_required'
            WHEN NEW.final_decision IN ('CONDITIONAL', 'REDESIGN', 'RESEARCH') THEN 'plan_revision_required'
            ELSE status -- Keep current status for DEFER
        END,
        lifecycle_write_token = 'update_sd_after_plan_validation',
        updated_at = NOW()
    WHERE id = NEW.sd_id;

    RETURN NEW;
END;
$function$;


-- update_sd_progress_from_phases: live pg_get_functiondef() capture + the stamp edit ONLY. Provenance, capture
-- timestamp and per-line diff: database/evidence/canonical-writer-choke/update_sd_progress_from_phases.{before,after}.sql
-- and update_sd_progress_from_phases.diff.txt. Deliberately no timestamp inline -- one representation, in the artifacts.
CREATE OR REPLACE FUNCTION public.update_sd_progress_from_phases()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    -- Update the SD's progress and current phase
    UPDATE strategic_directives_v2
    SET
        progress = calculate_sd_progress(NEW.sd_id),
        current_phase = (
            SELECT phase_name
            FROM sd_phase_tracking
            WHERE sd_id = NEW.sd_id AND is_complete = false
            ORDER BY
                CASE phase_name
                    WHEN 'LEAD_APPROVAL' THEN 1
                    WHEN 'PLAN_DESIGN' THEN 2
                    WHEN 'EXEC_IMPLEMENTATION' THEN 3
                    WHEN 'PLAN_VERIFICATION' THEN 4
                    WHEN 'LEAD_FINAL_APPROVAL' THEN 5
                END
            LIMIT 1
        ),
        lifecycle_write_token = 'update_sd_progress_from_phases',
        updated_at = NOW()
    WHERE id = NEW.sd_id;

    -- Mark as completed if all phases are complete
    UPDATE strategic_directives_v2
    SET
        status = 'completed',
        completion_date = NOW(),
        lifecycle_write_token = 'update_sd_progress_from_phases'
    WHERE id = NEW.sd_id
    AND NOT EXISTS (
        SELECT 1 FROM sd_phase_tracking
        WHERE sd_id = NEW.sd_id AND is_complete = false
    )
    AND status != 'completed';

    RETURN NEW;
END;
$function$;


-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 5. $verify$ — STRUCTURAL POST-CONDITIONS, RUN AS PART OF THE APPLY ITSELF
-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- Read-only and re-runnable. It performs NO write to strategic_directives_v2: a behavioural probe
-- here would mean this file mutates the very table it is guarding, during a chairman ceremony, on
-- live data. The behavioural proofs live in the DDL tier
-- (tests/ddl/strategic-directives-canonical-writer-choke-ddl.db.test.js) against an ephemeral clone.
--
-- The ordering assertion below is FR-2's STAGE 2 -- the one that could not exist during EXEC because
-- neither trigger was live then. Putting it here means the apply itself fails closed if a sibling
-- trigger has since landed outside the aaa_/zzz_ bounds.
DO $verify$
DECLARE
  v_def          text;
  v_first        text;
  v_last         text;
  v_n_before_row int;
  v_registry_n   int;
  v_unwired      text;
  v_bad_fn       text;
  v_dirty        bigint;
BEGIN
  -- (a) the stamp column, nullable with no default, no backfill required
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'strategic_directives_v2'
      AND column_name = 'lifecycle_write_token'
      AND is_nullable = 'YES' AND column_default IS NULL
  ) THEN
    RAISE EXCEPTION 'canonical-writer choke: lifecycle_write_token missing, NOT NULL, or carrying a DEFAULT — refusing to deploy';
  END IF;

  -- (b) the registry answers, and answers NEGATIVELY for an unknown identity (a registry that says
  --     yes to everything would satisfy a naive existence check while enforcing nothing)
  SELECT count(*) INTO v_registry_n FROM public.sd_canonical_writer_policy();
  IF v_registry_n < 10 THEN
    RAISE EXCEPTION 'canonical-writer choke: registry returned only % rows — refusing to deploy an allowlist this small', v_registry_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sd_canonical_writer_policy('handoff.js')) THEN
    RAISE EXCEPTION 'canonical-writer choke: the canonical writer handoff.js is not in its own registry — refusing to deploy';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sd_canonical_writer_policy('definitely-not-a-registered-writer')) THEN
    RAISE EXCEPTION 'canonical-writer choke: registry accepted an unknown identity — it is decorative, refusing to deploy';
  END IF;

  -- (c) both guard triggers exist, BEFORE ROW, on UPDATE, and share the one guard function
  IF (SELECT count(*) FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_proc p ON p.oid = t.tgfoid
       WHERE n.nspname = 'public' AND c.relname = 'strategic_directives_v2'
         AND NOT t.tgisinternal
         AND p.proname = 'enforce_canonical_lifecycle_write'
         AND (t.tgtype & 2) = 2 AND (t.tgtype & 1) = 1 AND (t.tgtype & 16) > 0
         AND t.tgname IN ('aaa_enforce_canonical_lifecycle_write',
                          'zzz_enforce_canonical_lifecycle_write_final')) <> 2 THEN
    RAISE EXCEPTION 'canonical-writer choke: expected exactly 2 BEFORE ROW UPDATE guard triggers wired to enforce_canonical_lifecycle_write — refusing to deploy';
  END IF;

  -- (d) FR-2 STAGE 2 — the aaa_/zzz_ bound, asserted against the REAL live trigger estate under the
  --     collation Postgres itself uses to order triggers (strcmp == COLLATE "C", NOT the database
  --     default; queried under the default collation the first trigger appears to be an AFTER
  --     trigger, which is a misleading answer for BEFORE-order reasoning).
  SELECT count(*), min(t.tgname::text COLLATE "C"), max(t.tgname::text COLLATE "C")
    INTO v_n_before_row, v_first, v_last
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'strategic_directives_v2'
     AND NOT t.tgisinternal AND (t.tgtype & 2) = 2 AND (t.tgtype & 1) = 1;

  IF v_first <> 'aaa_enforce_canonical_lifecycle_write' THEN
    RAISE EXCEPTION 'canonical-writer choke: % sorts BEFORE the guard among % BEFORE ROW triggers — the guard would not see the original NEW tuple. Refusing to deploy.', v_first, v_n_before_row;
  END IF;
  IF v_last <> 'zzz_enforce_canonical_lifecycle_write_final' THEN
    RAISE EXCEPTION 'canonical-writer choke: % sorts AFTER the final guard among % BEFORE ROW triggers — a later trigger could mutate a protected column unobserved. Refusing to deploy.', v_last, v_n_before_row;
  END IF;

  -- (d2) NULL-AT-REST, as a REAL COUNT over the table — not an echo of the reset's own ROW_COUNT.
  --      $reset_at_rest$ asserts the PRECONDITION for arming (nothing dirty before the triggers are
  --      created). This asserts the END STATE of the whole migration: guard armed AND zero stamps at
  --      rest. Different moments, different claims — a row dirtied between the two would satisfy the
  --      first and fail this one.
  SELECT count(*) INTO v_dirty
    FROM public.strategic_directives_v2 WHERE lifecycle_write_token IS NOT NULL;
  IF v_dirty <> 0 THEN
    RAISE EXCEPTION 'canonical-writer choke: % row(s) carry a non-NULL lifecycle_write_token at rest with the guard armed. Every subsequent unstamped write to those rows would inherit a valid stamp. Refusing to deploy.', v_dirty;
  END IF;

  -- (e) FR-6 — the depth exemption must be ABSENT, not merely superseded
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'enforce_canonical_lifecycle_write';
  IF v_def LIKE '%pg_trigger_depth%' THEN
    RAISE EXCEPTION 'canonical-writer choke: the guard references pg_trigger_depth() — FR-6 dropped the depth exemption entirely. Refusing to deploy.';
  END IF;

  -- (f) FR-1 AC#4 / TS-30 — the two message texts, and the "0 rows" collision that would make a
  --     genuine rejection read as success at skip-and-continue.js:148
  IF v_def NOT LIKE '%missing canonical-writer stamp on protected-column write%'
     OR v_def NOT LIKE '%stamp value not present in canonical-writer registry%' THEN
    RAISE EXCEPTION 'canonical-writer choke: one of the two required SDCW1 message texts is missing — refusing to deploy';
  END IF;
  IF v_def LIKE '%0 rows%' THEN
    RAISE EXCEPTION 'canonical-writer choke: guard text contains the substring "0 rows", which scripts/modules/handoff/skip-and-continue.js reads as SUCCESS — refusing to deploy';
  END IF;

  -- (g) every amended function actually carries a stamp assignment
  FOR v_bad_fn IN
    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('auto_transition_status', 'complete_orchestrator_sd',
                         'fn_atomic_lead_to_plan_transition', 'fn_atomic_exec_to_plan_transition',
                         'update_sd_after_exec_completion', 'update_sd_after_lead_evaluation',
                         'update_sd_after_plan_validation', 'update_sd_progress_from_phases')
       AND pg_get_functiondef(p.oid) NOT LIKE '%lifecycle_write_token%'
  LOOP
    RAISE EXCEPTION 'canonical-writer choke: % does not set lifecycle_write_token — its own writes would be rejected by the guard it ships with. Refusing to deploy.', v_bad_fn;
  END LOOP;

  -- (h) LOUD, NON-FATAL: writers that are registered but whose CODE does not yet send the stamp.
  --     Applying with a non-empty list here takes those tools offline (see the PRE-APPLY BLOCKER in
  --     this file's header). Deliberately a WARNING and not an EXCEPTION: FR-4 scopes this SD's
  --     stamp wiring to the handoff pipeline plus the DB functions above, so wiring the remainder
  --     is a prerequisite of the APPLY CEREMONY, not of this file.
  SELECT string_agg(writer_identity, ', ' ORDER BY writer_identity) INTO v_unwired
    FROM public.sd_canonical_writer_policy()
   WHERE (capability_flags->>'stamp_wired')::boolean IS NOT TRUE;
  IF v_unwired IS NOT NULL THEN
    RAISE WARNING 'canonical-writer choke: % registered writer(s) do NOT yet send the stamp and WILL start raising SDCW1: %',
      (SELECT count(*) FROM public.sd_canonical_writer_policy()
        WHERE (capability_flags->>'stamp_wired')::boolean IS NOT TRUE), v_unwired;
  END IF;
END
$verify$;
