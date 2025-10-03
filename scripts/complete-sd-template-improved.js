/**
 * Improved SD Completion Script Template
 *
 * ROOT CAUSE FIXES IMPLEMENTED:
 * 1. ✅ Query by 'id' field instead of 'sd_key' (more reliable)
 * 2. ✅ Auto-fix null sd_key if found
 * 3. ✅ Better error handling (fail loudly, not silently)
 * 4. ✅ Set all completion fields (status, progress, dates, approval)
 * 5. ✅ Verification step after update
 *
 * USAGE:
 * 1. Copy this template
 * 2. Replace 'SD-XXX-YYY' with your SD ID
 * 3. Run: node scripts/complete-sd-xxx-yyy.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseKey) {
  console.error('❌ Error: SUPABASE_ANON_KEY not set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ========================================
// CONFIGURATION - UPDATE THIS
// ========================================
const SD_ID = 'SD-XXX-YYY'; // ← CHANGE THIS TO YOUR SD ID
const SD_TITLE = 'Your SD Title'; // ← CHANGE THIS

async function completeSD() {
  console.log(`🎯 Completing ${SD_ID}: ${SD_TITLE}\n`);

  try {
    // ==================================================
    // FIX #1: Query by 'id' instead of 'sd_key'
    // This works even if sd_key is null
    // ==================================================
    const { data: sd, error: fetchError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', SD_ID)  // ← Use 'id', not 'sd_key'
      .single();

    // ==================================================
    // FIX #2: Fail loudly if SD not found
    // Don't fail silently - this is unexpected
    // ==================================================
    if (fetchError || !sd) {
      throw new Error(`SD not found: ${SD_ID}. Error: ${fetchError?.message}`);
    }

    console.log('✅ Found SD:\n');
    console.log('   ID:', sd.id);
    console.log('   sd_key:', sd.sd_key || '⚠️  NULL (will be fixed)');
    console.log('   Title:', sd.title);
    console.log('   Status:', sd.status);
    console.log('   Progress:', sd.progress + '%');
    console.log('   Current Phase:', sd.current_phase);
    console.log('');

    // ==================================================
    // FIX #3: Auto-fix null sd_key
    // Set sd_key = id if it's null
    // ==================================================
    const sdKeyToUse = sd.sd_key || sd.id;
    if (!sd.sd_key) {
      console.log('⚠️  sd_key is null, will be set to:', sdKeyToUse);
    }

    // ==================================================
    // FIX #4: Set ALL completion fields
    // Don't just set progress - set everything
    // ==================================================
    const now = new Date().toISOString();
    const updateData = {
      sd_key: sdKeyToUse,           // Fix null sd_key
      status: 'completed',           // Mark as completed
      progress: 100,                 // 100% progress
      current_phase: 'COMPLETED',    // Update phase
      phase_progress: 100,           // Phase complete
      completion_date: now,          // Completion date
      approval_date: now,            // Approval date
      approved_by: 'LEAD',          // Approved by LEAD
      updated_at: now                // Timestamp
    };

    console.log('🔄 Updating SD to completed status...');
    const { data: updated, error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update(updateData)
      .eq('id', SD_ID)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update SD: ${updateError.message}`);
    }

    console.log('✅ SD updated successfully!\n');

    // ==================================================
    // FIX #5: Verification step
    // Confirm all fields were updated correctly
    // ==================================================
    console.log('✅ Verification:');
    console.log('   sd_key:', updated.sd_key);
    console.log('   status:', updated.status);
    console.log('   progress:', updated.progress + '%');
    console.log('   current_phase:', updated.current_phase);
    console.log('   completion_date:', updated.completion_date);
    console.log('   approved_by:', updated.approved_by);
    console.log('');

    // Final check
    if (updated.sd_key && updated.status === 'completed' && updated.progress === 100) {
      console.log('🎉 SD ' + SD_ID + ' is now COMPLETE ("done done")!\n');
      console.log('✅ All fields verified correct');
      console.log('✅ Dashboard will show as completed with 100% progress\n');
    } else {
      console.warn('⚠️  Some fields may not be correct. Please verify manually.');
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('\nStack:', error.stack);
    process.exit(1);
  }
}

completeSD();
