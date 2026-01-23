#!/usr/bin/env node

/**
 * Migration Execution Reminder - PostToolUse Hook
 *
 * PostToolUse hook for Write tool that detects migration file creation
 * and reminds Claude to execute the migration.
 *
 * Hook Type: PostToolUse (matcher: Write)
 *
 * Created: 2026-01-23
 * SD: SD-LEO-HARDEN-VALIDATION-001 (root cause fix)
 * Issue: Database migrations were being created but not executed because
 *        the DATABASE sub-agent was not being invoked automatically.
 *
 * This hook:
 * 1. Detects when a migration file is written to database/migrations/ or supabase/migrations/
 * 2. Outputs a reminder to execute the migration
 * 3. Provides the exact command to run
 */

const path = require('path');
const fs = require('fs');

// Migration file patterns to detect
const MIGRATION_PATTERNS = [
  /database[\/\\]migrations[\/\\].*\.sql$/i,
  /supabase[\/\\]migrations[\/\\].*\.sql$/i,
  /supabase[\/\\]ehg_engineer[\/\\]migrations[\/\\].*\.sql$/i,
  /migrations[\/\\]\d{8,14}_.*\.sql$/i
];

/**
 * Detect if a file path is a migration file
 */
function isMigrationFile(filePath) {
  if (!filePath) return false;
  const normalizedPath = filePath.replace(/\\/g, '/');
  return MIGRATION_PATTERNS.some(pattern => pattern.test(normalizedPath));
}

/**
 * Extract SD ID from migration file content or filename
 */
function extractSDId(filePath, content) {
  // Check filename first (e.g., 20260123_retrospective_auto_archive_trigger.sql)
  const fileName = path.basename(filePath);

  // Check content for SD ID pattern
  const sdMatch = content?.match(/SD[-_][A-Z][-A-Z0-9]+[-_]\d+/gi);
  if (sdMatch) {
    return sdMatch[0].replace(/_/g, '-').toUpperCase();
  }

  return null;
}

/**
 * Main hook execution
 */
async function main() {
  // Get tool output from environment
  const toolOutput = process.env.CLAUDE_TOOL_OUTPUT || '';
  const toolInput = process.env.CLAUDE_TOOL_INPUT || '';
  const toolName = process.env.CLAUDE_TOOL_NAME || '';

  // Only check for Write tool
  if (toolName !== 'Write') {
    process.exit(0);
  }

  // Parse file path from tool input
  let filePath = '';
  let content = '';
  try {
    const input = JSON.parse(toolInput);
    filePath = input.file_path || '';
    content = input.content || '';
  } catch (_e) {
    process.exit(0);
  }

  // Check if this is a migration file
  if (!isMigrationFile(filePath)) {
    process.exit(0);
  }

  // Extract SD ID if present
  const sdId = extractSDId(filePath, content);
  const fileName = path.basename(filePath);

  // Output reminder
  console.log('\n');
  console.log('════════════════════════════════════════════════════════════');
  console.log('  MIGRATION FILE CREATED - ACTION REQUIRED');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`   File: ${fileName}`);
  console.log(`   Path: ${filePath}`);
  if (sdId) {
    console.log(`   SD: ${sdId}`);
  }
  console.log('');
  console.log('   This migration needs to be EXECUTED against the database.');
  console.log('');
  console.log('   OPTIONS TO EXECUTE:');
  console.log('');
  console.log('   1. Supabase SQL Editor (RECOMMENDED for hosted):');
  console.log('      → Open: https://supabase.com/dashboard/project/[PROJECT_ID]/sql');
  console.log('      → Paste and run the migration SQL');
  console.log('');
  console.log('   2. DATABASE Sub-Agent (if CLI is linked):');
  if (sdId) {
    console.log(`      → node scripts/execute-subagent.js --code DATABASE --sd-id ${sdId} --execute-migration --confirm-apply`);
  } else {
    console.log('      → node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID> --execute-migration --confirm-apply');
  }
  console.log('');
  console.log('   3. Supabase CLI (if linked locally):');
  console.log('      → supabase db push');
  console.log('');
  console.log('   4. Direct psql (if available):');
  console.log(`      → psql $DATABASE_URL -f "${filePath}"`);
  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('');

  // Also output JSON for Claude to parse (optional)
  const reminder = {
    type: 'MIGRATION_EXECUTION_REMINDER',
    file: fileName,
    path: filePath,
    sd_id: sdId,
    action_required: true,
    commands: {
      database_subagent: sdId
        ? `node scripts/execute-subagent.js --code DATABASE --sd-id ${sdId} --execute-migration --confirm-apply`
        : 'node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID> --execute-migration --confirm-apply',
      supabase_cli: 'supabase db push',
      manual: 'Execute in Supabase SQL Editor'
    }
  };

  console.log('MIGRATION_REMINDER_JSON:' + JSON.stringify(reminder));

  // Exit with 0 (advisory, non-blocking)
  process.exit(0);
}

// Execute
main().catch(err => {
  console.error(`[migration-execution-reminder] Error: ${err.message}`);
  process.exit(0);
});
