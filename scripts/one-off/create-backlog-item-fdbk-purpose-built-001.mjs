import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sdKey = 'SD-FDBK-FIX-FEEDBACKWIDGET-PURPOSE-BUILT-001';
const sdUuid = '399a955f-7da7-42e4-8b55-0baff4e47039';

const { data, error } = await supabase
  .from('sd_backlog_map')
  .insert({
    sd_id: sdUuid,
    backlog_id: `BL-${sdKey}-001`,
    backlog_title: 'FeedbackWidget submissions silently rejected at every severity',
    item_description:
      'public.feedback has zero permissive INSERT policy reachable by anon or authenticated. ' +
      'ehg/src/components/quality/FeedbackWidget.tsx submissions from signed-in users are ' +
      'unconditionally rejected today, at every severity, masking exactly the most urgent ' +
      '(critical/high) feedback. Implement fn_submit_internal_feedback (SECURITY DEFINER RPC, ' +
      'auth.uid()-bound identity) + check_internal_feedback_rate_limit (user_id-scoped) per FR-1/FR-2.',
    priority: 'high',
    item_type: 'story',
    completion_status: 'NOT_STARTED',
  })
  .select('sd_id, backlog_id');

if (error) {
  console.error('INSERT_ERR:', error);
  process.exit(1);
}
console.log('BACKLOG_ITEM_CREATED:', JSON.stringify(data, null, 2));
