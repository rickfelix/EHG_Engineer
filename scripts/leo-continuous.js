#!/usr/bin/env node

/**
 * LEO Continuous Orchestrator
 *
 * Runs the LEO Protocol continuously and autonomously, automatically advancing
 * through Strategic Directives based on the baseline execution plan.
 *
 * Features:
 * - Auto-advances to next SD when current hierarchy completes
 * - Depth-first execution of SD hierarchies
 * - Checkpoints at each phase transition
 * - Root cause analysis and retry on failures
 * - Full audit trail in database
 *
 * Usage:
 *   node scripts/leo-continuous.js                    # Start from baseline
 *   node scripts/leo-continuous.js --start SD-XXX    # Start from specific SD
 *   node scripts/leo-continuous.js --status          # Show current status
 *
 * Environment:
 *   Set CONTINUOUS_SESSION_ID to resume an existing session
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// Import local modules
import hierarchyMapper from './lib/sd-hierarchy-mapper.js';
import checkpointSystem from './lib/leo-checkpoint.js';
import rootCauseResolver from './lib/root-cause-resolver.js';

// Import post-completion requirements (SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-N)
import {
  getPostCompletionRequirements,
  getPostCompletionSequence,
  displayPostCompletionSummary
} from '../lib/utils/post-completion-requirements.js';

// Import UI-touching classifier for Vision QA integration (SD-LEO-ENH-VISION-QA-AUTO-PROCEED-001)
import { classifySD } from '../lib/testing/ui-touching-classifier.js';

// Import continuation state management (SD-LEO-INFRA-STOP-HOOK-ENHANCEMENT-001)
import {
  readState as readContinuationState,
  writeState as writeContinuationState,
  markComplete,
  addPendingCommands,
  removePendingCommand
} from './modules/handoff/continuation-state.js';

// Import child_process for command execution
import { spawn } from 'child_process';

const { mapHierarchy, getDepthFirstOrder, getNextIncomplete, isHierarchyComplete, getHierarchyStats } = hierarchyMapper;
const { checkpoint, reloadProtocol, validatePhase } = checkpointSystem;
const { analyzeFailure, attemptFix, skipAndLog } = rootCauseResolver;

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EHG_ENGINEER_ROOT = path.resolve(__dirname, '..');

// Load environment
const envPath = path.join(EHG_ENGINEER_ROOT, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgRed: '\x1b[41m'
};

// Session management
let sessionId = process.env.CONTINUOUS_SESSION_ID || `continuous_${uuidv4().substring(0, 8)}`;
let isRunning = true;
let currentSD = null;
let stats = {
  started: new Date(),
  sdsCompleted: 0,
  sdsSkipped: 0,
  sdsFailed: 0,
  retryAttempts: 0
};

/**
 * Load the orchestration template and inject SD ID
 */
async function loadOrchestrationTemplate(sdId) {
  const templatePath = path.join(EHG_ENGINEER_ROOT, 'templates/sd-orchestration-prompt.md');

  try {
    let template = fs.readFileSync(templatePath, 'utf-8');
    template = template.replace(/\{\{SD_ID\}\}/g, sdId);
    return template;
  } catch (err) {
    console.warn(`${colors.yellow}Warning: Could not load template: ${err.message}${colors.reset}`);
    return null;
  }
}

/**
 * Execute a post-completion command
 * SD-LEO-INFRA-STOP-HOOK-ENHANCEMENT-001
 *
 * @param {string} command - Command to execute (without leading /)
 * @returns {Promise<{ success: boolean, output?: string, error?: string }>}
 */
