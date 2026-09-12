import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: ev, error: evErr } = await s.from('sub_agent_execution_results')
  .select('id,verdict,confidence,summary,metadata,created_at,phase,sub_agent_code')
  .eq('id', '2de37d89-7fb2-4ab3-a37e-8d7b8c531376').maybeSingle();
if (evErr) console.log('EV ERROR:', evErr.message);
else if (!ev) console.log('EV: row not found');
else {
  console.log('=== PLAN TESTING EVIDENCE', ev.verdict, 'conf', ev.confidence, ev.phase, ev.created_at, '===');
  const f = ev.metadata?.findings || ev.metadata?.blocking_findings || null;
  console.log('metadata keys:', Object.keys(ev.metadata || {}).join(', '));
  if (Array.isArray(f)) f.forEach((x,i)=>console.log(`\n[F${i+1}]`, typeof x === 'string' ? x.slice(0,700) : JSON.stringify(x).slice(0,700)));
  else console.log('\nfindings raw:', JSON.stringify(f).slice(0,2000));
}

const { data: prd, error: pErr } = await s.from('product_requirements_v2')
  .select('id,metadata,functional_requirements,acceptance_criteria')
  .eq('sd_id','SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C').maybeSingle();
if (pErr) console.log('\nPRD ERROR:', pErr.message);
else if (!prd) console.log('\nPRD: not found by sd_id');
else {
  console.log('\n=== PRD', prd.id, '===');
  console.log('metadata keys:', Object.keys(prd.metadata||{}).join(', '));
  console.log('\nfollowup_out_of_scope_finding:', JSON.stringify(prd.metadata?.followup_out_of_scope_finding, null, 2));
  console.log('\nplan_testing_findings_absorbed:', JSON.stringify(prd.metadata?.plan_testing_findings_absorbed || prd.metadata?.testing_findings_absorbed, null, 2)?.slice(0,3000));
}

// blast radius: rows that assist-engine's own this_week/next_week scheduling would now newly exclude
const now = new Date().toISOString();
const { count: backlogFuture } = await s.from('feedback').select('id',{count:'exact',head:true}).eq('status','backlog').gt('snoozed_until', now);
const { count: backlogAny } = await s.from('feedback').select('id',{count:'exact',head:true}).eq('status','backlog').not('snoozed_until','is',null);
const { count: anyNonNull } = await s.from('feedback').select('id',{count:'exact',head:true}).not('snoozed_until','is',null);
console.log('\n=== BLAST RADIUS of the new .or() on assist-engine OWN rows ===');
console.log({ backlog_with_future_snoozed_until_NEWLY_EXCLUDED: backlogFuture, backlog_with_any_snoozed_until: backlogAny, any_row_with_non_null_snoozed_until: anyNonNull });
