import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sdKey = 'SD-FDBK-FIX-FEEDBACKWIDGET-PURPOSE-BUILT-001';
const sdUuid = '399a955f-7da7-42e4-8b55-0baff4e47039';
const prdId = 'PRD-SD-FDBK-FIX-FEEDBACKWIDGET-PURPOSE-BUILT-001';

const stories = [
  {
    story_key: `${sdKey}:US-001`,
    prd_id: prdId,
    sd_id: sdUuid,
    title: 'Submit critical/high-severity feedback that actually lands',
    user_role: 'signed-in EHG user',
    user_want: 'to submit feedback through the FeedbackWidget FAB at any severity, including Critical and High',
    user_benefit: 'my most urgent reports (system down, data loss) are not silently dropped',
    story_points: 5,
    priority: 'high',
    status: 'in_progress',
    acceptance_criteria: [
      'Selecting Critical or High severity and submitting succeeds (no error toast)',
      'The row lands in public.feedback with the exact severity selected, verified via a service_role query',
      'The row is attributed to the submitting user via auth.uid(), never a client-supplied identity',
    ],
    given_when_then: [
      { given: 'I am signed in and open the FeedbackWidget FAB', when: 'I select severity=Critical, fill title/description, and submit', then: 'the submission succeeds and the row is visible to a service_role query with severity=critical' },
    ],
    implementation_context: JSON.stringify({
      affected_files: [
        'database/chairman-gated/20260817_fdbk_internal_feedback_rpc.sql',
        'ehg/src/components/quality/FeedbackWidget.tsx',
        'ehg/src/integrations/feedback/feedbackDataAccess.ts',
      ],
      test_approach: 'ROLLBACK-guarded live dry-run proof (dry_run.mjs) + vitest unit tests for the DAL wrapper',
    }),
  },
  {
    story_key: `${sdKey}:US-002`,
    prd_id: prdId,
    sd_id: sdUuid,
    title: 'Per-user rate limit bounds abuse without penalizing other users',
    user_role: 'system operator',
    user_want: 'a single account to be rate-limited if it submits too many internal-feedback items in an hour',
    user_benefit: 'the channel cannot be flooded by one compromised or misbehaving account, while every other user is unaffected',
    story_points: 3,
    priority: 'high',
    status: 'in_progress',
    acceptance_criteria: [
      'A user submitting 20 items within an hour has their 21st submission rejected with a rate-limit error',
      'A different user, under their own threshold, submits successfully in the same window',
      'A global 200/hour ceiling exists as a second backstop, independent of any single user',
    ],
    given_when_then: [
      { given: 'user A has 20 manual_feedback rows in the last hour', when: 'user A submits again', then: 'the RPC raises ERRCODE 53400 and no row is inserted' },
      { given: 'user A is rate-limited', when: 'user B (under their own limit) submits', then: 'user B\'s submission succeeds' },
    ],
    implementation_context: JSON.stringify({
      affected_files: ['database/chairman-gated/20260817_fdbk_internal_feedback_rpc.sql'],
      test_approach: 'Live fixture seeding + ROLLBACK-guarded assertions (dry_run.mjs TS-6/TS-7/TS-8)',
    }),
  },
  {
    story_key: `${sdKey}:US-003`,
    prd_id: prdId,
    sd_id: sdUuid,
    title: 'Widget routes through the shared feedback DAL, not a raw DB call',
    user_role: 'engineer maintaining the FeedbackWidget/feedbackDataAccess.ts boundary',
    user_want: 'FeedbackWidget.tsx to call a typed feedbackDataAccess.ts function instead of touching supabase directly',
    user_benefit: 'the "no inline supabase.from/rpc calls in widget components" architectural rule holds for every feedback-submission path, not just the venture-scoped one',
    story_points: 2,
    priority: 'medium',
    status: 'in_progress',
    acceptance_criteria: [
      'FeedbackWidget.tsx imports only submitInternalFeedback from feedbackDataAccess.ts, no direct supabase import',
      'submitInternalFeedback maps 53400 to InternalFeedbackRateLimitExceededError, distinct from the venture-scoped RateLimitExceededError',
      'Unit tests cover the success path, all 3 error-code mappings, and the empty-title guard',
    ],
    given_when_then: [
      { given: 'the RPC returns a 53400 error', when: 'submitInternalFeedback is called', then: 'it throws InternalFeedbackRateLimitExceededError, not the venture-scoped RateLimitExceededError' },
    ],
    implementation_context: JSON.stringify({
      affected_files: [
        'ehg/src/integrations/feedback/feedbackDataAccess.ts',
        'ehg/src/integrations/feedback/types.ts',
        'ehg/tests/unit/integrations/feedbackDataAccess.test.ts',
      ],
      test_approach: 'vitest, mocked supabase.rpc',
    }),
  },
];

const { data, error } = await supabase.from('user_stories').insert(stories).select('story_key');
if (error) { console.error('INSERT_ERR:', error); process.exit(1); }
console.log('USER_STORIES_INSERTED:', JSON.stringify(data, null, 2));
