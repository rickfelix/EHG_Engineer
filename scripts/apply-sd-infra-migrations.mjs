#!/usr/bin/env node
/**
 * Apply SD-INFRA-VALIDATION Migrations
 *
 * Applies migrations using Supabase SQL execution
 * SD: SD-INFRA-VALIDATION
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create Supabase client with service role key for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const migrations = [
  {
    file: 'add_sd_type_column.sql',
    description: 'Add sd_type column to strategic_directives_v2',
    verify: async () => {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .select('sd_type')
        .limit(1);
      return !error && data !== null;
    }
  },
  {
    file: 'update_sd_cicd_type.sql',
    description: 'Mark SD-CICD-WORKFLOW-FIX as infrastructure',
    verify: async () => {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .select('sd_type')
        .eq('id', 'SD-CICD-WORKFLOW-FIX')
        .single();
      return !error && data?.sd_type === 'infrastructure';
    }
  },
  {
    file: 'update_calculate_sd_progress_with_type.sql',
    description: 'Update calculate_sd_progress() with type awareness',
    verify: async () => {
      // Verify by calling the function
      const { data, error } = await supabase.rpc('calculate_sd_progress', {
        sd_id_param: 'SD-INFRA-VALIDATION'
      });
      return !error;
    }
  }
];

console.log('🔧 APPLYING SD-INFRA-VALIDATION MIGRATIONS');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('⚠️  MIGRATION APPROACH:');
console.log('   Supabase client cannot execute raw DDL SQL');
console.log('   These migrations must be applied via Supabase Dashboard\n');

console.log('📋 MIGRATIONS TO APPLY:');
migrations.forEach((m, i) => {
  const path = join(__dirname, '../database/migrations', m.file);
  const sql = readFileSync(path, 'utf8');
  console.log(`   ${i + 1}. ${m.description}`);
  console.log(`      File: ${m.file}`);
  console.log(`      Size: ${(sql.length / 1024).toFixed(1)} KB\n`);
});

console.log('═══════════════════════════════════════════════════════════');
console.log('📝 INSTRUCTIONS:');
console.log('   1. Open Supabase Dashboard SQL Editor');
console.log('   2. Copy/paste each migration file content');
console.log('   3. Execute in order (1→2→3)');
console.log('   4. Run verification: node scripts/verify-sd-infra-migrations.mjs\n');

console.log('🔗 Dashboard URL:');
console.log(`   ${process.env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', 'https://supabase.com/dashboard/project/')}/sql\n`);

console.log('📄 Migration Files:');
migrations.forEach((m, i) => {
  console.log(`   ${i + 1}. database/migrations/${m.file}`);
});
console.log('');

// Perform pre-verification to see what's already applied
console.log('🔍 PRE-VERIFICATION:');
console.log('───────────────────────────────────────────────────────────');

for (const migration of migrations) {
  console.log(`   Checking: ${migration.description}`);
  try {
    const isApplied = await migration.verify();
    if (isApplied) {
      console.log('   ✅ Already applied');
    } else {
      console.log('   ⏳ Not yet applied');
    }
  } catch (error) {
    console.log(`   ❓ Unable to verify: ${error.message}`);
  }
  console.log('');
}

console.log('═══════════════════════════════════════════════════════════');
