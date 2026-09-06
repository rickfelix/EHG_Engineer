import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import 'dotenv/config';

const SD_KEY = 'SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001';
const baseline = JSON.parse(fs.readFileSync('.artifacts/lane-hygiene-baseline.json', 'utf8'));
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: _sd } = await supabase.from('strategic_directives_v2')
  .select('id, target_application').eq('sd_key', SD_KEY).maybeSingle();
const resolution = await resolveSubAgentRepo({
  sdId: _sd.id,
  targetApplication: _sd.target_application,
  subAgentCode: 'TESTING',
  fallback: process.cwd(),
  supabase,
});

const sketch = [
  "// tests/static-guards/session-coordination-writer-census.test.js",
  "const SITES = [",
  "  { file: 'scripts/assign-fleet-identities.cjs',  occurrences: 3, kind: 'SET_IDENTITY',           requiresSender: true },",
  "  { file: 'scripts/worker-signal.cjs',            occurrences: 1, kind: 'worker_signal',          requiresSender: true },",
  "  { file: 'scripts/stale-session-sweep.cjs',      occurrences: 2, kind: 'signal_resolved',        requiresSender: true },",
  "  { file: 'scripts/periodic-liveness-watcher.mjs',occurrences: 2, kind: 'periodic_liveness_flag', requiresSender: true, requiresBody: true },",
  "  { file: 'lib/npm-install-lock.cjs',             occurrences: 1, kind: 'node_modules_lock',      requiresSender: false /* sender_type:system is exempt */ },",
  "  { file: 'scripts/fleet-dashboard.cjs',          occurrences: 1, kind: 'stale_heartbeat_warning',requiresSender: true },",
  "];",
  "// extractCoordinationInserts: parse with acorn/@babel-parser, walk for CallExpression whose",
  "// callee is a .insert member (or insertCoordinationRow ident); take the first ObjectExpression",
  "// arg; read its `payload` property's ObjectExpression; return {line, payloadKind, hasSenderSession, hasBody}.",
  "it.each(SITES)('$file stamps payload.kind=$kind on all $occurrences insert(s)', ({file, occurrences, kind, requiresSender, requiresBody}) => {",
  "  const sites = extractCoordinationInserts(readFileSync(file, 'utf8'));",
  "  expect(sites, `${file}: writer count changed -- update the manifest`).toHaveLength(occurrences);",
  "  for (const s of sites) {",
  "    expect(s.payloadKind,       `${file}:${s.line} dropped payload.kind`).toBe(kind);",
  "    if (requiresSender) expect(s.hasSenderSession, `${file}:${s.line} dropped sender_session`).toBe(true);",
  "    if (requiresBody)   expect(s.hasBody,          `${file}:${s.line} dropped body`).toBe(true);",
  "  }",
  "});",
].join('\n');

