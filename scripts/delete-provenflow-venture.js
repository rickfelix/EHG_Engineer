/**
 * Delete ProvenFlow Venture Records
 *
 * Deletes all database records for the ProvenFlow venture in correct order
 * to respect foreign key constraints.
 *
 * Order:
 * 1. venture_stage_work (references ventures via venture_id FK)
 * 2. ventures (parent table)
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const VENTURE_ID = 'f88e4d4f-4f81-43ec-b53f-766e3cea25ce';

async function deleteProvenFlowVenture() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing required environment variables:');
    console.error('   SUPABASE_URL:', !!supabaseUrl);
    console.error('   SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey);
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('🗑️  Deleting ProvenFlow venture records...');
  console.log(`   Venture ID: ${VENTURE_ID}\n`);

  const deletionSummary = {
    venture_stage_work: 0,
    ventures: 0
  };

  try {
    // First, verify the venture exists and get its name
    const { data: venture, error: fetchError } = await supabase
      .from('ventures')
      .select('id, name')
      .eq('id', VENTURE_ID)
      .single();

    if (fetchError) {
      console.error('❌ Error fetching venture:', fetchError);
      process.exit(1);
    }

    if (!venture) {
      console.log('⚠️  Venture not found. Nothing to delete.');
      process.exit(0);
    }

    console.log(`📋 Found venture: "${venture.name}"`);

    // Count existing records before deletion
    console.log('\n📊 Counting existing records...');

    const { count: stageWorkCount } = await supabase
      .from('venture_stage_work')
      .select('*', { count: 'exact', head: true })
      .eq('venture_id', VENTURE_ID);

    deletionSummary.venture_stage_work = stageWorkCount || 0;
    deletionSummary.ventures = 1; // We verified it exists above

    console.log(`   Found ${deletionSummary.venture_stage_work} venture_stage_work records`);
    console.log(`   Found ${deletionSummary.ventures} ventures record\n`);

    // Step 1: Delete venture_stage_work records
    if (deletionSummary.venture_stage_work > 0) {
      console.log('1️⃣  Deleting venture_stage_work records...');
      const { error: stageWorkError } = await supabase
        .from('venture_stage_work')
        .delete()
        .eq('venture_id', VENTURE_ID);

      if (stageWorkError) {
        console.error('❌ Error deleting venture_stage_work:', stageWorkError);
        throw stageWorkError;
      }
      console.log(`   ✅ Deleted ${deletionSummary.venture_stage_work} venture_stage_work records`);
    }

    // Step 2: Delete ventures record
    console.log('\n2️⃣  Deleting ventures record...');
    const { error: venturesError } = await supabase
      .from('ventures')
      .delete()
      .eq('id', VENTURE_ID);

    if (venturesError) {
      console.error('❌ Error deleting ventures:', venturesError);
      throw venturesError;
    }
    console.log(`   ✅ Deleted ${deletionSummary.ventures} ventures record`);

    // Verify deletion
    const { data: checkData } = await supabase
      .from('ventures')
      .select('id')
      .eq('id', VENTURE_ID)
      .maybeSingle();

    if (checkData) {
      console.error('❌ Deletion verification failed: Venture still exists in database');
      process.exit(1);
    }

    // Summary
    console.log('\n📊 Deletion Summary:');
    console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   venture_stage_work: ${deletionSummary.venture_stage_work} rows`);
    console.log(`   ventures:           ${deletionSummary.ventures} row`);
    console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Total:              ${Object.values(deletionSummary).reduce((a, b) => a + b, 0)} rows deleted`);
    console.log('\n✅ ProvenFlow venture deleted successfully');

  } catch (error) {
    console.error('\n❌ Unexpected error during deletion:', error);
    process.exit(1);
  }
}

deleteProvenFlowVenture();
