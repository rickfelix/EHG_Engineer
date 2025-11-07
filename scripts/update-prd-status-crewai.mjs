#!/usr/bin/env node
/**
 * Update PRD status to 'approved' for PLAN→EXEC handoff
 * SD: SD-CREWAI-ARCHITECTURE-001
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-CREWAI-ARCHITECTURE-001';

async function updatePRDStatus() {
  console.log('📝 Updating PRD status to "approved"');
  console.log('═══════════════════════════════════════════════════\n');

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .update({
      status: 'approved',
      updated_at: new Date().toISOString()
    })
    .eq('id', PRD_ID)
    .select('id, title, status')
    .single();

  if (error) {
    console.error('❌ Error updating PRD:', error.message);
    process.exit(1);
  }

  console.log('✅ PRD status updated');
  console.log(`   ID: ${data.id}`);
  console.log(`   Title: ${data.title}`);
  console.log(`   Status: ${data.status}`);
  console.log('═'.repeat(60));
}

updatePRDStatus();
