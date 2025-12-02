import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjUxMTkzNywiZXhwIjoyMDcyMDg3OTM3fQ.tYGfVTDQWQDje4ZPSl5UsprYK9J15Fa-XdGFVScrRZg'
);

async function checkSchema() {
  // Check SD schema via sample record
  const { data: sdSample, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .limit(1)
    .single();

  if (sdError) {
    console.log('SD Error:', sdError.message);
  } else {
    console.log('=== strategic_directives_v2 columns ===');
    console.log(Object.keys(sdSample).sort().join('\n'));
  }

  // Check if delivers_capabilities column exists
  if (sdSample) {
    console.log('\n=== Capability-related columns ===');
    const capCols = Object.keys(sdSample).filter(k => k.includes('capabil'));
    console.log(capCols.length > 0 ? capCols.join('\n') : 'None found');
  }

  // Check if there's a capabilities table
  const { data: capTable, error: capError } = await supabase
    .from('platform_capabilities')
    .select('*')
    .limit(1);
  console.log('\n=== platform_capabilities table ===');
  if (capError) {
    console.log('DOES NOT EXIST -', capError.message);
  } else {
    console.log('EXISTS -', JSON.stringify(capTable));
  }

  // Check for crewai_agents table
  const { data: crewAi, error: crewError } = await supabase
    .from('crewai_agents')
    .select('*')
    .limit(1);
  console.log('\n=== crewai_agents table ===');
  if (crewError) {
    console.log('DOES NOT EXIST -', crewError.message);
  } else {
    console.log('EXISTS -', crewAi.length, 'records');
    if (crewAi.length > 0) {
      console.log('Sample columns:', Object.keys(crewAi[0]).join(', '));
    }
  }

  // Check for sd_capabilities junction table
  const { data: sdCap, error: sdCapError } = await supabase
    .from('sd_capabilities')
    .select('*')
    .limit(1);
  console.log('\n=== sd_capabilities junction table ===');
  if (sdCapError) {
    console.log('DOES NOT EXIST -', sdCapError.message);
  } else {
    console.log('EXISTS');
  }
}

checkSchema();
