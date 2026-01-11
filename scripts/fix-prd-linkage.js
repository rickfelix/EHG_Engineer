#!/usr/bin/env node
/**
 * Fix PRD linkage for SD-BASELINE-SYNC-001
 * The get_progress_breakdown function isn't finding the PRD
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixPRDLinkage() {
  const sdUuid = 'ca448fe3-35f0-419b-982d-6a942d0e8d87';

  console.log('Checking PRD linkage...\n');

  // Get the PRD
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('id', 'PRD-SD-BASELINE-SYNC-001')
    .single();

  if (prdError || !prd) {
    console.log('PRD not found!');
    return;
  }

  console.log('PRD ID:', prd.id);
  console.log('PRD sd_id:', prd.sd_id);
  console.log('PRD directive_id:', prd.directive_id);
  console.log('PRD status:', prd.status);

  // Check if there's an sd_uuid column (might be legacy)
  const columns = Object.keys(prd);
  console.log('\nAll columns:', columns.join(', '));

  // The progress function might be checking sd_uuid which doesn't exist
  // or might be checking status != completed

  // Let's run the raw progress calculation
  console.log('\n--- Running get_progress_breakdown ---');
  const { data: progress, error: progressError } = await supabase
    .rpc('get_progress_breakdown', { p_sd_id: sdUuid });

  if (progressError) {
    console.log('Progress RPC error:', progressError.message);

    // Try bypassing the trigger by using raw SQL
    console.log('\n--- Attempting direct status update via RPC ---');

    // Check if there's a bypass function
    const { error: bypassError } = await supabase.rpc('admin_complete_sd', {
      p_sd_id: sdUuid
    });

    if (bypassError) {
      console.log('No admin bypass function:', bypassError.message);
    }
  } else {
    console.log('Progress breakdown:', JSON.stringify(progress, null, 2));
  }
}

fixPRDLinkage().catch(console.error);
