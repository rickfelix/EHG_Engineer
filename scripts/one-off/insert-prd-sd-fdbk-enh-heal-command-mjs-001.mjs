#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = '9e8d5ddf-71e1-4138-bc6c-a4fa387e5dea';
const SD_KEY = 'SD-FDBK-ENH-HEAL-COMMAND-MJS-001';
const PRD_ID = `PRD-${SD_KEY}`;

const prd = {
  id: PRD_ID,
  sd_id: SD_UUID,
  directive_id: SD_KEY,
  title: 'PRD: Bind missing options parameter in corrective-sd-generator (heal sd generate fix)',
  version: '1.0.0',
  status: 'approved',
  category: 'feature',
  priority: 'medium',
  document_type: 'prd',
  phase: 'PLAN',
  progress: 0,

  executive_summary:
    'heal-command.mjs sd generate <score-id> crashes with ReferenceError: options is not defined whenever the score has rubric_snapshot.git_sha (i.e. every score generated post SD-LEO-INFRA-HEAL-PIPELINE-INTEGRITY-001 / CAPA-3). Root cause: scripts/eva/corrective-sd-generator.mjs:232 declares the function as generateCorrectiveSD(scoreId) but line 286 references options?.force inside the staleness check. Short-circuit evaluation hides the bug for older scores (no git_sha → never reaches the && right-hand side); CAPA-3 stamping makes the failure path the common case. Fix: add options = {} to the signature, plumb an optional --force CLI flag through heal-command.mjs:625 so the staleness override path becomes reachable. Net change ~5-8 source LOC + ~30 test LOC. No schema, no auth, no migration. SD title says "on Windows (Node 24.12)" but the bug is platform-independent — Windows was first observation, scope is cross-platform.',

  business_context:
    'Heal pipeline corrective-SD generation is broken for the modern fleet of vision scores. Every newly-scored failing SD that should auto-generate a corrective remediation SD instead errors out, leaving manual remediation as the only path. Per the originating feedback, the workaround is "skip corrective generation" — restoring the auto-path is the value here.',

  technical_context:
    'corrective-sd-generator.mjs is dynamically imported at heal-command.mjs:624 and invoked at :625 with a single argument. The staleness check at lines 285-302 was added by SD-LEO-INFRA-HEAL-PIPELINE-INTEGRITY-001 (CAPA-3) using options?.force as the override hatch — but the function signature was never updated to bind options. The `?.` optional-chaining shields the read once options is bound to undefined; the bug is that options is never declared in scope, so the access is a ReferenceError rather than a safe undefined-read.',

  functional_requirements: [
    {
      id: 'FR-1',
      title: 'Bind options parameter on generateCorrectiveSD',
      description: 'Update scripts/eva/corrective-sd-generator.mjs:232 from `export async function generateCorrectiveSD(scoreId)` to `export async function generateCorrectiveSD(scoreId, options = {})`. Default empty object preserves all existing call-site behavior. No other reads of `options` in the file (verified via grep).',
      priority: 'high',
      acceptance_criteria: ['Function declares options as second parameter with default {}', 'Existing single-arg callers continue to work unchanged', 'Line 286 evaluates without throwing when called with no second argument and a score whose rubric_snapshot.git_sha is set']
    },
    {
      id: 'FR-2',
      title: 'Plumb --force CLI flag through heal-command.mjs',
      description: 'Add --force to the CLI parser in scripts/eva/heal-command.mjs (~line 92 alongside other generate-mode flags). Forward as { force: opts.force } to generateCorrectiveSD at line 625. Without this plumbing the staleness override path remains unreachable from the canonical entrypoint.',
      priority: 'medium',
      acceptance_criteria: ['heal sd generate <score-id> --force sets opts.force=true', 'cmdSDGenerate signature accepts and forwards options to generateCorrectiveSD', 'Default invocation (no --force) still works']
    },
    {
      id: 'FR-3',
      title: 'Vitest regression coverage',
      description: 'Add unit case in tests/unit/eva/corrective-sd-generator.test.js (or new file if absent) that exercises the bug path: stub a score whose rubric_snapshot.git_sha equals a recent HEAD commit (commitsBehind <= 50), invoke generateCorrectiveSD(scoreId) with NO second argument, assert no ReferenceError thrown and the staleness branch enters the inner try block.',
      priority: 'high',
      acceptance_criteria: ['Test reproduces the original crash without the fix', 'Test passes after FR-1 binding', 'Test asserts staleness branch is exercised, not skipped']
    },
    {
      id: 'FR-4',
      title: 'Self-document the fix in code comment',
      description: 'Add a single inline comment at the new options parameter linking to this SD and noting the binding-fix history. One line, no expansion of unrelated areas.',
      priority: 'low',
      acceptance_criteria: ['Comment present and concise (<=80 chars body)', 'References SD key for future spelunkers']
    }
  ],

  non_functional_requirements: [
    { id: 'NFR-1', title: 'Behavior preservation', description: 'All existing single-arg call sites must produce identical output before and after fix.' },
    { id: 'NFR-2', title: 'Cross-platform', description: 'Fix verified on Linux + Windows (the original reproduction platform).' }
  ],

  technical_requirements: [
    { id: 'TR-1', title: 'No schema changes', description: 'Pure JavaScript signature update.' },
    { id: 'TR-2', title: 'No new dependencies', description: 'Uses existing vitest + supabase mocking patterns from sibling tests.' },
    { id: 'TR-3', title: 'ESM .mjs convention preserved', description: 'Match existing module style.' }
  ],

  system_architecture: 'Caller heal-command.mjs:625 cmdSDGenerate(scoreId) -> dynamically imports corrective-sd-generator.mjs -> calls generateCorrectiveSD(scoreId, options). Inside: staleness check at line 285-302 reads options?.force; previously this threw ReferenceError because options was unbound. After fix: options is bound (default {}), short-circuit `options?.force` reads safely (returns undefined), staleness check proceeds. New CLI path: heal sd generate <score-id> --force -> opts.force=true -> options.force=true at the function -> staleness check is bypassed allowing override.',

  data_model: { reads: [], writes: [], new_tables: [], new_columns: [] },

  acceptance_criteria: [
    { id: 'AC-1', criterion: 'No ReferenceError on score with git_sha', measure: 'Invoke heal sd generate against a score whose rubric_snapshot.git_sha is HEAD-recent; assert process exits 0 (or returns valid result), no ReferenceError in stderr.' },
    { id: 'AC-2', criterion: 'Existing call sites unaffected', measure: 'All existing references to generateCorrectiveSD in heal-command.mjs (lines 625, 679) work without modification when not passing options.' },
    { id: 'AC-3', criterion: '--force flag plumbing works end-to-end', measure: 'heal sd generate <score-id> --force against a STALE score (commitsBehind > 50) should bypass staleness check and proceed (vs default which logs skipped_stale_score).' },
    { id: 'AC-4', criterion: 'Vitest regression case green', measure: 'tests/unit/eva/corrective-sd-generator.test.js (or chosen file) contains a test that fails on unfixed code and passes after FR-1.' },
    { id: 'AC-5', criterion: 'No unrelated changes', measure: 'git diff shows only signature, comment, CLI parser, call-site forward, and test additions — no incidental refactors.' }
  ],

  test_scenarios: [
    { id: 'T-1', type: 'unit', name: 'Default-options invocation does not throw on git_sha-stamped score', description: 'Mock supabase to return a score with rubric_snapshot.git_sha set to a known recent commit; invoke generateCorrectiveSD(scoreId) with no second arg; assert no ReferenceError; assert staleness branch entered.' },
    { id: 'T-2', type: 'unit', name: 'options.force=true bypasses staleness check', description: 'Mock supabase to return a score with very-stale git_sha (commitsBehind > 50); invoke generateCorrectiveSD(scoreId, { force: true }); assert proceeds past staleness check.' },
    { id: 'T-3', type: 'unit', name: 'options.force=undefined preserves default skip on stale', description: 'Mock supabase to return same stale score; invoke without options; assert returns action=skipped reason=stale-score.' },
    { id: 'T-4', type: 'unit', name: 'CLI parser accepts --force', description: 'Test heal-command.mjs parseArgs (or extracted helper); assert opts.force set when --force present, undefined otherwise.' },
    { id: 'T-5', type: 'unit', name: 'cmdSDGenerate forwards options', description: 'Spy generateCorrectiveSD; invoke cmdSDGenerate(scoreId, { force: true }); assert spy called with (scoreId, { force: true }).' }
  ],

  implementation_approach:
    '1. Edit scripts/eva/corrective-sd-generator.mjs:232 — change `(scoreId)` to `(scoreId, options = {})` (1 line). 2. Add 1-line inline comment referencing SD-FDBK-ENH-HEAL-COMMAND-MJS-001. 3. Edit scripts/eva/heal-command.mjs cmdSDGenerate (line 623) to accept options and forward — change to `async function cmdSDGenerate(scoreId, options = {})` and `await generateCorrectiveSD(scoreId, options)` (~2 lines). 4. Add --force flag handling in CLI parser around line 92 (~3 lines). 5. Forward `{ force: opts.force }` from main entry at :866 (~1 line). 6. Add vitest cases T-1..T-5 in tests/unit/eva/corrective-sd-generator.test.js — create file if absent (~80 LOC including supabase mock setup). Total: ~7 source LOC + ~80 test LOC.',

  technology_stack: ['Node.js (ESM .mjs)', '@supabase/supabase-js', 'vitest'],

  dependencies: [
    { type: 'lib', id: 'scripts/eva/corrective-sd-generator.mjs', status: 'shipped', note: 'Direct fix target.' },
    { type: 'lib', id: 'scripts/eva/heal-command.mjs', status: 'shipped', note: 'CLI caller — needs --force plumbing.' },
    { type: 'sd', id: 'SD-LEO-INFRA-HEAL-PIPELINE-INTEGRITY-001', status: 'completed', note: 'CAPA-3 added the staleness branch but missed binding the options param — this PRD closes that gap.' }
  ],

  risks: [
    { id: 'R-1', title: 'Staleness check semantics drift', severity: 'low', mitigation: 'Behavior is exactly the same when options is undefined (the new default). Only new code path is the --force override which existing callers cannot trigger by accident.' },
    { id: 'R-2', title: 'Test-fixture commit not on disk', severity: 'low', mitigation: 'Use a known commit SHA from the worktree (e.g. HEAD~1 or the merge commit of FR-F PR #3458) and reference via execSync output mocking rather than relying on actual git rev-list.' },
    { id: 'R-3', title: 'Risk-agent may flag this as feature-class change due to sd_type=feature in DB', severity: 'low', mitigation: 'PRD documents the actual change scope (~7 source LOC, additive parameter only). LEAD validation evidence (id 4d5eb96d) confirms minimal-fix verdict.' }
  ],

  constraints: ['No schema changes', 'No auth changes', 'No new dependencies', 'No refactor of corrective-sd-generator beyond the binding fix'],
  assumptions: ['heal-command.mjs CLI parser pattern from existing flags can accommodate --force without restructuring', 'tests/unit/eva/ test layout is the canonical home for these regression cases'],

  metadata: {
    sub_agent_evidence: { LEAD: '4d5eb96d-832c-4658-b9eb-bf331b983cb7' },
    prd_authored_by: 'claude-code-inline-mode',
    prd_authored_at: new Date().toISOString(),
    scope_amendment: 'Dropped Windows-Node 24.12 framing — bug is platform-independent. Windows recorded as provenance only. Validation-agent score 94 (id 4d5eb96d) confirms.',
    vision_score_id: '329c32dc-0aaf-4e2e-8e66-f5e1bca6f9a9',
    vision_action: 'ESCALATE'
  }
};

