#!/usr/bin/env node
/**
 * Write Chairman-facing user stories for SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001
 * covering FR-4 (opt-in auto-advance for review-mode stages) and FR-5 (UI
 * consistency: review-mode indicator, toggle semantics, spinner accuracy).
 *
 * Uses the canonical user_stories INSERT shape (per memory:
 * reference_user_stories_insert_shape.md): status='ready', story_key prefix =
 * full sd_key, priority in canonical enum, implementation_context len>10.
 *
 * Run: node scripts/one-off/write-stories-sd-venture-gate-unification.mjs
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { lookupSdIdForFk, validateSdKeyForStoryKey } from '../modules/auto-trigger-stories.mjs';

dotenv.config();

const SD_KEY_OR_UUID = 'SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001';
const PRD_ID = 'f4a1ae52-4b9f-4d24-ac11-ec79a1762f62';

const STORIES = [
  {
    n: 1,
    title: 'Opt review-mode Stage 8 into auto-advance',
    user_role: 'Chairman',
    user_want: 'to toggle "auto-advance" ON for Stage 8 Business Model Canvas from the Stage Settings sheet and have the worker actually skip the pause',
    user_benefit: 'ventures I trust the canvas template for progress through the engine phase without daily manual approval',
    acceptance_criteria: [
      'Given a venture currently paused at Stage 8 review, when I open Stage Settings and toggle "Stage 8" auto-advance ON, then chairman_dashboard_config.stage_overrides[8].auto_proceed is written as true with set_by and set_at',
      'Given stage_overrides[8].auto_proceed === true, when the worker re-evaluates _canAutoAdvance(8) for any venture, then it returns true and the venture transitions out of Stage 8 without a Chairman approval',
      'Given I toggle Stage 8 auto-advance OFF, when the worker re-evaluates _canAutoAdvance(8), then it returns false (pause) regardless of master "Auto-approve gates" state'
    ],
    impl_context: {
      affected_files: [
        'src/hooks/useStageGovernance.ts (toggleStageOverride)',
        'lib/eva/stage-execution-worker.js (_canAutoAdvance)',
        'lib/eva/stage-governance.js (getStageGovernance)'
      ],
      fr_ref: 'FR-4 stage_overrides opt-in-to-auto semantics',
      test_approach: 'Integration: toggle via hook, assert DB write shape, then run worker decision matrix against the override'
    }
  },
  {
    n: 2,
    title: 'Review-mode stages display "Default: pause" indicator',
    user_role: 'Chairman',
    user_want: 'the Stage Settings sheet to clearly mark stages S7, S8, S9, and S11 as defaulting to pause for review',
    user_benefit: 'I know which toggles change behavior away from the safe default versus which ones just confirm the default',
    acceptance_criteria: [
      'Given I open the Stage Settings sheet for any venture, when rows for stages 7, 8, 9, and 11 render, then each shows a "Default: pause for review" indicator next to the auto-advance toggle',
      'Given stages S1-S6, S10, S12-S26 (non-review-mode), when they render in the sheet, then no "Default: pause" indicator appears (only the auto-advance toggle and existing controls)',
      'Given a review-mode stage where stage_overrides[n].auto_proceed is undefined, when the toggle state is computed, then it reads as OFF (matching the pause default) without writing any row'
    ],
    impl_context: {
      affected_files: [
        'src/components/ventures/StageSettingsSheet.tsx',
        'src/hooks/useStageGovernance.ts (review-mode read path)'
      ],
      fr_ref: 'FR-5 UI consistency, item (1)',
      review_stages: [7, 8, 9, 11],
      test_approach: 'Component test: render sheet against fixture with all 26 stages, assert indicator visibility for review subset only'
    }
  },
  {
    n: 3,
    title: 'Auto-advancing spinner only shows on real worker approval',
    user_role: 'Chairman',
    user_want: 'the "Auto-advancing..." spinner on the venture detail page to only appear when the worker has actually approved the gate and produced the required artifact',
    user_benefit: 'I am not misled into thinking a venture is progressing when it is actually still waiting for my review',
    acceptance_criteria: [
      'Given a venture at any stage where gateApproved === false, when the venture detail page renders the stage status, then it shows "Awaiting Chairman decision" (not "Auto-advancing...")',
      'Given gateApproved === true AND hasRequiredArtifact === true, when the page renders, then it shows the "Auto-advancing..." spinner',
      'Given gateApproved === true AND hasRequiredArtifact === false, when the page renders, then it does NOT show the auto-advancing spinner (regression guard against S8 NameSignal false-positive)'
    ],
    impl_context: {
      affected_files: [
        'src/hooks/useStageAutoAdvance.ts (line ~98 spinner predicate)',
        'src/components/ventures/StageStatusBadge.tsx (consumer)'
      ],
      fr_ref: 'FR-5 UI consistency, item (3)',
      regression_guard: 'NameSignal S8 false-positive — spinner currently triggers on gateApproved alone',
      test_approach: 'Hook unit test: 3-way truth table of (gateApproved, hasRequiredArtifact) -> expected display string'
    }
  },
  {
    n: 4,
    title: 'Master Auto-approve gates tooltip is truthful about Stage 16',
    user_role: 'Chairman',
    user_want: 'the master "Auto-approve gates" tooltip at the top of Stage Settings to truthfully describe the Stage 16 carve-out',
    user_benefit: 'I trust the UI copy as a faithful description of what the worker will actually do',
    acceptance_criteria: [
      'Given I hover the master "Auto-approve gates" tooltip in StageSettingsSheet, when the tooltip body renders, then its wording about Stage 16 matches actual worker enforcement (Stage 16 is a promotion gate enforced by _canAutoAdvance after FR-3)',
      'Given the master toggle is ON and stage_overrides has no entry for Stage 16, when the worker evaluates _canAutoAdvance(16), then it returns false (promotion gate blocks regardless of master state)',
      'Given the tooltip references any other "always requires approval" stage, when QA reviews against PRD FR-1 gate_type table, then the claim is verified or removed'
    ],
    impl_context: {
      affected_files: [
        'src/components/ventures/StageSettingsSheet.tsx (tooltip copy)',
        'lib/eva/stage-execution-worker.js (_canAutoAdvance for S16)'
      ],
      fr_ref: 'FR-5 UI consistency, item (1) tooltip clause + FR-3 worker callsite migration',
      test_approach: 'Snapshot test on tooltip text + worker decision matrix row for stage=16, master=on, override=none'
    }
  },
  {
    n: 5,
    title: 'Toggle a review-mode stage back to default-pause without leaving stale opt-in',
    user_role: 'Chairman',
    user_want: 'when I turn auto-advance OFF for a review-mode stage I previously opted in, the worker to go back to the pause default and not leave a stale auto_proceed:true in stage_overrides',
    user_benefit: 'I can change my mind on automation per stage without trusting hidden DB rows to be correct',
    acceptance_criteria: [
      'Given stage_overrides[8].auto_proceed === true (from a prior opt-in), when I toggle Stage 8 auto-advance OFF in the sheet, then the row is either deleted or rewritten as auto_proceed:false (no stale auto_proceed:true remains)',
      'Given stage_overrides[8] is absent or auto_proceed:false, when the worker evaluates _canAutoAdvance(8), then it returns false (review-mode default-pause)',
      'Given I toggle the same review-mode stage ON then OFF then ON again, when the worker re-evaluates, then the final state is auto-advance (no flip-flop or cache staleness beyond 5s realtime invalidation window per FR-2)'
    ],
    impl_context: {
      affected_files: [
        'src/hooks/useStageGovernance.ts (toggleStageOverride OFF branch for review-mode)',
        'lib/eva/stage-governance.js (cache invalidation on stage_config UPDATE — not stage_overrides, but same realtime hygiene applies)'
      ],
      fr_ref: 'FR-4 opt-in semantics (off-path) + FR-2 cache invalidation hygiene',
      test_approach: 'Integration: opt-in, opt-out, opt-in cycle; assert final DB row shape and worker decision after each toggle'
    }
  }
];

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Resolve SD via canonical resolver
const { id: resolvedSdId, sd_key: sdKey } = await lookupSdIdForFk(sb, SD_KEY_OR_UUID);
validateSdKeyForStoryKey(sdKey);
console.log(`Resolved sd_key=${sdKey} resolvedSdId=${resolvedSdId}`);

// Pre-flight: confirm no existing stories for this SD
const { data: existing, error: existErr } = await sb
  .from('user_stories')
  .select('story_key')
  .eq('sd_id', resolvedSdId);
if (existErr) throw new Error(`Pre-flight count failed: ${existErr.message}`);
if (existing && existing.length > 0) {
  console.error(`Stories already exist for ${sdKey}: ${existing.map((r) => r.story_key).join(', ')}`);
  process.exit(1);
}

const now = new Date().toISOString();
const rows = STORIES.map((s) => {
  const storyKey = `${sdKey}:US-${String(s.n).padStart(3, '0')}`;
  return {
    id: randomUUID(),
    sd_id: resolvedSdId,
    prd_id: PRD_ID,
    story_key: storyKey,
    title: s.title,
    user_role: s.user_role,
    user_want: s.user_want,
    user_benefit: s.user_benefit,
    story_points: 3,
    priority: 'high',
    status: 'ready',
    acceptance_criteria: s.acceptance_criteria,
    implementation_context: JSON.stringify(s.impl_context),
    given_when_then: [],
    testing_scenarios: [],
    architecture_references: [],
    created_at: now,
    updated_at: now,
    created_by: 'PLAN-STORIES-AGENT'
  };
});

console.log(`Inserting ${rows.length} stories...`);
let created = 0;
const createdKeys = [];
for (const row of rows) {
  const { error } = await sb.from('user_stories').insert(row);
  if (error) {
    console.error(`FAIL ${row.story_key}: ${error.message}`);
    process.exit(2);
  }
  console.log(`OK ${row.story_key} — ${row.title}`);
  createdKeys.push(row.story_key);
  created++;
}

console.log(`\nCreated ${created}/${rows.length} stories.`);
console.log('Story keys:', createdKeys.join(', '));

// Log sub-agent execution evidence (PLAN phase)
const evidenceId = randomUUID();
const { error: subAgentErr } = await sb.from('sub_agent_execution_results').insert({
  id: evidenceId,
  sd_id: sdKey,
  sub_agent_code: 'STORIES',
  phase: 'PLAN',
  status: 'completed',
  results: {
    sd_uuid: resolvedSdId,
    prd_id: PRD_ID,
    stories_created: created,
    story_keys: createdKeys,
    fr_coverage: ['FR-4', 'FR-5'],
    persona: 'Chairman'
  },
  created_at: now,
  updated_at: now
});
if (subAgentErr) {
  console.error(`Sub-agent evidence write failed: ${subAgentErr.message}`);
  process.exit(3);
}
console.log(`Sub-agent evidence row written: ${evidenceId}`);
