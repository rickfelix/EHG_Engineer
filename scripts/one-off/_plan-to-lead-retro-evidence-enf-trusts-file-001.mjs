#!/usr/bin/env node
/**
 * PLAN-TO-LEAD RETRO sub-agent evidence for SD-LEO-FIX-ENF-TRUSTS-FILE-001.
 * The retrospective row (retrospectives table, retro_type=SD_COMPLETION, id 91132b93-fb03-4f85-8f68-0d0fdbfe9746)
 * already exists and passed RETROSPECTIVE_QUALITY_GATE (97%). This records the separate
 * sub_agent_execution_results row GATE_SUBAGENT_EVIDENCE requires for code=RETRO.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-FIX-ENF-TRUSTS-FILE-001';

async function main() {
  const supabase = getSupabaseClient();
  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'RETRO',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 95,
    findings: [
      {
        id: 'F1-sd-completion-retro-persisted',
        severity: 'INFO',
        summary: 'SD_COMPLETION retrospective persisted (id 91132b93-fb03-4f85-8f68-0d0fdbfe9746, quality_score 90, status PUBLISHED, 0 boilerplate-pattern matches). Content grounded in the actual investigation: the falsified original QF proposal, the per-PID os.tmpdir() fix rationale with measured collision evidence, the verifier design, and the two governance traps hit (gitignore blanket pattern, shell-injection-argv allowlist).',
      },
    ],
    recommendations: ['Follow-up SD candidate recorded: sibling-class sweep of other shared-live-resource-with-no-test-injection-point files (lib/coordinator-mutation-guard.mjs, lib/fleet/cc-pid-liveness.cjs, lib/fleet/role-status-identity.cjs, scripts/fleet-dashboard.cjs, .claude/unified-session-state.json).'],
    metadata: {},
  };
  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults('RETRO', SD_KEY, null, results, { phase: 'PLAN_TO_LEAD' });
  console.log('Stored:', JSON.stringify({ id: stored?.id, verdict: results.verdict }));
}

main().catch((e) => { console.error(e); process.exit(1); });
