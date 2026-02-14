const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data } = await supabase.from('leo_sub_agents')
    .select('code, trigger_keywords')
    .in('code', ['DATABASE', 'GITHUB', 'TESTING', 'DOCMON']);

  for (const a of (data || [])) {
    const kw = a.trigger_keywords || [];
    console.log(a.code + ': first 3 = [' + kw.slice(0, 3).join(', ') + '] total=' + kw.length);
    if (kw.includes('EXEC_IMPLEMENTATION_COMPLETE')) {
      console.log('  *** STILL HAS EXEC_IMPLEMENTATION_COMPLETE ***');
    }
    if (kw.includes('EXEC-TO-PLAN')) {
      console.log('  Has EXEC-TO-PLAN');
    }
  }
}
check().catch(console.error);
