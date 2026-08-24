// SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 — SECURITY evidence (EXEC phase).
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = '0f589709-f317-4d79-ab3a-22a6b8a2faaf';
const PHASE = 'EXEC';

const findings = [
  {
    id: 'deploy-order-stamp-column-absent-in-prod',
    severity: 'critical',
    title: 'Every wired stamp write hard-fails with PGRST204 until the chairman-gated migration is applied',
    note:
      'MEASURED, not reasoned. (1) information_schema.columns shows NO lifecycle_write_token on public.strategic_directives_v2 in the live EHG_Engineer DB; registry_fn=0, guard_fn=0, guard_triggers=0 — the migration is correctly unapplied per TR-1. (2) Zero-write PostgREST probe via lib/supabase-client.js createSupabaseServiceClient(), .eq(\'id\',\'__SECURITY_PROBE_NO_SUCH_SD__\') so no row can match: payload INCLUDING lifecycle_write_token returns {"code":"PGRST204","message":"Could not find the \'lifecycle_write_token\' column of \'strategic_directives_v2\' in the schema cache"}; the identical probe WITHOUT it returns error:null, data:[]. PostgREST validates the payload against its schema cache independently of row matching, so this is not a rare path — it is the first call at every wired site. ' +
      'BLAST RADIUS: all 12 wired own-UPDATE sites, i.e. every handoff lifecycle transition — lead-to-plan/state-transitions.js:54 (rollback) and :129 (forward), plan-to-exec/state-transitions.js:51 (rollback) and :162 (forward), exec-to-plan/state-transitions.js:145, plan-to-lead/index.js:502, plan-to-lead/state-transitions.js:527, lead-final-approval/index.js:634, lead-to-plan/gates/transition-readiness.js:62, skip-and-continue.js:142, lib/orchestrator-terminal-guard.js:76, cli/execution-helpers.js:86. ' +
      'AGGRAVATING FACTOR: the new re-raise added to both rollback paths only fires on error.code === CANONICAL_WRITE_SQLSTATE (SDCW1). PGRST204 is not SDCW1, so isCanonicalWriteRejection() returns false and the pre-existing swallow applies — the compensating write silently no-ops behind a console.log, leaving the SD half-transitioned. That is exactly the "recoverable failure becomes a stuck SD" outcome FR-4\'s F8 amendment exists to prevent, reached through a different door. ' +
      'ROOT CAUSE IS A FALSE CLAIM IN CODE: scripts/modules/handoff/lib/canonical-writer-stamp.js:19-21 states "sending this column is harmless before the migration applies (it is an ordinary column) ... No feature flag is needed in either direction." It is not an ordinary column; it does not exist. This is the ONLY deploy-order statement anywhere in the SD — a repo-wide grep for deploy/merge-order language across database/, scripts/modules/handoff/ and tests/ returns just this line. database/chairman-gated/README.md documents only the REVERSE-direction sequencing hazard (the PRE-APPLY BLOCKER about 13 registered-but-unwired writers) and is silent on code-before-apply. ' +
      'REMEDIATION, before this branch merges to main — (a) PREFERRED: split "ALTER TABLE public.strategic_directives_v2 ADD COLUMN IF NOT EXISTS lifecycle_write_token TEXT;" into its own additive migration and apply it first. Catalog-only in PG11+ (no DEFAULT, no table rewrite), it decouples the code merge from the chairman ceremony entirely and leaves the gated file carrying only enforcement objects. Still run SET lock_timeout=\'3s\' per TR-2. (b) OTHERWISE: make the merge order an explicit, written constraint on the PR/SD — this branch does not land until the ceremony completes — rather than something a reader has to infer. (c) EITHER WAY: correct the DEPLOY ORDER note in canonical-writer-stamp.js. A measurably false safety claim in the one shared module is the durable defect; it would license exactly the deploy order that breaks the pipeline.',
  },
  {
    id: 'reapply-after-mode1-rollback-inherits-valid-stamps',
    severity: 'high',
    title: 'Re-applying the guard after a MODE 1 rollback degrades it to no-guard on exactly the hot rows',
    note:
      'MODE 1 (the DOWN file) drops BOTH triggers — including zzz_enforce_canonical_lifecycle_write_final, the only enforcer of the NULL-at-rest property — while deliberately RETAINING the column and deliberately NOT reverting the eight amended function bodies or the JS stamp payloads. Both non-reverts are correct in isolation and well argued. Their composition is the hazard: throughout the rollback window every canonical write persists a REGISTRY-VALID value at rest (\'handoff.js\', \'auto_transition_status\', \'complete_orchestrator_sd\', ...), because nothing is left to NULL it. ' +
      'The UP file advertises itself as "safely RE-RUNNABLE FROM THE TOP with no manual cleanup." Re-running it performs ADD COLUMN IF NOT EXISTS (a no-op, the column survived) and re-creates the triggers, with NO backfill UPDATE and no $verify$ clause asserting the column is NULL at rest. Every row touched during the window therefore re-enters enforcement already carrying an inherited valid stamp, so the NEXT unstamped protected-column write on that row passes both guards. That is precisely FR-3\'s F1b stale-stamp-reuse defect — the one the whole NULL-at-rest design exists to close — re-armed but blind on the rows canonical writers touch most. Under this SD\'s stated threat model the consequence is that the guard silently misses exactly the drifted writes it was redeployed to catch. ' +
      'NOT COVERED BY TESTS: TS-31 (tests/ddl/strategic-directives-canonical-writer-choke-ddl.db.test.js:1330) proves NULL-at-rest only with the triggers PRESENT. The DOWN-script coverage at :1462 is text assertion only (toMatch(/DELIBERATELY RETAINED, NOT DROPPED/), MODE 1/MODE 2 strings) — there is no behavioural rollback-then-re-apply cycle anywhere in the 67 scenarios. ' +
      'REMEDIATION (small, additive, safe on first apply): immediately before the two CREATE TRIGGER statements in the UP file, add "UPDATE public.strategic_directives_v2 SET lifecycle_write_token = NULL WHERE lifecycle_write_token IS NOT NULL;" — it changes no protected column so it cannot trip anything, and on a first apply it is a 0-row no-op. Then add a $verify$ clause asserting count(*) FILTER (WHERE lifecycle_write_token IS NOT NULL) = 0, so a future re-apply fails closed rather than arming a blind guard.',
  },
  {
    id: 'tr4-non-coverage-names-service-role-but-authenticated-is-the-real-forger',
    severity: 'medium',
    title: 'Stamp-forgery non-coverage is disclosed for service_role only; the reasoning does not transfer to the authenticated role',
    note:
      'This addresses the review question "is TR-4 accurately represented, not overstated." Two halves, opposite answers. ' +
      'ACCURATE AND VERIFIED: the anon claim. Measured — anon holds table-level UPDATE on strategic_directives_v2 but its ONLY RLS policy is anon_read_strategic_directives_v2 (cmd=SELECT). With no anon-covering UPDATE policy, zero rows qualify and anon writes are silent 0-row no-ops before any BEFORE ROW trigger fires. The migration header\'s non-coverage item 3, and its decision to deliberately EXCLUDE those writers from the registry rather than allowlist a dead-by-RLS caller, are both correct. ' +
      'THE GAP: FR-3 and the migration header frame stamp-forgery non-coverage as a service_role concern, resting on "such a caller already holds ALTER TABLE ... DISABLE TRIGGER and gains nothing by forging a stamp." That argument does not transfer to authenticated. Measured: authenticated holds table-level UPDATE AND a permissive policy venture_update_strategic_directives_v2 with qual ((venture_id IS NULL) OR fn_user_has_venture_access(venture_id)); most SDs carry venture_id IS NULL, so authenticated can already UPDATE nearly every row. An authenticated caller CANNOT disable the trigger, but the migration\'s own GRANT EXECUTE ON FUNCTION public.sd_canonical_writer_policy(text) TO service_role, authenticated lets it enumerate the allowlist and copy a valid identity. So "a forger gains nothing" is true only for service_role. ' +
      'THIS IS NOT A PRIVILEGE EXPANSION, and I want that recorded as clearly as the gap: pre-guard, authenticated writes these columns freely with no stamp at all; post-guard it needs a string it can look up. Net capability is unchanged-to-slightly-reduced. The grant is also strictly NARROWER than the cited precedent — measured handoff_actor_policy ACL is "anon=X | authenticated=X | service_role=X | postgres=X", and this SD correctly drops anon. Granting authenticated is moreover REQUIRED for correctness, since the guard is SECURITY INVOKER: without it, every legitimate authenticated write would fail permission-denied. The alternative (making the guard SECURITY DEFINER to avoid the grant) would be a larger surface, so the design choice is right. ' +
      'REMEDIATION IS WORDING, NOT DESIGN: TR-4 and FR-3 should state that the guard adds no protection against the authenticated role either, instead of resting on the "gains nothing by forging" argument that only holds for service_role. Left as-is, a future reader reasonably concludes the guard constrains authenticated writers. It does not.',
  },
  {
    id: 'secdef-search-path-omits-pg-temp-preexisting',
    severity: 'low',
    title: 'Amended SECURITY DEFINER functions pin a search_path that omits pg_temp (pre-existing, correctly out of scope)',
    note:
      'Measured prosecdef/proconfig: complete_orchestrator_sd (SECURITY DEFINER, search_path=public), fn_atomic_lead_to_plan_transition and fn_atomic_exec_to_plan_transition (SECURITY DEFINER, search_path=public, pg_catalog). All three reference strategic_directives_v2 / sd_transition_audit UNQUALIFIED. With pg_temp unlisted it is implicitly searched first for relation names — the classic definer-shadowing vector; the standard hardening is to name pg_temp explicitly LAST. ' +
      'PRE-EXISTING, NOT INTRODUCED HERE. The bodies were captured verbatim via pg_get_functiondef() with only the enumerated stamp lines inserted, which is the correct discipline and is mechanically enforced (the DDL test asserts each *.after.sql body appears verbatim in the migration). Raised only because a CREATE OR REPLACE is the moment such a fix would normally ride along — and the correct call here is NOT to take it, because doing so would break the verbatim-capture invariant this SD deliberately established after a stale migration-file copy produced a real authentication-bypass risk earlier in this session. File as separate remediation; do not fold into this SD. ' +
      'The two NEW functions are clean on this axis: both pin SET search_path TO \'public\', both are SECURITY INVOKER, and the guard schema-qualifies its only call (public.sd_canonical_writer_policy(...)), so shadowing is a non-issue for them.',
  },
  {
    id: 'cleared-after-measurement',
    severity: 'info',
    title: 'Explicitly cleared: injection, information disclosure, stamp controllability, privilege expansion, fail-closed, DOWN safety',
    note:
      'Recorded so a later reader knows these were measured, not skipped. ' +
      '(1) NO SQL INJECTION anywhere in the new objects. sd_canonical_writer_policy is LANGUAGE sql IMMUTABLE over a static inline VALUES CTE with one parameterised comparison (r.writer_identity = p_writer_identity); enforce_canonical_lifecycle_write is plpgsql with no EXECUTE, no dynamic SQL, no string-built statements. Nothing is concatenated into an executable context. ' +
      '(2) MESSAGE/ERROR HANDLING IS SAFE. The two RAISE EXCEPTION ... USING DETAIL calls use format() with %s/%L into message text that is never re-parsed as SQL; %L correctly quotes the one attacker-controlled value (NEW.lifecycle_write_token). Both share ERRCODE SDCW1 and differ only by MESSAGE, and $verify$ (f) mechanically asserts neither message contains the substring "0 rows" — which matters because skip-and-continue.js:150 discriminates optimistic-lock success from failure with updateError.message.includes(\'0 rows\'). That collision guard is a genuinely good catch and is correctly enforced at apply time rather than by convention. ' +
      '(3) NO INFORMATION DISCLOSURE via the error DETAIL. It exposes OLD.status / OLD.current_phase / OLD.completion_date and NEW.id to the rejected writer. Measured: BOTH anon and authenticated already hold SELECT policies on this table with qual = true (anon_read_strategic_directives_v2, authenticated_read_strategic_directives_v2), so DETAIL reveals nothing a plain SELECT does not already grant. The registry notes column (which contains repo file paths) is likewise strictly less sensitive than the SD titles/descriptions/scope the table already exposes to anon. ' +
      '(4) STAMP VALUE IS NOT ATTACKER-CONTROLLABLE on the JS side. Repo-wide grep: all 12 call sites pass the frozen module constant CANONICAL_WRITER_STAMP; the literal \'handoff.js\' appears exactly once (canonical-writer-stamp.js:23) and nowhere else, satisfying FR-5\'s SSOT contract. Zero sites derive the value from argv, env, request payload, or DB content. ' +
      '(5) NO WRITE-CAPABILITY EXPANSION from the column. Table-level privileges are already DELETE/INSERT/SELECT/UPDATE for anon, authenticated, service_role and postgres; a new column inherits them and no column-level GRANT/REVOKE is introduced. This matches FR-3\'s explicit acceptance criterion that enforcement is value-based and never column-privilege-based. The column is nullable, DEFAULT NULL, no backfill, and the guard is BEFORE UPDATE only — so INSERT/SD-creation paths are structurally untouched. ' +
      '(6) FAIL-CLOSED CONFIRMED BY CONSTRUCTION: enforce_canonical_lifecycle_write contains no EXCEPTION handler, so a registry lookup error propagates and aborts the UPDATE, as FR-3 documents. ' +
      '(7) DOWN SCRIPT IS SAFE and correctly ordered (both triggers dropped before both functions, so no dependency error), and its own $verify_down$ asserts the triggers are gone AND the column survived. Absent finding #2 above, it re-exposes exactly the pre-existing, already-accepted risk plus one inert nullable column — no new risk. ' +
      '(8) THE aaa_/zzz_ TWO-TRIGGER DESIGN IS THE RIGHT CALL from a security standpoint: a single early trigger is genuinely bypassable via a sibling BEFORE trigger that derives a protected column (status_auto_transition, measured at position 6 of 35), and the fully-generic zzz_ also covers a future unaware trigger #36. Dropping the pg_trigger_depth() exemption is likewise correct — a cross-table cascade is depth 1 on an unguarded table, so a depth exemption would have silently whitelisted the only DB-side writer of completion_date on a table with a documented phantom-completion history.',
  },
];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 92,
  summary:
    'Security review of the canonical-writer choke (SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001, EXEC). The design DELIVERS on its stated threat model — accidental/drifted non-canonical writes — with no SQL injection, no information disclosure, no attacker-controllable stamp, and no expansion of write capability. Cleared after live measurement: the registry is a static VALUES CTE with a parameterised comparison (no dynamic SQL); RAISE EXCEPTION DETAIL uses %L for the one attacker-controlled value and is never re-parsed as SQL; the DETAIL leaks nothing beyond the SELECT policies anon and authenticated already hold with qual=true; all 12 JS call sites pass a frozen module constant, with the literal appearing exactly once repo-wide; the new column inherits already-granted table privileges and introduces no column-level grant; the guard is fail-closed by construction; and the DOWN script is correctly ordered and re-exposes only the pre-existing accepted risk. ' +
    'CONDITIONAL on ONE BLOCKING PRE-MERGE ITEM. MEASURED: lifecycle_write_token does NOT exist in the live DB (registry_fn=0, guard_fn=0, guard_triggers=0 — correctly unapplied per TR-1), and a zero-write PostgREST probe proves an UPDATE payload containing that column returns PGRST204 regardless of row match, while the same probe without it succeeds. All 12 wired sites therefore hard-fail on their first call if this branch merges before the chairman ceremony, taking down every handoff lifecycle transition; and because the new rollback re-raise keys on SDCW1, PGRST204 falls through to the pre-existing swallow, silently stranding SDs mid-handoff — the exact outcome FR-4\'s F8 amendment was written to prevent. The root cause is a false claim in canonical-writer-stamp.js:19-21 ("harmless before the migration applies ... it is an ordinary column"), which is the only deploy-order statement anywhere in the SD. Fix by splitting the ADD COLUMN into its own additive migration applied first (preferred), or by making the merge-order constraint explicit — and correct the comment either way. ' +
    'Two further findings: re-applying the guard after a MODE 1 rollback inherits registry-valid stamps left at rest (zzz_ is the only NULL-at-rest enforcer and MODE 1 drops it while retaining both the column and the stamping writers), re-arming the guard blind on exactly the hot rows — closed by a one-line NULL backfill before CREATE TRIGGER plus a $verify$ assertion; and TR-4\'s stamp-forgery non-coverage is disclosed for service_role only, whose "a forger gains nothing, they already hold DISABLE TRIGGER" argument does not transfer to authenticated, which holds a permissive UPDATE policy on nearly every row (venture_id IS NULL) and can enumerate the allowlist via the new EXECUTE grant. That is a wording fix, not a design flaw — net capability for authenticated is unchanged-to-reduced, and the grant is strictly narrower than the handoff_actor_policy precedent it copies. TR-4\'s anon claim was verified ACCURATE (table UPDATE but SELECT-only policy = silent 0-row no-op), and the decision not to allowlist those dead writers is correct.',
  findings,
  metadata: {
    review_type: 'security_architecture_review',
    artifacts_reviewed: [
      'database/chairman-gated/20260824_strategic_directives_canonical_writer_choke.sql (1229 lines, full)',
      'database/chairman-gated/20260824_strategic_directives_canonical_writer_choke_DOWN.sql',
      'database/chairman-gated/README.md (apply-ceremony section)',
      'scripts/modules/handoff/lib/canonical-writer-stamp.js',
      'git diff: scripts/modules/handoff/** (10 files), scripts/leo-orchestrator-enforced.js, scripts/lib/lead-precheck-helpers.js',
      'product_requirements_v2 FR-1..FR-8, TR-1..TR-4 (FR-3, FR-4, TR-1, TR-4 read in full)',
      'tests/ddl/strategic-directives-canonical-writer-choke-ddl.db.test.js (coverage census)',
    ],
    live_measurements: {
      stamp_column_exists_in_prod: false,
      guard_objects_live: { registry_fn: 0, guard_fn: 0, guard_triggers: 0 },
      postgrest_unknown_column_probe: 'PGRST204 — "Could not find the \'lifecycle_write_token\' column of \'strategic_directives_v2\' in the schema cache"; control probe without the column returned error:null',
      postgrest_probe_was_zero_write: 'filter .eq(id, __SECURITY_PROBE_NO_SUCH_SD__) matches no row; control confirmed data:[]',
      rls_enabled: true,
      rls_forced: false,
      anon_policies: 'SELECT only (anon_read_strategic_directives_v2, qual=true) — no UPDATE policy, so anon writes are 0-row no-ops',
      authenticated_update_policy: 'venture_update_strategic_directives_v2, qual=((venture_id IS NULL) OR fn_user_has_venture_access(venture_id))',
      table_grants: 'anon/authenticated/postgres/service_role all hold DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE',
      handoff_actor_policy_acl: 'anon=X | authenticated=X | service_role=X | postgres=X (precedent is BROADER than this SD grant)',
      secdef_search_paths: 'complete_orchestrator_sd=public; fn_atomic_*_transition=public,pg_catalog; all omit pg_temp (pre-existing)',
    },
    blocking_before_merge: ['deploy-order-stamp-column-absent-in-prod'],
    threat_model_verdict: 'Delivers on the stated accidental-drift threat model. No unintended expansion of write capability, no new attack surface, no weakening of any existing RLS or permission boundary.',
    injection_risk: 'none — no dynamic SQL, no EXECUTE, no concatenation in either new function',
    stamp_controllability: 'not attacker-controllable; frozen module constant, literal appears exactly once repo-wide',
    findings_count: findings.length,
  },
  execution_time_ms: 1_500_000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'SECURITY',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(
  'SECURITY',
  SD_ID,
  { name: 'Chief Security Architect' },
  results,
  { phase: PHASE },
);

console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('VERDICT=' + results.verdict + ' CONFIDENCE=' + results.confidence);
console.log('FINDINGS=' + findings.length);
