/**
 * LEO Protocol Checkpoint System
 *
 * Provides checkpoint validation at each phase transition in continuous execution.
 * Re-reads CLAUDE.md, validates work against requirements, and logs checkpoints.
 *
 * Usage:
 *   import { checkpoint, reloadProtocol, validatePhase } from './leo-checkpoint.js';
 *
 *   await checkpoint(sdId, 'LEAD-TO-PLAN', { notes: 'PRD generated' });
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';

// Load environment
const envPath = '/mnt/c/_EHG/EHG_Engineer/.env';
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Protocol file paths
const PROTOCOL_FILES = {
  'CLAUDE.md': '/mnt/c/_EHG/EHG_Engineer/CLAUDE.md',
  'CLAUDE_CORE.md': '/mnt/c/_EHG/EHG_Engineer/CLAUDE_CORE.md',
  'CLAUDE_LEAD.md': '/mnt/c/_EHG/EHG_Engineer/CLAUDE_LEAD.md',
  'CLAUDE_PLAN.md': '/mnt/c/_EHG/EHG_Engineer/CLAUDE_PLAN.md',
  'CLAUDE_EXEC.md': '/mnt/c/_EHG/EHG_Engineer/CLAUDE_EXEC.md'
};

// Protocol version cache
let protocolCache = null;
let protocolCacheTime = null;
const CACHE_TTL = 60000; // 1 minute

/**
 * Reload and parse protocol files
 *
 * @returns {Object} Protocol data with file contents and metadata
 */
export async function reloadProtocol() {
  const now = Date.now();

  // Return cache if still valid
  if (protocolCache && protocolCacheTime && (now - protocolCacheTime) < CACHE_TTL) {
    return protocolCache;
  }

  const protocol = {
    version: null,
    files: {},
    hashes: {},
    loadedAt: new Date().toISOString()
  };

  for (const [name, path] of Object.entries(PROTOCOL_FILES)) {
    try {
      if (fs.existsSync(path)) {
        const content = fs.readFileSync(path, 'utf-8');
        protocol.files[name] = content;
        protocol.hashes[name] = crypto.createHash('md5').update(content).digest('hex');

        // Extract version from CLAUDE.md
        if (name === 'CLAUDE.md') {
          const versionMatch = content.match(/LEO PROTOCOL VERSION:\s*([\d.]+)/i);
          if (versionMatch) {
            protocol.version = versionMatch[1];
          }
        }
      }
    } catch (err) {
      console.warn(`Warning: Could not read ${name}: ${err.message}`);
    }
  }

  // Create combined hash for all files
  protocol.combinedHash = crypto
    .createHash('md5')
    .update(Object.values(protocol.hashes).join(''))
    .digest('hex');

  protocolCache = protocol;
  protocolCacheTime = now;

  return protocol;
}

/**
 * Validate phase requirements
 *
 * @param {string} sdId - SD legacy_id or UUID
 * @param {string} phase - Current phase (LEAD, PLAN, EXEC)
 * @returns {Object} Validation result
 */
export async function validatePhase(sdId, phase) {
  const result = {
    passed: true,
    phase,
    checks: [],
    warnings: [],
    errors: []
  };

  // Get SD details
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .or(`legacy_id.eq.${sdId},id.eq.${sdId}`)
    .single();

  if (error || !sd) {
    result.passed = false;
    result.errors.push(`SD not found: ${sdId}`);
    return result;
  }

  // Phase-specific validation
  switch (phase) {
    case 'LEAD':
      result.checks = validateLeadPhase(sd);
      break;
    case 'PLAN':
      result.checks = await validatePlanPhase(sd);
      break;
    case 'EXEC':
      result.checks = await validateExecPhase(sd);
      break;
    case 'COMPLETE':
      result.checks = await validateComplete(sd);
      break;
    default:
      result.warnings.push(`Unknown phase: ${phase}`);
  }

  // Aggregate results
  for (const check of result.checks) {
    if (!check.passed) {
      result.passed = false;
      result.errors.push(check.message);
    } else if (check.warning) {
      result.warnings.push(check.message);
    }
  }

  return result;
}

/**
 * LEAD phase validation
 */
