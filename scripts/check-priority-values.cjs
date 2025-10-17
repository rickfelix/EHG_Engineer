require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('priority')
    .limit(1000);

  if (error) {
    console.error('Error:', error);
    return;
  }

  const uniquePriorities = [...new Set(data.map(d => d.priority))];

  console.log('Unique priority values found:');
  uniquePriorities.forEach(p => console.log(`  - ${p}`));

  process.exit(0);
})();
