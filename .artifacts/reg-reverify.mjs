import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ID = '47629374-e1a6-4262-b0ba-80117185bb92';
const { data: row } = await sb.from('sub_agent_execution_results').select('metadata').eq('id', ID).single();
const metadata = {
  ...row.metadata,
  head_commit: '11082aa99d8',
  validated_at_commit: 'b41994adeda',
  reverification: {
    trigger: 'team-lead committed the F1 documentation response after the verdict was written',
    range: 'b41994adeda..11082aa99d8 (commits 0c3493959fb, 11082aa99d8)',
    cumulative_diff: '1 file, 19 insertions, 3 deletions, all in lib/eva/chairman-product-review.js',
    non_comment_changes: 0,
    finding: 'COMMENT-ONLY across the entire range. Executable code is byte-identical to the validated commit, so the CONDITIONAL_PASS verdict and every test/API/flag/migration measurement below carry forward to HEAD unamended.',
    f1_disposition: 'Documented rather than gated, accepted. The added comment names the exact load-bearing invariant this verdict rests on (all four readers fail closed, never throw) and instructs a future rewriter to add a try/catch, which is what condition 1 asked for.'
  }
};
const { data, error } = await sb.from('sub_agent_execution_results')
  .update({ metadata })
  .eq('id', ID).select('id,verdict,confidence,phase').single();
console.log('REVERIFIED:', JSON.stringify(data), 'err:', error?.message);
