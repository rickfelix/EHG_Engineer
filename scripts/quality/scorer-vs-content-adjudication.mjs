import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Attempt live view-definition retrieval. Recorded either way — acceptance requires reporting a
// blocker rather than writing DDL from a file that is provably not the live object.
for (const fn of ['exec_sql', 'execute_sql', 'run_sql', 'get_view_definition', 'sql']) {
  const { error } = await sb.rpc(fn, { sql: "select 1" });
  if (!error) { console.log('RPC AVAILABLE: ' + fn + ' <-- retrieve pg_get_viewdef with this'); }
}
console.log('view-definition retrieval: NO RPC AVAILABLE (checked 5 candidates)\n');

// FR-1: sample BOTH arms. The failing lanes alone cannot adjudicate — both hypotheses predict low
// scores there. The discriminating evidence is the CONTRAST with lanes that are healthy under the
// SAME scorer and the SAME content_type.
const FAILING = ['infrastructure', 'feature', 'bugfix', 'orchestrator', 'database', 'documentation'];
const HEALTHY = ['refactor', 'security'];

const pull = async (sdTypes, label) => {
  const { data, error } = await sb.from('ai_quality_assessments')
    .select('sd_type, content_id, weighted_score, pass_threshold, scores, feedback, band, assessed_at')
    .eq('content_type', 'user_story').in('sd_type', sdTypes)
    .order('assessed_at', { ascending: false }).limit(120);
  if (error) { console.log(label + ' ERR: ' + error.message); return []; }
  return data;
};

const fail = await pull(FAILING, 'FAILING');
const heal = await pull(HEALTHY, 'HEALTHY');
console.log('sampled: failing-lane n=' + fail.length + ', healthy-lane n=' + heal.length);

const stat = (rows, label) => {
  if (!rows.length) { console.log(label + ': EMPTY'); return; }
  const ws = rows.map((r) => Number(r.weighted_score)).filter(Number.isFinite);
  const mean = ws.reduce((a, b) => a + b, 0) / ws.length;
  console.log('\n' + label + '  n=' + rows.length + '  mean=' + mean.toFixed(1)
    + '  min=' + Math.min(...ws) + '  max=' + Math.max(...ws));
  // The RUBRIC BREAKDOWN is the discriminator. If the scorer were miscalibrated for user stories we
  // would expect it to mark them down broadly and similarly; if the content is weak we expect the
  // failing lanes to lose points on specific dimensions the healthy lanes satisfy.
  const dims = {};
  for (const r of rows) {
    if (r.scores && typeof r.scores === 'object') {
      for (const [k, v] of Object.entries(r.scores)) {
        if (Number.isFinite(Number(v))) { (dims[k] = dims[k] || []).push(Number(v)); }
      }
    }
  }
  for (const [k, v] of Object.entries(dims)) {
    console.log('   ' + k.padEnd(28) + ' mean=' + (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) + ' (n=' + v.length + ')');
  }
  const bands = {};
  for (const r of rows) bands[r.band] = (bands[r.band] || 0) + 1;
  console.log('   bands: ' + JSON.stringify(bands));
};

stat(fail, 'FAILING LANES (' + FAILING.join(',') + ')');
stat(heal, 'HEALTHY LANES (' + HEALTHY.join(',') + ')');

console.log('\n=== SAMPLE FEEDBACK — failing lanes ===');
for (const r of fail.slice(0, 3)) {
  console.log('  [' + r.sd_type + ' ' + r.weighted_score + '/' + r.pass_threshold + '] '
    + String(typeof r.feedback === 'string' ? r.feedback : JSON.stringify(r.feedback)).slice(0, 260));
}
console.log('\n=== SAMPLE FEEDBACK — healthy lanes ===');
for (const r of heal.slice(0, 3)) {
  console.log('  [' + r.sd_type + ' ' + r.weighted_score + '/' + r.pass_threshold + '] '
    + String(typeof r.feedback === 'string' ? r.feedback : JSON.stringify(r.feedback)).slice(0, 260));
}
