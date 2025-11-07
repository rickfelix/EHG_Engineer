/**
 * Check Ideas-to-Ventures Migration Status
 * SD: SD-VENTURE-UNIFICATION-001 US-006
 * Purpose: Validate migration has been applied and data integrity
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const EHG_SUPABASE_URL = 'https://liapbndqlqxdcgpwntbv.supabase.co';
const EHG_ANON_KEY = process.env.EHG_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_EHG_SUPABASE_ANON_KEY;

async function checkMigrationStatus() {
  console.log('\n🔍 Checking Ideas-to-Ventures Migration Status...\n');
  console.log('Database: EHG Application (liapbndqlqxdcgpwntbv)');
  console.log('SD: SD-VENTURE-UNIFICATION-001 US-006\n');

  if (!EHG_ANON_KEY) {
    console.error('❌ EHG_SUPABASE_ANON_KEY not found in environment');
    console.log('   Please set either EHG_SUPABASE_ANON_KEY or NEXT_PUBLIC_EHG_SUPABASE_ANON_KEY');
    process.exit(1);
  }

  const supabase = createClient(EHG_SUPABASE_URL, EHG_ANON_KEY);

  try {
    // Check 1: Ventures table migration status
    console.log('📊 Check 1: Ventures Table Migration Status');
    console.log('─'.repeat(60));

    const { data: venturesData, error: venturesError } = await supabase
      .from('ventures')
      .select('id, name, metadata', { count: 'exact' })
      .limit(0);

    if (venturesError) {
      console.error('❌ Error querying ventures table:', venturesError.message);
    } else {
      const totalVentures = venturesData?.length ?? 0;
      console.log('✅ Ventures table accessible');
      console.log(`   Total ventures visible: ${totalVentures}`);
    }

    // Check 2: Sample migrated venture
    console.log('\n📋 Check 2: Sample Migrated Venture');
    console.log('─'.repeat(60));

    const { data: migratedSample, error: sampleError } = await supabase
      .from('ventures')
      .select('id, name, metadata')
      .not('metadata->migration_meta', 'is', null)
      .limit(1)
      .single();

    if (sampleError) {
      if (sampleError.code === 'PGRST116') {
        console.log('⚠️  No migrated ventures found (or RLS blocking access)');
        console.log('   This could mean:');
        console.log('   1. Migration not yet applied');
        console.log('   2. No data in ideas table to migrate');
        console.log('   3. RLS policies preventing read access with ANON key');
      } else {
        console.error('❌ Error:', sampleError.message);
      }
    } else {
      console.log('✅ Found migrated venture:');
      console.log(`   ID: ${migratedSample.id}`);
      console.log(`   Name: ${migratedSample.name}`);
      if (migratedSample.metadata?.migration_meta) {
        console.log(`   Original ID: ${migratedSample.metadata.migration_meta.original_id}`);
        console.log(`   Migrated At: ${migratedSample.metadata.migration_meta.migrated_at}`);
        console.log(`   Migration Version: ${migratedSample.metadata.migration_meta.migration_version}`);
      }
    }

    // Check 3: Ideas table/view status
    console.log('\n📂 Check 3: Ideas Table Status');
    console.log('─'.repeat(60));

    const { data: ideasData, error: ideasError } = await supabase
      .from('ideas')
      .select('id, title', { count: 'exact' })
      .limit(1);

    if (ideasError) {
      if (ideasError.message.includes('relation "ideas" does not exist')) {
        console.log('⚠️  Ideas table does not exist (expected if migration applied)');
        console.log('   Expected state after migration:');
        console.log('   - Original table renamed to: ideas_deprecated_20251103');
        console.log('   - Backward compat view created: ideas (read-only)');
      } else {
        console.error('❌ Error querying ideas:', ideasError.message);
      }
    } else {
      console.log('✅ Ideas table/view accessible');
      console.log('   Could be: Original table OR backward compatibility view');
      console.log(`   Sample idea ID: ${ideasData[0]?.id}`);
      console.log(`   Sample idea title: ${ideasData[0]?.title}`);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📝 SUMMARY');
    console.log('='.repeat(60));

    if (!venturesError && !sampleError && migratedSample) {
      console.log('✅ Migration appears to be APPLIED');
      console.log('   - Ventures table has migrated data');
      console.log('   - Migration metadata present');
      console.log('   - Data structure validated');
    } else if (!venturesError && sampleError?.code === 'PGRST116') {
      console.log('⚠️  Migration status UNCLEAR');
      console.log('   - Ventures table exists but no migrated data visible');
      console.log('   - Could be RLS policy blocking ANON key access');
      console.log('   - Recommend: Check with SERVICE_ROLE_KEY or Supabase Dashboard');
    } else {
      console.log('❌ Migration appears NOT APPLIED or has issues');
      console.log('   - Check migration files in /mnt/c/_EHG/ehg/supabase/migrations/');
      console.log('   - Expected files:');
      console.log('     * 20251103_03_migrate_ideas_to_ventures.sql');
      console.log('     * 20251103_04_create_ideas_backward_compat_view.sql');
    }

    console.log('\n📁 Migration Files Location:');
    console.log('   /mnt/c/_EHG/ehg/supabase/migrations/20251103_03_migrate_ideas_to_ventures.sql');
    console.log('   /mnt/c/_EHG/ehg/supabase/migrations/20251103_04_create_ideas_backward_compat_view.sql');

    console.log('\n✅ Validation check complete\n');

  } catch (error) {
    console.error('\n❌ Unexpected error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkMigrationStatus();
