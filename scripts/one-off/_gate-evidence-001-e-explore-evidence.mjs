#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-E, LEAD-TO-PLAN phase.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-E';

const findings = [
  {
    id: 'canonical-writer-never-stamps-session-id',
    severity: 'HIGH',
    summary: "lib/sub-agent-executor/results-storage.js's storeSubAgentResults() (line 437-946) builds its insert/update record (698-725) with no session_id field anywhere, top-level or in metadata (built 568-633). process.env.CLAUDE_SESSION_ID is read once at line 863 (touchOwnerHeartbeat) purely to ping claude_sessions.heartbeat_at -- never written onto the evidence row itself.",
  },
  {
    id: 'second-writer-also-unstamped',
    severity: 'HIGH',
    summary: "scripts/hooks/task-subagent-recorder.cjs's processHookInput (record built 408-425, source:'task_hook') also inserts into sub_agent_execution_results. It reads process.env.CLAUDE_SESSION_ID at line 224 only to resolve sd_id via claim-lookup (getActiveSD, 217-256) and stamps metadata.attribution_source (423) -- the session id value itself is never persisted here either. 'Unconditionally' must cover both writers or the stamp remains path-partial, exactly the class of gap this SD's own thesis is about.",
  },
  {
    id: 'verdict-cache-is-a-different-mechanism-than-the-title-implies',
    severity: 'INFO',
    summary: "The 'verdict cache' referenced in the SD title is scripts/modules/handoff/gate-verdict-cache.js, wired into ValidationOrchestrator.js:280-333 and BaseExecutor.js:489-539 -- a GATE-level cache over sd_phase_handoffs.metadata.gate_results, unrelated to sub_agent_execution_results. Current key (probeVerdictCache, 141-175): prior row selected by (sd_id, handoff_type) [loadPriorGateResults, 185-205], match requires prior.input_hash === computeInputHash(extractor(context)) (sha256 of fixed SD content fields, line 157). For FAIL-REPLAY-only gates (FAIL_REPLAY_GATES, line 107) an additional check compares prior.code_version to GATE_CODE_VERSION[gateName] (168-169; GATE_CODE_VERSION defined 102, currently only {GATE_MECHANISM_CLAIM_VERIFIER: 1}). Today's key is (sd_id, handoff_type) -> input_hash [-> code_version for fail-replay] -- never an execution id.",
  },
  {
    id: 'invocation-id-not-populated-by-canonical-writer',
    severity: 'MEDIUM',
    summary: "invocation_id (a real, existing column) is NOT populated by the canonical results-storage.js writer at all -- no invocation_id key anywhere in its record object. It is populated only by task-subagent-recorder.cjs's separate hook-based insert path (invocation_id: invocationId, line 416, generated 381 via generateInvocationId) -- a different call path (source:'task_hook') than the explicit lib/sub-agents/* -> storeSubAgentResults() path most sub-agents use.",
  },
  {
    id: 'no-existing-migration-for-session-id-column',
    severity: 'INFO',
    summary: 'No migration in database/migrations/ or database/chairman-gated/ adds or stages a session_id column on sub_agent_execution_results (checked including the two invocation_id migrations, 20260130_add_invocation_id_to_sub_agent_results.sql and 20260130_add_invocation_tracking_to_sub_agent_results.sql). docs/reference/schema/engineer/tables/sub_agent_execution_results.md (25 columns) also has no session_id. Precedent (CLAUDE.md prologue rule 11): repo_path/executed_from_cwd already live in metadata rather than as top-level columns for the identical provenance-stamping purpose -- a metadata-based session_id stamp would follow that established, no-migration-needed pattern.',
  },
  {
    id: 'existing-tests-with-blast-radius',
    severity: 'MEDIUM',
    summary: 'scripts/modules/handoff/gate-verdict-cache.test.js has extensive coverage (e.g. lines 55-176) assuming input-hash-based keying; re-keying the cache on execution-id+gate-version would require rewriting most of it. tests/unit/handoff/base-executor-validation-context-session-id.test.js already exists and should be checked against any new stamping behavior. No test currently references session_id on sub_agent_execution_results directly, so a writer-side test for that half would be net-new.',
  },
];

const summary = 'Explore-phase discovery for SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-E: the canonical results-storage.js writer AND the separate task-subagent-recorder.cjs hook writer both currently omit session_id entirely (confirming the parent SDs measured gap). The verdict cache the title references is gate-verdict-cache.js, a distinct SD-phase-handoff-level cache keyed on (sd_id, handoff_type)+input_hash today, not an execution-id-keyed cache over sub_agent_execution_results -- re-keying it touches a large existing test suite. No DB migration for session_id exists yet; the established metadata-based provenance-stamp pattern (repo_path/executed_from_cwd) is available as a no-migration path for the session-id half.';

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
    warnings: [],
    recommendations: [
      'Stamp session_id into metadata (not a new column) on BOTH storeSubAgentResults() and task-subagent-recorder.cjs, following the repo_path/executed_from_cwd precedent -- no migration needed.',
      'Treat the gate-verdict-cache.js re-key as a separate, carefully-scoped FR given its existing test surface; consider whether the SD title\'s "verdict cache" goal is actually satisfied by a narrower change (e.g. adding execution-id as an additional cache-key dimension) rather than a full re-key that breaks input-hash-based reuse.',
    ],
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'lib/sub-agent-executor/results-storage.js',
        'scripts/hooks/task-subagent-recorder.cjs',
        'scripts/modules/handoff/gate-verdict-cache.js',
        'scripts/modules/handoff/ValidationOrchestrator.js',
        'scripts/modules/handoff/BaseExecutor.js',
        'scripts/modules/handoff/gate-verdict-cache.test.js',
        'tests/unit/handoff/base-executor-validation-context-session-id.test.js',
        'docs/reference/schema/engineer/tables/sub_agent_execution_results.md',
      ],
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
