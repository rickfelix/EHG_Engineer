#!/usr/bin/env node
/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E — TESTING at EXEC-TO-PLAN.
 *
 * MEASURED evidence (metadata.measured=true). The hermetic vitest suite shipped in commit
 * 3e39a5cb525 was executed in this worktree; counts below come from a runner-written JSON
 * artifact (vitest --reporter=json) whose sha256 is carried in metadata.test_execution.artifact_sha,
 * per the gate-evidence provenance rule (chairman ratification 6c263823): a gate may read only a
 * runner-produced artifact, never a hand-typed count.
 *
 * SCOPE LIMIT DECLARED UP FRONT: this row certifies the HERMETIC tier only. Live DB behavior
 * (trigger firing, changed_by resolution, backfill counts against committed data, VALIDATE
 * succeeding, CHECK rejection) is NOT verified here — see TEST-6. This LEO fleet worker session is
 * not authorized to open direct DB connections or execute DDL/DML against production (the path was
 * denied by the permission classifier), so the live tier is deferred to the sanctioned,
 * chairman-gated apply-migration.js --prod-deploy path — the same 3-factor gate currently blocking
 * sibling SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-A. Known and accepted limitation, recorded rather than
 * papered over.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD = 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E';
const MIGRATION = 'database/migrations/20260904_capa_002e_audit_triggers_and_disposition_constraints.sql';
const SUITE = 'tests/unit/database/capa-002e-audit-triggers-disposition-constraints.test.js';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 86,
  execution_time_ms: 252,
  // Schema constraint check_validation_mode_values allows only 'prospective' | 'retrospective'.
  // Retrospective: this reviews implementation that already landed (commit 3e39a5cb525).
  validation_mode: 'retrospective',
  summary:
    '14/14 hermetic vitest assertions PASS against the shipped migration (runner artifact sha256 '
    + '5704266e...). The suite covers the migration\'s structural claims well — to_jsonb-only extraction '
    + 'scoped to the function body, the 9-candidate COALESCE, all 4 trigger attachments with timing, the '
    + 'INSERT-only chairman_ratifications decision, the 19 backfilled QF ids, and all 3 CHECK constraints '
    + 'with their exact clauses and NOT VALID+VALIDATE shape. CONDITIONAL_PASS, not PASS: one ordering '
    + 'assertion is anchored on the wrong occurrence and passes for the wrong reason (TEST-1), the 16-row '
    + 'completeness test is partly tautological (TEST-2), and — the accepted limitation — no live DB behavior '
    + 'is verified by this evidence at all (TEST-6). The blocking live-tier condition carried by the '
    + 'PLAN-TO-EXEC TESTING row (65dd914d) is NOT discharged; it is deferred to the chairman-gated apply, '
    + 'not dropped.',

  critical_issues: [],

  warnings: [
    {
      id: 'TEST-1',
      severity: 'MEDIUM',
      issue: 'The widen-before-use ordering assertion is anchored on the header comment, so it passes for the wrong reason',
      evidence:
        'The test "widens the disposition enum to include legacy_grandfathered before it is used" computes '
        + 'widenIdx = migration.indexOf("\'legacy_grandfathered\'"). The FIRST occurrence of that quoted literal in '
        + 'the file is in the header prose (line 50: "the enum is widened with a 6th, honest value: '
        + '\'legacy_grandfathered\'"), NOT the ALTER TABLE ... ADD CONSTRAINT quick_fixes_disposition_check at '
        + 'lines 179-188. The assertion therefore proves only that a COMMENT mentioning the value precedes its '
        + 'use — which holds for any file whose header mentions it, including one where the ALTER was moved after '
        + 'the UPDATE. The real invariant (widen the enum BEFORE the UPDATE that writes the new value, or the '
        + 'migration aborts on the old 5-value check) is currently unasserted. Manually verified correct in the '
        + 'SHIPPED file: ALTER at line 179 precedes the UPDATE at line 208-209 — so the migration is right, but a '
        + 'regression would not be caught.',
      location: `${SUITE} — describe "backfill ordering and completeness", first it()`,
      recommendation:
        'Anchor on the statement, not the literal: widenIdx = migration.indexOf("ADD CONSTRAINT '
        + 'quick_fixes_disposition_check") and assert firstUseIdx > widenIdx. Same class of defect as the '
        + 'function-body slicing the suite already does correctly elsewhere (fnBodyOnly) — apply that discipline here.',
    },
    {
      id: 'TEST-2',
      severity: 'MEDIUM',
      issue: 'The 16-row completeness test asserts a property of its own literals and cannot detect an EXTRA id in the migration',
      evidence:
        'expect(evidenceSupported.length + grandfathered.length).toBe(16) is arithmetic over the TEST FILE\'s two '
        + 'arrays; it is true regardless of what the migration contains. The subsequent expect(migration).toContain '
        + 'loop is a one-directional check: it catches an id MISSING from the migration, but an extra/unintended id '
        + 'added to the 14-element IN(...) list would pass silently. Nothing asserts the IN list\'s cardinality. '
        + 'Given the migration mutates live governance data, over-inclusion is the more damaging direction of error.',
      location: `${SUITE} — it("backfills all 16 historical closed/disposition-null rows")`,
      recommendation:
        'Parse the IN (...) list out of the legacy_grandfathered UPDATE (match /IN \\(([\\s\\S]*?)\\)/ after the SET), '
        + 'split on commas, and assert SET EQUALITY against the 14-element array — not just containment. Then the '
        + 'count assertion becomes a real claim about the migration.',
    },
    {
      id: 'TEST-3',
      severity: 'MEDIUM',
      issue: 'Only 1 of the 3 CHECK constraints is ordering-checked against the backfill',
      evidence:
        'it("places every CHECK constraint block after the full backfill block") — despite the name — computes '
        + 'firstConstraintIdx = migration.indexOf("quick_fixes_duplicate_of_pairing") and compares only that one. '
        + 'quick_fixes_promoted_target_pairing and quick_fixes_closed_requires_disposition are not positionally '
        + 'asserted. closed_requires_disposition is precisely the constraint whose VALIDATE fails if the 16-row '
        + 'backfill has not run, so it is the one that most needs the assertion.',
      location: `${SUITE} — final it() of the CHECK-constraints describe`,
      recommendation:
        'Loop the constraints array and assert indexOf(name) > lastBackfillIdx for all three, matching the test\'s '
        + 'own stated intent ("every CHECK constraint block").',
    },
    {
      id: 'TEST-4',
      severity: 'LOW',
      issue: 'Transaction atomicity — the property that makes an apply-time VALIDATE failure safe — is untested',
      evidence:
        'The migration opens with BEGIN (line 60) and closes with COMMIT (line 255). That wrapper is what turns a '
        + 'VALIDATE CONSTRAINT failure into a clean abort with zero partial state, instead of a database left with '
        + 'triggers installed, an enum half-widened and 19 rows mutated. No assertion covers it; a future edit '
        + 'dropping BEGIN/COMMIT would keep all 14 tests green while converting the riskiest failure mode from '
        + 'fail-safe to fail-dirty.',
      location: `${MIGRATION} lines 60, 255`,
      recommendation:
        'Add expect(migration).toMatch(/^\\s*BEGIN;/m) and expect(migration).toMatch(/^COMMIT;/m), plus an assertion '
        + 'that every ALTER/UPDATE/CREATE TRIGGER offset falls between the two.',
    },
    {
      id: 'TEST-5',
      severity: 'LOW',
      issue: 'The two security-load-bearing properties of the function are structurally assertable but unasserted',
      evidence:
        'audit_trigger_generic() pins SET search_path TO \'public\', \'extensions\' (line 69) and is deliberately NOT '
        + 'SECURITY DEFINER — together these are what make a trigger function that runs on every write to 4 tables '
        + 'safe (no search_path hijack, no privilege escalation). Both are one-line hermetic assertions; neither '
        + 'exists. See the companion SECURITY row for why they matter.',
      location: `${MIGRATION} lines 66-70`,
      recommendation:
        'Assert toMatch(/SET search_path TO \'public\', \'extensions\'/) and not.toMatch(/SECURITY DEFINER/) on the '
        + 'function definition slice.',
    },
    {
      id: 'TEST-6',
      severity: 'HIGH',
      issue: 'ACCEPTED LIMITATION — zero live-DB behavior is verified by this evidence, and the PLAN-TO-EXEC blocking live-tier condition is undischarged',
      evidence:
        'The PLAN-TO-EXEC TESTING row (65dd914d-9f7a-402c-bafd-d5a109ab566b) attached TWO blocking conditions: a '
        + 'hermetic vitest suite (SHIPPED, green) and a live BEGIN...ROLLBACK validation script mirroring '
        + 'scripts/validate-trigger-guard-pack.mjs (NOT SHIPPED). The shipped suite\'s own header states the same '
        + 'boundary. Consequently UNVERIFIED: (1) the 4 triggers actually fire; (2) changed_by resolves to a real '
        + 'identity rather than falling through to \'SYSTEM\' — an INSERT that silently attributes to SYSTEM is '
        + 'indistinguishable from a correct one without reading the row back; (3) governance_audit_log.record_id is '
        + 'type-compatible with quick_fixes\' TEXT \'QF-\' ids (strong inference that it is text, since the already-'
        + 'audited strategic_directives_v2/product_requirements_v2 carry TEXT SD-/PRD- ids, but not measured here); '
        + '(4) the 19 backfill UPDATEs match the row counts they assume against committed data; (5) all three '
        + 'VALIDATE CONSTRAINT statements succeed; (6) the CHECK constraints actually reject a violating write. '
        + 'Asserting that the migration TEXT contains a COALESCE chain proves the chain was WRITTEN, never that it '
        + 'RESOLVES. This session is a LEO fleet worker and is NOT authorized to open a pg Client or execute this '
        + 'migration\'s DDL/DML against production, even inside a rolled-back transaction — that path was explicitly '
        + 'denied by the permission classifier. This is a recorded scope boundary, not a defect to fix now.',
      location: 'PRD test_scenarios TS-1, TS-2, TS-4, TS-5, TS-6',
      recommendation:
        'Discharge at apply time via the sanctioned chairman-gated apply-migration.js --prod-deploy path (the same '
        + '3-factor gate currently blocking sibling SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-A), and require the live '
        + 'assertions above as the apply\'s own acceptance evidence. PLAN should carry TEST-6 forward as an open '
        + 'condition on the apply rather than treating this hermetic green as scope-complete.',
    },
    {
      id: 'TEST-7',
      severity: 'MEDIUM',
      issue: 'Two apply-time abort risks are structurally invisible to a hermetic suite and are not covered by any backfill in the migration',
      evidence:
        'Each new constraint is added NOT VALID then VALIDATEd against EVERY existing row. (a) '
        + 'quick_fixes_promoted_target_pairing requires escalated_to_sd_id OR resolution_sd_id on every '
        + 'disposition=\'promoted\' row, but the migration only guarantees the single row it sets (QF-20260719-281). '
        + 'Any PRE-EXISTING \'promoted\' row with both columns NULL aborts the VALIDATE — the header documents no '
        + 're-measurement of that population. (b) quick_fixes_closed_requires_disposition is validated against a '
        + 'hardcoded 16-id list; the migration header itself records the count moving from 15 to 16 on re-measure, '
        + 'and QF-20260903-052 in the grandfathered list is dated 2026-09-03 — one day before the migration — so the '
        + 'closed/disposition-null population demonstrably churns daily. Any row closed without a disposition '
        + 'between authoring and apply aborts the migration. Both failures are FAIL-SAFE (inside BEGIN...COMMIT, per '
        + 'TEST-4) — the risk is a blocked apply, not corruption.',
      location: `${MIGRATION} lines 235-253`,
      recommendation:
        'Immediately before apply, re-measure BOTH populations: count(*) WHERE disposition=\'promoted\' AND '
        + 'escalated_to_sd_id IS NULL AND resolution_sd_id IS NULL (expect 0), and count(*) WHERE status=\'closed\' '
        + 'AND disposition IS NULL (expect exactly the 16 enumerated ids, no more). Treat any delta as a migration '
        + 'edit, not a retry.',
    },
  ],

  recommendations: [
    'Accept the hermetic tier. 14/14 green from a runner-written artifact; the suite is well-targeted at exactly '
    + 'the claims a source-level test can own, and the function-body slicing (fnBodyOnly) for the negative '
    + 'NEW.col/OLD.col assertion is the correct technique — a naive whole-file negative would have false-failed on '
    + 'the header prose that explains why governance_audit_trigger() could not be reused.',
    'Fix TEST-1 and TEST-3 before apply: both are one-line anchor changes, both currently give false confidence in '
    + 'the ordering guarantees that make this migration safe, and ordering is the single property most likely to '
    + 'regress under a future edit.',
    'Fix TEST-2 to assert set equality on the grandfathered IN(...) list. Over-inclusion silently mutating an extra '
    + 'governance row is the failure mode this SD exists to prevent.',
    'Carry TEST-6 forward as an OPEN condition on the chairman-gated apply, explicitly named in the PLAN-TO-LEAD '
    + 'handoff. A hermetic-only green must not be read as "this migration works" — it means "this migration is '
    + 'written the way it claims to be written".',
    'Re-measure both violation populations (TEST-7) in the same session as the apply, not from this evidence row.',
    'Do NOT retro-fit a live test into this session. The denial of direct DB access is a control working as '
    + 'intended; routing around it would be exactly the bypass this SD family is chartered to eliminate.',
  ],

  detailed_analysis: [
    'TESTING at EXEC-TO-PLAN for SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E. MEASURED: the hermetic suite was run in',
    'this worktree, 14 executed / 14 passed / 0 failed / 0 skipped, 252ms, vitest 4.1.4. Counts are taken from a',
    'runner-written JSON artifact (.artifacts/capa-002e-vitest-results.json, sha256 5704266e...), not typed by hand.',
    '',
    'WHAT THE SUITE GENUINELY PROVES. Fourteen assertions across four describes, and they are not filler:',
    '  - FR-1 structure: v_new/v_old are built by to_jsonb(NEW)/to_jsonb(OLD), and the function body contains NO',
    '    bare NEW.<col>/OLD.<col> reference to an actor column. This is the load-bearing assertion of the whole',
    '    migration — a direct NEW.created_by on a table lacking that column is a RUNTIME error, so the trigger',
    '    would create successfully and then break every write. The test scopes the negative to fnBodyOnly (sliced',
    '    between "AS $function$" and "$function$;"), which is necessary: the header prose legitimately mentions',
    '    NEW.created_by/NEW.updated_by while explaining why governance_audit_trigger() was not reusable, and a',
    '    whole-file negative would have false-failed. Correct technique, correctly applied.',
    '  - The COALESCE chain: all 9 candidate keys asserted present as ->>\'col\' plus the \'SYSTEM\' fallback.',
    '    Cross-checked against database/schema-reference-snapshot.json: disposed_by/verified_by/created_by/',
    '    claiming_session_id exist on quick_fixes; session_id on claude_sessions; triaged_by/assigned_to/',
    '    promoted_by/session_id on feedback; scribe_seat on chairman_ratifications. Every candidate is real, and',
    '    each of the 4 tables has at least one — so the chain is not decorative.',
    '  - Trigger attachment: DROP IF EXISTS + CREATE for all four, AFTER INSERT OR UPDATE OR DELETE ... FOR EACH',
    '    ROW for the three full ones, and — the sharpest assertion in the file — AFTER INSERT plus an explicit',
    '    not.toMatch(/UPDATE OR DELETE/) for chairman_ratifications, so the INSERT-only design decision cannot be',
    '    silently widened. Timing is asserted, not just existence; a trigger with the wrong timing still appears',
    '    in pg_trigger and reads as present.',
    '  - Constraints: each of the three asserted for its exact CHECK clause, its IF NOT EXISTS pg_constraint guard,',
    '    the NOT VALID marker, and a matching VALIDATE CONSTRAINT statement. Clauses verified by hand against the',
    '    live quick_fixes_disposition_check in the schema snapshot — the pre-existing 5 values are reproduced',
    '    exactly and only legacy_grandfathered is added, so no historical disposition is silently invalidated.',
    '',
    'WHERE THE SUITE IS WEAKER THAN IT LOOKS. Three assertions pass for reasons other than the ones they name.',
    'TEST-1 is the clearest: the enum-widening ordering check anchors on the first occurrence of the quoted',
    'literal, which lands in the header comment on line 50, not the ALTER on line 179. It would stay green if the',
    'ALTER were moved after the UPDATE — i.e. exactly the regression it exists to catch. The shipped file IS',
    'correctly ordered (verified by reading it), so this is a test defect, not a migration defect. TEST-2 makes an',
    'arithmetic claim about its own arrays rather than about the migration, and its containment loop is',
    'one-directional. TEST-3 asserts "every CHECK constraint block" but checks one of three, omitting the one',
    '(closed_requires_disposition) whose ordering actually gates the migration.',
    '',
    'THE BOUNDARY, STATED PLAINLY. Nothing in this row constitutes evidence that the migration WORKS. It is',
    'evidence that the migration is WRITTEN as described. Trigger firing, actor-column resolution, record_id type',
    'compatibility, backfill counts against committed data, VALIDATE success, and CHECK rejection are all',
    'unverified. The PLAN-TO-EXEC row made the live BEGIN...ROLLBACK tier a BLOCKING condition and it was not',
    'shipped; this session cannot ship it either, because opening a pg Client or executing this migration\'s',
    'DDL/DML against production was denied by the permission classifier as an unauthorized production-write',
    'action — including inside a transaction that would be rolled back. That denial is a control functioning',
    'correctly, and the honest response is to record the gap on the evidence row rather than route around it.',
    'The gap is discharged by the chairman-gated apply-migration.js --prod-deploy path, behind the same 3-factor',
    'gate that currently blocks sibling SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-A.',
    '',
    'VERDICT RATIONALE. CONDITIONAL_PASS. A clean PASS would assert coverage this evidence does not have: five of',
    'six PRD scenarios are integration/regression and none of them were exercised, and three of the fourteen green',
    'assertions are weaker than their names imply. The hermetic work that WAS done is real, well-targeted and',
    'green, which is why this is not a FAIL. The conditions below are what must hold before the migration is',
    'applied — which, for this SD, is where the actual risk lives.',
  ].join('\n'),

  conditions: [
    {
      action:
        'TEST-1: re-anchor the widen-before-use ordering assertion on indexOf("ADD CONSTRAINT '
        + 'quick_fixes_disposition_check") instead of the quoted literal, which currently matches the header comment.',
      priority: 'high',
      blocking: false,
    },
    {
      action:
        'TEST-3: assert backfill-precedes-constraint for ALL THREE constraints, especially '
        + 'quick_fixes_closed_requires_disposition.',
      priority: 'high',
      blocking: false,
    },
    {
      action:
        'TEST-2: assert set equality (not mere containment) on the 14-element legacy_grandfathered IN(...) list, so '
        + 'an extra id cannot be added silently.',
      priority: 'medium',
      blocking: false,
    },
    {
      action:
        'TEST-6 (BLOCKING ON APPLY, not on this handoff): live verification of trigger firing, changed_by '
        + 'resolution vs SYSTEM fallback, governance_audit_log.record_id type compatibility with TEXT QF ids, '
        + 'backfill row counts, VALIDATE success, and CHECK rejection must be produced as acceptance evidence for '
        + 'the chairman-gated apply-migration.js --prod-deploy run. This hermetic row does not and cannot cover it.',
      priority: 'high',
      blocking: true,
    },
    {
      action:
        'TEST-7: re-measure both violation populations (pre-existing disposition=\'promoted\' rows with no SD '
        + 'target; status=\'closed\' AND disposition IS NULL) in the same session as the apply — the migration '
        + 'hardcodes id lists against a population the header itself documents as moving.',
      priority: 'high',
      blocking: true,
    },
  ],

  justification:
    'CONDITIONAL_PASS recorded by TESTING at EXEC-TO-PLAN. The hermetic vitest suite shipped in commit 3e39a5cb525 '
    + 'was executed and is 14/14 green from a runner-written artifact, and it is well-targeted: it owns the '
    + 'to_jsonb-only structural claim (the migration\'s single load-bearing design decision), all four trigger '
    + 'attachments with timing, the INSERT-only chairman_ratifications choice, and all three CHECK constraints with '
    + 'their exact clauses. It is conditional rather than passing for two independent reasons. First, three of the '
    + 'fourteen assertions pass for weaker reasons than their names claim — most notably the enum-widening ordering '
    + 'check, which anchors on a header comment rather than the ALTER statement and would not catch the very '
    + 'reordering that would abort the migration. Second, and decisively, this evidence verifies only that the '
    + 'migration is WRITTEN as described, never that it WORKS: trigger firing, actor resolution, backfill counts '
    + 'against committed data, VALIDATE success and CHECK rejection are all unverified, and the live '
    + 'BEGIN...ROLLBACK tier that the PLAN-TO-EXEC row made a blocking condition was not shipped. This session is '
    + 'not authorized to open direct database connections, so that gap is recorded and routed to the '
    + 'chairman-gated apply rather than papered over with a clean PASS.',

  metadata: {
    measured: true,
    test_execution: buildTestExecution({
      executed: 14,
      passed: 14,
      failed: 0,
      skipped: 0,
      runner: 'vitest@4.1.4',
      artifactPath: '.artifacts/capa-002e-vitest-results.json',
      artifactSha: '5704266e6e60bebba52547d50b96f3c46a78fe0d2dd708ad639aaf287c68ee40',
      source: 'fresh',
    }),
    command: `npx vitest run ${SUITE}`,
    exec_commit: '3e39a5cb525',
    artifacts_reviewed: [MIGRATION, SUITE],
    tier_covered: 'hermetic_source_assertions_only',
    live_db_verified: false,
    live_db_unverified_claims: [
      'the 4 triggers fire on INSERT/UPDATE/DELETE',
      'changed_by resolves to a real identity rather than silently falling through to SYSTEM',
      'governance_audit_log.record_id accepts quick_fixes TEXT ids (QF-*) without a type error',
      'the 19 backfill UPDATEs match the row counts they assume against committed data',
      'all 3 VALIDATE CONSTRAINT statements succeed against live data',
      'the 3 CHECK constraints reject a violating write',
    ],
    live_tier_blocked_by:
      'LEO fleet worker session is not authorized to open a pg Client or execute this migration\'s DDL/DML against '
      + 'production, including inside a rolled-back transaction (denied by the Claude Code permission classifier). '
      + 'Deferred to chairman-gated apply-migration.js --prod-deploy, same 3-factor gate as sibling '
      + 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-A.',
    plan_to_exec_conditions_status: {
      hermetic_vitest_suite: 'DISCHARGED — shipped and green (14/14)',
      live_begin_rollback_script: 'NOT DISCHARGED — carried forward as a blocking condition on the apply',
      ts4_invariant_not_hardcoded_count:
        'PARTIALLY DISCHARGED — the 2 evidence-supported rows are asserted by QF id as required, but the 14 '
        + 'grandfathered rows are still a hardcoded list validated against a moving population (TEST-7)',
      remeasure_before_apply: 'OPEN — owed at apply time',
    },
    prd_id: 'PRD-SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E',
    parent_sd: 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-002',
    prior_testing_row: '65dd914d-9f7a-402c-bafd-d5a109ab566b (PLAN-TO-EXEC, strategy, unmeasured)',
  },
};

async function main() {
  const resolution = await resolveSubAgentRepo({
    sdId: SD,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
  });
  applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD,
    { name: 'QA Engineering Director', code: 'TESTING' },
    results,
    { phase: 'EXEC-TO-PLAN', sdKey: SD },
  );
  console.log('STORED ID:', stored?.id, '| verdict:', stored?.verdict, '| phase:', stored?.phase, '| confidence:', stored?.confidence);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
  });
}
