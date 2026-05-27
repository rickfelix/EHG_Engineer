// One-off: set checkpoint_plan on SD-C for BMAD PLAN-TO-EXEC gate (10 stories = checkpoint plan required).
// Maps the 7-phase implementation_approach (FR-0 migrations + 6 code phases) to 10 user stories.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = '6696db72-d1b1-4a07-8281-3bd7eb922251';

// Fetch existing stories to anchor checkpoint IDs to story keys
const { data: stories } = await supabase
  .from('user_stories')
  .select('id, story_key, title, prd_id')
  .eq('sd_id', SD_ID)
  .order('created_at');

console.log('Found', stories?.length || 0, 'stories.');

const checkpointPlan = {
  schema_version: '1.0',
  total_checkpoints: 7,
  notes: 'Each checkpoint represents a shippable PR scope. PRs must be small (≤200 LOC each per PRD guidance, ≤80 LOC for Phase 0/1). Checkpoint completion blocks subsequent checkpoint start. Migrations ship first; tests for each FR ship alongside the FR.',
  checkpoints: [
    {
      checkpoint: 'CP-0',
      phase: 'Phase 0: Migrations',
      stories: [],
      deliverables: [
        'database/migrations/YYYYMMDD_eva-support-sd-refs-column.sql (ALTER TABLE eva_todoist_intake ADD COLUMN sd_refs jsonb NOT NULL DEFAULT \'[]\')',
        'database/migrations/YYYYMMDD_eva-support-decision-log-decision-kind-metadata.sql (ALTER TABLE eva_support_decision_log ADD COLUMN decision_kind text NOT NULL CHECK + metadata jsonb NOT NULL DEFAULT \'{}\')',
        'Migration applied via database-agent; TS-M1 and TS-M2 pass.',
      ],
      blocks_next: true,
      estimated_effort_hours: 1,
      exit_criteria: [
        'SELECT pg_typeof(sd_refs) FROM eva_todoist_intake LIMIT 1 → jsonb',
        'eva_support_decision_log has decision_kind and metadata columns (information_schema query)',
        'All 304 eva_todoist_intake rows have sd_refs = [] (DEFAULT applied)',
      ],
    },
    {
      checkpoint: 'CP-1',
      phase: 'Phase 1: Shared active-SD predicate + resolve-feedback retrofit',
      stories: stories?.filter(s => s.title?.toLowerCase().includes('predicate') || s.story_key?.endsWith(':US-001'))?.map(s => s.story_key) || ['US-001'],
      deliverables: [
        'lib/sd/active-sd-predicate.js (exports getActiveSDFilter + isActiveSD, COALESCE handling for is_active)',
        'lib/governance/resolve-feedback.js diff (imports getActiveSDFilter, removes inline filter)',
        'tests/ci/active-sd-predicate-parity.test.js (parity test TS-9 + TS-12 NULL-is_active edge)',
      ],
      blocks_next: true,
      estimated_effort_hours: 2,
      exit_criteria: ['Parity test passes (identical row sets including is_active=NULL row)', 'Module size ≤60 LOC'],
    },
    {
      checkpoint: 'CP-2',
      phase: 'Phase 2: Read-only sd-reader + feature flag',
      stories: stories?.filter(s => s.title?.toLowerCase().includes('sd-reader') || s.story_key?.endsWith(':US-002'))?.map(s => s.story_key) || ['US-002'],
      deliverables: [
        'lib/eva-support/sd-reader.js (column allowlist, status filter via active-sd-predicate, EVA_SD_READER_ENABLED gating)',
        'TS-5 unit test (feature flag OFF returns [], writes reader_disabled row, zero .from(strategic_directives_v2))',
      ],
      blocks_next: true,
      estimated_effort_hours: 4,
      exit_criteria: ['Module size ≤120 LOC', 'TS-5 passes', 'Zero child_process imports'],
    },
    {
      checkpoint: 'CP-3',
      phase: 'Phase 3: sd-blocker-surface',
      stories: stories?.filter(s => s.title?.toLowerCase().includes('blocker') || s.story_key?.endsWith(':US-003'))?.map(s => s.story_key) || ['US-003'],
      deliverables: [
        'lib/eva-support/sd-blocker-surface.js (uses idx_sd_phase_handoffs_unresolved partial index via exact predicates)',
        'TS-2 unit test (2 blockers detected from 3 seeded SDs)',
      ],
      blocks_next: true,
      estimated_effort_hours: 3,
      exit_criteria: ['Module size ≤150 LOC', 'EXPLAIN ANALYZE confirms partial index hit', 'TS-2 passes'],
    },
    {
      checkpoint: 'CP-4',
      phase: 'Phase 4: Dispatcher middleware',
      stories: stories?.filter(s => s.title?.toLowerCase().includes('dispatcher') || s.story_key?.endsWith(':US-004'))?.map(s => s.story_key) || ['US-004'],
      deliverables: [
        'scripts/eva-support/_internal/dispatcher.js diff (single post-handler middleware hook)',
        '"Related SDs:" prefix injected only when matches/blockers exist',
        'Six sub-flow snapshot tests confirm regression-free',
      ],
      blocks_next: true,
      estimated_effort_hours: 2,
      exit_criteria: ['Diff modifies exactly one function in dispatcher.js', 'Six sub-flow files unchanged', 'Substring-redundancy audit documented in PR description'],
    },
    {
      checkpoint: 'CP-5',
      phase: 'Phase 5: Cross-ref + recommendation emitter (can ship as 2 sub-PRs)',
      stories: stories?.filter(s => s.title?.toLowerCase().includes('cross-ref') || s.title?.toLowerCase().includes('emitter') || s.story_key?.endsWith(':US-005') || s.story_key?.endsWith(':US-006'))?.map(s => s.story_key) || ['US-005', 'US-006'],
      deliverables: [
        'lib/eva-support/sd-cross-ref-store.js (jsonb append on sd_refs column with evidence_substring validation)',
        'lib/eva-support/sd-recommendation-emitter.js (emit-only, decision-log-before-render via try/finally, counterfactual semantics, override_reason ≥12 chars)',
        'TS-1, TS-3, TS-4, TS-10, TS-11 unit/integration tests',
      ],
      blocks_next: true,
      estimated_effort_hours: 9,
      exit_criteria: ['Emitter NEVER imports child_process (T1 will catch)', 'Decision-log written BEFORE render (TS-10)', 'Counterfactual surfaces existing sd_key when ≥80% match (TS-4)', 'Render crash leaves audit row (TS-11)'],
    },
    {
      checkpoint: 'CP-6',
      phase: 'Phase 6: Four invariant CI tests + ESLint + CODEOWNERS',
      stories: stories?.filter(s => s.title?.toLowerCase().includes('test') || s.title?.toLowerCase().includes('eslint') || s.title?.toLowerCase().includes('codeowners') || ['US-007','US-008','US-009','US-010'].some(k => s.story_key?.endsWith(':'+k)))?.map(s => s.story_key) || ['US-007', 'US-008', 'US-009', 'US-010'],
      deliverables: [
        'tests/ci/eva-support-no-process-spawn-imports.test.js (T1)',
        'tests/ci/eva-support-supabase-write-allowlist.test.js (T2)',
        'tests/ci/eva-support-eslint-restricted-imports-config.test.js (T3)',
        'tests/ci/eva-support-sd-reader-no-log-write-boundary.test.js (T7)',
        'eslint.config.js no-restricted-imports override for eva-support paths',
        'CODEOWNERS entry for scripts/eva-support/** + lib/eva-support/**',
        'Runbook section in .claude/commands/eva-support.md (1-line revert command)',
      ],
      blocks_next: false,
      estimated_effort_hours: 4,
      exit_criteria: ['All 4 tests pass (TS-6/7/8 + boundary)', 'ESLint config validates', 'CODEOWNERS gates PR reviews', 'Chairman runbook section exists with verbatim revert command'],
    },
  ],
  total_estimated_hours: 25,
  cumulative_check: 'Sum of phase efforts (1+2+4+3+2+9+4) = 25h matches PRD implementation_approach guidance.',
  authored_by: 'PLAN phase (session ea257a69-f0ec-40fb-8818-ce66e2767b28) post-BMAD gate fail; grounded in PRD implementation_approach + user_stories list.',
  authored_at: new Date().toISOString(),
};

// Update SD with checkpoint_plan
const { error } = await supabase
  .from('strategic_directives_v2')
  .update({ checkpoint_plan: checkpointPlan })
  .eq('id', SD_ID);

if (error) { console.error('UPDATE FAILED:', error.message); process.exit(1); }

const { data: verify } = await supabase
  .from('strategic_directives_v2')
  .select('checkpoint_plan')
  .eq('id', SD_ID).single();

console.log('=== CHECKPOINT PLAN SET ===');
console.log('schema_version:', verify.checkpoint_plan?.schema_version);
console.log('total_checkpoints:', verify.checkpoint_plan?.total_checkpoints);
console.log('total_estimated_hours:', verify.checkpoint_plan?.total_estimated_hours);
console.log('checkpoints with story refs:', verify.checkpoint_plan?.checkpoints?.filter(c => c.stories?.length > 0).length);
verify.checkpoint_plan?.checkpoints?.forEach(c => {
  console.log('  ' + c.checkpoint + ' ' + c.phase + ' | ' + c.stories?.length + ' story refs | ' + c.estimated_effort_hours + 'h');
});
