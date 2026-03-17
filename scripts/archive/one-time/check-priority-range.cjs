require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('priority, title')
    .order('priority', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error:', error);
    return;
  }

  const priorities = data.map(d => d.priority).filter(p => p != null);

  console.log('Sample records (top 10 by priority):');
  data.slice(0, 10).forEach(d => {
    console.log(`  Priority: ${d.priority} - ${d.title}`);
  });

  console.log('\nPriority statistics:');
  console.log('  Min:', Math.min(...priorities));
  console.log('  Max:', Math.max(...priorities));
  console.log('  Total records:', data.length);

  process.exit(0);
})();
