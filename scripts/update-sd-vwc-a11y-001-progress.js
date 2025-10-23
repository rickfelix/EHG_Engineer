#!/usr/bin/env node
/**
 * Update SD-VWC-A11Y-001 progress to 40% (PLAN phase complete)
 *
 * PLAN Phase Deliverables Completed:
 * - PRD created (PRD-VWC-A11Y-001)
 * - 7 user stories created (16 story points, 100% BMAD compliance)
 * - Database review complete (no schema changes)
 * - Testing strategy defined
 * - PLAN->EXEC handoff created (ID: 24cdf8db-5b60-4202-b6aa-dd9b417408ce)
 * - Git branch created
 *
 * Progress Breakdown (LEO Protocol v4.2.0):
 * - LEAD Pre-Approval: 20% COMPLETED
 * - PLAN PRD Creation: 20% COMPLETED (this update)
 * - EXEC Implementation: 30% (next phase)
 * - PLAN Verification: 15%
 * - LEAD Final Approval: 15%
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function updateSDProgress() {
  console.log('\n=== Updating SD-VWC-A11Y-001 Progress ===\n');

  try {
    // Update SD progress (using 'id' column, not 'sd_id')
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .update({
        progress_percentage: 40,
        current_phase: 'PLAN',
        updated_at: new Date().toISOString()
      })
      .eq('id', 'SD-VWC-A11Y-001')
      .select();

    if (error) {
      console.error('\n❌ Error updating SD:', error.message);
      console.error('\nFull error:', error);
      process.exit(1);
    }

    if (!data || data.length === 0) {
      console.error('\n❌ No SD found with ID: SD-VWC-A11Y-001');
      process.exit(1);
    }

    console.log('\n✅ SD Updated Successfully\n');
    console.log('Current Status:');
    console.log('  ID:', data[0].id);
    console.log('  Title:', data[0].title);
    console.log('  Current Phase:', data[0].current_phase);
    console.log('  Progress:', data[0].progress_percentage + '%');
    console.log('  Status:', data[0].status);
    console.log('  Updated:', new Date(data[0].updated_at).toLocaleString());
    console.log('\nPhase Breakdown:');
    console.log('  ✅ LEAD Pre-Approval: 20%');
    console.log('  ✅ PLAN PRD Creation: 20%');
    console.log('  ⏳ EXEC Implementation: 30%');
    console.log('  ⏳ PLAN Verification: 15%');
    console.log('  ⏳ LEAD Final Approval: 15%');
    console.log('\nNext Steps:');
    console.log('  1. EXEC agent accepts handoff (ID: 24cdf8db-5b60-4202-b6aa-dd9b417408ce)');
    console.log('  2. Implement user stories (16 story points)');
    console.log('  3. Write E2E tests (accessibility validation)');
    console.log('  4. Create EXEC->PLAN verification handoff');

  } catch (err) {
    console.error('\n❌ Fatal error:', err.message);
    console.error('\nStack:', err.stack);
    process.exit(1);
  }
}

updateSDProgress();
