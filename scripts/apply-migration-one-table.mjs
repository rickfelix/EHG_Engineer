#!/usr/bin/env node
/**
 * Apply sd_testing_status migration - ONE TABLE AT A TIME
 * Following CLAUDE.md database operations guidance
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Split SQL into individual operations
const sqlFile = readFileSync('database/schema/sd_testing_status.sql', 'utf8');

// Extract just the CREATE TABLE statement (lines 5-45)
const createTableSQL = `
CREATE TABLE IF NOT EXISTS sd_testing_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id VARCHAR(50) NOT NULL UNIQUE REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
    tested BOOLEAN NOT NULL DEFAULT false,
    test_pass_rate NUMERIC(5,2) CHECK (test_pass_rate >= 0 AND test_pass_rate <= 100),
    test_count INTEGER DEFAULT 0 CHECK (test_count >= 0),
    tests_passed INTEGER DEFAULT 0 CHECK (tests_passed >= 0),
    tests_failed INTEGER DEFAULT 0 CHECK (tests_failed >= 0),
    last_tested_at TIMESTAMP,
    test_duration_seconds INTEGER,
    test_framework VARCHAR(50),
    screenshot_paths JSONB DEFAULT '[]'::jsonb,
    test_results JSONB DEFAULT '{}'::jsonb,
    testing_notes TEXT,
    testing_sub_agent_used BOOLEAN DEFAULT false,
    user_stories_sub_agent_used BOOLEAN DEFAULT false,
    sub_agent_results JSONB DEFAULT '{}'::jsonb,
    testing_priority INTEGER DEFAULT 0,
    next_in_queue BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    CONSTRAINT valid_pass_count CHECK (tests_passed <= test_count),
    CONSTRAINT valid_fail_count CHECK (tests_failed <= test_count),
    CONSTRAINT valid_total_tests CHECK (tests_passed + tests_failed = test_count)
);
`.trim();

console.log('═══════════════════════════════════════════════════════════');
console.log('🔨 SUPABASE MIGRATION: sd_testing_status (ONE TABLE AT A TIME)');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('⚠️  NOTE: Supabase client cannot execute DDL statements directly.');
console.log('This script will guide you through manual application.\n');

console.log('📋 MANUAL MIGRATION STEPS:');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('1️⃣  Open Supabase SQL Editor:');
console.log('   https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/editor\n');

console.log('2️⃣  Click "+ New Query"\n');

console.log('3️⃣  Copy and paste this SQL:\n');
console.log('─────────────────────────────────────────────────────────');
console.log(createTableSQL);
console.log('─────────────────────────────────────────────────────────\n');

console.log('4️⃣  Click "Run" (or press Ctrl/Cmd + Enter)\n');

console.log('5️⃣  Verify by running this command:');
console.log('   node scripts/verify-sd-testing-status-migration.js\n');

console.log('═══════════════════════════════════════════════════════════');
console.log('💡 Why manual?');
console.log('   Supabase RPC limitations prevent automated DDL execution');
console.log('   Manual application via SQL Editor is safer and auditable');
console.log('═══════════════════════════════════════════════════════════\n');

// Save SQL to temporary file for easy copy-paste
const fs = await import('fs');
fs.writeFileSync('/tmp/sd_testing_status_table.sql', createTableSQL);
console.log('✅ SQL saved to: /tmp/sd_testing_status_table.sql');
console.log('   You can also copy from this file\n');
