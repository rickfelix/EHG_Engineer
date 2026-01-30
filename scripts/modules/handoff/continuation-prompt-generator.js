/**
 * Continuation Prompt Generator
 *
 * Part of SD-LEO-INFRA-STOP-HOOK-ENHANCEMENT-001
 *
 * Generates context-aware prompts for cross-session continuation:
 * - Includes SD context (ID, phase, progress, type)
 * - Lists pending post-completion commands
 * - Incorporates git state from unified session state
 * - Provides clear resumption instructions
 *
 * @see docs/plans/SD-LEO-INFRA-HARDENING-001-plan.md
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readState as readContinuationState } from './continuation-state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// File paths
const UNIFIED_STATE_FILE = path.join(__dirname, '../../../.claude/unified-session-state.json');
const PROMPT_OUTPUT_FILE = path.join(__dirname, '../../../.claude/continuation-prompt.md');

/**
 * Read unified session state
 * @returns {object|null} Unified state or null if not found
 */
function readUnifiedState() {
  try {
    if (fs.existsSync(UNIFIED_STATE_FILE)) {
      let content = fs.readFileSync(UNIFIED_STATE_FILE, 'utf8');
      // Remove BOM if present
      if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
      }
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn(`[continuation-prompt] Error reading unified state: ${err.message}`);
  }
  return null;
}

/**
 * Generate a continuation prompt based on current state
 * @param {object} options - Generation options
 * @param {object} options.continuationState - Override continuation state (optional)
 * @param {object} options.unifiedState - Override unified state (optional)
 * @returns {string} Generated prompt
 */
export function generateContinuationPrompt(options = {}) {
  const continuationState = options.continuationState || readContinuationState();
  const unifiedState = options.unifiedState || readUnifiedState();

  const lines = [];

  // Header
  lines.push('# LEO Protocol Continuation');
  lines.push('');
  lines.push('This is an automated continuation from a previous session that ended incomplete.');
  lines.push('');

  // Continuation reason
  if (continuationState.reason) {
    const reasonMap = {
      'context_limit': 'The previous session reached its context limit.',
      'session_end': 'The previous session ended before work was complete.',
      'user_interrupt': 'The previous session was interrupted by the user.',
      'error': 'The previous session encountered an error.'
    };
    lines.push(`**Reason**: ${reasonMap[continuationState.reason] || continuationState.reason}`);
    lines.push('');
  }

  // SD Context
  if (continuationState.sd?.id) {
    lines.push('## SD Context');
    lines.push('');
    lines.push(`- **SD ID**: ${continuationState.sd.id}`);
    lines.push(`- **Phase**: ${continuationState.sd.phase || 'Unknown'}`);
    lines.push(`- **Progress**: ${continuationState.sd.progress || 0}%`);
    lines.push(`- **Type**: ${continuationState.sd.type || 'Unknown'}`);
    lines.push('');
  }

  // Last Action
  if (continuationState.lastAction) {
    lines.push('## Last Action');
    lines.push('');
    lines.push(continuationState.lastAction);
    lines.push('');
  }

  // Pending Commands
  if (continuationState.pendingCommands?.length > 0) {
    lines.push('## Pending Commands');
    lines.push('');
    lines.push('The following post-completion commands were pending:');
    lines.push('');
    for (const cmd of continuationState.pendingCommands) {
      lines.push(`1. \`/${cmd}\``);
    }
    lines.push('');
  }

  // Git State (from unified state)
  if (unifiedState?.git) {
    lines.push('## Git State');
    lines.push('');
    lines.push(`- **Branch**: ${unifiedState.git.branch || 'Unknown'}`);

    if (unifiedState.git.recentCommits?.length > 0) {
      lines.push(`- **Latest Commit**: ${unifiedState.git.recentCommits[0]}`);
    }

    if (unifiedState.git.status?.length > 0) {
      const uncommitted = unifiedState.git.status.filter(s => s.startsWith('M ') || s.startsWith('A ') || s.startsWith('?'));
      if (uncommitted.length > 0) {
        lines.push(`- **Uncommitted Changes**: ${uncommitted.length} files`);
      }
    }
    lines.push('');
  }

  // Retry Information
  if (continuationState.retryCount > 0) {
    lines.push('## Retry Information');
    lines.push('');
    lines.push(`- **Retry Count**: ${continuationState.retryCount}/${continuationState.maxRetries}`);
    lines.push(`- **Consecutive Errors**: ${continuationState.consecutiveErrors}`);

    if (continuationState.errorDetails) {
      lines.push(`- **Last Error**: ${continuationState.errorDetails}`);
    }
    lines.push('');
  }

  // Instructions
  lines.push('## Resumption Instructions');
  lines.push('');

  // Determine action based on state
  if (continuationState.status === 'error' || continuationState.status === 'paused') {
    lines.push('The previous session encountered a non-recoverable error. Please:');
    lines.push('');
    lines.push('1. Review the error details above');
    lines.push('2. Determine if manual intervention is needed');
    lines.push('3. Run `/leo resume` to restore context and continue');
    lines.push('');
  } else if (continuationState.pendingCommands?.length > 0) {
    lines.push('Continue with the pending post-completion commands:');
    lines.push('');
    lines.push('1. Run `/leo resume` to restore context');
    lines.push('2. Execute the pending commands in order');
    lines.push('3. Run `/leo next` to show the SD queue');
    lines.push('');
  } else if (continuationState.sd?.id) {
    const phase = continuationState.sd.phase || 'EXEC';
    lines.push(`Continue with SD ${continuationState.sd.id} in ${phase} phase:`);
    lines.push('');
    lines.push('1. Run `/leo resume` to restore context');
    lines.push(`2. Continue the ${phase} phase workflow`);
    lines.push('3. Execute the appropriate handoff when phase completes');
    lines.push('');
  } else {
    lines.push('Resume LEO Protocol workflow:');
    lines.push('');
    lines.push('1. Run `/leo resume` to restore context');
    lines.push('2. Run `/leo next` to see the SD queue');
    lines.push('');
  }

  // AUTO-PROCEED reminder
  lines.push('---');
  lines.push('');
  lines.push('**AUTO-PROCEED**: The session should continue autonomously through the workflow.');
  lines.push('Only stop if encountering blocking errors that require human decision.');
  lines.push('');

  return lines.join('\n');
}