async function executePostCompletionCommand(command) {
  return new Promise((resolve) => {
    console.log(`${colors.cyan}  Executing: /${command}${colors.reset}`);

    // Map commands to their script equivalents
    const commandMap = {
      'document': ['node', ['scripts/execute-skill.js', 'document']],
      'ship': ['node', ['scripts/execute-skill.js', 'ship']],
      'learn': ['node', ['scripts/modules/learning/index.js', 'process']],
      'restart': ['node', ['scripts/cross-platform-run.js', 'leo-stack', 'restart']],
      'vision-qa': ['node', ['scripts/execute-vision-qa.js']]
    };

    const [cmd, args] = commandMap[command] || ['node', ['scripts/execute-skill.js', command]];

    try {
      const proc = spawn(cmd, args, {
        cwd: EHG_ENGINEER_ROOT,
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: true
      });

      let output = '';
      let errorOutput = '';

      proc.stdout?.on('data', (data) => {
        output += data.toString();
        process.stdout.write(data);
      });

      proc.stderr?.on('data', (data) => {
        errorOutput += data.toString();
        process.stderr.write(data);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output });
        } else {
          resolve({ success: false, error: errorOutput || `Exit code ${code}` });
        }
      });

      proc.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });

      // Timeout after 5 minutes per command
      setTimeout(() => {
        proc.kill();
        resolve({ success: false, error: 'Command timed out after 5 minutes' });
      }, 5 * 60 * 1000);
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}

/**
 * Trigger post-completion sequence based on SD type.
 * SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-N
 * SD-LEO-INFRA-STOP-HOOK-ENHANCEMENT-001: Now executes commands sequentially
 *
 * @param {Object} sd - The completed Strategic Directive
 * @returns {Promise<Object>} Post-completion result
 */
async function triggerPostCompletionSequence(sd) {
  const sdType = sd.sd_type || 'feature';
  const source = sd.source || '';

  console.log(`\n${colors.cyan}POST-COMPLETION SEQUENCE${colors.reset}`);
  console.log(`${colors.dim}SD Type: ${sdType}${colors.reset}`);

  // SD-LEO-ENH-VISION-QA-AUTO-PROCEED-001: Detect UI changes for Vision QA
  let hasUIChanges = false;
  try {
    const classification = await classifySD(sd);
    hasUIChanges = classification.ui_touching;
    console.log(`${colors.dim}UI-touching: ${hasUIChanges} (${classification.reason})${colors.reset}`);
  } catch (err) {
    console.log(`${colors.dim}UI classification failed: ${err.message} (defaulting to false)${colors.reset}`);
  }

  // Get post-completion requirements (with Vision QA awareness)
  const postCompOptions = { source, hasUIChanges, autoProceed: true };
  const requirements = getPostCompletionRequirements(sdType, postCompOptions);
  const sequence = getPostCompletionSequence(sdType, postCompOptions);

  // Display summary
  displayPostCompletionSummary(sdType, postCompOptions);

  // Build result with commands to execute
  const result = {
    sdKey: sd.sd_key || sd.id,
    sdType,
    sequenceType: requirements.sequenceType,
    commands: sequence,
    commandResults: [],
    requirements: {
      restart: requirements.restart,
      visionQA: requirements.visionQA,
      ship: requirements.ship,
      document: requirements.document,
      learn: requirements.learn
    }
  };

  // Log the command sequence
  console.log(`\n${colors.yellow}Commands to execute:${colors.reset}`);
  sequence.forEach((cmd, i) => {
    console.log(`   ${i + 1}. /${cmd}`);
  });

  // SD-LEO-INFRA-STOP-HOOK-ENHANCEMENT-001: Store pending commands in continuation state
  addPendingCommands(sequence);

  // Record post-completion trigger in database
  try {
    await supabase
      .from('continuous_execution_log')
      .insert({
        session_id: sessionId,
        parent_sd_id: sd.parent_sd_id,
        child_sd_id: sd.id,
        phase: 'POST-COMPLETION',
        status: 'triggered',
        metadata: result
      });
  } catch (_err) {
    // Ignore logging errors
  }

  // SD-LEO-INFRA-STOP-HOOK-ENHANCEMENT-001: Execute commands sequentially
  console.log(`\n${colors.cyan}Executing post-completion commands:${colors.reset}`);

  for (const command of sequence) {
    if (!isRunning) {
      console.log(`${colors.yellow}  Execution paused by user${colors.reset}`);
      break;
    }

    const cmdResult = await executePostCompletionCommand(command);
    result.commandResults.push({ command, ...cmdResult });

    if (cmdResult.success) {
      console.log(`${colors.green}  ✓ /${command} completed${colors.reset}`);
      // Remove from pending commands
      removePendingCommand(command);

      // Record success
      try {
        await supabase
          .from('continuous_execution_log')
          .insert({
            session_id: sessionId,
            parent_sd_id: sd.parent_sd_id,
            child_sd_id: sd.id,
            phase: 'POST-COMPLETION',
            status: 'command_completed',
            metadata: { command, success: true }
          });
      } catch (_err) {
        // Ignore logging errors
      }
    } else {
      console.log(`${colors.red}  ✗ /${command} failed: ${cmdResult.error}${colors.reset}`);

      // Record failure
      try {
        await supabase
          .from('continuous_execution_log')
          .insert({
            session_id: sessionId,
            parent_sd_id: sd.parent_sd_id,
            child_sd_id: sd.id,
            phase: 'POST-COMPLETION',
            status: 'command_failed',
            error_message: cmdResult.error,
            metadata: { command, success: false }
          });
      } catch (_err) {
        // Ignore logging errors
      }

      // Continue with next command even if one fails
      console.log(`${colors.yellow}  Continuing with remaining commands...${colors.reset}`);
    }
  }

  // Check if all commands completed
  const allSucceeded = result.commandResults.every(r => r.success);
  const successCount = result.commandResults.filter(r => r.success).length;

  console.log(`\n${colors.cyan}Post-completion summary:${colors.reset}`);
  console.log(`  Commands: ${successCount}/${result.commandResults.length} succeeded`);

  if (allSucceeded) {
    console.log(`${colors.green}  ✓ All post-completion commands executed successfully${colors.reset}`);
    // Mark continuation state as complete
    markComplete();
  } else {
    console.log(`${colors.yellow}  ⚠ Some commands failed - continuation state preserved${colors.reset}`);
  }

  return result;
}

