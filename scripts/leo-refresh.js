#!/usr/bin/env node
/**
 * LEO Protocol Refresh Command
 * SD: SD-LEO-4-3-2-AUTOMATION
 *
 * Unified command to check and refresh LEO Protocol KB files.
 *
 * Usage: node scripts/leo-refresh.js [--force] [--check-only]
 *   --force: Regenerate even if versions match
 *   --check-only: Only check, don't regenerate
 *   --silent: Suppress output except errors
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

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
    .select('version, id, title')
    .eq('status', 'active')
    .single();

  if (error || !data) {
    throw new Error(`No active protocol found: ${error?.message || 'No data'}`);
  }
  return data;
}

/**
 * Normalize version string by removing 'v' prefix and trailing asterisks
 * e.g., 'v4.3.1' -> '4.3.1', '4.3.1*' -> '4.3.1', '4.3.1' -> '4.3.1'
 */
function normalizeVersion(version) {
  if (!version) return null;
  return version.replace(/^v/i, '').replace(/\*+$/, '');
}

function extractVersionFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const patterns = [
    /Protocol Version:\s*v?([^\s\n]+)/i,
    /LEO Protocol Version:\s*v?([^\s\n]+)/i,
    /CURRENT LEO PROTOCOL VERSION:\s*v?([^\s\n]+)/i,
    /Protocol:\s*LEO\s*v?([^\s\n]+)/i
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) return normalizeVersion(match[1]);
  }
  return null;
}

async function logGeneration(protocol, filesGenerated, durationMs) {
  try {
    await supabase.from('leo_kb_generation_log').insert({
      protocol_id: protocol.id,
      protocol_version: protocol.version,
      files_generated: filesGenerated,
      generation_trigger: 'leo-refresh.js',
      generation_duration_ms: durationMs,
      generated_by: 'system'
    });
  } catch (error) {
    console.warn('⚠️  Could not log generation:', error.message);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const forceRegenerate = args.includes('--force');
  const checkOnly = args.includes('--check-only');
  const silent = args.includes('--silent');

  const log = silent ? () => {} : console.log;
  const baseDir = path.join(__dirname, '..');

  log('🔄 LEO Protocol Refresh');
  log('='.repeat(50));

  try {
    // Step 1: Get active protocol version
    const protocol = await getActiveProtocolVersion();
    log(`📦 Active Protocol: v${protocol.version}`);

    // Step 2: Check all file versions
    let driftDetected = false;
    const fileStatuses = [];
    const dbVersion = normalizeVersion(protocol.version);

    log('\n📄 File Version Check:');
    for (const file of CLAUDE_FILES) {
      const filePath = path.join(baseDir, file);
      const fileVersion = extractVersionFromFile(filePath);
      const matches = fileVersion === dbVersion;

      if (!matches) driftDetected = true;

      fileStatuses.push({ file, fileVersion, matches });

      const status = matches ? '✅' : '❌';
      log(`   ${status} ${file.padEnd(20)} ${fileVersion || 'NOT FOUND'}`);
    }

    // Step 3: Decide action
    if (!driftDetected && !forceRegenerate) {
      log('\n✅ All files up to date with protocol v' + protocol.version);
      if (checkOnly) {
        process.exit(0);
      }
      log('   Use --force to regenerate anyway');
      process.exit(0);
    }

    if (checkOnly) {
      log('\n❌ Version drift detected. Run without --check-only to fix.');
      process.exit(1);
    }

    // Step 4: Regenerate
    log('\n🔧 Regenerating CLAUDE files...');
    const startTime = Date.now();

    try {
      const output = execSync('node scripts/generate-claude-md-from-db.js', {
        cwd: baseDir,
        encoding: 'utf-8'
      });

      if (!silent) console.log(output);

      const durationMs = Date.now() - startTime;

      // Log the generation
      await logGeneration(protocol, CLAUDE_FILES, durationMs);

      log(`\n✅ Regeneration complete in ${durationMs}ms`);
      log('📝 Logged to leo_kb_generation_log');

    } catch (error) {
      console.error('❌ Regeneration failed:', error.message);
      process.exit(1);
    }

    // Step 5: Verify
    log('\n🔍 Verifying regeneration...');
    let allMatch = true;
    for (const file of CLAUDE_FILES) {
      const filePath = path.join(baseDir, file);
      const newVersion = extractVersionFromFile(filePath);
      const matches = newVersion === dbVersion;
      if (!matches) allMatch = false;

      const status = matches ? '✅' : '❌';
      log(`   ${status} ${file.padEnd(20)} ${newVersion || 'ERROR'}`);
    }

    if (allMatch) {
      log('\n✅ LEO Protocol refresh complete!');
      process.exit(0);
    } else {
      console.error('\n❌ Verification failed - some files still have version mismatch');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
