#!/usr/bin/env node
/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E — TESTING at PLAN-TO-EXEC.
 *
 * STRATEGY evidence, not a measured run. Nothing in this SD's scope is implemented yet
 * (no migration file, no tests) — the purpose of this row is to gate entry into EXEC with
 * a test approach that is grounded in patterns THIS repo already uses, and to name the
 * coverage gaps EXEC must close rather than discover.
 *
 * Because no test was executed, metadata.test_execution is a zeroed buildTestExecution()
 * block and metadata.measured === false — the honest-unmeasured shape that
 * lib/sub-agent-executor/testing-verdict-guard.js explicitly exempts (an unmeasured
 * verdict must declare itself, never fabricate counts).
 *
 * Premises were re-measured against this worktree rather than trusted from the task brief:
 * one cited reference test file does not exist (see TEST-1 below).
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD = 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  execution_time_ms: 0,
  validation_mode: 'prospective',
  summary:
    'TESTING strategy for PLAN-TO-EXEC. A two-tier approach is prescribed — hermetic vitest '
    + 'source-assertions over the migration SQL text (mirroring tests/unit/database/trigger-guard-pack.test.js) '
    + 'plus a BEGIN...ROLLBACK live round-trip script (mirroring scripts/validate-trigger-guard-pack.mjs) — '
    + 'because 5 of the PRD\'s 6 test scenarios assert runtime trigger/constraint BEHAVIOR that source '
    + 'assertions structurally cannot reach. CONDITIONAL_PASS: the strategy is sound and every pattern it '
    + 'relies on already exists in this repo, but no test has been written or run yet, so this row is '
    + 'explicitly unmeasured (metadata.measured=false).',

  critical_issues: [],

  warnings: [
    {
      id: 'TEST-1',
      severity: 'LOW',
      issue: 'One reference test file named in the EXEC brief does not exist in this repo',
      evidence:
        'tests/unit/database/strategic-directives-updated-at-trigger.test.js was cited as a pattern to mirror. '
        + 'It is absent from tests/unit/database/ (directory contains exactly: '
        + 'chairman-held-sends-reply-fields-migration.test.js, claim-sd-claim-switch-clobber-guard.test.js, '
        + 'four-audit-critical-timestamptz-verify.test.js, migrations/, trigger-guard-pack.test.js, '
        + 'widen-auto-cancel-trigger-needs-sd-exemption.test.js). The CANONICAL hermetic-source-assertion '
        + 'pattern is trigger-guard-pack.test.js — claim-sd-claim-switch-clobber-guard.test.js names it as the '
        + 'file it mirrors, in its own header comment.',
      location: 'tests/unit/database/',
      recommendation:
        'EXEC should mirror tests/unit/database/trigger-guard-pack.test.js (loadMigration() + describe-per-FR '
        + 'source assertions) and NOT search for the non-existent file.',
    },
    {
      id: 'TEST-2',
      severity: 'HIGH',
      issue: 'Five of six PRD test scenarios cannot be discharged by hermetic source assertions alone',
      evidence:
        'TS-3 alone is declared test_type=unit and is genuinely hermetic (it inspects constraint DEFINITIONS). '
        + 'TS-1, TS-2, TS-4 are test_type=integration and TS-6 is test_type=regression: each asserts what '
        + 'HAPPENS when a trigger fires or a constraint is evaluated (a governance_audit_log row appearing, '
        + 'changed_by resolving to a real identity vs SYSTEM, a 0-count after backfill, 9 pre-existing triggers '
        + 'still behaving). TS-5 exercises three live helper functions. Asserting the migration TEXT contains a '
        + 'COALESCE chain proves the chain was WRITTEN, never that it RESOLVES — and FR-1 AC-2\'s eight-column '
        + 'fallback across four tables with differing columns is exactly where a written-but-wrong chain hides.',
      location: 'PRD-SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E test_scenarios TS-1, TS-2, TS-4, TS-5, TS-6',
      recommendation:
        'EXEC must ship BOTH tiers. The live tier already has a working precedent to copy: '
        + 'scripts/validate-trigger-guard-pack.mjs (pg Client on SUPABASE_POOLER_URL, BEGIN, SAVEPOINT per '
        + 'case, ROLLBACK TO SAVEPOINT between cases, final ROLLBACK) — it applies the functions in-transaction '
        + 'from the migration file, so it runs PRE-APPLY and needs no chairman approval to prove behavior.',
    },
    {
      id: 'TEST-3',
      severity: 'MEDIUM',
      issue: 'The data-backfill scenario (TS-4) is destructive and order-dependent, unlike every other scenario',
      evidence:
        'TS-4 asserts a post-migration 0-count for status=closed AND disposition IS NULL, after 2 rows are '
        + 'backfilled to evidence-supported values and 14 to a NEW legacy_grandfathered enum value. Three '
        + 'orderings must hold within one transaction or the migration aborts mid-flight: widen '
        + 'quick_fixes_disposition_check to 6 values FIRST, backfill SECOND, add '
        + 'quick_fixes_closed_requires_disposition THIRD. Adding the constraint before the backfill fails '
        + 'against the 16 known rows; backfilling to legacy_grandfathered before widening the enum fails the '
        + 'existing 5-value check. Same ordering hazard applies to FR-3 (5 duplicate_of rows must be resolved '
        + 'before quick_fixes_duplicate_of_pairing is added).',
      location: 'FR-3 AC-2, FR-5 AC-1/AC-2/AC-3',
      recommendation:
        'Test the ORDERING explicitly, not just the end state: a hermetic assertion that the ALTER widening the '
        + 'disposition enum precedes the UPDATE statements, which precede the ADD CONSTRAINT — assert on '
        + 'byte offsets within the migration text (indexOf comparisons), which is what four-audit-critical-'
        + 'timestamptz-verify.test.js-style ordering checks reduce to. Re-measure both counts (5 and 16) '
        + 'immediately before apply; the SD\'s own description records that the 16 moves.',
    },
    {
      id: 'TEST-4',
      severity: 'MEDIUM',
      issue: 'The live tier may be split across a chairman approval boundary',
      evidence:
        'database/chairman-gated/ exists and holds ~40 staged migrations, and trigger-guard-pack.test.js\'s '
        + 'header documents precisely this split: hermetic tests run now, the live round-trip runs "pre-apply '
        + '(functions applied in-txn from these same files) and re-run post-apply once the chairman approves '
        + 'the TIER-2 migration." This SD creates 4 triggers, 3 CHECK constraints, widens an enum constraint '
        + 'and mutates 21 rows of live data — squarely TIER-2 shaped.',
      location: 'database/chairman-gated/',
      recommendation:
        'EXEC should determine the tier BEFORE writing tests and, if TIER-2, structure the live script to be '
        + 'runnable twice (pre-apply in-txn, post-apply verification) rather than assuming a single post-apply '
        + 'run. A test suite that only runs post-apply cannot gate the apply it is supposed to gate.',
    },
    {
      id: 'TEST-5',
      severity: 'LOW',
      issue: 'TS-2 asserts a negative that needs an explicit assertion, not an absence of error',
      evidence:
        'TS-2 requires changed_by to equal the row\'s session_id and to be "not \'SYSTEM\' and not a trigger '
        + 'error". claude_sessions has neither created_by nor updated_by (confirmed in this SD\'s LEAD-phase '
        + 'VALIDATION evidence, row e0dcfb04). A test that merely performs the UPDATE and sees no exception '
        + 'passes identically whether changed_by resolved to session_id or fell through to SYSTEM — the two '
        + 'outcomes are indistinguishable without reading the written row back.',
      location: 'FR-1 AC-2, FR-2 AC-1/AC-2, TS-2',
      recommendation:
        'Assert on the READ-BACK governance_audit_log row\'s changed_by value for all four tables, and include '
        + 'the positive SYSTEM case from FR-2 AC-2 (a row with none of the 8 candidate columns populated must '
        + 'still produce an audit row) so the fallback is proven to be a fallback and not a silent default.',
    },
  ],

  recommendations: [
    'Proceed to EXEC. The test approach is prescribable in full from existing repo patterns; no test '
    + 'infrastructure needs to be invented.',
    'Tier 1 (hermetic, vitest): tests/unit/database/<migration-slug>.test.js mirroring '
    + 'tests/unit/database/trigger-guard-pack.test.js — loadMigration() via readFileSync on '
    + 'database/migrations, one describe block per FR. Covers TS-3 fully and the structural half of FR-1 '
    + '(to_jsonb extraction used exclusively; assert the migration does NOT match /NEW\\.(disposed_by|'
    + 'verified_by|created_by|session_id)/ outside a to_jsonb call), FR-3, FR-4, FR-5.',
    'Tier 2 (live, pg BEGIN...ROLLBACK): scripts/validate-<migration-slug>.mjs mirroring '
    + 'scripts/validate-trigger-guard-pack.mjs — Client on SUPABASE_POOLER_URL, SAVEPOINT per case, final '
    + 'ROLLBACK so no state is mutated. Covers TS-1, TS-2, TS-5, TS-6 and the behavioral half of FR-2.',
    'Assert the four trigger names explicitly (audit_quick_fixes, audit_claude_sessions, audit_feedback, '
    + 'audit_chairman_ratifications) and the AFTER INSERT OR DELETE OR UPDATE ... FOR EACH ROW timing per '
    + 'FR-1 AC-3 — a trigger created with the wrong timing still exists in pg_trigger and reads as present.',
    'For TS-6, snapshot the 9 pre-existing triggers on the 4 tables via pg_trigger BEFORE apply and diff '
    + 'AFTER: the assertion is that the new triggers are ADDITIVE (count 9 -> 13, the original 9 byte-identical '
    + 'by pg_get_triggerdef), which is stronger and cheaper than re-testing each one\'s behavior.',
    'TS-5 premise re-verified live: scripts/coordinator-stale-qf-disposition-sweep.mjs does contain '
    + 'closeDuplicate (line 303), closePremiseResolved (line 321) and closePremiseUnverifiedStale, and each '
    + 'sets disposition in the same UPDATE as the close — so the non-regression claim is structurally sound '
    + 'and TS-5 is expected to pass. Test it anyway; the value is the guard against a future writer.',
    'Do not gate EXEC on a live-DB test suite passing before the migration exists. This row certifies the '
    + 'STRATEGY; the measured TESTING verdict is owed at EXEC-TO-PLAN, where metadata.measured must be true.',
  ],

  detailed_analysis: [
    'TESTING at PLAN-TO-EXEC for SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E (child E of',
    'SD-LEO-ORCH-CAPA-RECORD-TRUTH-002, W4 of the Foundation CAPA plan). This is a STRATEGY',
    'verdict: no migration file and no test file exist yet, so nothing was executed and',
    'metadata.measured is false.',
    '',
    'WHAT THE SD SHIPS, AND WHY IT IS AWKWARD TO TEST. Four AFTER INSERT/UPDATE/DELETE triggers',
    'calling one new audit_trigger_generic() into governance_audit_log, across four tables with',
    'DIFFERENT columns (quick_fixes has created_by; claude_sessions, feedback and',
    'chairman_ratifications have neither created_by nor updated_by). That column asymmetry is the',
    'entire design constraint — it forces to_jsonb(NEW)->>\'col\' extraction over direct NEW.col',
    'reference, because a direct reference to a column that does not exist on the table is a',
    'RUNTIME error on first write, not a creation-time error. A trigger can therefore be created',
    'successfully and be broken. Source assertions catch the wrong SHAPE; only a live write catches',
    'the wrong RESOLUTION.',
    '',
    'TIER 1 — HERMETIC SOURCE ASSERTIONS (vitest, no DB).',
    'Pattern: tests/unit/database/trigger-guard-pack.test.js. Its header states the doctrine this',
    'strategy adopts wholesale: "Hermetic source-assertions on the migration files (no DB',
    'connection). Live behavioral proof is scripts/validate-trigger-guard-pack.mjs — a',
    'BEGIN...ROLLBACK round-trip." tests/unit/database/claim-sd-claim-switch-clobber-guard.test.js',
    'is the second instance of the same pattern and names trigger-guard-pack as its model.',
    'Mechanics: a loadMigration(name) helper doing readFileSync(path.resolve(process.cwd(),',
    '"database/migrations", name), "utf8"), then describe-per-FR with expect(migration).toMatch(...)',
    'and, importantly, expect(...).not.toMatch(...) for the negative structural claims. Slicing the',
    'text between function-start and $function$; to scope assertions to one function body (as',
    'trigger-guard-pack does) is the technique for asserting FR-1 AC-1 and AC-2 precisely.',
    'Discharges: TS-3 in full; the structural half of FR-1 (AC-1 to_jsonb-only, AC-2 the eight-name',
    'COALESCE order, AC-3 the four trigger names + timing); FR-3 AC-1, FR-4 AC-1, FR-5 AC-1/AC-3;',
    'and the STATEMENT ORDERING in FR-5 (widen enum -> backfill -> add constraint) via indexOf',
    'offset comparison, which is a source-level property and needs no DB.',
    '',
    'TIER 2 — LIVE BEGIN...ROLLBACK ROUND-TRIP (pg, no persisted mutation).',
    'Pattern: scripts/validate-trigger-guard-pack.mjs (194 lines). Mechanics confirmed by reading it:',
    'import { Client } from "pg"; new Client({ connectionString: process.env.SUPABASE_POOLER_URL });',
    'a notice handler so RAISE NOTICE output is visible; query("BEGIN"); the functions applied',
    'IN-TRANSACTION from the migration file itself; SAVEPOINT before each destructive case with',
    'ROLLBACK TO SAVEPOINT between them; a final ROLLBACK so the database is untouched. It also',
    'fingerprints functions via md5(pg_get_functiondef(oid)) to prove identity — directly reusable',
    'for TS-6\'s "pre-existing triggers unchanged" claim via pg_get_triggerdef.',
    'Discharges: TS-1 (real-actor resolution — INSERT/UPDATE a quick_fixes row with disposed_by set,',
    'read back the governance_audit_log row, assert changed_by equals disposed_by); TS-2 (fallback',
    'on claude_sessions, asserting changed_by equals session_id AND is not SYSTEM — see TEST-5, the',
    'negative must be asserted, not inferred from the absence of an exception); FR-2 AC-2 (the',
    'genuine SYSTEM case still writes a row rather than failing); TS-5 (the three sweep helpers);',
    'TS-6 (additive-trigger diff).',
    '',
    'THE ONE SCENARIO NEITHER TIER FULLY OWNS: TS-4.',
    'TS-4 asserts a 0-count AFTER a 16-row backfill lands. Inside a ROLLBACK transaction it is',
    'testable and should be tested there (apply the migration in-txn, run the count, roll back) —',
    'but the assertion that ultimately matters is against the REAL committed data, and both counts',
    'are moving targets. This SD\'s own description records the closed/disposition-null count being',
    'corrected from 15 to 16 with the instruction "re-measure at PLAN time, this count moves", and',
    'the LEAD-phase VALIDATION row (e0dcfb04) flagged that success_criteria still carries the stale',
    '15. The test must therefore assert the INVARIANT (count = 0 post-apply) and never a hardcoded',
    '16, or it will fail for the right reason at the wrong time. The 2-row / 14-row split is',
    'evidence-specific (QF-20260719-281 -> promoted, QF-20260727-705 -> premise_resolved) and',
    'should be asserted by id, not by count.',
    '',
    'SEQUENCING AGAINST THE CHAIRMAN GATE. database/chairman-gated/ holds ~40 staged migrations and',
    'trigger-guard-pack.test.js documents the pre-apply/post-apply double-run explicitly. A schema',
    'change of this shape (4 triggers, 3 CHECK constraints, an enum widening, 21 rows of data',
    'mutation) is TIER-2 shaped. EXEC should establish the tier before writing the live script, and',
    'build it to run twice — pre-apply in-transaction to GATE the approval, post-apply to CONFIRM',
    'it. A suite that can only run after the apply cannot gate the apply.',
    '',
    'VERDICT RATIONALE. CONDITIONAL_PASS, not PASS. The approach is complete, every pattern it needs',
    'already exists in this repo, and the PRD\'s six scenarios map cleanly onto two tiers with no',
    'scenario left unowned. But five of six scenarios are integration/regression and none of them are',
    'written yet, so certifying this as PASS would assert coverage that does not exist. The',
    'conditions attached are the specific artifacts EXEC owes before the measured TESTING verdict at',
    'EXEC-TO-PLAN.',
  ].join('\n'),

  conditions: [
    {
      action:
        'EXEC ships a hermetic vitest suite at tests/unit/database/ mirroring trigger-guard-pack.test.js, '
        + 'covering TS-3 plus the structural assertions for FR-1 AC-1/AC-2/AC-3, FR-3 AC-1, FR-4 AC-1, '
        + 'FR-5 AC-1/AC-3, and the widen->backfill->constrain statement ordering.',
      priority: 'high',
      blocking: true,
    },
    {
      action:
        'EXEC ships a live BEGIN...ROLLBACK validation script mirroring scripts/validate-trigger-guard-pack.mjs, '
        + 'covering TS-1, TS-2, TS-5, TS-6 and FR-2 AC-1/AC-2 by reading back governance_audit_log.changed_by. '
        + 'Source assertions alone cannot discharge these five scenarios.',
      priority: 'high',
      blocking: true,
    },
    {
      action:
        'TS-4 asserts the invariant (count of status=closed AND disposition IS NULL equals 0 post-apply) and '
        + 'the 2 evidence-supported rows by QF id — never a hardcoded 16, which the SD itself documents as moving.',
      priority: 'high',
      blocking: true,
    },
    {
      action:
        'Both pre-existing violation counts (5 duplicate_of, 16 closed/null) are re-measured immediately before '
        + 'migration apply, since adding either constraint before its backfill aborts the migration.',
      priority: 'medium',
      blocking: false,
    },
    {
      action:
        'A measured TESTING verdict (metadata.measured=true, tests_executed>0) is written at EXEC-TO-PLAN. '
        + 'This PLAN-TO-EXEC row is explicitly unmeasured and certifies strategy only.',
      priority: 'high',
      blocking: false,
    },
  ],

  justification:
    'CONDITIONAL_PASS recorded by TESTING at PLAN-TO-EXEC: the test strategy is complete and grounded in '
    + 'patterns that already exist in this repo (trigger-guard-pack.test.js for the hermetic tier, '
    + 'validate-trigger-guard-pack.mjs for the live BEGIN...ROLLBACK tier), and all six PRD scenarios map onto '
    + 'those two tiers with none left unowned. It is conditional rather than passing because no test has been '
    + 'written or executed yet — five of the six scenarios assert runtime trigger and constraint behavior that '
    + 'hermetic source assertions structurally cannot reach, so EXEC owes both tiers plus a measured verdict at '
    + 'EXEC-TO-PLAN before this scope can be certified green.',

  metadata: {
    // Honest-unmeasured declaration. testing-verdict-guard.js exempts a row that explicitly
    // declares measured===false from the isMeasuredExecution() check, but STILL requires a
    // well-formed test_execution block — a row cannot merely claim measured:false with no shape.
    measured: false,
    test_execution: buildTestExecution({
      executed: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      runner: null,
      source: null,
    }),
    unmeasured_reason:
      'PLAN-TO-EXEC strategy evidence. The migration file and its tests do not exist yet — this row '
      + 'prescribes the test approach that gates entry into EXEC. Nothing was executed, and no test '
      + 'counts are claimed.',
    strategy_tiers: {
      hermetic: {
        harness: 'vitest',
        location: 'tests/unit/database/',
        pattern_source: 'tests/unit/database/trigger-guard-pack.test.js',
        secondary_pattern: 'tests/unit/database/claim-sd-claim-switch-clobber-guard.test.js',
        requires_live_db: false,
        scenarios_covered: ['TS-3'],
        partial_coverage: ['FR-1 (structure only)', 'FR-3 AC-1', 'FR-4 AC-1', 'FR-5 AC-1/AC-3'],
      },
      live_round_trip: {
        harness: 'node + pg Client, BEGIN...SAVEPOINT...ROLLBACK',
        location: 'scripts/validate-<migration-slug>.mjs',
        pattern_source: 'scripts/validate-trigger-guard-pack.mjs',
        connection_env: 'SUPABASE_POOLER_URL',
        requires_live_db: true,
        scenarios_covered: ['TS-1', 'TS-2', 'TS-5', 'TS-6'],
        partial_coverage: ['TS-4 (in-txn only; committed-data assertion is post-apply)', 'FR-2 AC-1/AC-2'],
      },
    },
    scenario_coverage_map: {
      'TS-1': { test_type: 'integration', tier: 'live_round_trip', hermetic_sufficient: false },
      'TS-2': { test_type: 'integration', tier: 'live_round_trip', hermetic_sufficient: false },
      'TS-3': { test_type: 'unit', tier: 'hermetic', hermetic_sufficient: true },
      'TS-4': { test_type: 'integration', tier: 'both', hermetic_sufficient: false },
      'TS-5': { test_type: 'integration', tier: 'live_round_trip', hermetic_sufficient: false },
      'TS-6': { test_type: 'regression', tier: 'live_round_trip', hermetic_sufficient: false },
    },
    scenarios_total: 6,
    scenarios_requiring_live_db: 5,
    scenarios_hermetic_sufficient: 1,
    premises_reverified: {
      // Re-measured in this worktree rather than trusted from the task brief.
      'tests/unit/database/trigger-guard-pack.test.js': 'EXISTS — canonical hermetic pattern',
      'tests/unit/database/claim-sd-claim-switch-clobber-guard.test.js': 'EXISTS — mirrors trigger-guard-pack',
      'tests/unit/database/strategic-directives-updated-at-trigger.test.js': 'DOES NOT EXIST — cited in brief, absent from repo (TEST-1)',
      'scripts/validate-trigger-guard-pack.mjs': 'EXISTS (194 lines) — live BEGIN...ROLLBACK precedent',
      'scripts/coordinator-stale-qf-disposition-sweep.mjs': 'EXISTS (552 lines) — closeDuplicate:303, closePremiseResolved:321, closePremiseUnverifiedStale present; each sets disposition in the same UPDATE as status (TS-5 premise holds)',
      'database/chairman-gated/': 'EXISTS (~40 staged migrations) — TIER-2 approval boundary likely applies (TEST-4)',
    },
    chairman_gate_risk: 'TIER-2 likely — live tier must be runnable pre-apply (in-txn) as well as post-apply',
    measured_verdict_owed_at: 'EXEC-TO-PLAN',
    prd_id: 'PRD-SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E',
    parent_sd: 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-002',
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
    { phase: 'PLAN-TO-EXEC', sdKey: SD },
  );
  console.log('STORED ID:', stored?.id, '| verdict:', stored?.verdict, '| phase:', stored?.phase, '| confidence:', stored?.confidence);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
  });
}
