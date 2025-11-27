#!/usr/bin/env node
/**
 * Check SD Deliverables Blocking Status
 * Diagnoses why deliverables_complete is false
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const sdId = process.argv[2] || 'SD-IDEATION-STAGE2-001';

async function checkDeliverables() {
  console.log('=== Checking Deliverables for', sdId, '===\n');

  // Check sd_scope_deliverables
  const { data: deliverables, error } = await supabase
    .from('sd_scope_deliverables')
    .select('id, deliverable_name, deliverable_type, priority, completion_status, verified_by')
    .eq('sd_id', sdId);

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  console.log('Total deliverables tracked:', deliverables?.length || 0);

  if (deliverables && deliverables.length > 0) {
    console.log('\n--- All Deliverables ---');
    deliverables.forEach(d => {
      const status = d.completion_status === 'completed' ? '✅' : '❌';
      console.log(`  ${status} [${d.priority}] ${d.deliverable_name} - ${d.completion_status}`);
    });

    // Check what's blocking
    const incomplete = deliverables.filter(d =>
      (d.priority === 'required' || d.priority === 'high') && d.completion_status !== 'completed'
    );
    console.log('\n--- BLOCKING DELIVERABLES ---');
    console.log('Incomplete required/high:', incomplete.length);
    incomplete.forEach(d => {
      console.log(`  ❌ ${d.deliverable_name} (status: ${d.completion_status})`);
    });
  } else {
    console.log('No deliverables tracked - should auto-complete (COUNT=0 returns true)');
  }

  // Get full progress breakdown
  const { data: breakdown, error: bErr } = await supabase
    .rpc('get_progress_breakdown', { sd_id_param: sdId });

  if (bErr) {
    console.log('\nBreakdown error:', bErr.message);
  } else {
    console.log('\n=== Progress Breakdown ===');
    console.log(JSON.stringify(breakdown, null, 2));
  }
}

checkDeliverables().catch(console.error);