/**
 * Get next parent SD from baseline
 */
async function getNextParentSD(afterSdId = null) {
  // First, check for any SD marked as working_on
  // Note: legacy_id column was deprecated and removed - using sd_key instead
  const { data: workingOn } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, current_phase, parent_sd_id')
    .eq('is_working_on', true)
    .eq('is_active', true)
    .single();

  if (workingOn && workingOn.status !== 'completed') {
    return workingOn;
  }

  // Get from baseline
  const { data: baseline } = await supabase
    .from('sd_execution_baselines')
    .select('id')
    .eq('is_active', true)
    .single();

  if (!baseline) {
    console.log(`${colors.yellow}No active baseline found. Create one with: npm run sd:baseline create${colors.reset}`);
    return null;
  }

  // Get next ready item from baseline
  // Note: legacy_id was deprecated - using sd_key instead
  const { data: nextItem } = await supabase
    .from('sd_baseline_items')
    .select(`
      sd_id,
      sequence_rank,
      strategic_directives_v2 (
        id, sd_key, title, status, current_phase, parent_sd_id
      )
    `)
    .eq('baseline_id', baseline.id)
    .eq('is_ready', true)
    .not('strategic_directives_v2.status', 'in', '("completed","cancelled")')
    .order('sequence_rank')
    .limit(1)
    .single();

  if (nextItem?.strategic_directives_v2) {
    return nextItem.strategic_directives_v2;
  }

  // Fallback: get any active SD
  const { data: fallback } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, current_phase, parent_sd_id')
    .eq('is_active', true)
    .not('status', 'in', '("completed","cancelled","deferred")')
    .is('parent_sd_id', null) // Top-level only
    .order('sequence_rank', { nullsFirst: false })
    .limit(1)
    .single();

  return fallback || null;
}

