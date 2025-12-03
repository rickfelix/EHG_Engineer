import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjUxMTkzNywiZXhwIjoyMDcyMDg3OTM3fQ.tYGfVTDQWQDje4ZPSl5UsprYK9J15Fa-XdGFVScrRZg'
);

async function checkStatuses() {
  // Get all distinct statuses from existing SDs
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('status')
    .limit(100);

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  const statuses = [...new Set(data.map(d => d.status))];
  console.log('Valid statuses:', statuses.sort());
}

checkStatuses();
