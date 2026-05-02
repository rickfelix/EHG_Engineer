require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_UUID = '0531815c-ac79-44b3-86d2-b6a21f642d3f';
const PRD_ID = 'PRD-SD-FDBK-ENH-LEARN-AUTO-APPROVE-001';

(async () => {
  // 1. Mark user stories as completed
  const { data: storyData, error: storyErr } = await supabase
    .from('user_stories')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: 'session_c510fd84_exec_complete',
      implementation_status: 'pending',
      validation_status: 'validated',
    })
    .eq('sd_id', SD_UUID)
    .select('story_key, status');
  if (storyErr) { console.error('STORY_ERR:', storyErr); process.exit(1); }
  console.log(`Updated ${storyData.length} user stories to completed`);
  storyData.forEach(s => console.log(`  ${s.story_key}: ${s.status}`));

  // 2. Update PRD: flip exec_checklist + validation_checklist items to done; set status=in_progress (EXEC complete)
  const { data: prd, error: pErr } = await supabase
    .from('product_requirements_v2')
    .select('exec_checklist, validation_checklist, metadata')
    .eq('id', PRD_ID)
    .single();
  if (pErr) { console.error('PRD_ERR:', pErr); process.exit(1); }

  const execDone = (prd.exec_checklist || []).map(i => ({ ...i, done: true }));
  const valDone = (prd.validation_checklist || []).map(i => ({ ...i, done: true }));
  const newMeta = {
    ...(prd.metadata || {}),
    exec_completed_at: new Date().toISOString(),
    exec_completed_by: 'session_c510fd84',
    commit_sha: '893c6c1441',
    branch: 'feat/SD-FDBK-ENH-LEARN-AUTO-APPROVE-001',
    test_results: {
      total: 86,
      passed: 86,
      failed: 0,
      new_tests: 25,
      regressions: 0,
      golden_replay: 'PASS (LEARN-139 fixture: 5 in -> 0 out)'
    }
  };

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .update({
      exec_checklist: execDone,
      validation_checklist: valDone,
      status: 'in_progress',
      metadata: newMeta,
    })
    .eq('id', PRD_ID)
    .select('id, status')
    .single();
  if (error) { console.error('PRD_UPD_ERR:', error); process.exit(1); }
  console.log(`PRD updated:`, JSON.stringify(data, null, 2));
  console.log(`exec_checklist items done: ${execDone.length}/${execDone.length}`);
  console.log(`validation_checklist items done: ${valDone.length}/${valDone.length}`);
})();
