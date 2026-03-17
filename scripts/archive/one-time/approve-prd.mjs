#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const PRD_ID = 'PRD-VWC-PHASE1-001';

async function approvePRD() {
  console.log(`📋 Approving PRD ${PRD_ID} for EXEC phase...\n`);

  const { error } = await supabase
    .from('product_requirements_v2')
    .update({
      status: 'approved',
      updated_at: new Date().toISOString()
    })
    .eq('id', PRD_ID);

  if (error) {
    console.error('❌ Failed to approve PRD:', error.message);
    process.exit(1);
  }

  console.log('✅ PRD approved successfully');
  console.log('   Status: verification → approved');
  console.log('   Ready for PLAN→EXEC handoff');
}

approvePRD()
  .then(() => process.exit(0))
  .catch(e => {
    console.error('❌ Error:', e.message);
    process.exit(1);
  });
