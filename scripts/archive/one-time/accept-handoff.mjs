#!/usr/bin/env node
/**
 * Accept a phase handoff by updating its status to 'accepted'
 *
 * Usage: node scripts/accept-handoff.mjs <handoff_id>
 *
 * Note: The handoff table uses 'id' as the primary key column, not 'handoff_id'
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function acceptHandoff(handoffId) {
  console.info(`\n🔄 Accepting handoff ${handoffId}...\n`);

  // Create Supabase client with fallback to ANON_KEY if SERVICE_ROLE_KEY not available
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
                      process.env.SUPABASE_ANON_KEY ||
                      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env file');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // First, check current handoff status (using 'id' column, not 'handoff_id')
    const { data: currentHandoff, error: fetchError } = await supabase
      .from('sd_phase_handoffs')
      .select('*')
      .eq('id', handoffId)
      .single();

    if (fetchError) {
      console.error(`❌ Failed to fetch handoff: ${fetchError.message}`);
      process.exit(1);
    }

    if (!currentHandoff) {
      console.error(`❌ Handoff not found with ID: ${handoffId}`);
      process.exit(1);
    }

    console.info(`📋 Current handoff status:`);
    console.info(`   ID: ${currentHandoff.id}`);
    console.info(`   SD: ${currentHandoff.sd_id}`);
    console.info(`   Transition: ${currentHandoff.from_phase} → ${currentHandoff.to_phase}`);
    console.info(`   Status: ${currentHandoff.status}`);
    console.info(`   Created: ${currentHandoff.created_at}\n`);

    if (currentHandoff.status === 'accepted') {
      console.info(`✅ Handoff already accepted. No action needed.\n`);
      return;
    }

    // Update status to 'accepted'
    const { data: updated, error: updateError } = await supabase
      .from('sd_phase_handoffs')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString()
      })
      .eq('id', handoffId)
      .select();

    if (updateError) {
      console.error(`❌ Failed to update handoff: ${updateError.message}`);
      process.exit(1);
    }

    const updatedHandoff = updated && updated[0];
    if (!updatedHandoff) {
      console.error(`❌ Update succeeded but no data returned`);
      process.exit(1);
    }

    console.info(`✅ HANDOFF ACCEPTED SUCCESSFULLY\n`);
    console.info(`   Handoff ID: ${updatedHandoff.id}`);
    console.info(`   SD ID: ${updatedHandoff.sd_id}`);
    console.info(`   From Phase: ${updatedHandoff.from_phase}`);
    console.info(`   To Phase: ${updatedHandoff.to_phase}`);
    console.info(`   Status: ${updatedHandoff.status}`);
    console.info(`   Accepted At: ${updatedHandoff.accepted_at}\n`);

  } catch (error) {
    console.error(`\n❌ Error accepting handoff:`, error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Get handoff ID from command line argument
const handoffId = process.argv[2];

if (!handoffId) {
  console.error('\n❌ Usage: node scripts/accept-handoff.mjs <handoff_id>\n');
  process.exit(1);
}

// Execute
acceptHandoff(handoffId)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
