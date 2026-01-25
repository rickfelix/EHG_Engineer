#!/usr/bin/env node

/**
 * Handoff Enforcement PreToolUse Hook
 *
 * PreToolUse hook for Bash commands containing git commit/push.
 * Checks that required handoffs exist before allowing commits.
 * Blocks with exit(2) and provides handoff.js remediation command.
 *
 * Hook Type: PreToolUse (matcher: Bash)
 *
 * Created: 2026-01-22
 * SD: SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-I
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
 * Handoff requirements by SD type
 * Maps SD types to minimum required handoffs before commits
 */
const HANDOFF_REQUIREMENTS = {
  feature: {
    minHandoffs: 3,
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC'],
    optional: ['EXEC-TO-PLAN', 'PLAN-TO-LEAD']
  },
  bugfix: {
    minHandoffs: 2,
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC'],
    optional: []
  },
  security: {
    minHandoffs: 3,
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC'],
    optional: ['EXEC-TO-PLAN']
  },
  infrastructure: {
    minHandoffs: 2,
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC'],
    optional: []
  },
  enhancement: {
    minHandoffs: 2,
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC'],
    optional: []
  },
  documentation: {
    minHandoffs: 1,
    required: ['LEAD-TO-PLAN'],
    optional: []
  },
  orchestrator: {
    minHandoffs: 1,
    required: ['LEAD-TO-PLAN'],
    optional: []
  },
  refactor: {
    minHandoffs: 2,
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC'],
    optional: []
  },
  performance: {
    minHandoffs: 2,
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC'],
    optional: []
  }
};

/**
 * Git commands that should trigger handoff validation
 */
const GIT_COMMIT_PATTERNS = [
  /git\s+commit/i,
  /git\s+push/i,
  /gh\s+pr\s+create/i,
  /gh\s+pr\s+merge/i
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

    // Match SD pattern (e.g., SD-FEATURE-001)
    const sdMatch = branch.match(/SD-[A-Z]+-(?:[A-Z]+-)*[0-9]+/i);
    if (sdMatch) {
      return sdMatch[0].toUpperCase();
    }
  } catch (_error) {
    // Git command failed
  }

  return null;
}

/**
 * Check if command is a git commit/push operation
 */
function isGitCommitOperation(command) {
  if (!command) return false;
  return GIT_COMMIT_PATTERNS.some(pattern => pattern.test(command));
}

/**
 * Get handoff requirements for SD type
 */
function getHandoffRequirements(sdType) {
  const normalizedType = (sdType || 'feature').toLowerCase();
  return HANDOFF_REQUIREMENTS[normalizedType] || HANDOFF_REQUIREMENTS.feature;
}

/**
 * Validate handoffs for the SD
 */
async function validateHandoffs(sdKey) {
  const supabase = getSupabase();
  if (!supabase) {
    // No database connection, allow operation (fail-open)
    console.log('[handoff-enforcement] Warning: No database connection, allowing operation');
    return { valid: true, reason: 'no_database' };
  }

  try {
    // Get SD details
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, sd_type, title, current_phase')
      .or(`sd_key.eq.${sdKey},sd_key.eq.${sdKey}`)
      .single();

    if (sdError || !sd) {
      // SD not found, allow operation
      return { valid: true, reason: 'sd_not_found', sdKey };
    }

    // Get requirements for this SD type
    const requirements = getHandoffRequirements(sd.sd_type);

    // Get accepted handoffs for this SD
    const { data: handoffs, error: handoffsError } = await supabase
      .from('sd_phase_handoffs')
      .select('handoff_type, status')
      .eq('sd_id', sd.id)
      .eq('status', 'accepted');

    if (handoffsError) {
      console.log(`[handoff-enforcement] Warning: Query error: ${handoffsError.message}`);
      return { valid: true, reason: 'query_error' };
    }

    const acceptedTypes = (handoffs || []).map(h => h.handoff_type);

    // Check required handoffs
    const missingRequired = requirements.required.filter(
      req => !acceptedTypes.includes(req)
    );

    // Check minimum handoff count
    const handoffCount = acceptedTypes.length;
    const hasMinHandoffs = handoffCount >= requirements.minHandoffs;

    if (missingRequired.length > 0 || !hasMinHandoffs) {
      return {
        valid: false,
        reason: 'missing_handoffs',
        sdKey,
        sdType: sd.sd_type,
        sdTitle: sd.title,
        sdId: sd.id,
        currentPhase: sd.current_phase,
        requirements,
        acceptedHandoffs: acceptedTypes,
        missingRequired,
        handoffCount
      };
    }

    return {
      valid: true,
      reason: 'handoffs_complete',
      sdKey,
      sdType: sd.sd_type,
      handoffCount,
      acceptedHandoffs: acceptedTypes
    };
  } catch (error) {
    console.log(`[handoff-enforcement] Warning: Error: ${error.message}`);
    return { valid: true, reason: 'error', error: error.message };
  }
}

