import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// MY FR-1 SAMPLE WAS RECENCY-BIASED and I am not going to launder that. It took the latest 120 rows
// and their failing-lane mean was 65.6, while the 4-week view reports ~41 for the same lanes. Either
// the sample is unrepresentative, or user-story quality is moving fast. Both matter, and they are
// distinguishable — so measure the whole window by week instead of arguing about it.
const FAILING = ['infrastructure', 'feature', 'bugfix', 'orchestrator', 'database', 'documentation'];
const HEALTHY = ['refactor', 'security'];

const all = [];
const PAGE = 1000;
for (let from = 0; ; from += PAGE) {
  const { data, error } = await sb.from('ai_quality_assessments')
    .select('sd_type, weighted_score, pass_threshold, assessed_at')
    .eq('content_type', 'user_story')
    .gte('assessed_at', new Date(Date.now() - 28 * 864e5).toISOString())
    .order('assessed_at', { ascending: true }).range(from, from + PAGE - 1);
  if (error) { console.log('ERR ' + error.message); break; }
  all.push(...(data || []));
  if (!data || data.length < PAGE) break;
}
// Reconcile against the count so a silent cap cannot masquerade as the population.
const { count } = await sb.from('ai_quality_assessments')
  .select('*', { count: 'exact', head: true })
  .eq('content_type', 'user_story')
  .gte('assessed_at', new Date(Date.now() - 28 * 864e5).toISOString());
console.log('fetched=' + all.length + ' count=' + count + (all.length === count ? ' RECONCILED' : ' <-- MISMATCH, do not trust'));

const bucket = (rows) => {
  const wk = {};
  for (const r of rows) {
    const d = Math.floor((Date.now() - Date.parse(r.assessed_at)) / 864e5 / 7);
    (wk[d] = wk[d] || []).push(Number(r.weighted_score));
  }
  return wk;
};
const show = (label, rows) => {
  const wk = bucket(rows);
  console.log('\n' + label + ' (n=' + rows.length + ')');
  for (const k of Object.keys(wk).sort((a, b) => a - b)) {
    const v = wk[k];
    const pass = rows.filter((r) => Math.floor((Date.now() - Date.parse(r.assessed_at)) / 864e5 / 7) === Number(k)
      && Number(r.weighted_score) >= Number(r.pass_threshold)).length;
    console.log('  ' + (k === '0' ? 'this week ' : k + ' wk ago  ') + ' n=' + String(v.length).padEnd(5)
      + ' mean=' + (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1).padEnd(6)
      + ' pass=' + (100 * pass / v.length).toFixed(1) + '%');
  }
};
show('FAILING LANES', all.filter((r) => FAILING.includes(r.sd_type)));
show('HEALTHY LANES', all.filter((r) => HEALTHY.includes(r.sd_type)));
