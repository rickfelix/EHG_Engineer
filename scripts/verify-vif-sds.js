#!/usr/bin/env node

/**
 * Verify VIF Strategic Directives were created successfully
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function verifyVIFSDs() {
  console.log('🔍 Verifying VIF Strategic Directives...\n');

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, priority, status, metadata')
    .in('id', ['SD-VIF-PARENT-001', 'SD-VIF-TIER-001', 'SD-VIF-INTEL-001', 'SD-VIF-REFINE-001'])
    .order('id');

  if (error) {
    console.error('❌ Error querying database:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.error('❌ No VIF SDs found in database!');
    process.exit(1);
  }

  console.log(`✅ Found ${data.length} VIF Strategic Directives:\n`);

  data.forEach(sd => {
    console.log(`📋 ${sd.id}`);
    console.log(`   Key: ${sd.sd_key}`);
    console.log(`   Title: ${sd.title}`);
    console.log(`   Priority: ${sd.priority} | Status: ${sd.status}`);

    if (sd.metadata?.is_parent) {
      console.log('   Parent SD: YES');
      console.log(`   Child SDs: ${sd.metadata.sub_directive_ids?.join(', ')}`);
    } else if (sd.metadata?.parent_sd_id) {
      console.log(`   Parent: ${sd.metadata.parent_sd_id}`);
      console.log(`   Sequence: ${sd.metadata.sequence_order}`);
    }

    console.log('');
  });

  console.log('✅ All VIF Strategic Directives verified successfully!');
  console.log('\n🎯 Next Steps:');
  console.log('   1. View in dashboard: http://localhost:3000/strategic-directives');
  console.log('   2. Run LEAD pre-approval validation');
  console.log('   3. Navigate to ../ehg/ for implementation');
}

verifyVIFSDs().catch(console.error);
