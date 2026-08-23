// SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001 -- PLAN-phase PRD revision incorporating the
// prospective TESTING sub-agent's findings (row 6e4ca29e-00aa-4603-823c-75e653c37040,
// CONDITIONAL_PASS): 3 CRITICAL/blocking gaps (F1 unreachable NULL lifecycle, F2 no
// run-scoped identity exists in production code, F6 attempt_number race + silent drop)
// plus 6 correctness/scoping findings. Content patch, not a re-generation.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001';

const { data: prd, error: fetchErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, technical_requirements, test_scenarios, risks, acceptance_criteria')
  .eq('id', PRD_ID)
  .single();
if (fetchErr) { console.error(fetchErr); process.exit(1); }

const byId = (arr, id) => arr.findIndex((x) => x.id === id);

// --- FR-1: soften unverifiable "false positive" claim (F3), note mock still needs current_stage fixed (F10) ---
const functional_requirements = prd.functional_requirements.map((fr) => {
  if (fr.id === 'FR-1') {
    return {
      ...fr,
      description: fr.description
        + " CORRECTION (TESTING F3, row 6e4ca29e): lib/eva/launch-workflow/index.js has ZERO live consumers today (not re-exported from lib/eva/index.js; only its own quarantined test imports it) -- the \"some ventures currently report false-positive launch ready\" framing is unverified prose about a currently-dead module. Fix it because it's a real, findable bug and because a future consumer will hit it, not because a live symptom is observable today; drop the \"prove a venture flips\" acceptance framing. CORRECTION (TESTING F10): the quarantine signature ('AssertionError: expected false to be true') is caused by the test's mock baking in a phantom `current_stage` field (the real code reads `current_lifecycle_stage`, already guarded by tests/unit/eva-phantom-column-alignment.test.js for THIS file but not for reasoning/score) -- fixing the reasoning/score column names alone will NOT un-red the suite. The mock must be corrected for BOTH phantom fields in the same change.",
      acceptance_criteria: fr.acceptance_criteria.map((ac) =>
        ac.includes('previously-false-positive-ready venture')
          ? 'A code-correctness proof (not a live-data before/after, since the module has zero current consumers): the corrected queries execute against a real venture\'s eva_stage_gate_results rows with no 42703 error, and getLaunchStatus/getChecklist return a real computed result derived from those rows.'
          : ac
      ),
    };
  }
  if (fr.id === 'FR-3') {
    return {
      ...fr,
      requirement: 'eva_stage_gate_attempts schema: attempt_id (fresh per evaluation-call, NOT a cross-stage traversal identity), venture_id, stage_number, gate_type, attempt_number, with a real unique constraint and live duplicate-rejection proof.',
      description: "CORRECTION (TESTING F2, CRITICAL): there is no existing 'run' concept spanning multiple stages that production code can mint a run_id against. The only traversal-scoped function, run() (eva-orchestrator.js:1373), is dead in production -- its only live caller is scripts/eva-run.js:34 (a manual CLI). Every real gate-writing path calls processStage() directly and independently: stage-execution-worker.js:2015 (the polling daemon, one stage per poll cycle, surviving restarts), eva-master-scheduler.js:48, concurrent-venture-orchestrator.js:204, venture-monitor.js. A 'run' under the daemon spans many poll cycles with no in-memory continuity, so a randomUUID()-per-function-call cannot represent it without NEW persistent state (a runs table or an eva_ventures column) this SD does not budget. RESCOPED: the identifier is `attempt_id`, freshly minted per gate-evaluation call (inside the new openAttempt()/recordGateResult() write path itself, not threaded from any traversal-level construct). This delivers durable, immutable, attributable ATTEMPT history -- the SD's actual FR-1/FR-2 promise -- without requiring a cross-stage 'run' concept that does not exist anywhere in the current system. Grouping attempts into a higher-level 'run' (e.g. via evaluated_at proximity, or a future runs table) is explicitly OUT OF SCOPE and left to a follow-up SD if the chairman wants that grouping.",
      acceptance_criteria: [
        'UNIQUE constraint on (attempt_id, venture_id, stage_number, gate_type, attempt_number) exists and a live test proves a duplicate INSERT is rejected, not silently upserted',
        'attempt_id is minted fresh (randomUUID()) at the top of the new write path for every gate evaluation call, with NO dependency on eva-orchestrator.js run()/correlationId',
        'INSERT-per-attempt: each evaluation call writes a NEW row, never UPSERTs over a prior attempt',
        'The PRD/EXEC evidence explicitly documents that cross-stage run grouping is OUT OF SCOPE, not silently dropped',
      ],
    };
  }
  if (fr.id === 'FR-4') {
    return {
      ...fr,
      description: fr.description
        + " CORRECTION (TESTING F1, CRITICAL): recordGateResult() requires `passed` as an argument and is called ONLY post-verdict at all 3 known call sites (eva-orchestrator.js:907, eva-orchestrator.js:1269, stage-17-blueprint-review.js:427) -- so as originally scoped, no code path ever creates the NULL-outcome row before evaluation runs, making 'interrupted attempts stay NULL-visible' structurally impossible. FIX: introduce an explicit `openAttempt()` write, called at each of those 3 call sites BEFORE the evaluation logic runs (creating the attempt_id + NULL-outcome row), with the existing post-verdict write becoming the NULL->final atomic UPDATE (keyed on attempt_id) rather than a fresh INSERT. This is a bounded change (3 call sites), not a worker-architecture redesign. If a call site cannot be safely changed to call openAttempt() first (to be confirmed during EXEC), the PRD's 'interrupted attempts stay NULL-visible' claim must be explicitly descoped for that call site rather than silently unmet.",
      acceptance_criteria: [
        ...fr.acceptance_criteria,
        'All 3 known call sites (eva-orchestrator.js:907, :1269, stage-17-blueprint-review.js:427) are updated to call openAttempt() before evaluation runs, or each site that cannot be safely changed has its NULL-visibility gap explicitly documented as descoped',
      ],
    };
  }
  if (fr.id === 'FR-5') {
    return {
      ...fr,
      description: fr.description.replace(
        'lib/eva/experiments/gate-outcome-bridge.js:66',
        "lib/eva/artifact-persistence-service.js:427-450 (CORRECTED per TESTING F9 -- this is the SAME FILE FR-7's dual-write extends, making a name collision a duplicate-export error, not just a naming clash; the gate-outcome-bridge.js:66 export is a different, harmless collision the PRD originally cited incorrectly)"
      ),
      acceptance_criteria: [
        ...fr.acceptance_criteria.map((ac) =>
          ac.includes('CHECK constraint enforcing exactly the 7 terms')
            ? 'eva_stage_gate_attempts.resolved_outcome has a CHECK constraint written explicitly as `resolved_outcome IS NULL OR resolved_outcome IN (...)` (TESTING F13 -- a bare IN-list check permits any value via Postgres 3-valued-logic NULL handling by accident, not by explicit intent)'
            : ac
        ),
      ],
    };
  }
  if (fr.id === 'FR-7') {
    return {
      ...fr,
      description: fr.description
        + " CORRECTION (TESTING F1, F4, F6, F11, row 6e4ca29e): (a) the new table's evidence/notes field must NOT reuse the existing `reasoning || JSON.stringify(metadata)` precedence bug at artifact-persistence-service.js:381 -- 317/400 sampled non-null notes values are already JSON blobs, not prose, so the dual-write must store reasoning AND metadata as distinct fields on the new table, not clobber one with the other. (b) attempt_number allocation MUST be atomic (e.g. a pg_advisory_xact_lock keyed on (venture_id,stage_number,gate_type) wrapping the SELECT-MAX+INSERT, or an equivalent race-proof pattern) -- a naive SELECT MAX+1 then INSERT races under concurrent-venture-orchestrator's concurrent dispatch. (c) a losing/failed second-table write must be logged loudly (throw or a hard-failure metric), never the existing logger.warn-only catch at eva-orchestrator.js:920-922, which currently silently drops the exact class of write the evidence layer exists to make durable. (d) the taste-gate call site's `details:`/`criteria:` parameter-name mismatch (eva-orchestrator.js:1275 passes `details:` where the function destructures `criteria:`, producing empty gate_criteria on every taste-gate row) must NOT be silently inherited by the new table's write path -- fix or explicitly carry the same defect forward with a documented reason.",
      acceptance_criteria: [
        ...fr.acceptance_criteria,
        'The new table\'s evidence-write path stores reasoning and metadata as distinct fields, never one clobbering the other',
        'attempt_number allocation is proven race-safe under concurrent writers (a live concurrent-insert test, or the advisory-lock mechanism is documented and reviewed)',
        'A failed/losing dual-write to the new table fails loud (exception or hard-failure log/metric), never a bare logger.warn',
      ],
    };
  }
  if (fr.id === 'FR-8') {
    return {
      ...fr,
      description: fr.description
        + ' EXPANDED (TESTING F5, F8, row 6e4ca29e): the census must also cover 5 additional eva_stage_gate_results consumers found beyond LEAD\'s original list (lib/eva/operations/domain-handler.js:64, lib/adam/briefings/platform.js:45, lib/eva/gate-bars.js:47,219, lib/eva/gate-enforcement.js:66, scripts/audit/normative-signal-audit.mjs:45), and 4 hand-maintained enumerations that would silently omit the NEW table unless updated: the master_reset_portfolio RPC\'s explicit phase-4 DELETE list (5 migration copies), fk-registry.cjs:39, .husky/pre-commit:373 (matches literal table names, and only `.insert|.upsert` -- blind to `.update()`), and the anon TRUNCATE-revoke sweep.',
      acceptance_criteria: [
        ...fr.acceptance_criteria,
        'The reader/writer census names all 10 total known eva_stage_gate_results consumers (5 original + 5 found by TESTING) and all 4 hand-maintained enumerations that need a new-table entry',
      ],
    };
  }
  return fr;
});

// --- TR additions: db-tier test-visibility gap (F12) ---
const technical_requirements = [
  ...prd.technical_requirements,
  {
    id: 'TR-5',
    requirement: "TS-1/TS-2/TS-3/TS-8's live-proof requirements MUST be delivered as one-time migration-verification evidence artifacts captured against the actually-applied migration (mirroring this SD's own LEAD-phase risk-agent/validation-agent `.artifacts-*.mjs` probe pattern), NOT as permanent vitest --project db specs.",
  },
];
// Insert a justifying description into TR-5 via a second pass (object literal above kept minimal for id/requirement match with existing TR shape).
const tr5 = technical_requirements[technical_requirements.length - 1];
tr5.description = "TESTING (F12, row 6e4ca29e) found .github/workflows/unit-tier.yml's own comment states no workflow ever invokes --project db, runs it with `|| true`, and never sets VITEST_DB_ALLOW_REF -- every db-tier test skips via installDbTierGate's DB_TIER_BLOCKED guard. Written as ordinary vitest specs, TS-1/TS-2/TS-3/TS-8 would be four suites asserting nothing, forever, and nobody would notice. Deliver the proofs as a committed, reproducible probe script run once against the applied chairman-gated migration (capturing real query output as evidence, same discipline as this SD's own LEAD-phase risk verification), not as CI-gated tests that silently no-op.";

// --- Risk additions ---
const risks = [
  ...prd.risks,
  {
    risk: "FR-4's NULL-first attempt lifecycle is unreachable from the originally-scoped write path -- recordGateResult() is only ever called post-verdict at all 3 known call sites, so no code path creates an in-flight NULL row. (TESTING F1, CRITICAL)",
    impact: 'critical',
    mitigation: 'Introduce an explicit openAttempt() write at each of the 3 call sites before evaluation runs (revised FR-4); if a call site cannot be safely changed, explicitly descope its NULL-visibility guarantee rather than silently missing it.',
  },
  {
    risk: 'No production code path mints or threads a cross-stage "run" identifier -- the only traversal-scoped function is dead in production; every real gate-writing path (worker, scheduler, orchestrators) calls processStage() independently with no persistent run continuity. (TESTING F2, CRITICAL)',
    impact: 'critical',
    mitigation: "Rescoped run_id to attempt_id: a fresh identifier per evaluation call, not a cross-stage run construct (revised FR-3). Cross-stage grouping is explicitly out of scope for this SD.",
  },
  {
    risk: 'attempt_number allocation via app-level SELECT MAX+1 races under concurrent dispatch, and the current write path silently drops a losing write (logger.warn only) -- the exact failure the evidence layer exists to prevent. (TESTING F6, HIGH)',
    impact: 'high',
    mitigation: 'Use an atomic allocation pattern (e.g. pg_advisory_xact_lock keyed on venture_id,stage_number,gate_type) and fail loud on any write failure (revised FR-7).',
  },
  {
    risk: "The dual-write would inherit 2 existing bugs in the write path it extends: the reasoning-vs-metadata JSON-clobbering precedence at artifact-persistence-service.js:381 (317/400 sampled notes values are already JSON, not prose), and the taste-gate details/criteria parameter mismatch producing empty gate_criteria. (TESTING F4, F11)",
    impact: 'medium',
    mitigation: 'The new table stores reasoning and metadata as distinct fields (never clobbering); the taste-gate parameter mismatch is fixed or explicitly carried forward with a documented reason, not silently inherited.',
  },
  {
    risk: '5 additional eva_stage_gate_results consumers and 4 hand-maintained enumerations exist beyond LEAD\'s original list, all of which need to be accounted for in FR-7\'s "verified unchanged" claim and FR-8\'s census. (TESTING F5, F8)',
    impact: 'medium',
    mitigation: 'FR-7 and FR-8 acceptance criteria expanded to name all 10 consumers and 4 enumerations explicitly.',
  },
  {
    risk: 'TS-1/TS-2/TS-3/TS-8 as ordinary vitest --project db specs would silently no-op forever -- this repo\'s db tier never actually runs in CI. (TESTING F12)',
    impact: 'medium',
    mitigation: 'TR-5: deliver these as one-time migration-verification evidence artifacts (probe scripts run once against the applied migration), not CI-gated specs.',
  },
];

const { error: updateErr } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements, technical_requirements, risks })
  .eq('id', PRD_ID);

if (updateErr) { console.error('[UPDATE FAILED]', updateErr.message); process.exit(1); }
console.log('[APPLIED] PRD revised with TESTING findings (row 6e4ca29e).');
console.log(`FRs: ${functional_requirements.length}, TRs: ${technical_requirements.length}, Risks: ${risks.length}`);