function validateLeadPhase(sd) {
  const checks = [];

  // Title exists
  checks.push({
    name: 'title_exists',
    passed: !!sd.title,
    message: sd.title ? 'Title present' : 'Missing title'
  });

  // Category assigned
  checks.push({
    name: 'category_assigned',
    passed: !!sd.category,
    message: sd.category ? `Category: ${sd.category}` : 'Missing category',
    warning: !sd.category
  });

  // SD type assigned
  checks.push({
    name: 'type_assigned',
    passed: !!sd.sd_type,
    message: sd.sd_type ? `Type: ${sd.sd_type}` : 'Missing SD type',
    warning: !sd.sd_type
  });

  return checks;
}

/**
 * PLAN phase validation
 */
async function validatePlanPhase(sd) {
  const checks = [];

  // Check for PRD
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('id, status, sections')
    .eq('sd_id', sd.id)
    .single();

  checks.push({
    name: 'prd_exists',
    passed: !!prd,
    message: prd ? 'PRD exists' : 'No PRD found'
  });

  if (prd) {
    // PRD has content
    const hasContent = prd.sections && Object.keys(prd.sections).length > 0;
    checks.push({
      name: 'prd_has_content',
      passed: hasContent,
      message: hasContent ? 'PRD has content' : 'PRD is empty'
    });
  }

  return checks;
}

/**
 * EXEC phase validation
 */
async function validateExecPhase(sd) {
  const checks = [];

  // Check for handoff records
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('id, transition_type, status')
    .eq('sd_id', sd.id)
    .order('created_at', { ascending: false });

  const hasHandoffs = handoffs && handoffs.length > 0;
  checks.push({
    name: 'handoffs_exist',
    passed: hasHandoffs,
    message: hasHandoffs ? `${handoffs.length} handoff(s) recorded` : 'No handoffs recorded'
  });

  // Check PLAN-TO-EXEC transition occurred
  const planToExec = handoffs?.find(h => h.transition_type === 'PLAN-TO-EXEC');
  checks.push({
    name: 'plan_to_exec_complete',
    passed: !!planToExec,
    message: planToExec ? 'PLAN-TO-EXEC completed' : 'PLAN-TO-EXEC not found',
    warning: !planToExec
  });

  return checks;
}

/**
 * Completion validation
 */
async function validateComplete(sd) {
  const checks = [];

  // Status is completed
  checks.push({
    name: 'status_complete',
    passed: sd.status === 'completed',
    message: sd.status === 'completed' ? 'Status: completed' : `Status: ${sd.status}`
  });

  // Progress is 100%
  checks.push({
    name: 'progress_complete',
    passed: sd.progress_percentage === 100,
    message: `Progress: ${sd.progress_percentage || 0}%`
  });

  return checks;
}

/**
 * Record a checkpoint in the database
 *
 * @param {string} sdId - SD legacy_id or UUID
 * @param {string} transition - Transition type (e.g., 'LEAD-TO-PLAN')
 * @param {Object} options - Additional options
 * @returns {Object} Checkpoint record
 */
export async function checkpoint(sdId, transition, options = {}) {
  // Reload protocol to ensure fresh state
  const protocol = await reloadProtocol();

  // Determine phase from transition
  const phase = transition.split('-')[0];

  // Validate current phase
  const validation = await validatePhase(sdId, phase);

  // Get SD UUID
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .or(`legacy_id.eq.${sdId},id.eq.${sdId}`)
    .single();

  // Record checkpoint
  const checkpointRecord = {
    sd_id: sd?.id || sdId,
    phase,
    transition,
    validation_passed: validation.passed,
    protocol_version: protocol.version,
    claude_md_hash: protocol.hashes['CLAUDE.md'],
    validation_details: {
      checks: validation.checks,
      warnings: validation.warnings,
      errors: validation.errors
    },
    notes: options.notes || null
  };

  const { data: record, error } = await supabase
    .from('sd_checkpoint_history')
    .insert(checkpointRecord)
    .select()
    .single();

  if (error) {
    console.warn(`Warning: Could not record checkpoint: ${error.message}`);
    return { ...checkpointRecord, recorded: false, error: error.message };
  }

  return {
    ...record,
    recorded: true,
    validation
  };
}

