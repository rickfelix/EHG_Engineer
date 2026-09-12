#!/usr/bin/env node
/**
 * One-off: insert user stories for SD-LEO-FIX-COORDINATOR-SELF-SCORE-001 (bugfix, stories required).
 * Work is already implemented/tested/pushed (PR #8739) before PLAN phase paperwork, per the
 * QF-to-SD escalation workflow -- stories are marked completed, mirroring the shipped FRs.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-COORDINATOR-SELF-SCORE-001';
const PRD_ID = `PRD-${SD_KEY}`;

async function main() {
  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr || !sd) {
    console.error('SD_FETCH_FAILED', sdErr);
    process.exit(1);
  }

  const stories = [
    {
      story_key: `${SD_KEY}:US-001`,
      sd_id: sd.id,
      prd_id: PRD_ID,
      title: "Add a --force bypass to the coordinator's self-score writer",
      user_role: 'the coordinator self-review cron',
      user_want: 'a way to override COORD_SELF_SCORE_V1 without needing a persistent env var',
      user_benefit: 'so the writer can actually be told to fire, mirroring how Adam/Solomon\'s parallel writers already work',
      acceptance_criteria: [
        "node scripts/coordinator-self-review.mjs --force reaches the self-score write branch even when COORD_SELF_SCORE_V1 is unset",
        'Without --force, behavior is unchanged (still ships inert)',
      ],
      test_scenarios: [
        { id: 'TS-1', scenario: '--force bypasses COORD_SELF_SCORE_V1' },
      ],
      implementation_context: 'scripts/coordinator-self-review.mjs: FORCE_SELF_SCORE const + the self-score if-gate',
      priority: 'high',
      status: 'completed',
      implementation_status: 'complete',
      validation_status: 'validated',
    },
    {
      story_key: `${SD_KEY}:US-002`,
      sd_id: sd.id,
      prd_id: PRD_ID,
      title: "Wire --force into the coordinator's self-review cron manifest",
      user_role: 'the coordinator role re-arming its standard loops',
      user_want: 'the self-review cron prompt to already invoke --force',
      user_benefit: 'so re-arming the cron is sufficient to activate the writer, with no separate manual step to remember',
      acceptance_criteria: [
        "coordinator-startup-check.mjs's self-review cron prompt string contains '--force'",
      ],
      test_scenarios: [
        { id: 'TS-2', scenario: 'cron manifest prompt includes --force' },
      ],
      implementation_context: "scripts/coordinator-startup-check.mjs: 'self-review' cron entry's prompt field",
      priority: 'high',
      status: 'completed',
      implementation_status: 'complete',
      validation_status: 'validated',
    },
    {
      story_key: `${SD_KEY}:US-003`,
      sd_id: sd.id,
      prd_id: PRD_ID,
      title: 'Enable the 2 self-score-age gauges with verified-live writers',
      user_role: 'an operator reading the gauge dashboard',
      user_want: "adam_self_score_age and solomon_self_score_age to actually be live, since their writers demonstrably work",
      user_benefit: 'so staleness in Adam/Solomon\'s own self-review cadence is actually caught, instead of a gauge that ships enabled:false indefinitely',
      acceptance_criteria: [
        "GAUGE_REGISTRY.find(e => e.id==='adam_self_score_age').enabled === true",
        "GAUGE_REGISTRY.find(e => e.id==='solomon_self_score_age').enabled === true",
      ],
      test_scenarios: [
        { id: 'TS-3', scenario: 'gauge-registry.test.js reflects the 2 flipped flags (27->29 enabled entries)' },
      ],
      implementation_context: 'lib/governance/gauge-registry.js: adam_self_score_age and solomon_self_score_age entries',
      priority: 'medium',
      status: 'completed',
      implementation_status: 'complete',
      validation_status: 'validated',
    },
    {
      story_key: `${SD_KEY}:US-004`,
      sd_id: sd.id,
      prd_id: PRD_ID,
      title: "Never enable coordinator_self_score_age ahead of a demonstrated live writer",
      user_role: 'a future engineer touching this registry',
      user_want: "a durable check that fails loud if an enabled self-score-age gauge's writer has gone silent",
      user_benefit: 'so this exact failure class (an enabled gauge with a dead writer, tripping permanently) cannot recur silently',
      acceptance_criteria: [
        'scripts/lint/self-score-gauge-writer-lint.mjs exits 0 at the shipped state (adam/solomon fresh, coordinator disabled)',
        'The same lint exits 1 if coordinator_self_score_age is hypothetically flipped enabled:true while its writer still has 0 rows (verified during implementation, then reverted)',
      ],
      test_scenarios: [
        { id: 'TS-4', scenario: 'lint fails on a silent enabled writer, passes at the shipped state' },
      ],
      implementation_context: 'scripts/lint/self-score-gauge-writer-lint.mjs (new); lib/governance/gauge-registry.js coordinator_self_score_age entry stays enabled:false with an explanatory comment',
      priority: 'high',
      status: 'completed',
      implementation_status: 'complete',
      validation_status: 'validated',
    },
    {
      story_key: `${SD_KEY}:US-005`,
      sd_id: sd.id,
      prd_id: PRD_ID,
      title: 'Keep the insertCoordinationRow census accurate after the --force wiring',
      user_role: 'the caller-census audit (SD-LEO-INFRA-INSERTCOORDINATIONROW-NOT-SIGNAL-001)',
      user_want: 'its pinned line numbers to stay accurate after this change adds lines above two call sites',
      user_benefit: 'so the census test keeps genuinely verifying the call sites it claims to cover, instead of drifting silently out of sync',
      acceptance_criteria: [
        'tests/unit/coordinator/insert-coordination-row-callers-census.test.js passes',
      ],
      test_scenarios: [
        { id: 'TS-5', scenario: 'census entries for coordinator-self-review.mjs point at the correct, shifted line numbers' },
      ],
      implementation_context: 'lib/coordinator/insert-coordination-row-callers.cjs: coordinator-self-review.mjs entries (314, 328)',
      priority: 'medium',
      status: 'completed',
      implementation_status: 'complete',
      validation_status: 'validated',
    },
  ];

  const { error: insErr } = await supabase.from('user_stories').insert(stories);
  if (insErr) {
    console.error('STORIES_INSERT_FAILED', insErr);
    process.exit(1);
  }
  console.log(`Inserted ${stories.length} user stories for ${SD_KEY}`);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
}
