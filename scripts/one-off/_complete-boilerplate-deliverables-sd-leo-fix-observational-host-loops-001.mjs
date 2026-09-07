// Mark auto-generated boilerplate deliverables complete with evidence.
// sync-deliverables-from-git.js's commit-to-branch matching couldn't find these commits: the
// implementation landed on a pre-existing qf/QF-20260906-831 branch (reaper-preserved WIP,
// commit 46b8983f961) before this SD was escalated from that QF, so the commit predates the
// SD's own key existing anywhere in the branch/commit history the script scans for.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const updates = [
  {
    id: '01eeb71c-d2aa-4eca-9856-1e8600b97c3a', // ui_feature: Core functionality implemented
    completion_status: 'completed',
    completion_notes:
      'All 3 FRs implemented and live-verified: config/armed-loops-registry.json (needs_model registry), scripts/setup-index-jam-detector-task.mjs (Task Scheduler registration, reusing setup-alarm-cron-tasks.mjs\'s tested FR-5 builders), tests/unit/config/armed-loops-registry.test.js (exit-predicate CI test). Registered live this session: schtasks /Create succeeded, --verify confirmed hidden-window launch, repeating, enabled for \'EHG LEO Loop - Index Jam Detector\'.',
    completion_evidence: {
      commit: '46b8983f961',
      files: ['config/armed-loops-registry.json', 'scripts/setup-index-jam-detector-task.mjs', 'tests/unit/config/armed-loops-registry.test.js'],
      live_registration: 'schtasks /Create succeeded; --verify confirmed VERIFIED — hidden-window launch, repeating, enabled',
      mechanism_verification: 'scripts/cron/index-jam-detector.mjs:87 (observeIndexLock) read and confirmed strictly observational (fs.statSync only)',
    },
    verified_by: 'EXEC',
    verified_at: new Date().toISOString(),
    verification_notes: 'Live schtasks registration + --verify run this session; 5/5 armed-loops-registry unit tests passing.',
  },
  {
    id: 'd0ebb366-5be9-4901-96bf-0cc1edcb222a', // ui_feature: Code review completed
    completion_status: 'completed',
    completion_notes:
      'Self-review performed: read scripts/cron/index-jam-detector.mjs in full to verify the mechanism claim (strictly observational, fs.statSync at line 87/98) before citing it in the SD spine (GATE_MECHANISM_CLAIM_VERIFIER). scripts/setup-index-jam-detector-task.mjs reuses scripts/setup-alarm-cron-tasks.mjs\'s builders, which already carry SECURITY sub-agent hardening (SEC-1 XML-injection guard, SEC-2 argument quoting) from a prior SD -- no new attack surface introduced. SECURITY sub-agent ran CONDITIONAL_PASS (70%, pre-existing fleet-wide RLS/SECURITY-DEFINER findings unrelated to this diff).',
    completion_evidence: {
      mechanism_verification_citation: 'scripts/cron/index-jam-detector.mjs:87',
      reused_hardened_builders: 'scripts/setup-alarm-cron-tasks.mjs (buildWrapperScript, buildHiddenTrAction, buildCreateArgs)',
      security_subagent_result: 'CONDITIONAL_PASS 70% -- findings are pre-existing fleet-wide (RLS census, SECURITY DEFINER catalog), not introduced by this diff',
    },
    verified_by: 'EXEC',
    verified_at: new Date().toISOString(),
    verification_notes: 'No new attack surface: thin wrapper over already-reviewed, already-tested FR-5 builders.',
  },
];

for (const u of updates) {
  const { id, ...patch } = u;
  const { error } = await sb.from('sd_scope_deliverables').update(patch).eq('id', id);
  if (error) {
    console.error('FAILED for', id, error.message);
    process.exit(1);
  }
  console.log('completed:', id);
}
console.log('Done.');