/**
 * Get checkpoint history for an SD
 *
 * @param {string} sdId - SD legacy_id or UUID
 * @returns {Array} Checkpoint records
 */
export async function getCheckpointHistory(sdId) {
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .or(`legacy_id.eq.${sdId},id.eq.${sdId}`)
    .single();

  if (!sd) return [];

  const { data: checkpoints } = await supabase
    .from('sd_checkpoint_history')
    .select('*')
    .eq('sd_id', sd.id)
    .order('created_at', { ascending: true });

  return checkpoints || [];
}

/**
 * Print checkpoint summary for an SD
 */
export async function printCheckpointSummary(sdId) {
  const history = await getCheckpointHistory(sdId);

  console.log(`\nCheckpoint History for ${sdId}:`);
  console.log('─'.repeat(60));

  if (history.length === 0) {
    console.log('  No checkpoints recorded');
    return;
  }

  for (const cp of history) {
    const status = cp.validation_passed ? '[PASS]' : '[FAIL]';
    const time = new Date(cp.created_at).toLocaleString();
    console.log(`  ${status} ${cp.transition} @ ${time}`);

    if (cp.validation_details?.errors?.length > 0) {
      for (const err of cp.validation_details.errors) {
        console.log(`        Error: ${err}`);
      }
    }
  }

  console.log('');
}

// CLI support
if (process.argv[1].endsWith('leo-checkpoint.js')) {
  const command = process.argv[2];
  const sdId = process.argv[3];

  if (!command) {
    console.log('Usage: node leo-checkpoint.js <command> [sd_id]');
    console.log('');
    console.log('Commands:');
    console.log('  reload              Reload and display protocol info');
    console.log('  validate <sd_id>    Validate an SD\'s current phase');
    console.log('  checkpoint <sd_id>  Record a checkpoint for an SD');
    console.log('  history <sd_id>     Show checkpoint history');
    process.exit(1);
  }

  (async () => {
    try {
      switch (command) {
        case 'reload': {
          const protocol = await reloadProtocol();
          console.log('\nProtocol Information:');
          console.log('─'.repeat(40));
          console.log(`  Version: ${protocol.version || 'Unknown'}`);
          console.log(`  Loaded: ${protocol.loadedAt}`);
          console.log(`  Combined Hash: ${protocol.combinedHash.substring(0, 12)}...`);
          console.log('\n  File Hashes:');
          for (const [name, hash] of Object.entries(protocol.hashes)) {
            console.log(`    ${name}: ${hash.substring(0, 8)}...`);
          }
          break;
        }

        case 'validate': {
          if (!sdId) {
            console.log('Error: SD ID required');
            process.exit(1);
          }
          const result = await validatePhase(sdId, 'EXEC');
          console.log('\nValidation Result:');
          console.log('─'.repeat(40));
          console.log(`  Passed: ${result.passed}`);
          console.log(`  Phase: ${result.phase}`);
          console.log('\n  Checks:');
          for (const check of result.checks) {
            const icon = check.passed ? '✓' : '✗';
            console.log(`    ${icon} ${check.message}`);
          }
          if (result.errors.length > 0) {
            console.log('\n  Errors:');
            for (const err of result.errors) {
              console.log(`    - ${err}`);
            }
          }
          break;
        }

        case 'checkpoint': {
          if (!sdId) {
            console.log('Error: SD ID required');
            process.exit(1);
          }
          const transition = process.argv[4] || 'MANUAL-CHECKPOINT';
          const cp = await checkpoint(sdId, transition);
          console.log('\nCheckpoint Recorded:');
          console.log('─'.repeat(40));
          console.log(`  SD: ${sdId}`);
          console.log(`  Transition: ${transition}`);
          console.log(`  Passed: ${cp.validation?.passed}`);
          console.log(`  Recorded: ${cp.recorded}`);
          break;
        }

        case 'history': {
          if (!sdId) {
            console.log('Error: SD ID required');
            process.exit(1);
          }
          await printCheckpointSummary(sdId);
          break;
        }

        default:
          console.log(`Unknown command: ${command}`);
          process.exit(1);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  })();
}

export default {
  reloadProtocol,
  validatePhase,
  checkpoint,
  getCheckpointHistory,
  printCheckpointSummary
};
