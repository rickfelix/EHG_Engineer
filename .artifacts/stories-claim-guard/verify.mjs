import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
const s = createSupabaseServiceClient();
const SD_UUID = '11f9e1ac-a769-47f1-82b4-950a32a0d977';

const { data: rows } = await s.from('user_stories')
  .select('story_key, prd_id, sd_id, status, priority, story_points, e2e_test_status, validation_status, acceptance_criteria, implementation_context, architecture_references, example_code_patterns, testing_scenarios, given_when_then, definition_of_done')
  .eq('sd_id', SD_UUID).order('story_key');

console.log('=== USER STORIES READBACK ===');
console.log('count:', rows.length);
for (const r of rows) {
  const ac = r.acceptance_criteria || [];
  const gwt = ac.filter(a => a.given && a.when && a.then).length;
  console.log(`${r.story_key} | ${r.status}/${r.priority}/${r.story_points}pt | ac=${ac.length} gwt=${gwt} | ctx=${r.implementation_context?.length} | arch=${r.architecture_references?.length} code=${r.example_code_patterns?.length} tests=${r.testing_scenarios?.length} gwtCol=${r.given_when_then?.length} dod=${r.definition_of_done?.length} | e2e=${r.e2e_test_status} val=${r.validation_status}`);
}
const withCtx = rows.filter(r => r.implementation_context && r.implementation_context.length > 50).length;
console.log(`BMAD implementation_context coverage: ${withCtx}/${rows.length} = ${Math.round(withCtx / rows.length * 100)}%`);
console.log('prd_id uniform:', [...new Set(rows.map(r => r.prd_id))]);

const { data: ev } = await s.from('sub_agent_execution_results')
  .select('id, sub_agent_code, verdict, confidence, phase, summary, created_at, updated_at, metadata, execution_time')
  .eq('sd_id', SD_UUID).eq('sub_agent_code', 'STORIES').order('created_at', { ascending: false });
console.log('\n=== STORIES EVIDENCE ROWS ===');
console.log('rows:', ev.length);
for (const e of ev) {
  console.log(`id=${e.id} verdict=${e.verdict} conf=${e.confidence} phase=${e.phase} created=${e.created_at}`);
  console.log(`  repo_path=${e.metadata?.repo_path}`);
  console.log(`  executed_from_cwd=${e.metadata?.executed_from_cwd}`);
  console.log(`  repo_resolved=${e.metadata?.repo_resolved} registry_source=${e.metadata?.registry_source}`);
  console.log(`  original_verdict=${e.metadata?.original_verdict} evaluated_commit_sha=${e.metadata?.evaluated_commit_sha}`);
  console.log(`  summary_len=${e.summary?.length}`);
}

const { data: app } = await s.from('applications').select('name, local_path').eq('name', 'EHG_Engineer').maybeSingle();
console.log('\napplications.EHG_Engineer.local_path =', app?.local_path);
console.log('gate compares metadata.repo_path === local_path ->', ev[0]?.metadata?.repo_path === app?.local_path);
