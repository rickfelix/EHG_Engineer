import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjUxMTkzNywiZXhwIjoyMDcyMDg3OTM3fQ.tYGfVTDQWQDje4ZPSl5UsprYK9J15Fa-XdGFVScrRZg'
);

async function checkSchema() {
  // Get an existing SD to see what columns exist
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .limit(1)
    .single();

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  console.log('=== strategic_directives_v2 columns ===');
  console.log(Object.keys(data).sort().join('\n'));

  console.log('\n=== Sample SD data ===');
  console.log('ID:', data.id || data.legacy_id);
  console.log('Status:', data.status);
  console.log('Has phase field:', 'phase' in data);
}

checkSchema();
