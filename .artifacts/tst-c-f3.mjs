import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; dotenv.config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const pat = '%chairman_all_decision_signals%';
for (const [t, cols] of [['strategic_directives_v2','id,title,status'],['quick_fixes','id,title,status'],['feedback','id,title,status,category']]) {
  const { data, error } = await s.from(t).select(cols).or(`title.ilike.${pat},description.ilike.${pat}`).limit(10);
  console.log(`--- ${t} matching chairman_all_decision_signals:`, error ? 'ERR '+error.message : JSON.stringify(data));
}
// broader: any tracked item mentioning snoozed + chairman view
const { data: d2 } = await s.from('quick_fixes').select('id,title,status').ilike('title','%snooze%').limit(10);
console.log('--- quick_fixes title ilike %snooze%:', JSON.stringify(d2));
const { data: d3 } = await s.from('feedback').select('id,title,category,status').ilike('title','%snooze%').limit(10);
console.log('--- feedback title ilike %snooze%:', JSON.stringify(d3));
// re-measure F3 population against the LIVE view arm
const { count: c } = await s.from('feedback').select('id',{count:'exact',head:true})
  .in('severity',['critical','high']).is('resolved_at',null).not('status','in','(resolved,wont_fix,in_progress,duplicate,invalid)');
console.log('--- F3 live population (critical/high, unresolved, not-excluded-by-view):', c);
