#!/usr/bin/env node
/**
 * LEO Protocol Version Consistency Checker
 * SD: SD-LEO-4-3-1-HARDENING
 *
 * Verifies that all CLAUDE*.md files show the same version as the database.
 * Returns PASS if consistent, FAIL with details if drift detected.
 *
 * Usage: node scripts/check-leo-version.js [--fix]
 *   --fix: Regenerate CLAUDE files if version mismatch detected
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const CLAUDE_FILES = [
  'CLAUDE.md',
  'CLAUDE_CORE.md',
  'CLAUDE_LEAD.md',
  'CLAUDE_PLAN.md',
  'CLAUDE_EXEC.md'
];

async function getActiveProtocolVersion() {
  const { data, error } = await supabase
    .from('leo_protocols')
    .select('version, id, status, title')
    .eq('status', 'active')
    .single();

  if (error || !data) {
    throw new Error(`No active protocol found in database: ${error?.message || 'No data'}`);
  }

  return data;
}

function extractVersionFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, version: null };
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // Look for version patterns in the file
  // Pattern 1: "Protocol Version: v4.3.1" or "LEO v4.3.1"
  const patterns = [
    /Protocol Version:\s*v?([\d.]+[a-z_]*)/i,
    /LEO Protocol Version:\s*v?([\d.]+[a-z_]*)/i,
    /CURRENT LEO PROTOCOL VERSION:\s*v?([\d.]+[a-z_]*)/i,
    /Protocol:\s*LEO\s*v?([\d.]+[a-z_]*)/i,
    /\*Protocol Version:\s*v?([\d.]+[a-z_]*)/i
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return { exists: true, version: match[1] };
    }
  }

  return { exists: true, version: null };
}

async function checkVersionConsistency() {
  console.log('🔍 LEO Protocol Version Consistency Check');
  console.log('='.repeat(50));
  console.log('');

  // Get database version
  let dbProtocol;
  try {
    dbProtocol = await getActiveProtocolVersion();
    console.log('📦 Database Active Protocol:');
    console.log(`   Version: ${dbProtocol.version}`);
    console.log(`   ID: ${dbProtocol.id}`);
    console.log(`   Title: ${dbProtocol.title}`);
    console.log('');
  } catch (error) {
    console.error('❌ FAIL: Cannot read database protocol');
    console.error(`   ${error.message}`);
    return { pass: false, reason: 'database_error' };
  }

  // Check each CLAUDE file
  const baseDir = path.join(__dirname, '..');
  const results = [];
  let allMatch = true;

  console.log('📄 File Version Check:');
  console.log('-'.repeat(50));

  for (const file of CLAUDE_FILES) {
    const filePath = path.join(baseDir, file);
    const { exists, version } = extractVersionFromFile(filePath);

    const status = {
      file,
      exists,
      version,
      matches: version === dbProtocol.version
    };

    results.push(status);

    if (!exists) {
      console.log(`   ⚠️  ${file.padEnd(20)} NOT FOUND`);
      allMatch = false;
    } else if (!version) {
      console.log(`   ⚠️  ${file.padEnd(20)} NO VERSION DETECTED`);
      allMatch = false;
    } else if (version === dbProtocol.version) {
      console.log(`   ✅ ${file.padEnd(20)} ${version}`);
    } else {
      console.log(`   ❌ ${file.padEnd(20)} ${version} (expected: ${dbProtocol.version})`);
      allMatch = false;
    }
  }

  console.log('');
  console.log('='.repeat(50));

  if (allMatch) {
    console.log('✅ PASS: All files consistent with database version');
    return { pass: true, dbVersion: dbProtocol.version, results };
  } else {
    console.log('❌ FAIL: Version drift detected');
    console.log('');
    console.log('   REMEDIATION:');
    console.log('   Run: node scripts/generate-claude-md-from-db.js');
    console.log('   Or:  node scripts/check-leo-version.js --fix');
    return { pass: false, dbVersion: dbProtocol.version, results, reason: 'version_drift' };
  }
}

async function fixVersionDrift() {
  console.log('');
  console.log('🔧 Attempting to fix version drift...');
  console.log('   Running: node scripts/generate-claude-md-from-db.js');
  console.log('');

  try {
    const output = execSync('node scripts/generate-claude-md-from-db.js', {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf-8'
    });
    console.log(output);
    console.log('✅ CLAUDE files regenerated');
    return true;
  } catch (error) {
    console.error('❌ Failed to regenerate CLAUDE files');
    console.error(`   ${error.message}`);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const shouldFix = args.includes('--fix');

  const result = await checkVersionConsistency();

  if (!result.pass && shouldFix) {
    const fixed = await fixVersionDrift();
    if (fixed) {
      // Re-check after fix
      console.log('');
      console.log('🔄 Re-checking after fix...');
      console.log('');
      const recheck = await checkVersionConsistency();
      process.exit(recheck.pass ? 0 : 1);
    } else {
      process.exit(1);
    }
  }

  process.exit(result.pass ? 0 : 1);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
