import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
const SD_ID = 'SD-LEO-INFRA-THREE-GAPS-APPLIED-001';

const testing = {
  verdict: 'PASS', confidence: 88,
  summary:
    '41 tests across 2 new suites, 11 of them seeded defects, plus two live probes. Both fences '
    + 'demonstrated able to FAIL before being trusted to pass. Zero DDL executed. Two FR outcomes '
    + 'changed during EXEC because measurement contradicted the plan, and both are recorded.',
  findings: [
    { id: 'the-fence-caught-a-real-divergence-on-its-first-live-run', severity: 'critical', note: 'NOT A SEEDED RESULT. scripts/severity-pair-divergence-fence.mjs reported FR-3 DIVERGED against the production catalog on its first genuine run, because the applied policy had changed under the SD: 20260803_bound_anon_ingress_source_type_qualifier.sql rewrote the counting subquery from a fixed source_type=telegram to a CORRELATED NOT (f.source_type IS DISTINCT FROM feedback.source_type). anon SELECT exposes exactly one source_type, so for every other value the count starves. FR-3 predicted this and it arrived via the DUAL of the predicted route — nobody narrowed SELECT, they narrowed the COUNTED SET.' },
    { id: 'the-fence-deliberately-stays-red-while-the-hazard-is-cold', severity: 'critical', note: 'Coordinator reply 596e6e1f established the disarm is COLD: venture_user_insert_feedback, the only non-telegram anon insert door, is dead end-to-end since 2026-07-04 (SD-LEO-INFRA-DEAD-VENTURE-USER-001). The fence still reports DIVERGED, and that is INTENTIONAL — it asserts on the COUPLING, not on reachability. A broken coupling masked by a second defect is still broken, and it gets discovered by whoever OPENS the door. A reachability-keyed fence would report green here and teach everyone the coupling was fine. Recorded in signal 7c4fdee8 so it is not later suppressed as a stale alarm.' },
    { id: 'eleven-seeded-defects-every-fence-proven-able-to-fail', severity: 'critical', note: 'TR-3 in full. severity-pair-coupling: narrowing the policy pair, restructuring the view pair, narrowing anon SELECT, scoping SELECT to a bot identity, plus correlated-form cases. anon-chairman-boundary: grant dropped, storm severity changed, new insert path appearing, declared path disappearing, unparseable severities. Each verified to FAIL on the mutation and PASS unmutated. A check that has never failed cannot be distinguished from one that cannot fail.' },
    { id: 'the-load-bearing-test-of-fr1-is-a-negative', severity: 'critical', note: 'assertsUnreachability must NOT flag the honest paragraph, which contains anon + reach + chairman-queue in one breath. A keyword scan flags it, and the resulting fix for a false closure claim is to DELETE THE ACCURATE EXPLANATION — strictly worse than doing nothing. It matches claim SHAPES and treats concession (false as stated / is not established) as a correction rather than an assertion. Tested against the real KNOWN GAPS text.' },
    { id: 'drift-in-the-good-direction-still-fails-by-design', severity: 'warning', note: 'If the anon EXECUTE grant is ever dropped, evaluateBoundary reports DRIFTED rather than green. That is deliberate: the declaration and every closure claim would then describe a boundary that no longer exists. A check that only fires on bad news trains people to edit the declaration and move on.' },
    { id: 'four-extraction-bugs-caught-by-the-tests-before-shipping', severity: 'warning', note: 'PROCESS FINDING, and the same shape each time. (a) anchoring on the FIRST severity token read a jsonb_build_object projection hundreds of chars from the WHERE clause and reported UNREADABLE on a view whose pair is plainly present. (b) normalisePredicate did not strip table qualifiers, so f.source_type vs source_type — same column — produced a permanent false DIVERGENCE. (c) a [^)]* gap cannot cross the )::text cast between a column and IS DISTINCT FROM. (d) correlated detection had to run BEFORE the literal scan, because both contain a source_type token and literal-first falls through to unreadable, hiding a decidable divergence. Every one of these is a guard reading the wrong text.' },
    { id: 'unreadable-is-never-a-pass-and-empty-is-not-success', severity: 'warning', note: 'Both libraries return UNREADABLE (not AGREES/MATCHES) when an input cannot be parsed, and allCouplingsAgree([]) is FALSE — a fence that measured nothing has not succeeded. Pinned by tests, because the natural simplification is to treat an empty result set as clean.' },
    { id: 'zero-ddl-executed-including-inside-transactions', severity: 'info', note: 'All catalog work was read-only against pg_proc, pg_policy, pg_views and information_schema.routine_privileges. The --seed-divergence proof mutates strings IN MEMORY rather than via BEGIN/ROLLBACK, deliberately, so that no code path in this SD can issue DDL even accidentally.' },
  ],
  metadata: {
    tests_added: 41, seeded_defects: 11, suites: 2, live_probes: 2, ddl_applied: 0,
    commits: 3,
    mechanism_verifications: [
      { verified_by: 'the fence fails on a seeded divergence and passes clean', verified_at: 'node scripts/severity-pair-divergence-fence.mjs --seed-divergence -> FR-2 DIVERGED, exit 1; clean run -> FR-2 AGREES' },
      { verified_by: 'the FR-3 divergence is real, not seeded', verified_at: 'clean run of the same fence -> FR-3 DIVERGED, correlated on source_type vs anon SELECT pinned to telegram' },
      { verified_by: 'the boundary probe matches the live catalog', verified_at: 'node scripts/probe-anon-chairman-reach.mjs -> MATCHES, exit 0; storm_watermark issue/new/high, normal issue/new/medium' },
      { verified_by: 'the honest paragraph does not trip the unreachability detector', verified_at: 'tests/unit/anon-chairman-boundary.test.js — assertsUnreachability(HONEST_BOUNDARY_STATEMENT) === false and the real KNOWN GAPS text === false' },
      { verified_by: 'anon EXECUTE is load-bearing, so revoke was not staged', verified_at: 'lib/eva/config/venture-default-capabilities.js — error-capture-middleware calls the RPC with EHG_ENGINEER_SUPABASE_ANON_KEY as a fleet default capability' },
    ],
  },
  execution_time_ms: 2100000,
};

