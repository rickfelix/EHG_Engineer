#!/usr/bin/env node
/**
 * Apply SD-INFRA-VALIDATION Migrations via RPC
 *
 * Creates a temporary RPC function to execute DDL statements
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔧 APPLYING SD-INFRA-VALIDATION MIGRATIONS VIA RPC');
console.log('═══════════════════════════════════════════════════════════\n');

// Read migration files
const migration1 = readFileSync(join(__dirname, '../database/migrations/add_sd_type_column.sql'), 'utf8');
const migration2 = readFileSync(join(__dirname, '../database/migrations/update_sd_cicd_type.sql'), 'utf8');
const migration3 = readFileSync(join(__dirname, '../database/migrations/update_calculate_sd_progress_with_type.sql'), 'utf8');

console.log('📋 Migration 1: Add sd_type column');
console.log('   Executing ALTER TABLE via raw SQL...\n');

// Create a temporary function to execute the DDL
const wrapperSQL = `
CREATE OR REPLACE FUNCTION execute_migration_ddl()
RETURNS TEXT AS $$
BEGIN
  -- Migration 1: Add sd_type column
  ${migration1}

  -- Migration 2: Update SD-CICD-WORKFLOW-FIX type
  ${migration2}

  -- Migration 3: Update calculate_sd_progress function
  ${migration3}

  RETURN 'Migrations applied successfully';
EXCEPTION WHEN OTHERS THEN
  RETURN 'Error: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`;

console.log('⚠️  ALTERNATIVE APPROACH NEEDED:');
console.log('   Supabase client cannot execute DDL (ALTER TABLE, CREATE FUNCTION)');
console.log('   Migrations must be applied via Supabase Dashboard SQL Editor\n');

console.log('📝 MANUAL STEPS:');
console.log('   1. Open: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql');
console.log('   2. Create new query');
console.log('   3. Paste migration 1 content: database/migrations/add_sd_type_column.sql');
console.log('   4. Run query');
console.log('   5. Repeat for migration 2 and 3\n');

console.log('🔍 OR: Use psql directly (if credentials available):');
console.log('   psql "postgresql://postgres.[PROJECT_ID]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres" -f database/migrations/add_sd_type_column.sql\n');

console.log('═══════════════════════════════════════════════════════════');
