#!/usr/bin/env node

/**
 * Cancel Strategic Directive
 * Changes status to 'cancelled' to mark directive as permanently rejected
 *
 * Usage: node scripts/delete-strategic-directive.js <SD-ID>
 * Example: node scripts/delete-strategic-directive.js SD-2025-1020-6HZ
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function cancelStrategicDirective(sdId) {
  console.log(`🚫 Cancelling Strategic Directive: ${sdId}\n`);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials in .env file');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // First verify SD exists
    console.log('🔍 Verifying SD exists...');
    const { data: existingSD, error: checkError } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, created_at')
      .eq('id', sdId)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        console.log(`❌ Strategic Directive ${sdId} not found in database`);
        process.exit(1);
      }
      throw checkError;
    }

    console.log('✅ SD found:');
    console.log(`   ID: ${existingSD.id}`);
    console.log(`   Title: ${existingSD.title}`);
    console.log(`   Status: ${existingSD.status}`);
    console.log(`   Created: ${existingSD.created_at}`);

    if (existingSD.status === 'cancelled') {
      console.log('⚠️  SD is already cancelled');
      process.exit(0);
    }

    // Cancel the SD and mark in title
    console.log('\n🚫 Cancelling SD and updating title...');
    const cancelledTitle = existingSD.title.startsWith('[CANCELLED]')
      ? existingSD.title
      : `[CANCELLED] ${existingSD.title}`;

    const { data: cancelledSD, error: cancelError } = await supabase
      .from('strategic_directives_v2')
      .update({
        status: 'cancelled',
        title: cancelledTitle
      })
      .eq('id', sdId)
      .select()
      .single();

    if (cancelError) {
      console.error('❌ Cancel operation failed:', cancelError.message);
      process.exit(1);
    }

    console.log('✅ SD cancelled successfully!');
    console.log(`   New status: ${cancelledSD.status}`);
    console.log(`   New title: ${cancelledSD.title}`);

    // Verify cancellation
    console.log('\n🔍 Verifying cancellation...');
    const { data: verifySD, error: verifyError } = await supabase
      .from('strategic_directives_v2')
      .select('id, status, title')
      .eq('id', sdId)
      .single();

    if (verifyError) {
      console.warn('⚠️  Could not verify cancellation:', verifyError.message);
    } else if (verifySD.status === 'cancelled') {
      console.log('✅ Cancellation verified - SD status is "cancelled"');
    } else {
      console.warn(`⚠️  Cancellation may not have persisted - status is "${verifySD.status}"`);
    }

    console.log('\n📝 Note: The SD is now cancelled and marked as permanently rejected.');

  } catch (error) {
    console.error('❌ Error cancelling SD:', error.message);
    if (error.hint) console.error('   Hint:', error.hint);
    if (error.details) console.error('   Details:', error.details);
    process.exit(1);
  }
}

// Get SD ID from command line
const args = process.argv.slice(2);
if (args.length < 1) {
  console.log('Usage: node scripts/delete-strategic-directive.js <SD-ID>');
  console.log('Example: node scripts/delete-strategic-directive.js SD-2025-1020-6HZ');
  process.exit(1);
}

const sdId = args[0];
cancelStrategicDirective(sdId);
