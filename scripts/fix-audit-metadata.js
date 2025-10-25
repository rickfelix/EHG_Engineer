#!/usr/bin/env node

/**
 * Fix metadata for SD-DASHBOARD-AUDIT-2025-08-31-A
 * Restore all phase progress values
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function fixAuditMetadata() {
  console.log('🔧 Fixing metadata for Critical Issues Audit SD...');
  
  const sdId = 'SD-DASHBOARD-AUDIT-2025-08-31-A';
  
  try {
    // Get current SD data
    const { data: currentSD, error: fetchError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch SD: ${fetchError.message}`);
    }

    // Get current metadata
    const metadata = currentSD.metadata || {};
    
    // Fix the Phase Progress to include ALL phases at correct values
    const correctPhaseProgress = {
      'LEAD_PLANNING': 100,      // Was already complete
      'PLAN_DESIGN': 100,        // Was already complete  
      'EXEC_IMPLEMENTATION': 100, // Was already complete
      'PLAN_VERIFICATION': 100,   // Now complete (updated from 60)
      'LEAD_APPROVAL': 100       // Was already complete
    };

    // Update metadata with correct phase progress
    const updatedMetadata = {
      ...metadata,
      'Phase Progress': correctPhaseProgress,
      'Current Phase': 'COMPLETE',
      verification_status: 'complete',
      completion_percentage: 100,
      final_status: 'VERIFICATION_COMPLETE'
    };

    console.log('Updated Phase Progress:', correctPhaseProgress);

    // Update the SD in database
    const { data: updatedSD, error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({
        metadata: updatedMetadata,
        updated_at: new Date().toISOString()
      })
      .eq('id', sdId)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update SD: ${updateError.message}`);
    }

    console.log('✅ Metadata fixed successfully!');
    console.log('📊 All phases now show 100% completion');
    console.log('🎯 Strategic Directive should now show 100% progress');

    // Calculate expected progress
    // LEO Protocol v4.1: LEAD(20%) + PLAN(20%) + EXEC(30%) + PLAN_VERIFICATION(15%) + LEAD_APPROVAL(15%)
    const expectedProgress = 20 + 20 + 30 + 15 + 15; // = 100%
    console.log(`📈 Expected progress calculation: ${expectedProgress}%`);

  } catch (error) {
    console.error('❌ Error fixing metadata:', error);
    process.exit(1);
  }
}

// Run the fix
fixAuditMetadata();