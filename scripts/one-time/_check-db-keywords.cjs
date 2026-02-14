const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const codes = ['DATABASE', 'GITHUB', 'TESTING', 'DOCMON'];
  for (const code of codes) {
    const { data, error } = await supabase.from('leo_sub_agents')
      .select('code, trigger_keywords')
      .eq('code', code)
      .single();

    if (error) {
      console.log(code + ': ERROR - ' + error.message);
      continue;
    }

    const kw = data.trigger_keywords || [];
    const hasOld = kw.includes('EXEC_IMPLEMENTATION_COMPLETE');
    const hasNew = kw.includes('EXEC-TO-PLAN');
    console.log(code + ': total=' + kw.length + ' hasOld=' + hasOld + ' hasNew=' + hasNew + ' first3=[' + kw.slice(0,3).join(', ') + ']');
  }

  // Also check the generate script to see how it builds the summary
  console.log('\nChecking leo_protocol_sections for static trigger summary...');
  const { data: sections } = await supabase.from('leo_protocol_sections')
    .select('id, title')
    .ilike('title', '%trigger%');
  console.log('Sections with "trigger" in title:', JSON.stringify(sections));
}
check().catch(console.error);
