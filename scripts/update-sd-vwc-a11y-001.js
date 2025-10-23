#!/usr/bin/env node

/**
 * Update SD-VWC-A11Y-001 Status After LEAD Approval
 *
 * Updates strategic directive to active status and PLAN phase
 * following successful LEAD Pre-Approval Strategic Validation (6/6 passed)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function updateSDStatus() {
  console.log('Updating SD-VWC-A11Y-001 status after LEAD approval...\n');

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      status: 'active',
      current_phase: 'PLAN',
      progress_percentage: 20,
      updated_at: new Date().toISOString()
    })
    .eq('id', 'SD-VWC-A11Y-001')
    .select('id, title, status, current_phase, progress_percentage, updated_at');

  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.error('❌ No record found for SD-VWC-A11Y-001');
    process.exit(1);
  }

  console.log('✅ Update successful:\n');
  console.log(JSON.stringify(data[0], null, 2));
  console.log('\n📊 Summary:');
  console.log(`   - Status: draft → ${data[0].status}`);
  console.log(`   - Phase: LEAD_APPROVAL → ${data[0].current_phase}`);
  console.log(`   - Progress: 0% → ${data[0].progress_percentage}%`);
  console.log(`   - Updated: ${new Date(data[0].updated_at).toLocaleString()}`);
}

updateSDStatus().catch(console.error);
