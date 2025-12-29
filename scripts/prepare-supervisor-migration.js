#!/usr/bin/env node

/**
 * Prepare PLAN Supervisor Migration for Supabase Dashboard
 * This script prepares the SQL and provides easy copy-paste instructions
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function prepareMigration() {
  console.log('🚀 Preparing PLAN Supervisor Migration\n');
  console.log('='.repeat(60));
  
  // Read the SQL file
  const sqlPath = path.join(__dirname, 'apply-supervisor-safe.sql');
  const sqlContent = fs.readFileSync(sqlPath, 'utf8');
  
  // Create a cleaned version (remove comments for easier copying)
  const _cleanSQL = sqlContent
    .split('\n')
    .filter(line => !line.trim().startsWith('--') || line.includes('--'))
    .join('\n');
  
  console.log('\n📋 INSTRUCTIONS:');
  console.log('='.repeat(60));
  console.log('\n1. Open Supabase Dashboard:');
  console.log('   https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq');
  console.log('\n2. Click "SQL Editor" in the left sidebar');
  console.log('\n3. Click "New query" button');
  console.log('\n4. Copy everything between the SQL START and SQL END markers below');
  console.log('\n5. Paste into the SQL Editor');
  console.log('\n6. Click "Run" button (or press Ctrl+Enter)\n');
  console.log('='.repeat(60));
  console.log('\n');
  console.log('━'.repeat(60));
  console.log('████ SQL START - COPY FROM HERE ████');
  console.log('━'.repeat(60));
  console.log('\n' + sqlContent + '\n');
  console.log('━'.repeat(60));
  console.log('████ SQL END - COPY TO HERE ████');
  console.log('━'.repeat(60));
  console.log('\n');
  
  // Save to clipboard file for easy access
  const clipboardPath = path.join(__dirname, 'supervisor-migration-clipboard.sql');
  fs.writeFileSync(clipboardPath, sqlContent);
  
  console.log('✅ SQL also saved to: scripts/supervisor-migration-clipboard.sql');
  console.log('\n📌 After running the SQL, verify with:');
  console.log('   node scripts/verify-supervisor-setup.js');
  console.log('\n🎯 This migration is SAFE and won\'t affect existing LEO Protocol!');
  console.log('='.repeat(60));
}

// Run
prepareMigration();