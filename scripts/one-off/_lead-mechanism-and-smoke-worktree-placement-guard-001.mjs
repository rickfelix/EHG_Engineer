import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-FDBK-INFRA-WORKTREE-PLACEMENT-GUARD-001';

const smoke_test_steps = [
  {
    step_number: 1,
    instruction: 'Run `git worktree add ../EHG_Engineer-smoke-test -b smoke/outside-guard` from the repo root (simulates a model-typed sibling worktree, the exact defect class this SD closes).',
    expected_outcome: 'The command is REFUSED by the pre-tool-enforce.cjs hook with a message naming the sanctioned in-repo path (.worktrees/{sd,qf,adhoc}/<key>); no sibling directory is created.',
  },
  {
    step_number: 2,
    instruction: 'Run `git worktree add .worktrees/qf/QF-SMOKE-TEST-001 -b qf/QF-SMOKE-TEST-001` from the repo root.',
    expected_outcome: 'The command SUCCEEDS unimpeded (guard is scoped to outside .worktrees/, not to worktrees generally); clean up with `git worktree remove .worktrees/qf/QF-SMOKE-TEST-001 --force`.',
  },
  {
    step_number: 3,
    instruction: 'Read `.claude/commands/quick-fix.md` (or the worker skill doc updated by this SD).',
    expected_outcome: 'The doc now names the exact `.worktrees/qf/<id>` path a self-claimed QF should use, where previously it named none.',
  },
  {
    step_number: 4,
    instruction: 'Run the worktree-reaper fleet-health check (or its detector unit test) against a fixture registered worktree path outside `.worktrees/`.',
    expected_outcome: 'The new isSibling-style detector flags it, surfaced as a fleet-health line — distinguishable from the existing isNested/isZombieOnMain/isIdle detectors.',
  },
];

const mechanism_verifications = [
  { claim: 'worktree-manager.js WORKTREES_DIR + createWorkTypeWorktree typed layout', verified_by: 'Explore sub-agent (Task tool), LEAD phase', verified_at: 'lib/worktree-manager.js:889' },
  { claim: 'resolve-sd-workdir.js validateWorktreePath refuses paths outside .worktrees/', verified_by: 'Explore sub-agent (Task tool), LEAD phase', verified_at: 'scripts/resolve-sd-workdir.js:136' },
  { claim: 'create-quick-fix.js creates a worktree only behind a held mint-time claim', verified_by: 'Explore sub-agent (Task tool), LEAD phase', verified_at: 'scripts/create-quick-fix.js:661' },
  { claim: 'qf-auto-start.cjs (QF self-claim predicate) has zero worktree references', verified_by: 'Explore sub-agent (Task tool), LEAD phase', verified_at: 'lib/fleet/qf-auto-start.cjs:1' },
  { claim: 'pre-tool-enforce.cjs has no git-worktree-add enforcement today', verified_by: 'Explore sub-agent (Task tool), LEAD phase', verified_at: 'scripts/hooks/pre-tool-enforce.cjs:782' },
  { claim: 'worktree-reaper/detectors.js has no sibling-outside-.worktrees detector today', verified_by: 'Explore sub-agent (Task tool), LEAD phase', verified_at: 'lib/worktree-reaper/detectors.js:40' },
];

const { data: sd, error: fetchErr } = await sb
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) throw fetchErr;

const newMetadata = { ...sd.metadata, mechanism_verifications };

const { error } = await sb
  .from('strategic_directives_v2')
  .update({ smoke_test_steps, metadata: newMetadata })
  .eq('sd_key', SD_KEY);
if (error) throw error;

console.log('UPDATED smoke_test_steps (4) + metadata.mechanism_verifications (6) for', SD_KEY);
