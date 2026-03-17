import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function debug() {
  const prdId = 'PRD-SD-001';
  
  const { data: prd, error } = await supabase
    .from('prds')
    .select('target_url, component_name, app_path, port')
    .eq('id', prdId)
    .single();
  
  console.log('Query error:', error);
  console.log('PRD data:', prd);
  
  if (prd) {
    const prdContent = {
      targetURL: prd.target_url,
      componentName: prd.component_name,
      appPath: prd.app_path || process.cwd(),
      port: prd.port || 3000
    };
    console.log('PRD content:', prdContent);
  }
}

debug();
