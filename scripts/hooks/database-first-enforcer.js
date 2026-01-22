#!/usr/bin/env node

/**
 * Database-First PreToolUse Enforcer
 *
 * PreToolUse hook that enforces database-first principle for Edit/Write tools.
 * Checks if PRD is required for the current SD type before allowing code edits.
 * Blocks with exit(2) and provides remediation command.
 *
 * Hook Type: PreToolUse (matcher: Write|Edit)
 *
 * Created: 2026-01-22
 * SD: SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-G
 * Part of: AUTO-PROCEED Intelligence Enhancements
 */

const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const SESSION_STATE_FILE = path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.claude-session-state.json');

/**
 * SD types that REQUIRE a PRD before code edits
 * These are code-producing types per LEO Protocol
 */
const PRD_REQUIRED_TYPES = [
  'feature',
  'bugfix',
  'security',
  'enhancement',
  'performance'
];

/**
 * SD types that do NOT require a PRD (database-first still applies but no PRD)
 */
const PRD_EXEMPT_TYPES = [
  'documentation',
  'docs',
  'infrastructure',
  'orchestrator',
  'refactor',
  'database',
  'process',
  'qa'
];

/**
 * File patterns that are ALWAYS allowed (no PRD check)
 * These are documentation/config files that don't need PRD
 */
const ALWAYS_ALLOWED_PATTERNS = [
  /\.md$/i,                    // Markdown files
  /\.json$/i,                  // JSON config
  /\.env/i,                    // Environment files
  /\.gitignore$/i,             // Git ignore
  /package\.json$/i,           // Package files
  /test\/.*\.test\.js$/i,      // Test files
  /test\/.*\.test\.ts$/i,
  /spec\/.*\.spec\.js$/i,
  /spec\/.*\.spec\.ts$/i,
  /\.claude\//i,               // Claude config
  /scripts\/hooks\//i          // Hooks themselves
];

/**
 * Get Supabase client
 */
function getSupabase() {
  try {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  } catch (_error) {
    return null;
  }
}

/**
 * Detect current SD from git branch or session state
 */
function detectCurrentSD() {
  // Try session state first
  if (fs.existsSync(SESSION_STATE_FILE)) {
    try {
      const state = JSON.parse(fs.readFileSync(SESSION_STATE_FILE, 'utf8'));
      if (state.current_sd) {
        return state.current_sd;
      }
    } catch (_error) {
      // Ignore parsing errors
    }
  }

  // Try git branch
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    const sdMatch = branch.match(/SD-[A-Z0-9-]+/i);
    if (sdMatch) {
      return sdMatch[0].toUpperCase();
    }
  } catch (_error) {
    // Git command failed
  }

  return null;
}

/**
 * Check if file path is always allowed (no PRD check needed)
 */
function isAlwaysAllowedFile(filePath) {
  if (!filePath) return true;

  const normalizedPath = filePath.replace(/\\/g, '/');

  return ALWAYS_ALLOWED_PATTERNS.some(pattern => pattern.test(normalizedPath));
}

/**
 * Check if SD type requires PRD
 */
function requiresPRD(sdType) {
  const normalizedType = (sdType || 'feature').toLowerCase();
  return PRD_REQUIRED_TYPES.includes(normalizedType);
}

/**
 * Check if PRD exists for the SD
 */