const userStories = [
  {
    story_key: `${SD_KEY}:US-001`,
    prd_id: PRD_ID,
    sd_id: SD_UUID,
    title: 'As an EVA pipeline operator I want heal sd generate <score-id> to succeed on modern (git_sha-stamped) scores so corrective SDs auto-generate again',
    user_role: 'EVA pipeline operator',
    user_want: 'heal sd generate to not crash on scores with rubric_snapshot.git_sha',
    user_benefit: 'corrective remediation SDs auto-generate from failing scores without manual intervention',
    story_points: 1,
    priority: 'medium',
    status: 'draft',
    acceptance_criteria: ['heal sd generate <score-id> exits 0 on a score with rubric_snapshot.git_sha set', 'corrective SD created (or staleness skip recorded) instead of ReferenceError'],
    definition_of_done: ['AC-1, AC-2, AC-4 pass', 'Vitest T-1 + T-3 green'],
    technical_notes: 'Bind options parameter at corrective-sd-generator.mjs:232. Default {} preserves behavior.',
    implementation_approach: 'Single-line signature update + comment + regression test.',
    test_scenarios: ['T-1', 'T-3'],
    implementation_context: { fix_site: 'scripts/eva/corrective-sd-generator.mjs:232', loc_estimate: '7 source + 80 test', regression_anchor: 'rubric_snapshot.git_sha set + commitsBehind <= 50' }
  },
  {
    story_key: `${SD_KEY}:US-002`,
    prd_id: PRD_ID,
    sd_id: SD_UUID,
    title: 'As an EVA pipeline operator I want a --force flag on heal sd generate so I can override staleness when re-scoring is impractical',
    user_role: 'EVA pipeline operator',
    user_want: 'a --force CLI flag plumbed through heal-command.mjs to generateCorrectiveSD options.force',
    user_benefit: 'I can intentionally bypass the 50-commit staleness skip without re-running vision-scorer',
    story_points: 1,
    priority: 'low',
    status: 'draft',
    acceptance_criteria: ['heal sd generate <score-id> --force bypasses staleness check', 'Default invocation (no --force) preserves existing skip behavior'],
    definition_of_done: ['AC-3 passes', 'Vitest T-2 + T-4 + T-5 green'],
    technical_notes: 'Add --force to argv parser around heal-command.mjs:92. Forward { force: opts.force } at :866 + cmdSDGenerate signature update at :623.',
    implementation_approach: 'CLI flag parse + forward through cmdSDGenerate to generateCorrectiveSD.',
    test_scenarios: ['T-2', 'T-4', 'T-5'],
    implementation_context: { plumbing_sites: ['scripts/eva/heal-command.mjs:~92 parser', 'scripts/eva/heal-command.mjs:623 cmdSDGenerate sig', 'scripts/eva/heal-command.mjs:866 main forward'], opt_in_only: true }
  }
];

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const s = createClient(url, key);

  const { error: prdErr } = await s.from('product_requirements_v2').upsert(prd, { onConflict: 'id' });
  if (prdErr) {
    console.error('PRD insert failed:', prdErr.message);
    process.exit(1);
  }
  console.log('PRD inserted:', PRD_ID);

  for (const us of userStories) {
    const { error: usErr } = await s.from('user_stories').upsert(us, { onConflict: 'story_key' });
    if (usErr) {
      console.error(`User story ${us.story_key} insert failed:`, usErr.message);
      process.exit(1);
    }
    console.log('User story inserted:', us.story_key);
  }

  console.log('PRD + user stories committed.');
}

main().catch((err) => { console.error(err); process.exit(1); });
