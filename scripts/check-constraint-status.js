#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function investigateConstraint() {
  console.log('=== Investigating strategic_directives_v2 Status Constraint ===\n');

  // 1. Search for VIF-TIER SD
  console.log('1. Searching for VIF-TIER SD...');
  const { data: sds, error: searchError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_id, status, progress, title')
    .or('sd_id.ilike.%VIF-TIER%,sd_key.ilike.%VIF-TIER%')
    .limit(5);

  if (searchError) {
    console.error('Search error:', searchError);
  } else if (sds && sds.length > 0) {
    console.log('Found:', JSON.stringify(sds, null, 2));
  } else {
    console.log('No VIF-TIER SDs found');
  }

  // 2. Look at existing completed SDs
  console.log('\n2. Checking existing completed SDs as examples...');
  const { data: completedSds, error: completedError } = await supabase
    .from('strategic_directives_v2')
    .select('sd_id, sd_key, status, progress')
    .eq('status', 'completed')
    .limit(5);

  if (completedError) {
    console.error('Completed SD query error:', completedError);
  } else if (completedSds && completedSds.length > 0) {
    console.log('Completed SDs:', JSON.stringify(completedSds, null, 2));
  } else {
    console.log('No completed SDs found');
  }

  // 3. Check for SDs with 100% progress
  console.log('\n3. Checking SDs with 100% progress...');
  const { data: fullProgressSds, error: progressError } = await supabase
    .from('strategic_directives_v2')
    .select('sd_id, sd_key, status, progress')
    .eq('progress', 100)
    .limit(5);

  if (progressError) {
    console.error('Progress query error:', progressError);
  } else if (fullProgressSds && fullProgressSds.length > 0) {
    console.log('100% progress SDs:', JSON.stringify(fullProgressSds, null, 2));
  } else {
    console.log('No 100% progress SDs found');
  }

  // 4. Try to understand the constraint by testing status values
  console.log('\n4. Testing what status values exist in the table...');
  const { data: allStatuses, error: statusError } = await supabase
    .from('strategic_directives_v2')
    .select('status')
    .limit(100);

  if (statusError) {
    console.error('Status query error:', statusError);
  } else if (allStatuses && allStatuses.length > 0) {
    const uniqueStatuses = [...new Set(allStatuses.map(s => s.status))];
    console.log('Unique status values found:', uniqueStatuses);
  }

  // 5. Check recent migrations for constraint definition
  console.log('\n5. Looking for recent migrations with constraint definitions...');
  console.log('Check: supabase/migrations/ directory for strategic_directives_v2_status_check');

  console.log('\n=== Investigation Complete ===');
  console.log('\nNext Steps:');
  console.log('1. Check migration files for constraint definition');
  console.log('2. Check for database triggers on progress/status fields');
  console.log('3. Verify if status must be "completed" when progress=100');
  console.log('4. Test update with both status and progress together');
}

investigateConstraint().catch(console.error);
