import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-LEO-PHASE-TAGGED-001';

async function main() {
  const { data: sd, error } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (error) throw error;

  const results = {
    verdict: 'PASS',
    confidence_score: 90,
    summary: 'Surveyed the existing SD-LEO-INFRA-BURN-TELEMETRY-PER-001 token-telemetry pipeline before scoping this SD. Confirmed the write/sync/upsert pipeline, outcome-side phase+sd_id tagging on sub_agent_execution_results/sd_phase_handoffs, and a reserved-but-empty baseline_snapshot.metrics slot all already exist. Confirmed context_usage_log has neither an sd_key nor a phase column -- the real, unbuilt core of this SD. Confirmed zero schema overlap with the EHG-app-side intelligence_budget_tracking table (different repo, different keys).',
    detailed_analysis: {
      files_read: [
        '.claude/context-usage-feed.cjs',
        'scripts/sync-context-usage.js',
        'scripts/worker-checkin.cjs',
        'database/migrations/20251226_context_usage_tracking.sql',
        'database/migrations/20260829_context_usage_loop_name.sql',
        'lib/governance/phase-snapshot-window.mjs',
        'database/chairman-gated/20260829_phase_snapshot_windows_agent_class_rates.sql',
        'docs/reference/schema/engineer/tables/sd_phase_handoffs.md',
        'docs/reference/schema/engineer/tables/sub_agent_execution_results.md',
        '(sibling repo) ehg/supabase/migrations/20251017135151_intelligence_budget_tracking.sql'
      ],
      key_findings: [
        'context_usage_log has NO sd_key/sd_id column and NO leo_phase column -- only loop_name (a recurring-task label, different axis) and session_id/working_directory. This is the real gap this SD closes.',
        'claude_sessions.sd_key is a POINT-IN-TIME claim field, not historical per-snapshot -- joining retroactively would misattribute tokens for a long-lived session touching multiple SDs sequentially. Must tag at write time (env var, mirroring the existing CLAUDE_LOOP_NAME pattern), not via retroactive join.',
        'sd_phase_handoffs.baseline_snapshot.metrics is an ALREADY-RESERVED, empty {} field explicitly commented as intended for exactly this per-phase burn data (phase-snapshot-window.mjs lines 30-34), including is_self_transition for first-pass vs rework detection -- this SD populates it, does not invent the phase-cycle mechanism.',
        'sub_agent_execution_results already has phase + sd_id + verdict, and v_agent_class_rates already joins outcome by phase and sd_type -- reusable as-is for FR-3, only the token-cost column is missing.',
        'Existing pipeline is confirmed side-effect-free (fail-soft, try/catch-wrapped in worker-checkin.cjs, no dispatch/cadence reads it) -- FR-5 replicates this exact posture.',
        'EHG-app intelligence_budget_tracking (sibling repo, different Supabase project) verified zero schema overlap: different keys (auth.users/ventures vs session_id/sd_id), no shared tables.',
        'QF-tier rollups and comms-vs-build session-class split have ZERO existing analog anywhere in the surveyed pipeline -- correctly descoped as genuinely new classification schemes, not joins, disproportionate to this wiring-focused SD.'
      ]
    },
    metadata: {
      repo_path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer',
      executed_from_cwd: process.cwd()
    }
  };

  await storeSubAgentResults('Explore', sd.id, { code: 'Explore', name: 'Explore' }, results, { source: 'manual', phase: 'LEAD' });
  console.log('OK stored Explore evidence for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
