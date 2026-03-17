#!/usr/bin/env node

/**
 * Apply Refactoring Workflow Migrations
 * Applies all 4 database migrations for LEO v4.3.3 refactoring enhancement
 *
 * Created: 2025-12-27
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MIGRATIONS = [
  '20251227_refactor_intensity_levels.sql',
  '20251227_refactor_gate_exemptions_update.sql',
  '20251227_register_regression_validator_subagent.sql',
  '20251227_refactor_brief_template.sql'
];

async function applyMigrations() {
  console.log('=== Applying Refactoring Workflow Migrations ===\n');

  for (const migrationFile of MIGRATIONS) {
    const migrationPath = path.join(__dirname, '../database/migrations', migrationFile);

    if (!fs.existsSync(migrationPath)) {
      console.log(`⚠️  Migration file not found: ${migrationFile}`);
      continue;
    }

    console.log(`\n📄 Processing: ${migrationFile}`);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Try to execute via RPC if available
    const { error: rpcError } = await supabase.rpc('fn_execute_sql_admin', {
      sql_text: sql
    });

    if (rpcError) {
      if (rpcError.message.includes('does not exist')) {
        console.log('   ⚠️  Admin SQL RPC not available');
        console.log('   📋 Migration must be applied manually via Supabase SQL Editor');
        console.log(`   File: database/migrations/${migrationFile}`);
      } else {
        console.log(`   ❌ Error: ${rpcError.message}`);
      }
    } else {
      console.log('   ✅ Applied successfully via RPC');
    }
  }

  // Verify key changes
  console.log('\n=== Verifying Migration Results ===\n');

  // Check 1: intensity_level column
  console.log('1. Checking intensity_level column...');
  const { data: _sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, intensity_level')
    .limit(1);

  if (sdError && sdError.message.includes('intensity_level')) {
    console.log('   ❌ Column not found - migration not applied');
  } else {
    console.log('   ✅ intensity_level column exists');
  }

  // Check 2: sd_intensity_adjustments table
  console.log('2. Checking sd_intensity_adjustments table...');
  const { data: adjData, error: adjError } = await supabase
    .from('sd_intensity_adjustments')
    .select('*')
    .limit(3);

  if (adjError) {
    console.log(`   ❌ Table not found: ${adjError.message}`);
  } else {
    console.log(`   ✅ Table exists with ${adjData?.length || 0} rows`);
  }

  // Check 3: sd_intensity_gate_exemptions table
  console.log('3. Checking sd_intensity_gate_exemptions table...');
  const { data: exemptData, error: exemptError } = await supabase
    .from('sd_intensity_gate_exemptions')
    .select('*')
    .limit(3);

  if (exemptError) {
    console.log(`   ❌ Table not found: ${exemptError.message}`);
  } else {
    console.log(`   ✅ Table exists with ${exemptData?.length || 0} rows`);
  }

  // Check 4: REGRESSION sub-agent
  console.log('4. Checking REGRESSION sub-agent registration...');
  const { data: subAgent, error: subAgentError } = await supabase
    .from('leo_sub_agents')
    .select('id, name, code')
    .eq('code', 'REGRESSION')
    .single();

  if (subAgentError) {
    console.log(`   ❌ Sub-agent not found: ${subAgentError.message}`);
  } else {
    console.log(`   ✅ REGRESSION sub-agent registered: ${subAgent.name}`);
  }

  // Check 5: Refactor Brief template
  console.log('5. Checking Refactor Brief template...');
  const { data: template, error: templateError } = await supabase
    .from('leo_protocol_sections')
    .select('id, title')
    .eq('section_type', 'template')
    .ilike('title', '%Refactor Brief%')
    .single();

  if (templateError) {
    console.log(`   ❌ Template not found: ${templateError.message}`);
  } else {
    console.log(`   ✅ Template exists: ${template.title}`);
  }

  // Check 6: document_type column on product_requirements_v2
  console.log('6. Checking document_type column on product_requirements_v2...');
  const { data: _prdData, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('id, document_type')
    .limit(1);

  if (prdError && prdError.message.includes('document_type')) {
    console.log('   ❌ Column not found - migration not applied');
  } else {
    console.log('   ✅ document_type column exists');
  }

  console.log('\n=== Migration Check Complete ===\n');
  console.log('If any checks failed, apply migrations manually via Supabase SQL Editor.');
  console.log('Migration files are in: database/migrations/');
}

applyMigrations().catch(console.error);