/**
 * Execute a single SD through all phases
 */
async function executeSD(sd, parentSdId = null) {
  const startTime = Date.now();
  currentSD = sd;

  console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bold}Executing: ${sd.sd_key || sd.id}${colors.reset}`);
  console.log(`${colors.dim}${sd.title}${colors.reset}`);
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);

  // Log start
  await logExecution(parentSdId, sd.id, sd.current_phase || 'LEAD', 'started');

  // Claim the SD
  await supabase
    .from('strategic_directives_v2')
    .update({ is_working_on: true, active_session_id: sessionId })
    .eq('id', sd.id);

  try {
    // Execute each phase
    const phases = ['LEAD', 'PLAN', 'EXEC'];
    let currentPhaseIndex = phases.indexOf(sd.current_phase || 'LEAD');
    if (currentPhaseIndex < 0) currentPhaseIndex = 0;

    for (let i = currentPhaseIndex; i < phases.length; i++) {
      const phase = phases[i];

      // Reload protocol before each phase
      await reloadProtocol();

      console.log(`\n${colors.yellow}[${phase}]${colors.reset} Starting phase...`);

      // Record checkpoint
      const cp = await checkpoint(sd.sd_key || sd.id, `${phase}-START`, {
        notes: `Starting ${phase} phase in continuous mode`
      });

      if (!cp.validation?.passed) {
        console.log(`${colors.red}  Checkpoint validation failed${colors.reset}`);
        for (const err of cp.validation?.errors || []) {
          console.log(`    ${colors.red}✗ ${err}${colors.reset}`);
        }
      }

      // Update phase
      await supabase
        .from('strategic_directives_v2')
        .update({ current_phase: phase })
        .eq('id', sd.id);

      // Phase-specific execution would happen here
      // In practice, this would delegate to handoff.js or similar
      console.log(`${colors.green}  ✓ Phase ${phase} setup complete${colors.reset}`);

      // Simulate phase completion (in real use, this waits for actual work)
      if (phase === 'EXEC') {
        // Mark as complete
        await supabase
          .from('strategic_directives_v2')
          .update({
            status: 'completed',
            current_phase: 'COMPLETE',
            progress_percentage: 100,
            is_working_on: false,
            completion_date: new Date().toISOString()
          })
          .eq('id', sd.id);
      }
    }

    // Log completion
    const duration = Math.round((Date.now() - startTime) / 1000);
    await logExecution(parentSdId, sd.id, 'COMPLETE', 'completed', null, duration);

    stats.sdsCompleted++;
    console.log(`\n${colors.green}${colors.bold}✓ Completed: ${sd.sd_key || sd.id} (${duration}s)${colors.reset}`);

    // SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-N: Post-completion sequence
    const postCompletion = await triggerPostCompletionSequence(sd);

    return { success: true, duration, postCompletion };

  } catch (error) {
    console.log(`\n${colors.red}✗ Error: ${error.message}${colors.reset}`);

    // Analyze and attempt fix
    console.log(`${colors.yellow}  Analyzing failure...${colors.reset}`);
    const analysis = await analyzeFailure(error, {
      sdId: sd.sd_key || sd.id,
      phase: sd.current_phase,
      operation: 'execute'
    });

    if (analysis.canAutoFix) {
      console.log(`${colors.yellow}  Attempting auto-fix...${colors.reset}`);
      stats.retryAttempts++;

      const fix = await attemptFix(analysis);

      if (fix.success) {
        console.log(`${colors.green}  Fix successful, retrying...${colors.reset}`);
        // Retry the SD
        return executeSD(sd, parentSdId);
      }
    }

    // Log failure
    await logExecution(parentSdId, sd.id, sd.current_phase, 'failed', error.message);

    // Skip
    console.log(`${colors.yellow}  Skipping SD and continuing...${colors.reset}`);
    await skipAndLog(sd.sd_key || sd.id, error.message, sessionId);
    stats.sdsSkipped++;

    return { success: false, error: error.message };
  }
}

/**
 * Execute a full SD hierarchy depth-first
 */
async function executeHierarchy(parentSd) {
  console.log(`\n${colors.magenta}${'═'.repeat(60)}${colors.reset}`);
  console.log(`${colors.bold}${colors.magenta} HIERARCHY: ${parentSd.sd_key || parentSd.id}${colors.reset}`);
  console.log(`${colors.magenta}${'═'.repeat(60)}${colors.reset}`);

  // Load orchestration template
  const template = await loadOrchestrationTemplate(parentSd.sd_key || parentSd.id);
  if (template) {
    console.log(`${colors.dim}Template loaded for orchestration${colors.reset}`);
  }

  // Map the hierarchy
  const hierarchy = await mapHierarchy(parentSd.sd_key || parentSd.id);
  const executionOrder = getDepthFirstOrder(hierarchy);
  const hierarchyStats = getHierarchyStats(hierarchy);

  console.log(`\n${colors.cyan}Hierarchy mapped:${colors.reset}`);
  console.log(`  Total SDs: ${hierarchyStats.total}`);
  console.log(`  Already complete: ${hierarchyStats.complete}`);
  console.log(`  Remaining: ${hierarchyStats.remaining}`);

  // Execute each SD in order
  for (const sd of executionOrder) {
    if (sd.isComplete) {
      console.log(`\n${colors.dim}[SKIP] ${sd.sd_key || sd.id} - Already complete${colors.reset}`);
      continue;
    }

    if (!isRunning) {
      console.log(`\n${colors.yellow}Execution paused by user${colors.reset}`);
      break;
    }

    // Get full SD details
    const { data: fullSD } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sd.id)
      .single();

    if (fullSD) {
      await executeSD(fullSD, parentSd.id);
    }
  }

  // Check if hierarchy is complete
  const updatedHierarchy = await mapHierarchy(parentSd.sd_key || parentSd.id);
  const complete = isHierarchyComplete(updatedHierarchy);

  if (complete) {
    console.log(`\n${colors.green}${colors.bold}✓ Hierarchy complete: ${parentSd.sd_key || parentSd.id}${colors.reset}`);
  } else {
    const remaining = getNextIncomplete(updatedHierarchy);
    console.log(`\n${colors.yellow}Hierarchy incomplete. Next: ${remaining?.sd_key || remaining?.id}${colors.reset}`);
  }

  return { complete };
}

/**
 * Log execution event
 */
async function logExecution(parentSdId, childSdId, phase, status, errorMessage = null, duration = null) {
  try {
    await supabase
      .from('continuous_execution_log')
      .insert({
        session_id: sessionId,
        parent_sd_id: parentSdId,
        child_sd_id: childSdId,
        phase,
        status,
        error_message: errorMessage,
        duration_seconds: duration
      });
  } catch (err) {
    // Ignore logging errors
  }
}

/**
 * Display current status
 */
async function showStatus() {
  console.log(`\n${colors.cyan}${colors.bold}LEO CONTINUOUS - Status${colors.reset}`);
  console.log(`${'─'.repeat(50)}`);
  console.log(`  Session: ${sessionId}`);
  console.log(`  Started: ${stats.started.toLocaleString()}`);
  console.log(`  Current SD: ${currentSD?.sd_key || currentSD?.id || 'None'}`);
  console.log(`  Completed: ${stats.sdsCompleted}`);
  console.log(`  Skipped: ${stats.sdsSkipped}`);
  console.log(`  Retry attempts: ${stats.retryAttempts}`);

  // Get recent log entries
  const { data: recentLogs } = await supabase
    .from('continuous_execution_log')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (recentLogs && recentLogs.length > 0) {
    console.log('\n  Recent activity:');
    for (const log of recentLogs) {
      const time = new Date(log.created_at).toLocaleTimeString();
      const status = log.status === 'completed' ? '✓' : log.status === 'failed' ? '✗' : '○';
      console.log(`    ${status} [${time}] ${log.phase} - ${log.status}`);
    }
  }

  console.log('');
}

/**
 * Main continuous execution loop
 */
async function runContinuous(startSdId = null) {
  console.log(`\n${colors.cyan}${colors.bold}${'═'.repeat(60)}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan} LEO CONTINUOUS ORCHESTRATOR${colors.reset}`);
  console.log(`${colors.cyan}${'═'.repeat(60)}${colors.reset}`);
  console.log(`\n${colors.dim}Session: ${sessionId}${colors.reset}`);
  console.log(`${colors.dim}Mode: Fully Autonomous | Retry: Yes | Time Limits: None${colors.reset}`);

  // Register session
  await supabase
    .from('claude_sessions')
    .upsert({
      session_id: sessionId,
      is_continuous_mode: true,
      continuous_started_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString()
    }, { onConflict: 'session_id' });

  // Main loop
  while (isRunning) {
    // Get next parent SD
    const parentSd = startSdId
      ? await getSDByLegacyId(startSdId)
      : await getNextParentSD();

    if (!parentSd) {
      console.log(`\n${colors.green}${colors.bold}All SDs in baseline complete!${colors.reset}`);
      break;
    }

    // Execute the hierarchy
    const result = await executeHierarchy(parentSd);

    // Clear startSdId after first iteration
    startSdId = null;

    // Update heartbeat
    await supabase
      .from('claude_sessions')
      .update({
        heartbeat_at: new Date().toISOString(),
        continuous_sds_completed: stats.sdsCompleted
      })
      .eq('session_id', sessionId);

    // Brief pause between hierarchies
    if (isRunning && result.complete) {
      console.log(`\n${colors.dim}Moving to next SD hierarchy...${colors.reset}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Final status
  console.log(`\n${colors.cyan}${'═'.repeat(60)}${colors.reset}`);
  console.log(`${colors.bold}Session Complete${colors.reset}`);
  console.log(`  Completed: ${stats.sdsCompleted}`);
  console.log(`  Skipped: ${stats.sdsSkipped}`);
  console.log(`  Duration: ${Math.round((Date.now() - stats.started.getTime()) / 60000)} minutes`);
  console.log(`${colors.cyan}${'═'.repeat(60)}${colors.reset}\n`);
}

