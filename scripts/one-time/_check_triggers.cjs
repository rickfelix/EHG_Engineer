require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const sql = `
    SELECT
      p.proname AS function_name,
      pg_get_functiondef(p.oid) AS full_definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname IN (
      'enforce_is_working_on_for_handoffs',
      'auto_validate_handoff',
      'verify_deliverables_before_handoff'
    )
    AND n.nspname = 'public'
    ORDER BY p.proname;
  `;

  const { data, error } = await client.rpc('exec_sql', { sql_text: sql });

  if (error) {
    console.error('Error:', JSON.stringify(error, null, 2));
    return;
  }

  const results = data[0]?.result || data;
  for (const fn of results) {
    console.log('=== ' + fn.function_name + ' ===');
    console.log(fn.full_definition);
    console.log('');
  }
})();
