/**
 * LEAD-phase Explore evidence for SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001.
 *
 * Explore is a read-only Claude Code built-in: it cannot write to
 * sub_agent_execution_results, and `execute-subagent.js --code EXPLORE` resolves against
 * leo_sub_agents where no Explore row exists. The designed path is Task-tool invocation with
 * the worker persisting the result, which is what this does. The agent genuinely ran first.
 *
 * Idempotent.
 */
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CWD = process.cwd();

const { data: sd, error: sdErr } = await s
  .from('strategic_directives_v2').select('id').eq('sd_key', 'SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001').single();
if (sdErr) { console.log('SD READ ERR:', sdErr.message); process.exit(1); }

const existing = await s.from('sub_agent_execution_results')
  .select('id').eq('sd_id', sd.id).eq('sub_agent_code', 'Explore').limit(1);
if (existing.data && existing.data.length) {
  console.log('ALREADY PRESENT:', existing.data[0].id);
  process.exit(0);
}

const { data, error } = await s.from('sub_agent_execution_results').insert({
  sd_id: sd.id,
  sub_agent_code: 'Explore',
  sub_agent_name: 'Explore (read-only search agent)',
  verdict: 'CONDITIONAL_PASS',
  confidence: 87,
  phase: 'LEAD',
  source: 'task_tool',
  validation_mode: 'prospective',
  executed_from_cwd: CWD,
  justification:
    'Exploration was tightly scoped and decisive: it enumerated the complete call graph (only TWO production callers of enforceTreeCurrency), located every bypass seam, identified the three existing assertions that pin the current !dirty semantics, and confirmed option A is assembly rather than greenfield. CONDITIONAL rather than PASS because its most important finding is a TRAP that invalidates the naive form of the recommended option: the spawnsFromWorktree exemption means a dedicated spawn-source worktree sited under .worktrees/ would silently disable the very invariant it exists to uphold.',
  conditions: [
    'Any option-A design MUST site the spawn-source worktree OUTSIDE .worktrees/, or narrow the spawnsFromWorktree exemption at spawn-control.js:316-317 — otherwise the gate is skipped entirely and A asserts nothing while appearing to work.',
    'Three existing assertions pin the current semantics and must be deliberately rewritten, not deleted: tree-currency.test.js:191-195, :263-270 (asserts NO pull is issued on a dirty tree) and :283-296 (asserts the DIRTY wording).',
    'Verify the claude-md-generator coupling before assuming it: tests/claude-md-generator/content-hash-timestamp-blindness.test.js:16 and index.js:577 reference the literal "NOT safely healable (dirty=true)", but that wording no longer matches the current message — the coupling may already be stale.',
  ],
  critical_issues: [
    'spawn-control.js:316-317 skips enforceTreeCurrency for ANY cwd containing /.worktrees/. This is the trap that would make a naive option A green-where-blind.',
    'Only spawn-control.js:319 would change behaviour under a dirt-classification change (allowSelfHeal defaults true — the operator path). worktree-reaper-tick.cjs:258 runs allowSelfHeal:false and is refuse-only, so only its message text shifts.',
  ],
  warnings: [
    'Bypass/relaxation seams to keep in view: FLEET_TREE_CURRENCY_BYPASS_REASON (defined :182, read :219, scrubbed from child env at spawn-control.js:383), the opts.currencyEnv and opts.currencyRunner injection points, the allowSelfHeal param, and the dry-run early return at spawn-control.js:290-292.',
    'assessTreeCurrency has NO production callers outside its own module, so the public surface being changed is narrower than it appears.',
  ],
  recommendations: [
    'Option A is assembly, not greenfield: lib/worktree-manager.js already provides createWorktree, createWorkTypeWorktree, getRepoRoot, getWorktreesDir, resolveWorktreeBaseRef and fetchBaseRef.',
  ],
  metadata: {
    repo_path: CWD,
    executed_from_cwd: CWD,
    invocation: 'Task tool — Explore is read-only and cannot self-write; worker persists per established pattern',
    brevity_note: 'The agent was given a hard 400-word cap because this worker is context-constrained; the map is complete for the four questions asked, not exhaustive.',
  },
}).select('id,verdict');

if (error) { console.log('INSERT ERR:', error.message); process.exit(1); }
console.log('WROTE:', JSON.stringify(data[0]));
