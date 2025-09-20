import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function updatePRD() {
  // Update PRD-SD-001 with required fields
  const { data, error } = await supabase
    .from('prds')
    .update({
      target_url: 'http://localhost:3000/dashboard',
      component_name: 'Dashboard',
      app_path: '/mnt/c/_EHG/EHG_Engineer',
      port: 3000
    })
    .eq('id', 'PRD-SD-001');

  if (error) {
    console.error('Error updating PRD:', error);
  } else {
    console.log('✅ PRD-SD-001 updated with target fields');
  }

  // Verify the update
  const { data: prd } = await supabase
    .from('prds')
    .select('id, target_url, component_name, app_path, port')
    .eq('id', 'PRD-SD-001')
    .single();

  console.log('Updated PRD:', prd);
}

updatePRD();