/**
 * Write the continuation prompt to file
 * @param {object} options - Generation options
 * @returns {{ success: boolean, path: string, error?: string }}
 */
export function writeContinuationPrompt(options = {}) {
  try {
    const prompt = generateContinuationPrompt(options);

    const dir = path.dirname(PROMPT_OUTPUT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(PROMPT_OUTPUT_FILE, prompt, 'utf8');

    return { success: true, path: PROMPT_OUTPUT_FILE };
  } catch (err) {
    return { success: false, path: PROMPT_OUTPUT_FILE, error: err.message };
  }
}

/**
 * Read the continuation prompt from file
 * @returns {string|null} Prompt content or null if not found
 */
export function readContinuationPrompt() {
  try {
    if (fs.existsSync(PROMPT_OUTPUT_FILE)) {
      return fs.readFileSync(PROMPT_OUTPUT_FILE, 'utf8');
    }
  } catch (err) {
    console.warn(`[continuation-prompt] Error reading prompt: ${err.message}`);
  }
  return null;
}

/**
 * Delete the continuation prompt file
 * @returns {boolean} Success status
 */
export function deleteContinuationPrompt() {
  try {
    if (fs.existsSync(PROMPT_OUTPUT_FILE)) {
      fs.unlinkSync(PROMPT_OUTPUT_FILE);
    }
    return true;
  } catch (err) {
    console.warn(`[continuation-prompt] Error deleting prompt: ${err.message}`);
    return false;
  }
}

/**
 * Get the prompt output file path
 * @returns {string}
 */
export function getPromptFilePath() {
  return PROMPT_OUTPUT_FILE;
}

/**
 * Generate a minimal prompt for quick continuation
 * @returns {string}
 */
export function generateMinimalPrompt() {
  const state = readContinuationState();

  if (state.status !== 'incomplete') {
    return '/leo next';
  }

  if (state.pendingCommands?.length > 0) {
    return `/leo resume && ${state.pendingCommands.map(c => `/${c}`).join(' && ')}`;
  }

  if (state.sd?.id) {
    return '/leo resume';
  }

  return '/leo next';
}

export default {
  generateContinuationPrompt,
  writeContinuationPrompt,
  readContinuationPrompt,
  deleteContinuationPrompt,
  getPromptFilePath,
  generateMinimalPrompt
};
