#!/usr/bin/env node
// EXEC-phase SECURITY evidence for SD-LEO-INFRA-STAGE-GATE-RETRY-001 (EXEC-TO-PLAN gate).
// Reviews commit 8430fe45560: gate-retry-guard.js, recordGateOverride idempotency short-circuit,
// stage-execution-worker wiring, and census-unbounded-retry.mjs.
//
// Every claim below was MEASURED live (service + anon Supabase clients, vitest run), not inferred
// from code reading or from migration-header prose.
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '8077da1b-7888-4a91-aba8-bfe459e61334';
const SD_KEY = 'SD-LEO-INFRA-STAGE-GATE-RETRY-001';

async function run() {
  let results = {
    sub_agent_name: 'Security (EXEC review: bounded gate retries + override idempotency)',
    verdict: 'CONDITIONAL_PASS',
    confidence: 88,
    critical_issues: [],
    warnings: [
      'SEC-1 (MEDIUM, detective control blind): census-unbounded-retry.mjs findUnboundedRetryVentures() selects eva_stage_gate_attempts with no .limit()/.range()/.order(), then groups in memory and thresholds at >= GATE_RETRY_CEILING. MEASURED: the table holds 1902 rows; the plain select returns exactly 1000 (PostgREST max-rows cap). The census therefore measures the cap, not the population, and fails in the FALSE-NEGATIVE direction (reports "all clear"). Today\'s "reads 0" is correct only incidentally: the one over-ceiling pair (venture 809ec7e7-f688-4a0c-b9f8-c8a8291cf94d / stage 21 / 1902 attempts, ApexNiche AI) is parked and correctly excluded -- and that single venture already consumes 100% of the 1000-row window (DISTINCT_VENTURES_VISIBLE_UNDER_CAP=1). A second runaway venture would be structurally invisible to FR-4, and a genuinely over-ceiling venture can have its count truncated below the ceiling and be filtered out entirely.',
      'SEC-2 (MEDIUM, audit durability): in recordGateOverride the write order is (1) UPDATE gate_criteria with the override, then (2) fire-and-forget recordGateAttempt(resolvedOutcome="override") inside a try/catch that only console.errors. The new short-circuit keys on the field written by step (1). So if (1) succeeds and (2) throws, every subsequent poll short-circuits and the override attempt row is NEVER written for that decision_id. Pre-fix, the pathological re-poll loop accidentally self-healed this failure mode; the fix removes that accidental recovery. Net effect: a transient evidence-write failure becomes permanent audit loss for a chairman decision.',
      'SEC-3 (LOW, lost update on the audit field itself): terminalizeVentureForRetryExhaustion does a client-side read / spread / full-object write of ventures.metadata with no atomic JSONB merge and no optimistic-lock predicate. Worker-vs-worker IS genuinely mitigated -- checkGateRetryCeiling is called inside _processVenture AFTER acquireProcessingLock, which is an atomic conditional UPDATE (.eq("orchestrator_state","idle")), so two workers cannot both be in this path for one venture. But out-of-band writers of the same full metadata object do NOT take that lock. MEASURED writers with the identical read/spread/write shape: scripts/one-off/park-apexniche-stage21.mjs (the chairman park, run manually) and lib/eva/bridge/venture-provisioner.js:423,856. A chairman action landing inside the guard\'s read->write window loses whichever write is second, across the WHOLE metadata object (not just gating_decision), and the alreadyTerminalForThisReason dedupe would then not see the entry it lost. The field that loses data is exactly the one recording who decided to stop the venture.',
    ],
    recommendations: [
      'SEC-1 fix (recommended before FR-4 is relied on as a control): replace the unbounded select with a .range() pagination loop, or better, push the aggregation server-side (a count-per-venture/stage view or RPC) so no row set is transferred at all. Add an explicit assertion that the fetched row count matches an exact head-count, so the census fails loud rather than reporting a truncated 0.',
      'SEC-2 fix: make the short-circuit depend on the evidence actually existing, not on gate_criteria alone -- either stamp override.attempt_recorded_at into gate_criteria only after recordGateAttempt succeeds and gate the short-circuit on that stamp, or write the attempt row first and the gate_criteria marker second. Cheapest variant: short-circuit only when gate_criteria.override.decision_id matches AND a matching attempt row exists.',
      'SEC-3 fix: perform the metadata write as an atomic server-side jsonb merge (metadata = metadata || jsonb_build_object(...)) via an RPC rather than a client-side spread, so concurrent writes to unrelated metadata keys are not clobbered.',
      'SEC-3 addendum (audit durability): emit an append-only event on terminalization -- emit(supabase, "venture_terminalized", {...}) -- following the existing precedent at stage-execution-worker.js:353 (venture_killed) and :2558 (chairman_gate_waiting). Today the ONLY record of this privileged automated action is a mutable JSONB field subject to the very lost-update described above. Also consider putting the worker identity / lockId / correlationId into decision.by, which currently carries only the SD key.',
    ],
    detailed_analysis: [
      'SCOPE: commit 8430fe45560 (443 insertions) on feat/SD-LEO-INFRA-STAGE-GATE-RETRY-001 -- lib/eva/gate-retry-guard.js (new), lib/eva/artifact-persistence-service.js (idempotency short-circuit), lib/eva/stage-execution-worker.js (poll-loop wiring), scripts/eva/census-unbounded-retry.mjs (new), plus 207 lines of tests. Internal server-side batch orchestration, no public-facing endpoint; threat model weighted accordingly (integrity/availability/auditability, not perimeter).',
      '',
      'Q1 CONCURRENT METADATA WRITE -- PARTIALLY MITIGATED. See SEC-3. The orchestrator processing lock is a genuine atomic compare-and-set (orchestrator-state-machine.js:96, conditional UPDATE gated on orchestrator_state=idle), and checkGateRetryCeiling runs inside it, so the worker-vs-worker race the question posits does not exist. The residual is worker-vs-out-of-band-human: the chairman park script and venture-provisioner write the same full metadata object without the lock. Impact is bounded -- the window is two DB round-trips (~tens of ms) against a ~30s poll, and both racers converge on parked=true so the venture does not escape its park -- but the losing write is silently discarded across all metadata keys, and the discarded content is the human decision rationale/unpark_trigger. Integrity/auditability issue, not an availability or authorization one.',
      '',
      'Q2 TOCTOU ON THE IDEMPOTENCY CHECK -- NOT EXPLOITABLE, no transaction needed. Three reasons. (a) The only production caller (stage-execution-worker.js:852) runs under the orchestrator lock, so there is no concurrent second evaluator for the same venture/gate. (b) The classic undefined===undefined footgun is closed UPSTREAM: recordGateOverride throws on falsy override.decision_id before the comparison is reached, so two absent ids can never compare equal into a false short-circuit (empty string is falsy and also throws). (c) The direction of failure is fail-safe -- a stale read causes an extra re-record (the pre-fix behaviour), never a granted gate pass; the short-circuit only suppresses duplicate recording, it never authorizes anything. An optimistic-lock/etag on the subsequent .update() would add no security value here. The real defect in this area is ordering, not concurrency -- see SEC-2.',
      '',
      'Q3 INJECTION / UNBOUNDED QUERY / OVER-EXPOSURE. Injection: none. Every query in both new files uses parameterized supabase-js builders (.eq/.in/.select); there is no string-concatenated SQL, no rpc() with interpolated text, and all inputs (ventureId, stageNumber, decision_id) are internal DB-sourced values, never user-supplied. Unbounded query: the census select is unbounded in INTENT but capped in PRACTICE at 1000 rows by PostgREST -- so the memory/DoS risk is nil and the real consequence is blindness (SEC-1), the opposite of exhaustion. Enforcement-path load: getGateAttemptCount runs a COUNT per venture/stage on EVERY poll tick, but it is index-supported -- eva_stage_gate_attempts_venture_stage_idx (venture_id, stage_number, gate_type, attempt_number DESC) left-prefix-covers the (venture_id, stage_number) filter -- so there is no seq-scan amplification on the unboundedly-growing table. Exposure: the census selects ventures(id, metadata) but prints only venture_id / stage_number / attempt_count; no metadata content ever reaches stdout. Credentials come from createSupabaseServiceClient() reading env (SUPABASE_SERVICE_ROLE_KEY); no hardcoded secrets anywhere in the diff.',
      '',
      'Q3 NOTE -- ENFORCEMENT vs DETECTION DIVERGE ON THE SAME CAP. getGateAttemptCount uses { count: "exact", head: true }, which is NOT subject to the 1000-row cap and MEASURED 1902 correctly. The census uses a row-returning select and MEASURED 1000. So the guard enforces on a true count while the census detects on a truncated one -- the enforcement path is sound and only the detective control is blind. This is why SEC-1 is a warning and not a critical issue.',
      '',
      'Q4 AUTHORIZATION BOUNDARY -- ACCEPTABLE, audit content sufficient, audit DURABILITY is the gap. The auto-park is fail-CLOSED in every direction that matters: it only ever moves the venture to a MORE restrictive state (parked=true), it never grants a gate pass, never unparks, never clears an existing park, and its unpark_trigger explicitly routes resolution back to a human ("Human review of the stuck gate, followed by a corrective fix or an explicit chairman override"). An automated actor taking a restrictive-only action on a runaway process is a legitimate fail-safe, not a privilege escalation -- the escalation direction would be auto-UNparking, which this code cannot do. It CAN overwrite a prior human gating_decision, but it preserves that decision verbatim in gating_decision_history first, and it reuses the exact metadata shape an existing chairman-initiated park already uses (so it is queryable by the same tooling rather than creating a second source of truth). The recorded provenance (at / by / reason / decision / context / unpark_trigger) is sufficient CONTENT for the audit trail. The gap is not what is recorded but WHERE: gating_decision_history is a mutable JSONB array with no append-only backing, written via a last-writer-wins full-object update (SEC-3). Recommend the append-only event emission above so the privileged automated action survives a clobber.',
      '',
      'Q5 OTHER OWASP-RELEVANT. Nothing further of substance for server-internal batch code. No deserialization of untrusted input, no path/command construction, no SSRF surface, no template rendering, no authn/authz decision logic, no PII in the new code paths (census prints UUIDs and integers only). A08 Data Integrity Failures is the only category with real purchase here and is covered by SEC-2/SEC-3. Minor style note, not a finding: the census encodes its group key as `${venture_id}::${stage_number}` and parses it back with split("::") -- safe because venture_id is a UUID PK and cannot contain the delimiter, but a Map keyed on a tuple would be sturdier.',
      '',
      'PRE-EXISTING, OUT OF SCOPE (stated because the new code now depends on it). The idempotency short-circuit makes eva_stage_gate_results.gate_criteria.override.decision_id load-bearing for control flow, so its grant posture matters. MEASURED live with the anon key rather than trusting the 20260823 migration header prose: eva_stage_gate_attempts correctly returns 42501 permission denied (its REVOKE landed); eva_stage_gate_results and ventures return NO 42501 on either a SELECT or a zero-row-matching UPDATE probe, meaning table-level anon GRANTs still exist on both. However RLS is doing the real work on both -- anon SELECT returns 0 rows against service-role counts of 1796 (eva_stage_gate_results) and 152 (ventures) -- so there is no practical anon read or write path today. Residual is a defense-in-depth gap (grants not revoked to match RLS), it is pre-existing, it is already flagged out-of-scope in the 20260823 migration header, and this diff neither introduces nor worsens it. Recommend it stay tracked separately rather than being pulled into this SD.',
      '',
      'POSITIVE CONTROLS VERIFIED: 26/26 new unit tests pass (gate-retry-guard.test.js, census-unbounded-retry.test.js, kill-gate-evidence.test.js). Attempts table has correct RLS posture (ENABLE ROW LEVEL SECURITY, service_role-only FOR ALL policy, REVOKE ALL FROM anon/authenticated/PUBLIC) plus an immutability trigger freezing finalized rows -- a strong append-only foundation. The ceiling COUNT is index-backed. No secrets in the diff.',
      '',
      'VERDICT RATIONALE: CONDITIONAL_PASS, nothing blocking EXEC-TO-PLAN. The enforcement path (guard + wiring + idempotency) is correct, fail-closed, and index-supported, and it fixes a real unbounded-write incident. The three warnings are integrity/auditability issues, not exploitable vulnerabilities. SEC-1 is the one worth fixing before anyone treats the FR-4 census as a working control, because a detective control that reports 0 by truncation is worse than no control at all.',
    ].join('\n'),
    execution_time: 0,
    validation_mode: 'retrospective',
    justification:
      'EXEC-phase SECURITY review of commit 8430fe45560 against the five questions posed at invocation (metadata write race, idempotency TOCTOU, census injection/unbounded-query/exposure, auto-terminalization authorization boundary, general OWASP). All findings measured live against the production Supabase instance (service + anon clients) and a vitest run, not inferred from code reading.',
    metadata: {
      commit_reviewed: '8430fe45560',
      branch: 'feat/SD-LEO-INFRA-STAGE-GATE-RETRY-001',
      files_reviewed: [
        'lib/eva/gate-retry-guard.js',
        'lib/eva/artifact-persistence-service.js',
        'lib/eva/stage-execution-worker.js',
        'scripts/eva/census-unbounded-retry.mjs',
      ],
      measurements: {
        eva_stage_gate_attempts_exact_count: 1902,
        eva_stage_gate_attempts_plain_select_rows: 1000,
        postgrest_max_rows_cap_confirmed: true,
        distinct_ventures_visible_under_cap: 1,
        distinct_ventures_true: 1,
        over_ceiling_pairs: [{ venture_id: '809ec7e7-f688-4a0c-b9f8-c8a8291cf94d', stage_number: 21, attempt_count: 1902, parked: true }],
        shipped_census_result_len: 0,
        census_correct_today_but_by_luck: true,
        ceiling_count_index: 'eva_stage_gate_attempts_venture_stage_idx (venture_id, stage_number, gate_type, attempt_number DESC) -- left-prefix covers the guard filter',
        anon_probe: {
          eva_stage_gate_attempts_select: 'DENIED 42501',
          eva_stage_gate_results_select: 'grant present, RLS filters to 0 rows (service count 1796)',
          eva_stage_gate_results_update_zero_row: 'grant present, no 42501',
          ventures_select: 'grant present, RLS filters to 0 rows (service count 152)',
        },
        unit_tests: '26/26 passed',
      },
      findings: [
        { id: 'SEC-1', severity: 'MEDIUM', category: 'A09 Security Logging and Monitoring Failures', title: 'Census measures the 1000-row PostgREST cap, not the population; fails false-negative', file: 'scripts/eva/census-unbounded-retry.mjs', blocking: false },
        { id: 'SEC-2', severity: 'MEDIUM', category: 'A08 Software and Data Integrity Failures', title: 'Transient attempt-evidence write failure becomes permanent audit loss once the short-circuit engages', file: 'lib/eva/artifact-persistence-service.js', blocking: false },
        { id: 'SEC-3', severity: 'LOW', category: 'A08 Software and Data Integrity Failures', title: 'Non-atomic read-modify-write of ventures.metadata; audit record for a privileged auto-action lives in the clobberable field', file: 'lib/eva/gate-retry-guard.js', blocking: false },
        { id: 'SEC-4', severity: 'INFO', category: 'A03 Injection', title: 'No injection surface; idempotency TOCTOU not exploitable (parameterized builders, guarded falsy decision_id, fail-safe direction)', file: 'multiple', blocking: false },
        { id: 'SEC-5', severity: 'INFO', category: 'A01 Broken Access Control', title: 'Pre-existing anon table GRANTs on eva_stage_gate_results/ventures (RLS mitigates); out of scope, not worsened by this diff', file: 'pre-existing', blocking: false },
      ],
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: SD_UUID,
    subAgentCode: 'SECURITY',
    targetApplication: 'EHG_Engineer',
  });
  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_UUID,
    { name: 'Security (EXEC review: bounded gate retries + override idempotency)' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC' }
  );

  console.log('\nEvidence row written:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