async function checkPRDExists(sdKey) {
  const supabase = getSupabase();
  if (!supabase) {
    // No database connection, allow operation (fail-open)
    console.log('[database-first] Warning: No database connection, allowing operation');
    return { exists: true, reason: 'no_database' };
  }

  try {
    // First get the SD
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, sd_type, title')
      .eq('sd_key', sdKey)
      .single();

    if (sdError || !sd) {
      // SD not found, allow operation (might be new work)
      return { exists: true, reason: 'sd_not_found', sdKey };
    }

    // Check if PRD is required for this SD type
    if (!requiresPRD(sd.sd_type)) {
      return {
        exists: true,
        reason: 'prd_not_required',
        sdType: sd.sd_type,
        sdKey
      };
    }

    // Check if PRD exists
    const { data: prd, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('id, title, status')
      .eq('sd_id', sd.id)
      .single();

    if (prdError || !prd) {
      return {
        exists: false,
        reason: 'prd_missing',
        sdType: sd.sd_type,
        sdKey,
        sdTitle: sd.title,
        sdId: sd.id
      };
    }

    // Check PRD status
    const validStatuses = ['approved', 'ready_for_exec', 'completed', 'planning'];
    if (!validStatuses.includes(prd.status)) {
      return {
        exists: false,
        reason: 'prd_status_invalid',
        sdType: sd.sd_type,
        sdKey,
        prdStatus: prd.status,
        prdId: prd.id
      };
    }

    return {
      exists: true,
      reason: 'prd_exists',
      sdType: sd.sd_type,
      sdKey,
      prdId: prd.id,
      prdStatus: prd.status
    };
  } catch (error) {
    // Query error, allow operation (fail-open)
    console.log(`[database-first] Warning: Query error: ${error.message}`);
    return { exists: true, reason: 'query_error', error: error.message };
  }
}

/**
 * Main hook execution
 */
async function main() {
  // Get tool input from environment
  const toolInput = process.env.CLAUDE_TOOL_INPUT || '';
  const toolName = process.env.CLAUDE_TOOL_NAME || '';

  // Only check for Edit and Write tools
  if (!['Edit', 'Write'].includes(toolName)) {
    process.exit(0);
  }

  // Parse file path from tool input
  let filePath = '';
  try {
    const input = JSON.parse(toolInput);
    filePath = input.file_path || input.path || '';
  } catch (_e) {
    // Not JSON, might be simple path
    filePath = toolInput;
  }

  // Check if file is always allowed
  if (isAlwaysAllowedFile(filePath)) {
    process.exit(0);
  }

  // Detect current SD
  const sdKey = detectCurrentSD();

  if (!sdKey) {
    // No SD detected, show warning but allow
    console.log('[database-first] Warning: No SD detected - recommend creating an SD first');
    console.log('   Create SD: npm run sd:create OR /leo create');
    process.exit(0);
  }

  // Check if PRD exists
  const prdCheck = await checkPRDExists(sdKey);

  if (prdCheck.exists) {
    // PRD exists or not required, allow operation
    process.exit(0);
  }

  // PRD required but missing - BLOCK
  console.log('\n');
  console.log('DATABASE-FIRST VIOLATION DETECTED');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`   SD: ${prdCheck.sdKey}`);
  console.log(`   SD Type: ${prdCheck.sdType}`);
  console.log(`   Status: ${prdCheck.reason === 'prd_missing' ? 'PRD MISSING' : 'PRD STATUS INVALID'}`);
  console.log('');
  console.log('   LEO Protocol requires PRD before code edits for this SD type.');
  console.log('');
  console.log('   REMEDIATION:');

  if (prdCheck.reason === 'prd_missing') {
    console.log('   1. Create PRD first:');
    console.log(`      node scripts/add-prd-to-database.js ${prdCheck.sdKey}`);
    console.log('');
    console.log('   2. Or run LEAD-TO-PLAN handoff:');
    console.log(`      node scripts/handoff.js execute LEAD-TO-PLAN ${prdCheck.sdKey}`);
  } else {
    console.log('   Update PRD status to approved:');
    console.log(`      node scripts/update-prd-status.js ${prdCheck.prdId} approved`);
  }

  console.log('════════════════════════════════════════════════════════════');
  console.log('');

  // Exit with code 2 to block the tool
  process.exit(2);
}

// Execute
main().catch(err => {
  console.error(`[database-first] Error: ${err.message}`);
  // Fail-open on errors
  process.exit(0);
});
