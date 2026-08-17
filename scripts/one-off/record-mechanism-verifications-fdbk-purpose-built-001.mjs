import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sdKey = 'SD-FDBK-FIX-FEEDBACKWIDGET-PURPOSE-BUILT-001';

const { data: current, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', sdKey)
  .single();
if (readErr) { console.error(readErr); process.exit(1); }

const metadata = {
  ...current.metadata,
  mechanism_verifications: [
    {
      verified_by: 'Claude (Golf-7, session 698520e6)',
      verified_at: 'ehg/src/components/quality/FeedbackWidget.tsx:77',
      claim: 'FeedbackWidget.tsx uses a direct supabase.from("feedback").insert() call (not an RPC), which this SD replaces with fn_submit_internal_feedback',
    },
    {
      verified_by: 'Claude (Golf-7, session 698520e6)',
      verified_at: 'database/migrations/20260802_bound_anon_feedback_ingress.sql:90',
      claim: 'anon_feedback_ingress_bounds WITH CHECK excludes severity critical/high via (severity IS NULL OR severity NOT IN (\'critical\',\'high\')) -- the original (now-superseded) framing of the defect this SD\'s FR-4 mechanism does not rely on or touch',
    },
  ],
};

const { error } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata })
  .eq('sd_key', sdKey);

if (error) { console.error(error); process.exit(1); }
console.log('mechanism_verifications recorded for', sdKey);