const security = {
  verdict: 'PASS', confidence: 87,
  summary:
    'No authorization surface changed and no DDL was applied. The SD surfaced one live coupling '
    + 'defect and one cold-but-armed one, routed both, and declined to stage two constrain options '
    + 'whose costs were measured rather than assumed.',
  findings: [
    { id: 'declined-to-stage-a-revoke-that-would-break-the-fleet', severity: 'critical', note: 'THE SECURITY-RELEVANT NON-ACTION. The obvious FR-1 constrain is REVOKE EXECUTE ON record_venture_error FROM anon. MEASURED: the anon key IS the production mechanism — lib/eva/config/venture-default-capabilities.js ships error-capture-middleware to every venture calling this RPC with EHG_ENGINEER_SUPABASE_ANON_KEY. Staging that would have put a fleet-breaking availability change in front of the chairman wearing the costume of a security fix. Recorded as an option with its cost, not staged as a recommendation.' },
    { id: 'the-second-constrain-trades-a-false-closure-for-a-suppressed-alarm', severity: 'critical', note: 'The alternative — downgrade the storm-watermark severity so it stops arming the chairman queue — hides a signal that arguably SHOULD reach the chairman. Choosing between a false-closure risk and a suppressed-alarm risk is a chairman decision. Both branches are documented with measured costs so the decision can be made later on evidence.' },
    { id: 'a-live-rate-limit-disarm-was-found-and-routed', severity: 'critical', note: 'The applied ingress policy changed mid-SD and its per-source_type counting basis is not covered by anon SELECT, so the RESTRICTIVE rate limit does not bind for non-telegram sources. Cold today only because the sole non-telegram anon door is dead. Routed harness-bug/high (5cc210bb); coordinator ratified and folded a mandatory two-sided binding requirement into SD-LEO-INFRA-DEAD-VENTURE-USER-001 so the revive cannot land without the bind.' },
    { id: 'safety-by-coincidence-is-named-as-such', severity: 'critical', note: 'The limit is currently protected by a SECOND DEFECT (a dead insert path), not by a working guard. A measured zero whose cause is a dead door is not safety. This is stated explicitly in the PRD and the signal, because the next person to measure finds nothing reachable and concludes the coupling is fine.' },
    { id: 'no-new-authz-surface-and-no-applied-ddl', severity: 'info', note: 'Zero migrations produced, zero DDL executed, no new table/policy/role/grant/function/env var. New code reads pg_catalog and information_schema only. The two CLIs take a connection string from existing env and write nothing.' },
    { id: 'inherited-assessment-kept-separate-from-measured-fact', severity: 'info', note: 'venture_uuids_anon_enumerable and feedback_force_row_security are carried from the KNOWN GAPS block and are NOT verified by this SD; they live in an inherited_unverified bucket with a test pinning the separation. On a security boundary, an inherited assessment presented as a measurement is how a false closure claim gets built.' },
  ],
  metadata: { ddl_applied: 0, new_env_vars: 0, rls_changes: 0, migrations_staged: 0, authz_defects_routed: 1, constrain_options_declined_with_measured_cost: 2 },
  execution_time_ms: 900000,
};

for (const [code, name, payload] of [['TESTING', 'QA Engineering Director', testing], ['SECURITY', 'Chief Security Architect', security]]) {
  const res = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: code, targetApplication: 'EHG_Engineer' });
  applySubAgentRepoVerdict(payload, res);
  const s = await storeSubAgentResults(code, SD_ID, { name }, payload, { phase: 'EXEC' });
  console.log('STORED ' + code + '/EXEC id=' + (s && s.id));
}