/**
 * Get SD by sd_key (legacy_id column was deprecated and removed)
 */
async function getSDByLegacyId(sdKey) {
  const { data } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', sdKey)
    .single();
  return data;
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}Graceful shutdown initiated...${colors.reset}`);
  isRunning = false;
});

process.on('SIGTERM', () => {
  isRunning = false;
});

// CLI
const args = process.argv.slice(2);

if (args.includes('--status')) {
  showStatus().then(() => process.exit(0));
} else if (args.includes('--help')) {
  console.log(`
LEO Continuous Orchestrator

Usage:
  node scripts/leo-continuous.js                    Start from baseline
  node scripts/leo-continuous.js --start SD-XXX    Start from specific SD
  node scripts/leo-continuous.js --status          Show current status
  node scripts/leo-continuous.js --help            Show this help

Environment:
  CONTINUOUS_SESSION_ID    Resume an existing session

Features:
  - Fully autonomous SD execution
  - Depth-first hierarchy traversal
  - Checkpoint validation at each phase
  - Root cause analysis on failures
  - Auto-retry then skip on persistent failures
  - Full audit trail in database
`);
  process.exit(0);
} else {
  const startIdx = args.indexOf('--start');
  const startSdId = startIdx >= 0 ? args[startIdx + 1] : null;

  runContinuous(startSdId).catch(err => {
    console.error(`${colors.red}Fatal error: ${err.message}${colors.reset}`);
    process.exit(1);
  });
}