/**
 * Main hook execution
 */
async function main() {
  // Get tool input from environment
  const toolInput = process.env.CLAUDE_TOOL_INPUT || '';
  const toolName = process.env.CLAUDE_TOOL_NAME || '';

  // Only check for Bash tool
  if (toolName !== 'Bash') {
    process.exit(0);
  }

  // Parse command from tool input
  let command = '';
  try {
    const input = JSON.parse(toolInput);
    command = input.command || '';
  } catch (_e) {
    command = toolInput;
  }

  // Check if this is a git commit operation
  if (!isGitCommitOperation(command)) {
    process.exit(0);
  }

  // Detect current SD
  const sdKey = detectCurrentSD();

  if (!sdKey) {
    // No SD detected, allow operation with warning
    console.log('[handoff-enforcement] Warning: No SD detected for git operation');
    process.exit(0);
  }

  // Validate handoffs
  const validation = await validateHandoffs(sdKey);

  if (validation.valid) {
    process.exit(0);
  }

  // Handoffs not complete - BLOCK
  console.log('\n');
  console.log('HANDOFF ENFORCEMENT VIOLATION');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`   SD: ${validation.sdKey}`);
  console.log(`   SD Type: ${validation.sdType}`);
  console.log(`   Current Phase: ${validation.currentPhase}`);
  console.log(`   Required Handoffs: ${validation.requirements.minHandoffs}`);
  console.log(`   Accepted Handoffs: ${validation.handoffCount}`);
  console.log('');

  if (validation.missingRequired.length > 0) {
    console.log('   Missing Required Handoffs:');
    validation.missingRequired.forEach(h => console.log(`      - ${h}`));
    console.log('');
  }

  console.log('   LEO Protocol requires handoffs before committing code changes.');
  console.log('');
  console.log('   REMEDIATION:');

  const nextHandoff = validation.missingRequired[0] || 'PLAN-TO-EXEC';
  console.log('   Run the next required handoff:');
  console.log(`      node scripts/handoff.js execute ${nextHandoff} ${validation.sdKey}`);

  console.log('════════════════════════════════════════════════════════════');
  console.log('');

  // Output JSON for Claude to parse
  const output = {
    decision: 'block',
    reason: `SD ${validation.sdKey} (${validation.sdType}) requires handoffs before commits`,
    details: {
      sd_key: validation.sdKey,
      sd_type: validation.sdType,
      current_phase: validation.currentPhase,
      required_handoffs: validation.requirements.minHandoffs,
      accepted_handoffs: validation.handoffCount,
      accepted_types: validation.acceptedHandoffs,
      missing_required: validation.missingRequired
    },
    remediation: {
      next_handoff: nextHandoff,
      command: `node scripts/handoff.js execute ${nextHandoff} ${validation.sdKey}`
    }
  };

  console.log(JSON.stringify(output));

  // Exit with code 2 to block the tool
  process.exit(2);
}

// Execute
main().catch(err => {
  console.error(`[handoff-enforcement] Error: ${err.message}`);
  // Fail-open on errors
  process.exit(0);
});
