require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_UUID = '0531815c-ac79-44b3-86d2-b6a21f642d3f';
const PRD_ID = 'PRD-SD-FDBK-ENH-LEARN-AUTO-APPROVE-001';

(async () => {
  const { data: results, error: rerr } = await supabase
    .from('sub_agent_execution_results')
    .select('sub_agent_code, verdict, confidence, summary, metadata, created_at')
    .eq('sd_id', SD_UUID)
    .in('sub_agent_code', ['DESIGN', 'DATABASE'])
    .order('created_at', { ascending: false });
  if (rerr) { console.error('RES_ERR:', rerr); process.exit(1); }
  const design = results.find(r => r.sub_agent_code === 'DESIGN');
  const database = results.find(r => r.sub_agent_code === 'DATABASE');

  const { data: prd, error: gerr } = await supabase
    .from('product_requirements_v2')
    .select('metadata')
    .eq('id', PRD_ID)
    .single();
  if (gerr) { console.error('GET_ERR:', gerr); process.exit(1); }

  const newMeta = {
    ...(prd.metadata || {}),
    design_analysis: design ? {
      verdict: design.verdict,
      confidence: design.confidence,
      summary: design.summary,
      sub_agent_code: 'DESIGN',
      executed_at: design.created_at
    } : null,
    database_analysis: database ? {
      verdict: database.verdict,
      confidence: database.confidence,
      summary: database.summary,
      sub_agent_code: 'DATABASE',
      executed_at: database.created_at
    } : null,
    plan_approved_at: new Date().toISOString(),
    plan_approved_by: 'session_c510fd84'
  };

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .update({ metadata: newMeta, status: 'approved' })
    .eq('id', PRD_ID)
    .select('id, status, phase')
    .single();
  if (error) { console.error('UPDATE_ERR:', error); process.exit(1); }
  console.log('APPROVED:', JSON.stringify(data, null, 2));
  console.log('design_analysis present:', !!newMeta.design_analysis);
  console.log('database_analysis present:', !!newMeta.database_analysis);
})();
