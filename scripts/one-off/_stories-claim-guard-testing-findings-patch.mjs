// Sync US-002 (ENFORCEMENT-4 threading) with the TESTING sub-agent's C1/C3 findings
// (evidence 67361b06-cd82-4469-bee7-4dfef51ef13f) already folded into the PRD's FR-1 revision:
// the container-exemption scope gate must stay intact (branch derivation only refines a key
// for paths already in scope, never expands scope to .worktrees/qf/** or similar), and the
// worktree root must be resolved via `git rev-parse --show-toplevel` + an under-.worktrees
// discard check (a container-level git -C invocation silently returns "main", exit 0).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const STORY_ID = '71a8f95a-8b3f-41ae-a03f-83cae9291965'; // US-002

const { data: story, error: fetchErr } = await supabase
  .from('user_stories')
  .select('acceptance_criteria')
  .eq('id', STORY_ID)
  .single();
if (fetchErr || !story) { console.error('FETCH_FAILED', fetchErr); process.exit(1); }

// Fix the execFileSync timeout to match the PRD's 2000ms (was 5000ms in AC1)
const acceptance_criteria = story.acceptance_criteria.map((ac) =>
  ac.then?.includes('timeout: 5000')
    ? { ...ac, then: ac.then.replace('timeout: 5000', 'timeout: 2000') }
    : ac
);

acceptance_criteria.push(
  {
    scenario: 'Branch derivation never expands scope beyond today\'s container exemption (C1)',
    given: 'a file path under .worktrees/qf/<any-name>/... (the container-exempt prefix ENFORCEMENT-4 has always skipped)',
    when: 'ENFORCEMENT-4 evaluates the edit',
    then: 'the existing container-exemption check (match[1] !== \'qf\', aligned with the {sd,qf,adhoc} containers pre-tool-enforce.cjs:854 advertises) still short-circuits BEFORE any branch/marker/path derivation runs — branch-first derivation only refines the key for paths already in scope, it must never be the mechanism that newly subjects an exempt container to blocking (TESTING sub-agent finding C1, evidence 67361b06-cd82-4469-bee7-4dfef51ef13f)',
  },
  {
    scenario: 'Worktree root is resolved via show-toplevel, not a fixed single-segment path (C3)',
    given: 'a two-segment tree layout, e.g. .worktrees/qf/QF-20260903-451 (this session\'s own worktree)',
    when: 'the branch is resolved for derivation',
    then: 'the root is computed via `git rev-parse --show-toplevel` from the target file\'s directory, and the branch-derived key is DISCARDED unless that toplevel path is itself under .worktrees/ — measured: `git -C .worktrees/qf rev-parse --abbrev-ref HEAD` (a container-level, not tree-level, invocation) returns "main" with exit 0, which without this check would produce a confidently-wrong high-priority key with no fall-through (TESTING sub-agent finding C3)',
  }
);

const { error: updateErr } = await supabase
  .from('user_stories')
  .update({ acceptance_criteria })
  .eq('id', STORY_ID);
if (updateErr) { console.error('UPDATE_FAILED', updateErr); process.exit(1); }
console.log('US-002_PATCHED', { ac_count: acceptance_criteria.length });
