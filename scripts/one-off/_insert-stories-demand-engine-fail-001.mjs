import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001';
const SD_ID = '4520716b-0603-46b5-bf7e-19fe4271fe3b';
const PRD_ID = `PRD-${SD_KEY}`;

function implContext({ summary, files, steps }) {
  return `## Implementation Guidance\n\n**Architecture Patterns:**\n- ${summary}\n- Files: ${files.join(', ')}\n- Reuse the existing lib/governance/stage-gate-predicate.js predicate; do not author a duplicate\n\n**Integration Points:**\n- Database: Supabase client, existing error-handling conventions in the target file\n\n**Implementation Steps:**\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
}

const stories = [
  {
    story_key: `${SD_KEY}:US-001`,
    title: 'Create and arm the STAGE_GATE_PREDICATE_ARMED feature flag',
    user_role: 'Platform Operator',
    user_want: 'the go-live predicate to actually enforce once armed, not silently fail safe to permissive',
    user_benefit: 'no real customer outreach can occur below go-live once this flag is enabled',
    story_points: 3,
    priority: 'critical',
    acceptance_criteria: [
      'leo_feature_flags has a STAGE_GATE_PREDICATE_ARMED row (created disabled)',
      'shouldEnforceBlock() live-probed against a real below-go-live venture returns false before enable, true after',
    ],
    implementation_context: implContext({
      summary: 'FR-1: flag creation via the governed leo_feature_flags insert path',
      files: ['lib/governance/stage-gate-predicate.js', 'lib/feature-flags/evaluator.js'],
      steps: [
        'Add a governed insert for the STAGE_GATE_PREDICATE_ARMED flag row (disabled)',
        'Do not flip is_enabled=true until FR-7\'s obligation is resolved/waived',
        'Live-probe shouldEnforceBlock() against AltifyAI before and after enabling',
      ],
    }),
  },
  {
    story_key: `${SD_KEY}:US-002`,
    title: "Correct the predicate to stage>=24 AND launch_mode='live', is_demo forced to mock",
    user_role: 'Platform Operator',
    user_want: 'is_demo and launch_mode ventures to be handled safely rather than exempted or ungated',
    user_benefit: '141/171 is_demo ventures and simulated ventures past stage 24 cannot be mistaken for real-cleared',
    story_points: 3,
    priority: 'critical',
    acceptance_criteria: [
      'is_demo=true is force-mocked at any stage/launch_mode',
      'launch_mode=simulated at stage>=24 is blocked',
      'launch_mode=live, is_demo=false, stage>=24 passes unchanged',
    ],
    implementation_context: implContext({
      summary: 'FR-2: predicate correction in checkStageGate/shouldEnforceBlock',
      files: ['lib/governance/stage-gate-predicate.js'],
      steps: [
        'Add launch_mode and is_demo as inputs to checkStageGate()',
        'is_demo=true always forces mock regardless of other inputs',
        'Unit tests for the 3 boundary cases (TS-2, TS-3, TS-1 happy path)',
      ],
    }),
  },
  {
    story_key: `${SD_KEY}:US-003`,
    title: 'Fix the return-contract gap so a mock publish is never counted as real',
    user_role: 'Platform Operator',
    user_want: 'a dry-run/mock publish result to be distinguishable from a real one by every caller',
    user_benefit: 'metrics, spend records, and content status never reflect a publish that never actually happened',
    story_points: 5,
    priority: 'critical',
    acceptance_criteria: [
      'content-pipeline.js does not increment totalPublished or call recordSpend on a mock result',
      "owned-audience-content-loop.js does not write status='posted' on a mock result",
    ],
    implementation_context: implContext({
      summary: 'FR-3: publisher/index.js real/mock/deny contract + both callers updated',
      files: ['lib/marketing/publisher/index.js', 'lib/marketing/content-pipeline.js', 'lib/marketing/owned-audience-content-loop.js'],
      steps: [
        'Add a mode field (real|mock|deny) to publisher.publish()\'s return value, forced by shouldEnforceBlock()',
        'Update content-pipeline.js:136 to branch on mode before incrementing totalPublished',
        "Update owned-audience-content-loop.js:173 to branch on mode before writing status='posted'",
        'Unit test TS-4 against both callers',
      ],
    }),
  },
  {
    story_key: `${SD_KEY}:US-004`,
    title: 'Add a mock/synthetic discriminator to the publish ledger before any mock send path exists',
    user_role: 'Platform Operator',
    user_want: 'mock-forced publishes to never count toward a channel\'s autonomy graduation streak',
    user_benefit: 'a channel cannot earn real, unsupervised publish authority purely from simulated activity',
    story_points: 5,
    priority: 'critical',
    acceptance_criteria: [
      'venture_channel_publish_ledger has a new discriminator column',
      'Every mock-forced publish sets it',
      'evaluateGraduation() excludes discriminated rows from its streak count',
    ],
    implementation_context: implContext({
      summary: 'FR-4: chairman-gated migration + evaluateGraduation() filter',
      files: ['database/chairman-gated/', 'lib/marketing/autonomy-gate.js'],
      steps: [
        'Add the discriminator column via a chairman-gated migration, following the schema-lint-disable-line convention',
        'Update evaluateGraduation() (autonomy-gate.js:474-495) to filter it out of the streak',
        'Land this in the SAME change as US-003/FR-3 so no mock-shaped row is ever undiscriminated',
      ],
    }),
  },
  {
    story_key: `${SD_KEY}:US-005`,
    title: 'Extend gating to email-campaigns.js sendEmail(), venture-consent.js, and the outbound-ledger DB trigger',
    user_role: 'Platform Operator',
    user_want: 'every direct send/consent path to be gated, not just the ones routed through processStep()',
    user_benefit: 'a caller cannot bypass the go-live gate by calling a lower-level function directly',
    story_points: 5,
    priority: 'high',
    acceptance_criteria: [
      'sendEmail() itself refuses for a below-go-live venture',
      'venture-consent.js resolveSendPermission() denies for a below-go-live venture',
      'A DB trigger on the outbound ledger rejects inserts for a below-go-live venture',
    ],
    implementation_context: implContext({
      summary: 'FR-5: 3 new mirror sites (processStep() and the canonical predicate module are already wired)',
      files: ['lib/marketing/ai/email-campaigns.js', 'lib/marketing/venture-consent.js', 'database/chairman-gated/'],
      steps: [
        'Add a shouldEnforceBlock() check inside sendEmail() itself (line 60)',
        'Add the same check inside resolveSendPermission() (venture-consent.js:76)',
        'Add a DB trigger migration on the outbound ledger table as a last-line defense',
        'Integration test TS-6 for the direct sendEmail() bypass case',
      ],
    }),
  },
  {
    story_key: `${SD_KEY}:US-006`,
    title: 'CI negative-test suite asserting shouldEnforceBlock() as the sole discriminator',
    user_role: 'Platform Operator',
    user_want: 'CI to fail if a below-go-live venture can ever reach a real send',
    user_benefit: 'a future regression is caught before merge, not discovered in production',
    story_points: 3,
    priority: 'high',
    acceptance_criteria: [
      'CI includes a negative test asserting shouldEnforceBlock()===true, never checkStageGate().blocked',
      'The matrix includes AltifyAI (S23) and ApexNiche AI (S21)',
    ],
    implementation_context: implContext({
      summary: 'FR-6: CI job wiring, not new production logic',
      files: ['CI workflow config', 'test suite for lib/governance/stage-gate-predicate.js'],
      steps: [
        'Write the negative test spying on the adapter boundary',
        'Wire it into the existing CI test job',
        'Confirm it fails against the pre-fix code (red) and passes post-fix (green)',
      ],
    }),
  },
  {
    story_key: `${SD_KEY}:US-007`,
    title: 'Resolve/waive the STAGE-GATE-PREDICATE-001 obligation and file the Part B follow-on SD',
    user_role: 'Coordinator / Chairman',
    user_want: 'the predecessor SD\'s atomic arming obligation to be explicitly addressed, and the deferred Part B work to be tracked',
    user_benefit: 'arming this gate does not silently violate an earlier safety commitment, and Part B is not lost',
    story_points: 2,
    priority: 'high',
    acceptance_criteria: [
      'A documented coordinator/chairman confirmation or waiver exists before FR-1\'s enable step',
      'A follow-on SD exists in strategic_directives_v2 for Part B, citing this SD as a prerequisite',
    ],
    implementation_context: implContext({
      summary: 'FR-7: governance step, not code — coordinate via /signal, then leo-create-sd.js for the follow-on',
      files: ['strategic_directives_v2 (follow-on SD row)'],
      steps: [
        'Signal the coordinator/chairman with the STAGE-GATE-PREDICATE-001 obligation before flipping the flag',
        'File the Part B follow-on SD once this SD is far enough along to describe its ledger discriminator as a dependency',
        "Update SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-E's release condition to reference the follow-on SD",
      ],
    }),
  },
];

const rows = stories.map((s) => ({
  story_key: s.story_key,
  prd_id: PRD_ID,
  sd_id: SD_ID,
  title: s.title,
  user_role: s.user_role,
  user_want: s.user_want,
  user_benefit: s.user_benefit,
  story_points: s.story_points,
  priority: s.priority,
  status: 'draft',
  acceptance_criteria: s.acceptance_criteria,
  implementation_context: s.implementation_context,
  created_by: 'Alpha-2 (PLAN phase, worker)',
}));

for (const row of rows) {
  const { data: existing } = await supabase.from('user_stories').select('id').eq('story_key', row.story_key).maybeSingle();
  const result = existing
    ? await supabase.from('user_stories').update(row).eq('story_key', row.story_key).select('story_key')
    : await supabase.from('user_stories').insert(row).select('story_key');
  if (result.error) {
    console.error(`STORY WRITE ERROR (${row.story_key}):`, result.error.message);
    process.exit(1);
  }
  console.log('Story written:', result.data[0]?.story_key);
}
