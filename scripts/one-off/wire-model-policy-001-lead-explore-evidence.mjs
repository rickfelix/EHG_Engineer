#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-INFRA-WIRE-MODEL-POLICY-001, LEAD-TO-PLAN phase.
 *
 * Records the discovery work actually performed by this worker before/alongside the
 * validation-agent, risk-agent, and prospective testing-agent LEAD-phase runs: reading
 * lib/fleet/role-status-identity.cjs in full (the pre-existing three-state role classifier),
 * lib/governance/emit-feedback.js's day-salted dedup pattern, and locating fleet-dashboard.cjs's
 * existing metadata projection -- the discoveries that informed both the LEAD scope correction and
 * the PRD's FR-1/FR-2/FR-3.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-WIRE-MODEL-POLICY-001';

const findings = [
  {
    id: 'three-state-role-classifier-located-and-read-in-full',
    severity: 'HIGH',
    summary: 'lib/fleet/role-status-identity.cjs read in full. Exports verdictFromMetadata(metadata) -> "role"|"worker"|"unknown" (ROLE_VERDICT enum), built by SD-LEO-INFRA-ROLE-BLIND-SESSION-001 FR-1 specifically to prevent the collapse-to-worker defect class. Handles metadata.non_fleet===true and metadata.is_coordinator===true as affirmative ROLE (the coordinator writer stamps is_coordinator, never a role string -- QF-20260906-473 is the prior incident where a predicate missed this). An absent role key is treated as an affirmative WORKER signal; a malformed/empty role string is UNKNOWN, never guessed. Also exports the async roleVerdictFor({sessionId, supabase}) (DB-first, .claude/fleet-identity-<sid>.json fallback for hook contexts) and shouldApplyWorkerMachinery (collapses UNKNOWN to true/worker, a DIFFERENT and deliberately more conservative policy than what a model-mismatch signal needs -- confirms the SD must call verdictFromMetadata/roleVerdictFor directly, not shouldApplyWorkerMachinery).',
  },
  {
    id: 'emit-feedback-dedup-mechanism-confirmed-reusable',
    severity: 'INFO',
    summary: 'lib/governance/emit-feedback.js\'s emitFeedback() read: day-salted dedup_hash, insert-or-noop semantics (returns {id, deduped}), already the established idiom other watchdogs (lib/adam/inbound-backlog-watchdog.js, lib/adam/outbound-silence-watchdog.js) use to avoid duplicate feedback rows. Confirms the PRD\'s FR-1 requirement to use emitFeedback rather than any hand-rolled UPDATE-based dedup, which the live append-only trigger on public.feedback would reject outright.',
  },
  {
    id: 'fleet-dashboard-metadata-projection-located',
    severity: 'INFO',
    summary: 'scripts/fleet-dashboard.cjs confirmed to be the actively-maintained (npm run fleet:dashboard), large (3457 lines) live dashboard surface; it already selects and projects session metadata (model/effort chip) with no additional DB query needed to add role/is_coordinator/non_fleet fields to that same projection for FR-2 -- corroborates validation-agent\'s independent measurement of the exact same fact.',
  },
  {
    id: 'model-policy-cjs-consumer-surface-confirmed-empty',
    severity: 'INFO',
    summary: 'grep across the repo for checkModelMismatch/recipeLine (both shipped by QF-20260911-878) confirms zero runtime consumers today outside their own module and test file -- this SD is the first real consumer, corroborating validation-agent\'s independent finding of the same fact and confirming no duplicate/overlapping in-flight work exists.',
  },
  {
    id: 'fleet-health-as-a-table-does-not-exist-corroborated',
    severity: 'INFO',
    summary: 'Independently corroborates validation-agent\'s live-probed finding that public.fleet_health is not a table (PGRST205) -- lib/governance/drive-state/axes/fleet-health.cjs is a code module, not a data surface. The original QF-20260911-878 description\'s "feedback + fleet_health" framing for a loud mismatch signal is corrected in this SD\'s PRD to feedback-only for FR-1, with FR-2 (the dashboard count) serving the observability role fleet_health was assumed to serve.',
  },
];

const warnings = [
  'FR-1\'s fix for the false-positive-on-first-SessionStart edge case (classify off the hook\'s own pre-write existingMetadata snapshot, never a fresh re-query) narrows but does not fully eliminate the false positive: a role seat\'s very first-ever SessionStart before its role-registration step has run will still classify as worker once. Documented as an accepted, self-healing, low-severity risk in the PRD rather than engineered away (would require a second DB round-trip inside an already-tight hook timeout budget).',
];

const recommendations = [
  'EXEC must re-verify against current main (not this LEAD-phase snapshot) that capture-session-id.cjs\'s main() still fetches existingMetadata before its upsert at the exact point buildSessionMetadata(existingMetadata, ...) is called, since hook internals can drift between LEAD and EXEC.',
  'EXEC must confirm require()-ing the ESM lib/governance/emit-feedback.js from the CJS hook does not throw ERR_REQUIRE_ESM on the CI runner\'s actual Node version, not merely the authoring machine\'s (measured node v24.12.0 locally by prospective testing-agent).',
  'EXEC must place all new tests in *.test.js files and confirm via `npx vitest list` that they are collected by the exact vitest invocation hooks-harness-tests.yml runs in CI -- three pre-existing *.test.cjs suites in tests/unit/hooks/ were measured dark (never collected) by prospective testing-agent.',
];

const summary = 'Explore-phase discovery for SD-LEO-INFRA-WIRE-MODEL-POLICY-001 located and read in full the pre-existing three-state role classifier (lib/fleet/role-status-identity.cjs) that the original QF-20260911-878 filing did not know about, confirmed the emitFeedback day-salted dedup idiom as the correct write path given the live append-only feedback trigger, confirmed fleet-dashboard.cjs already has the metadata needed for FR-2 with zero new queries, and independently corroborated validation-agent\'s and risk-agent\'s core findings (coordinator-seat false positive, fleet_health table absence, zero existing runtime consumers of model-policy.cjs). This exploration, together with validation-agent/risk-agent/prospective-testing-agent evidence, was the basis for the LEAD scope correction recorded on this SD and for the PRD\'s FR-1/FR-2/FR-3.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 92,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'lib/fleet/role-status-identity.cjs',
        'lib/fleet/model-policy.cjs',
        'lib/governance/emit-feedback.js',
        'scripts/hooks/capture-session-id.cjs',
        'scripts/fleet-dashboard.cjs',
      ],
      related_sub_agent_evidence: {
        validation: 'bbe5505d-8970-42f1-9924-eed669607b9c',
        risk: '1c58d649-f511-4563-a548-10cfd387f650',
        testing_prospective: '09a71628-23be-4e3e-9883-168b080448fa',
      },
      parent_qf: 'QF-20260911-878',
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'Explore',
    SD_KEY,
    { name: 'Explore' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' },
  );

  console.log('EXPLORE EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
