import { createClient  } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function check() {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, priority, status, target_application, sequence_rank')
    .eq('priority', 'high')
    .eq('status', 'active')
    .order('sequence_rank');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('🔍 HIGH-PRIORITY ACTIVE SDs - targetApplication VALUES');
  console.log('======================================================');

  // Group by target_application
  const appGroups = {};
  data.forEach(sd => {
    const app = sd.target_application || 'NULL';
    if (!appGroups[app]) appGroups[app] = [];
    appGroups[app].push(sd);
  });

  // Show the groups
  Object.entries(appGroups).forEach(([app, sds]) => {
    console.log(`\ntargetApplication = '${app}': ${sds.length} SDs`);
    sds.forEach(sd => {
      console.log(`  ${sd.id.padEnd(10)} rank: ${sd.sequence_rank}`);
    });
  });

  console.log('\n📌 PROBLEM IDENTIFIED:');
  console.log('The UI is filtering for targetApplication === "EHG"');
  console.log('But your SDs have targetApplication = ' + Object.keys(appGroups).join(', '));

  if (!appGroups['EHG']) {
    console.log('\n⚠️  NO SDs have targetApplication = "EHG"!');
    console.log('This is why you see 0 results with the current filter.');
    console.log('\nSOLUTION: Either:');
    console.log('1. Change the application filter to "All" in the UI');
    console.log('2. Update the SDs to have targetApplication = "EHG"');
    console.log('3. Change the default filter in localStorage');
  }
}

check();