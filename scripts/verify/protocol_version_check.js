#!/usr/bin/env node

/**
 * Protocol Version Check for Session Prologue
 *
 * Verifies that CLAUDE*.md files match the database protocol version.
 * Called at session start to detect stale protocol files.
 *
 * SD: SD-LEO-SELF-IMPROVE-001A
 * User Story: US-004
 *
 * Exit codes:
 *   0 - Version match (files are current)
 *   1 - Version mismatch (files are stale)
 *   2 - Error (could not check)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..', '..');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const CLAUDE_FILES = [
  'CLAUDE.md',
  'CLAUDE_CORE.md',
  'CLAUDE_LEAD.md',
  'CLAUDE_PLAN.md',
  'CLAUDE_EXEC.md'
];

async function checkProtocolVersion() {
  // Get active protocol version from database
  const { data: protocol, error: protocolError } = await supabase
    .from('leo_protocols')
    .select('version, id, title')
    .eq('status', 'active')
    .single();

  if (protocolError || !protocol) {
    console.error('❌ ERROR: Could not fetch active protocol from database');
    console.error('   ' + (protocolError?.message || 'No active protocol found'));
    process.exit(2);
  }

  const dbVersion = protocol.version;
  let allMatch = true;
  const mismatches = [];

  // Check each CLAUDE file
  for (const file of CLAUDE_FILES) {
    const filePath = join(ROOT_DIR, file);

    if (!existsSync(filePath)) {
      mismatches.push({ file, reason: 'NOT_FOUND' });
      allMatch = false;
      continue;
    }

    const content = readFileSync(filePath, 'utf-8');

    // Extract version from file using multiple patterns
    const patterns = [
      /CURRENT LEO PROTOCOL VERSION:\s*v?([\d.]+)/i,
      /Protocol Version:\s*v?([\d.]+)/i,
      /Protocol:\s*LEO\s*v?([\d.]+)/i
    ];

    let fileVersion = null;
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        fileVersion = match[1];
        break;
      }
    }

    if (!fileVersion) {
      mismatches.push({ file, reason: 'NO_VERSION', expected: dbVersion });
      allMatch = false;
    } else if (fileVersion !== dbVersion) {
      mismatches.push({ file, reason: 'MISMATCH', found: fileVersion, expected: dbVersion });
      allMatch = false;
    }
  }

  // Output result
  if (allMatch) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  ✅ PROTOCOL VERSION CHECK: CURRENT');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Database Version: ${dbVersion}`);
    console.log(`  All ${CLAUDE_FILES.length} CLAUDE files match`);
    console.log('═══════════════════════════════════════════════════════════════');
    process.exit(0);
  } else {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  ⚠️  PROTOCOL VERSION CHECK: STALE FILES DETECTED');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Database Version: ${dbVersion}`);
    console.log('');
    console.log('  Files needing regeneration:');
    for (const m of mismatches) {
      if (m.reason === 'NOT_FOUND') {
        console.log(`    ❌ ${m.file} - FILE NOT FOUND`);
      } else if (m.reason === 'NO_VERSION') {
        console.log(`    ⚠️  ${m.file} - No version detected`);
      } else {
        console.log(`    ❌ ${m.file} - v${m.found} (expected v${m.expected})`);
      }
    }
    console.log('');
    console.log('  REMEDIATION:');
    console.log('    node scripts/generate-claude-md-from-db.js');
    console.log('');
    console.log('  Or run version check with auto-fix:');
    console.log('    node scripts/check-leo-version.js --fix');
    console.log('═══════════════════════════════════════════════════════════════');
    process.exit(1);
  }
}

checkProtocolVersion().catch(err => {
  console.error('❌ ERROR: Protocol version check failed');
  console.error('   ' + err.message);
  process.exit(2);
});
