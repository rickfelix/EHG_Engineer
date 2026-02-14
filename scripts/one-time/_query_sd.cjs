require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', 'SD-LEO-INFRA-PROTOCOL-FILE-STATE-001')
    .single();

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  // Show non-null, non-empty fields
  for (const [key, val] of Object.entries(data)) {
    if (val === null || val === undefined || val === '') continue;
    if (Array.isArray(val) && val.length === 0) continue;
    console.log(`${key}: ${JSON.stringify(val)}`);
  }
}

main();