const results = {
  verdict: 'PASS',
  confidence_score: 88,
  summary: 'PLAN-phase prospective TESTING strategy for the lane-hygiene machine-writer fixes. Baseline captured: 10 affected suites, 123/123 green pre-implementation. Delivers per-FR test targets with exact new assertions, the FR-7(b) gauge fixture design (with a mandatory RED control), an AST-based FR-7(a) census-test recommendation, and 4 named tests that WILL break by construction.',
  detailed_analysis: {
    mode: 'pre-implementation (prospective) -- no production code written',
    baseline: {
      suites: 10,
      tests_total: baseline.numTotalTests,
      passed: baseline.numPassedTests,
      failed: baseline.numFailedTests,
      command: 'npx vitest run tests/unit/{assign-fleet-identities-rename-legibility,coordinator/signal-resolved-*,periodic-liveness/watcher-emit-overdue-signal,coordination/{kind-classification,lane-lint-gauge,lane-lint-budget},fleet/{drain-sets-adam-reconciliation,drain-set-registry},governance/orphan-writers-registry}.test.js',
    },
    per_fr_test_plan: {
      'FR-2 assign-fleet-identities SET_IDENTITY': {
        existing_test: 'tests/unit/assign-fleet-identities-rename-legibility.test.js -- CONFIRMED EXISTS, 4 tests, green',
        new_assertions: "In both the first-assignment and rename cases add expect(msg.payload.kind).toBe('SET_IDENTITY') (exact uppercase). Add a third test asserting a simulated insert error logs a warning and the naming loop continues (FR-2 AC-4).",
        structural_note: 'The 3 insert sites are scripts/assign-fleet-identities.cjs:679 (rebroadcast), :713 (SD-label refresh -- builds its payload INLINE, does NOT call buildIdentityMessage), and :785 (new assignment, spreads buildIdentityMessage). Only 2 of 3 flow through the builder, so a builder-only assertion covers at most 2 sites; :713 needs the FR-7(a) census test or its own assertion.',
        sender_session_note: '_mySessionId is resolved at :462 inside main() and is in scope at all three sites; it is NOT reachable from buildIdentityMessage, so sender_session can only be pinned at the insert level (census test), never in the builder unit test.',
      },
      'FR-3 worker-signal kind + coordinator drain set': {
        existing_test: 'tests/unit/coordination/kind-classification.test.js -- CONFIRMED EXISTS, 12 tests, green',
        new_assertions: "Add: classifyCoordinationRow({payload:{kind:'worker_signal', signal_type:'harness-bug'}}) => classification 'actionable' and basis NOT 'unrecognized'. KEEP the existing TRAP-(a) no-kind/signal_type-fallback test unchanged as the control -- it proves the fallback still works for legacy rows already in the 24h window.",
        collateral_required: "Three further edits are NOT optional -- they are enforced by tests: (1) drain-sets-adam-reconciliation.test.js:58 28 -> 29; (2) a ('coordinator','worker_signal', ...) row in the role_drain_sets seed migration (or a new file added to RECONCILIATION_MIGRATION_PATHS) because drain-set-registry.test.js:152-158 asserts 1:1 seed parity for EVERY kind in DRAIN_SETS[role]; (3) drain-set-registry.test.js:169 106 -> 107.",
        preserved: 'tests/unit/coordinator/dispatch-send-backpressure.test.js stays unmodified -- verified the exemption keys on payload.signal_type, not kind absence (FR-3 AC-4).',
      },
      'FR-4 stale-session-sweep signal_resolved sender_session': {
        existing_tests: 'tests/unit/coordinator/signal-resolved-disposition-path.test.js (assertions at :156-162) and signal-resolved-promotion-path.test.js (:127-132) -- BOTH CONFIRMED EXIST, green',
        new_assertions: "In each suite's PRIMARY positive test add expect(c.inserts[0].sender_session).toBe('stale-session-sweep') AND expect(c.inserts[0].sender_type).toBe('coordinator'). The second assertion is the valuable one: it pins the REJECTED alternative, so a future edit retyping to sender_type='sweep' (which would silently drop these rows out of the michael-identity / solomon-identity / coordinator-hourly-review rescue filters) goes red.",
        break_risk: 'NONE -- both suites assert via property access on c.inserts[0], never toEqual on the whole row.',
      },
      'FR-5 periodic-liveness-watcher sender_session + body': {
        existing_test: 'tests/unit/periodic-liveness/watcher-emit-overdue-signal.test.js -- CONFIRMED EXISTS, 4 tests, green, ALL using expect.objectContaining',
        new_assertions: "Extend the clean-insert objectContaining in test 1 with sender_session: 'periodic-liveness-watcher' and body: expect.stringContaining('OVERDUE'). Safe: objectContaining tolerates added keys.",
        coverage_gap: 'NO test file exists anywhere for emitPersistentUnverifiedSignal (grep found only an incidental mention in panel-arithmetic-beside-last-state.test.js). The UNVERIFIED half of FR-5 would ship completely unpinned. EXEC must add a second describe block to the same file (the vi.mock scaffolding is already in place) asserting sender_session and a body containing UNVERIFIED.',
      },
      'FR-6a lib/npm-install-lock.cjs node_modules_lock': {
        existing_test: 'NONE for the acquireLock insert shape',
        recommendation: 'Cover via the FR-7(a) census test rather than a bespoke mocked-supabase suite. VERIFIED at lib/npm-install-lock.cjs:73: the insert already passes a non-empty body column, so adding payload.kind moves it out of untyped_row WITHOUT creating a bodyless_row -- the net -66 violations the PRD claims does hold.',
      },
      'FR-6b scripts/fleet-dashboard.cjs stale_heartbeat_warning': {
        existing_test: 'NONE for the STALE_WARNING insert',
        recommendation: 'Same -- fold into FR-7(a). VERIFIED at fleet-dashboard.cjs:1627: body is a real non-empty string, so no bodyless_row conversion. The .then().catch(()=>{}) fire-and-forget shape makes a runtime-mock test low-value anyway.',
      },
    },
    fr7b_gauge_fixture_design: {
      target_file: 'tests/unit/coordination/lane-lint-gauge.test.js -- extend it, NOT lane-lint-budget.test.js (that file owns the ratio/workflow-consumption axis; the row-shape axis belongs with computeRowViolationCounts).',
      helper: 'Reuse the existing cleanRow(overrides) factory already defined at the top of the file.',
      six_clean_rows: [
        "SET_IDENTITY:           { sender_type:'coordinator', sender_session:'<coordinator uuid>', payload:{ kind:'SET_IDENTITY', callsign:'Charlie' }, body:'The coordinator assigned you callsign ...' }",
        "worker_signal:          { sender_type:'worker', sender_session:'sess-w1', payload:{ kind:'worker_signal', signal_type:'harness-bug', body:'gate failed twice' }, body:'gate failed twice' }",
        "signal_resolved:        { sender_type:'coordinator', sender_session:'stale-session-sweep', payload:{ kind:'signal_resolved', resolution_kind:'disposition' }, body:'Your earlier signal has been dispositioned.' }",
        "periodic_liveness_flag: { sender_type:'periodic-liveness-watcher', sender_session:'periodic-liveness-watcher', payload:{ kind:'periodic_liveness_flag', state:'OVERDUE' }, body:'P1 is OVERDUE' }",
        "node_modules_lock:      { sender_type:'system', sender_session:null, payload:{ kind:'node_modules_lock', lock_type:'NODE_MODULES', status:'locked' }, body:'Session abc12345 is running npm install' }",
        "stale_heartbeat_warning:{ sender_type:'dashboard', sender_session:'fleet-dashboard', payload:{ kind:'stale_heartbeat_warning', heartbeat_age: 900 }, body:'Your session on SD-X has not heartbeated in 15m.' }",
      ],
      expected_output: 'expect(computeRowViolationCounts(SIX_CLEAN_ROWS)).toEqual({ untyped_row: 0, bodyless_row: 0, empty_sender_row: 0 })',
      mandatory_red_control: {
        why: "The all-zero assertion alone is green BEFORE and AFTER the fix (the rows are locally constructed), so it certifies nothing -- exactly the tautological shape this file's own FR-4 header block explicitly rejects. Pair it with the pre-fix shapes.",
        rows: 'The same six writers with the new stamps STRIPPED (no payload.kind on SET_IDENTITY/worker_signal/node_modules_lock/stale_heartbeat_warning; sender_session null on SET_IDENTITY/signal_resolved/stale_heartbeat_warning; no body and no sender on periodic_liveness_flag).',
        expected_output: 'toEqual({ untyped_row: 4, bodyless_row: 1, empty_sender_row: 4 })',
        arithmetic: 'untyped: SET_IDENTITY, worker_signal, node_modules_lock, stale_heartbeat_warning = 4. bodyless: periodic_liveness_flag only (the other three untyped rows short-circuit out of isBodylessRow by design, no double-count) = 1. empty_sender: SET_IDENTITY, signal_resolved, periodic_liveness_flag, stale_heartbeat_warning = 4.',
        trap: "node_modules_lock is sender_type='system', which IS in LEGITIMATE_EMPTY_SENDER_TYPES -- it must NOT be counted in empty_sender_row in either fixture. Getting this wrong (expecting 5) is the most likely way EXEC writes a red-forever control.",
      },
    },
    fr7a_census_test_recommendation: {
      chosen_shape: 'A table-driven STATIC AST scan over a hand-maintained call-site manifest, as tests/static-guards/session-coordination-writer-census.test.js.',
      rejected_alternatives: {
        'per-file mocked-supabase suites': 'Five of the eight sites are inline inserts buried in 2000+ line async CLI main() bodies (stale-session-sweep.cjs, fleet-dashboard.cjs, assign-fleet-identities.cjs). Reaching them needs ~5 new mock harnesses for 2 assertions each, and each harness rots on the next refactor of an unrelated part of the same main().',
        'golden-string / regex fixture': 'Brittle to formatting -- a prettier run or a trailing-comma change goes red with no defect. Also cannot distinguish payload.kind from a top-level kind.',
      },
      why_ast_wins: 'Format-insensitive, one harness for all eight sites, and the failure message can name the exact file:line that dropped a stamp (FR-7 AC-1 requires the test to NAME the offending writer). Precedent already in-repo: tests/static-guards/drain-set-registry-readers.test.js uses the same static-guard shape.',
      code_sketch: sketch,
      pin_the_occurrence_count: 'Asserting toHaveLength(occurrences) is what catches a NEWLY ADDED untyped writer in an already-covered file. "Dropped a stamp" and "added an unstamped writer" are different mutants; only the count assertion kills the second.',
      accepted_caveat: 'The manifest duplicates the writer set and can drift from reality. Accept it -- it drifts LOUDLY (the length assertion goes red), which is strictly better than the status quo of no coverage on five of the eight sites.',
    },
    tests_that_will_break: [
      {
        file: 'tests/unit/assign-fleet-identities-rename-legibility.test.js',
        line: 29,
        severity: 'HIGH',
        assertion: "expect(msg.payload).toEqual({ color: 'blue', callsign: 'Charlie', display_name: 'Charlie | idle', tier_rank: 4 })",
        why: 'EXACT toEqual on the whole payload. If EXEC stamps kind inside buildIdentityMessage this goes red immediately.',
        resolution: "Two valid paths. (a) Stamp kind only at the 3 insert sites, leaving the builder untouched -- test stays green, but then the builder test proves nothing about kind and FR-7(a) becomes the ONLY coverage. (b) Stamp inside the builder, relax :29 to toMatchObject, and add an explicit expect(msg.payload.kind).toBe('SET_IDENTITY'). RECOMMEND (b): one stamp site instead of three, and the :713 inline site still needs its own stamp either way.",
      },
      {
        file: 'tests/unit/fleet/drain-sets-adam-reconciliation.test.js',
        line: 58,
        severity: 'HIGH',
        assertion: 'expect(DRAIN_SETS.coordinator.length).toBe(28)',
        why: "FR-3 adds 'worker_signal' to DRAIN_SETS.coordinator -> length 29.",
        resolution: "Bump to 29 and extend the adjacent comment block with a line naming this SD, matching the file's established +1-per-SD convention (lines 51-56).",
      },
      {
        file: 'tests/unit/fleet/drain-set-registry.test.js',
        line: '152-158 (seed parity loop) and 169 (total count)',
        severity: 'HIGH',
        assertion: "for each kind in DRAIN_SETS[role]: migrationText must contain \"('coordinator', 'worker_signal'\"; and expect(matches.length).toBe(106)",
        why: 'This is the test that makes FR-3 AC-2 ("and to the role_drain_sets seed") mandatory rather than aspirational. Adding the kind to DRAIN_SETS without the seed row fails the parity loop.',
        resolution: "Add ('coordinator', 'worker_signal', ...) to the seed migration (or a new reconciliation migration registered in RECONCILIATION_MIGRATION_PATHS) and bump 106 -> 107. EXEC should do this in the SAME commit as the DRAIN_SETS edit.",
      },
      {
        file: 'tests/unit/governance/orphan-writers-registry.test.js',
        line: 121,
        severity: 'MEDIUM',
        assertion: 'expect(ORPHAN_ENTRIES.length).toBe(PINNED_TOTAL_ENTRIES)',
        why: 'FR-8 adds one ORPHAN_ENTRIES entry.',
        resolution: 'Bump PINNED_TOTAL_ENTRIES by 1 with a comment naming this SD (already FR-8 AC-2). The PRD correctly flags QF-20260904-116 as a pending collision on this same constant -- rebase immediately before merge and re-read the live value rather than assuming +1 from the current file.',
      },
    ],
    verified_not_at_risk: [
      'tests/unit/periodic-liveness/watcher-emit-overdue-signal.test.js -- all 4 insert assertions use expect.objectContaining; added sender_session/body keys are tolerated.',
      'tests/unit/coordinator/signal-resolved-{disposition,promotion}-path.test.js -- property-access assertions only, no toEqual on the inserted row.',
      "tests/unit/coordination/kind-classification.test.js 'informational and actionable sets are disjoint' -- safe: worker_signal joins DRAIN_SETS.coordinator (actionable), not INFORMATIONAL_KINDS.",
      'tests/unit/coordination/lane-lint-gauge.test.js and lane-lint-budget.test.js existing assertions -- operate purely on locally-built fixtures, immune to production writer changes.',
      "FR-6 bodyless-conversion hazard RULED OUT by reading both call sites: lib/npm-install-lock.cjs:73 and scripts/fleet-dashboard.cjs:1627 both already pass a non-empty body column, and readCanonicalBody falls back to row.body, so typing the kind does not trade untyped_row for bodyless_row.",
      "FR-2 bodyless hazard RULED OUT: all three SET_IDENTITY sites pass a non-empty body (buildIdentityMessage's body, or the inline ':713' string).",
    ],
    additional_risk_for_exec: {
      title: 'FR-3 may produce false-positive send-time drain warns on non-coordinator /signal targets',
      detail: "scripts/worker-signal.cjs accepts --to, so a /signal can be addressed to a worker, adam or solomon seat, not just the coordinator. Once payload.kind='worker_signal' exists, warnOnSendTargetDrain (lib/fleet/worker-status.cjs) fires on a CONFIDENT mismatch -- known role, known non-terminal kind, absent from that role's drain set. The PRD registers the kind for 'coordinator' ONLY.",
      recommendation: "EXEC should either (a) register worker_signal in all four DRAIN_SETS (mirroring the BACKPRESSURE_EXEMPT_KINDS precedent -- then all FOUR length pins move +1 and the seed gains 4 rows, 106 -> 110), or (b) confirm by reading insertCoordinationRow that the send-warn path is not invoked from worker-signal.cjs. Not a blocker; a decision that should be made deliberately rather than discovered as a log-noise regression after merge.",
    },
    exec_ordering_advice: [
      '1. Re-run the 10-suite baseline command above FIRST and confirm 123/123 before touching code (this row records the baseline; re-confirm it in the worktree EXEC actually edits).',
      '2. Do FR-3 as one atomic commit: worker-signal.cjs payload.kind + DRAIN_SETS.coordinator + seed migration row + both count-pin bumps. A partial FR-3 is red in two suites.',
      '3. Do FR-2 with resolution (b) above so the payload toEqual is relaxed in the same diff that adds the stamp.',
      '4. FR-4, FR-5, FR-6 are independent and low-risk; FR-5 needs the NEW UNVERIFIED describe block, not just the OVERDUE assertion.',
      '5. Write FR-7(b) fixture + RED control BEFORE FR-7(a), so the gauge arithmetic is proven before the AST harness is built.',
      '6. FR-8 last, rebased on main, re-reading PINNED_TOTAL_ENTRIES live (QF-20260904-116 collision).',
    ],
  },
  metadata: {
    mode: 'pre-implementation-prospective',
    prd_id: 'PRD-SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001',
    frs_analyzed: ['FR-2', 'FR-3', 'FR-4', 'FR-5', 'FR-6', 'FR-7'],
    existing_test_files_confirmed: 5,
    at_risk_tests: 4,
    test_execution: {
      framework: 'vitest',
      command: 'npx vitest run <10 affected suites>',
      tests_executed: baseline.numTotalTests,
      tests_passed: baseline.numPassedTests,
      tests_failed: baseline.numFailedTests,
      tests_skipped: baseline.numPendingTests || 0,
      suites: baseline.numTotalTestSuites,
      purpose: 'pre-implementation baseline (PAT-RECURSION-001): every affected suite is green BEFORE the change, so any post-implementation red is attributable to this SD, not pre-existing rot.',
      captured_at: new Date().toISOString(),
      results_file: '.artifacts/lane-hygiene-baseline.json',
    },
  },
  execution_time_ms: 0,
};

applySubAgentRepoVerdict(results, resolution);

const out = await storeSubAgentResults(
  'TESTING',
  SD_KEY,
  { id: null, name: 'QA Engineering Director' },
  results,
  { sdKey: SD_KEY, phase: 'PLAN' }
);
console.log('STORED:', JSON.stringify(out).slice(0, 600));
