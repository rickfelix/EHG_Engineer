#!/usr/bin/env node
/**
 * Apply protocol_improvements migration to retrospectives table
 * Uses Supabase JS client since direct psql connection may have auth issues
 *
 * Usage: node scripts/apply-protocol-improvements-migration.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('🔧 Applying protocol_improvements migration...\n');

  try {
    // Step 1: Add the column
    console.log('1️⃣  Adding protocol_improvements column...');
    const { error: addColumnError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE retrospectives
        ADD COLUMN IF NOT EXISTS protocol_improvements JSONB DEFAULT '[]'::jsonb;

        COMMENT ON COLUMN retrospectives.protocol_improvements IS 'Array of LEO Protocol improvement suggestions. Each object: { category: string, improvement: string, evidence: string, impact: string, affected_phase: LEAD|PLAN|EXEC|null }';
      `
    });

    if (addColumnError) {
      // Try direct SQL via REST
      console.log('   ℹ️  exec_sql not available, trying via raw SQL...');

      // Check if we need to use the management API or just test the column
      const { error: testError } = await supabase
        .from('retrospectives')
        .select('id')
        .limit(0);

      if (testError) {
        throw new Error(`Cannot access retrospectives table: ${testError.message}`);
      }

      console.log('   ⚠️  Direct SQL execution not available via JS client');
      console.log('   📋 Migration SQL needs to be applied via Supabase Dashboard:');
      console.log('');
      console.log('   Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql');
      console.log('   Run the SQL from: database/migrations/20251204_add_protocol_improvements_to_retrospectives.sql');
      console.log('');
      return { success: false, method: 'manual_required' };
    }

    console.log('   ✅ Column added successfully');

    // Step 2: Add check constraint
    console.log('\n2️⃣  Adding check constraint...');
    const { error: constraintError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE retrospectives
        ADD CONSTRAINT IF NOT EXISTS check_protocol_improvements_is_array
        CHECK (jsonb_typeof(protocol_improvements) = 'array' OR protocol_improvements IS NULL);
      `
    });

    if (constraintError) {
      console.log('   ⚠️  Could not add constraint:', constraintError.message);
    } else {
      console.log('   ✅ Check constraint added');
    }

    // Step 3: Add index
    console.log('\n3️⃣  Adding GIN index...');
    const { error: indexError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE INDEX IF NOT EXISTS idx_retrospectives_protocol_improvements_gin
        ON retrospectives USING gin (protocol_improvements);
      `
    });

    if (indexError) {
      console.log('   ⚠️  Could not add index:', indexError.message);
    } else {
      console.log('   ✅ GIN index added');
    }

    console.log('\n✅ Migration completed successfully!');
    return { success: true, method: 'rpc' };

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Verify the column exists after migration
async function verifyMigration() {
  console.log('\n🔍 Verifying migration...');

  try {
    const { error } = await supabase
      .from('retrospectives')
      .select('id, protocol_improvements')
      .limit(1);

    if (error) {
      console.log('   ❌ Column not found:', error.message);
      return false;
    }

    console.log('   ✅ protocol_improvements column exists');
    return true;
  } catch (error) {
    console.log('   ❌ Verification failed:', error.message);
    return false;
  }
}

async function main() {
  const result = await applyMigration();

  if (result.success || result.method === 'manual_required') {
    const verified = await verifyMigration();

    if (!verified && result.method !== 'manual_required') {
      console.log('\n⚠️  Migration applied but verification failed. Please check manually.');
    }
  }
}

main();
