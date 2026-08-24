// SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 — TESTING evidence, EXEC phase.
// Records what was BUILT, what was EXECUTED and on which tier, and what was NOT executed and why.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = '0f589709-f317-4d79-ab3a-22a6b8a2faaf';
const PHASE = 'EXEC';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  summary:
    'EXEC built the DB guard (staged, never applied — TR-1 held: zero live DDL) plus its DDL proof tier and the ' +
    'JS stamp wiring. EXECUTED: 67/67 DDL scenarios green against real Postgres, and 31/31 JS-side unit assertions ' +
    'green (19 stamp-wiring + 12 scanner-recall). TS-1..TS-28 and TS-30..TS-31 pass on the DDL tier; TS-32 and TS-19 ' +
    'pass on the unit tier; TS-22 is satisfied by FR-5\'s recorded negative finding, asserted rather than narrated. ' +
    'NOT EXECUTED: TS-29 (SQLSTATE round-trip through PostgREST) — it needs the live-PostgREST tier that does not ' +
    'exist here, exactly as implementation_approach\'s tier-boundary note anticipated. CONDITIONAL because of two ' +
    'things a reviewer must decide, not because anything built is known-wrong: (1) 13 registry-allowlisted writers ' +
    'are registered but NOT stamp-wired, so applying the migration before they are wired takes sd:cancel / ' +
    'sd:reactivate / sd:recover / sd:park offline; (2) FR-8 is half-delivered — the scanner recall defect is fixed ' +
    'and proven, the quarantined test\'s restructuring is not, because its acceptance criteria are internally ' +
    'inconsistent (see finding fr8-acceptance-criteria-internally-inconsistent).',
  findings: [
    {
      id: 'ts18-stamp-readback-contradicts-fr3-null-at-rest',
      severity: 'high',
      note:
        'SPEC CONTRADICTION, resolved in favour of FR-3. TS-18 states "After each step, a SELECT confirms ... the ' +
        'stamp column holds the expected registry identity string for that mechanism". That is IMPOSSIBLE under ' +
        'FR-3\'s NULL-at-rest requirement (the F1b stale-stamp-reuse fix), which has zzz_ set the stamp back to NULL ' +
        'on every successful UPDATE — and TS-31 asserts the exact opposite of TS-18 ("The first SELECT reads NULL ' +
        '(not the writer\'s identity string)"). TS-18\'s readback clause predates the F1b amendment. EXEC implemented ' +
        'FR-3/TS-31 (the later, blocking amendment) and implemented TS-18 as status/current_phase reaching the ' +
        'expected values with the stamp reading NULL. The per-mechanism identity claim TS-18 wanted is instead ' +
        'carried by FR-4\'s static same-statement assertion, which reads each mechanism\'s own SQL text. PLAN should ' +
        'amend TS-18\'s expected field so the next reader does not re-derive this.',
    },
    {
      id: 'both-rollback-functions-are-dead-by-unreachability',
      severity: 'high',
      note:
        'MEASURED, and it changes what FR-4\'s F8 amendment is protecting. Both compensation paths FR-4 and FR-5 ' +
        'treat as load-bearing have ZERO call sites repo-wide: `git grep "rollbackSdState|rollbackState"` outside ' +
        'archive/ returns only the two definition lines. lead-to-plan/state-transitions.js exports three functions ' +
        'and its index.js imports exactly one (transitionSdToPlan); captureStateSnapshot is unreferenced too. This is ' +
        'the SAME dead-by-unreachability class the PRD itself corrected for SDRepository.updateStatus(), applied to ' +
        'the sites the PRD promoted to blocking in its place. CONSEQUENCE: FR-4\'s stated hazard — "stamping the ' +
        'forward path without the rollback is strictly WORSE than stamping neither, because it lets the forward ' +
        'transition succeed while guaranteeing its compensation cannot run" — cannot occur today, because no ' +
        'compensation is ever invoked. EXEC stamped and de-swallowed both anyway (correct if they are ever wired, ' +
        'and cheap), but the reachability fact should be recorded so the SD is not credited with closing a live ' +
        'hazard it did not have. The genuinely live question this raises is separate and larger: LEAD-TO-PLAN and ' +
        'PLAN-TO-EXEC currently have NO rollback on handoff failure at all.',
    },
    {
      id: 'pre-apply-blocker-13-registered-writers-not-stamp-wired',
      severity: 'critical',
      note:
        'BLOCKS THE APPLY CEREMONY, not this SD. FR-4 scopes EXEC\'s stamp wiring to the handoff pipeline (12 ' +
        'reachable own-UPDATE sites + the 2 RPC bodies) plus the DB-resident functions amended in the migration. ' +
        'FR-5 separately requires every allowlist-dispositioned writer to hold a registry entry — so 13 writers now ' +
        'have entries while their CODE still sends no stamp: sd:cancel, sd:reactivate, sd:recover, sd:verify, ' +
        'sd-park.js, leo:continuous, stale-session-sweep.cjs, sd-revert.js, release-work-item.mjs, ' +
        'reap-orphaned-provisioning.js, lifecycle-sd-bridge.js, orchestrator-child-completion.js, ' +
        'SDGitStateReconciler.js, plus 5 DB functions (complete_business_evaluation, request_business_evaluation, ' +
        'fn_rollback_sd_hierarchy, delete_venture, kill_venture). Applying before they are wired makes each of them ' +
        'start raising SDCW1. Made QUERYABLE rather than left in prose: capability_flags carries stamp_wired, the ' +
        'migration header states it as a PRE-APPLY BLOCKER, and the $verify$ block RAISEs a WARNING naming every ' +
        'unwired writer at apply time. Deliberately a WARNING and not an EXCEPTION — wiring them is a prerequisite ' +
        'of the ceremony, and FR-4 put it out of this SD\'s scope.',
    },
    {
      id: 'fr8-acceptance-criteria-internally-inconsistent',
      severity: 'medium',
      note:
        'FR-8 asks for three things that cannot all hold. (a) "repair the scanner" — the repair INCREASES its finding ' +
        'count, because the whole defect was 0% recall on multi-line chains and raw SQL. (b) "the test is RESTRUCTURED ' +
        'so the strategic_directives_v2 sub-test un-quarantines independently" — the SD-v2 row already fails today with ' +
        '16 unexempted sites, and the repair makes that strictly more. (c) "not fixed, not exempted" — which removes ' +
        'both ways of getting the count to zero. The consistent reading is that an ADVISORY scanner\'s sub-test should ' +
        'no longer assert "zero unexempted sites" at all (the DB guard is the enforcement now), and should assert ' +
        'RECALL instead. EXEC delivered exactly that half: verifyHelperCoverage() now runs 4 passes (single-line, ' +
        'multi-line chain, raw SQL, caller-declared .rpc()), self-reports advisory:true, and ' +
        'tests/unit/governance/canonical-helper-scanner-recall.test.js proves it now sees SDRepository.js (multiline) ' +
        'and lib/sd-park.js (raw SQL) — TS-20, previously 0% recall on both — plus a synthetic throwaway-table fixture ' +
        'proving the fix generalises, with two-sided cases so a scanner that flagged everything would fail. NOT ' +
        'delivered: the quarantine-manifest restructuring, which needs the assertion-semantics decision above made ' +
        'explicitly rather than by me. Incidental: fixed a latent bug in the same function — the table-name regex ' +
        'escape used $1 with no capture group, so it escaped nothing (inert for every current table name).',
    },
    {
      id: 'transition-readiness-gate-swallows-any-write-error',
      severity: 'medium',
      note:
        'PRE-EXISTING, surfaced while wiring FR-4. lead-to-plan/gates/transition-readiness.js:59 does ' +
        '`await supabase.from(...).update({status:"draft", is_active:true})` WITHOUT destructuring `{ error }`. ' +
        'supabase-js RETURNS errors rather than throwing, so its surrounding try/catch can never fire for a DB error ' +
        '— a guard rejection there would be invisible, the same silent-failure class FR-4\'s F8 amendment fixed for ' +
        'the two rollback sites. F8 named only those two, so repairing this one was out of scope; the site IS stamped, ' +
        'so it will not reject in practice. Worth its own QF.',
    },
    {
      id: 'local-tier-is-pglite-pg18-not-ci-pg16',
      severity: 'low',
      note:
        'HOW THE 67 DDL SCENARIOS WERE ACTUALLY EXECUTED, stated so the result is not over-read. No Postgres and no ' +
        'Docker exist on this host, and the sibling tests/ddl/*.db.test.js files are CI-only for that reason. The ' +
        'suite was run locally against @electric-sql/pglite (real Postgres compiled to WASM, reporting PostgreSQL ' +
        '18.3), aliased in place of `pg` by a THROWAWAY vitest config outside the repo — the checked-in test file was ' +
        'not modified to accommodate it and still uses raw `pg`, fail-closed, no skip branch. Two consequences: ' +
        '(1) CI runs PG16, so a version-dependent behaviour would show up there rather than here; nothing used is ' +
        'version-sensitive (IS DISTINCT FROM, custom SQLSTATE, TG_NAME/TG_ARGV, COLLATE "C" trigger ordering, ' +
        'inline-VALUES SQL functions). (2) PGlite is single-connection, so TS-28\'s two-session EvalPlanQual scenario ' +
        'is VACUOUS locally — it passed without genuine lock contention and is only really exercised in CI. Do not ' +
        'count TS-28 as measured until the CI run is green.',
    },
    {
      id: 'fr7-grep-criterion-unsatisfiable-as-written',
      severity: 'low',
      note:
        'FR-7 AC#1 asks that "grep confirms zero remaining references to markSDComplete or complete-orchestrator.js ' +
        'outside scripts/archive/". Zero CODE references is achieved (markSDComplete() removed from ' +
        'leo-orchestrator-enforced.js along with its stale import comment; complete-orchestrator.js (formerly under scripts/) deleted). ' +
        'The literal criterion is not, and cannot be without unrelated edits: docs/reference/ and ' +
        'docs/summaries/ describe the old behaviour historically, scripts/audit/count-truncation-overrides.json and ' +
        'docs/audits/count-truncation-inventory.json carry file:line keys for the deleted script, and two ' +
        'scripts/one-off/ evidence scripts quote it in recorded findings. Stale override keys are inert (they simply ' +
        'never match a new finding). Also confirmed FR-7\'s third check: no vitest include pattern resurrects ' +
        'test-sd-completion-fix.js — the unit tier collects **/*.test.js and that is a test- PREFIX, not a suffix. ' +
        'Note templates/execute-phase*/ have their OWN markSDComplete; FR-7 targeted only the ' +
        'leo-orchestrator-enforced.js method and those are untouched.',
    },
  ],
  metadata: {
    tier: 'ephemeral-postgres (pglite 18.3 locally; postgres:16 service container in CI)',
    tests_executed: {
      'tests/ddl/strategic-directives-canonical-writer-choke-ddl.db.test.js': '67/67 pass',
      'tests/unit/handoff/canonical-writer-stamp.test.js': '19/19 pass',
      'tests/unit/governance/canonical-helper-scanner-recall.test.js': '12/12 pass',
      'tests/unit/lib/lead-precheck-helpers.test.js': '20/20 pass (pre-existing suite, no regression)',
    },
    ts_coverage: {
      ddl_tier: 'TS-1..TS-18, TS-21, TS-22, TS-23..TS-28, TS-30, TS-31',
      unit_tier: 'TS-19, TS-20, TS-30 (static half), TS-32',
      deferred: 'TS-29 — live-PostgREST tier only; no assertion in either tier claims it',
      vacuous_locally: 'TS-28 — needs two real connections; genuinely exercised only in CI',
    },
    live_ddl_applied: false,
    migration_staged_at: 'database/chairman-gated/20260824_strategic_directives_canonical_writer_choke.sql',
    rollback_staged_at: 'database/chairman-gated/20260824_strategic_directives_canonical_writer_choke_DOWN.sql',
    function_diff_artifacts: 'database/evidence/canonical-writer-choke/*.{before,after}.sql + *.diff.txt (8 functions)',
    rpc_bodies_pulled_live: [
      'fn_atomic_lead_to_plan_transition',
      'fn_atomic_exec_to_plan_transition',
    ],
    stamp_wiring_points_completed: 14,
    stamp_wiring_points_declared_by_fr4: 15,
    stamp_wiring_excluded: 'scripts/modules/handoff/db/SDRepository.js updateStatus() — dead by unreachability, FR-5 removed it from the targets',
    registry_identities: 26,
    registry_identities_stamp_wired: 13,
  },
  execution_time_ms: 9_600_000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'TESTING',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(
  'TESTING',
  SD_ID,
  { name: 'Enhanced QA Engineering Director' },
  results,
  { phase: PHASE },
);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('VERDICT=' + results.verdict + ' CONFIDENCE=' + results.confidence);
console.log('FINDINGS=' + results.findings.length);
