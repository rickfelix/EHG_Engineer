const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTriggers() {
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        trigger_name, 
        event_manipulation, 
        action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'strategic_directives_v2'
      AND trigger_schema = 'public';
    `
  });

  if (error) {
    console.log('Cannot query triggers directly via RPC');
    console.log('Error:', error.message);
    console.log('\n--- Alternative Approach ---');
    console.log('Need to disable trigger via Supabase Dashboard SQL Editor');
    console.log('\nSQL to execute:');
    console.log('ALTER TABLE strategic_directives_v2 DISABLE TRIGGER auto_calculate_progress_trigger;');
    return;
  }

  console.log('Triggers on strategic_directives_v2:');
  console.log(data);
}

checkTriggers();
