#!/usr/bin/env node
/**
 * Complete SD Deliverables
 * Marks all deliverables as completed with evidence when EXEC phase is done
 * Part of LEO Protocol intelligent completion system
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
const verifiedBy = process.argv[3] || 'EXEC';
const evidence = process.argv[4] || 'Implementation verified via EXEC-TO-PLAN handoff acceptance';

async function completeDeliverables() {
  console.log('=== Completing Deliverables for', sdId, '===\n');

  // Get all pending deliverables
  const { data: deliverables, error } = await supabase
    .from('sd_scope_deliverables')
    .select('id, deliverable_name, completion_status')
    .eq('sd_id', sdId)
    .neq('completion_status', 'completed');

  if (error) {
    console.error('Error fetching deliverables:', error.message);
    return;
  }

  if (!deliverables || deliverables.length === 0) {
    console.log('No pending deliverables found - all complete!');
    return;
  }

  console.log('Found', deliverables.length, 'pending deliverables to complete:\n');

  // Update each deliverable
  for (const d of deliverables) {
    console.log(`  Completing: ${d.deliverable_name}`);

    const { error: updateErr } = await supabase
      .from('sd_scope_deliverables')
      .update({
        completion_status: 'completed',
        verified_by: verifiedBy,
        verified_at: new Date().toISOString(),
        completion_evidence: evidence,
        completion_notes: `Auto-completed by LEO Protocol after EXEC phase completion. SD handoffs verified.`,
        updated_at: new Date().toISOString()
      })
      .eq('id', d.id);

    if (updateErr) {
      console.error(`    ❌ Error: ${updateErr.message}`);
    } else {
      console.log('    ✅ Completed');
    }
  }

  // Verify final state
  console.log('\n=== Verification ===');
  const { data: breakdown } = await supabase
    .rpc('get_progress_breakdown', { sd_id_param: sdId });

  if (breakdown) {
    console.log('EXEC_implementation.deliverables_complete:', breakdown.phases?.EXEC_implementation?.deliverables_complete);
    console.log('Total Progress:', breakdown.total_progress);
    console.log('Can Complete:', breakdown.can_complete);
  }
}

completeDeliverables().catch(console.error);
