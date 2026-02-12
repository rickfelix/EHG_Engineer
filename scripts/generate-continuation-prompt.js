#!/usr/bin/env node

/**
 * Generate Continuation Prompt CLI
 *
 * Part of SD-LEO-INFRA-STOP-HOOK-ENHANCEMENT-001
 *
 * Wrapper script that reads continuation state and unified state,
 * then generates a context-aware continuation prompt.
 *
 * Usage:
 *   node scripts/generate-continuation-prompt.js           # Write to file
 *   node scripts/generate-continuation-prompt.js --stdout  # Print to stdout
 *   node scripts/generate-continuation-prompt.js --minimal # Print minimal prompt
 *   node scripts/generate-continuation-prompt.js --check   # Check if continuation needed
 *
 * @see docs/plans/SD-LEO-INFRA-HARDENING-001-plan.md
 */

import {
  generateContinuationPrompt,
  writeContinuationPrompt,
  generateMinimalPrompt,
  _getPromptFilePath
} from './modules/handoff/continuation-prompt-generator.js';

import {
  readState,
  needsContinuation
} from './modules/handoff/continuation-state.js';

const args = process.argv.slice(2);

// Help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Generate Continuation Prompt CLI

Usage:
  node scripts/generate-continuation-prompt.js           Write prompt to file
  node scripts/generate-continuation-prompt.js --stdout  Print to stdout only
  node scripts/generate-continuation-prompt.js --minimal Print minimal prompt for automation
  node scripts/generate-continuation-prompt.js --check   Check if continuation is needed (exit code)
  node scripts/generate-continuation-prompt.js --status  Show current continuation state
  node scripts/generate-continuation-prompt.js --help    Show this help

Exit Codes:
  0 - Success / Continuation needed
  1 - Error
  2 - No continuation needed (for --check)
`);
  process.exit(0);
}

// Check mode
if (args.includes('--check')) {
  const needed = needsContinuation();
  if (needed) {
    console.log('CONTINUATION_NEEDED=true');
    process.exit(0);
  } else {
    console.log('CONTINUATION_NEEDED=false');
    process.exit(2);
  }
}

// Status mode
if (args.includes('--status')) {
  const state = readState();
  console.log('');
  console.log('Continuation State:');
  console.log('-------------------');
  console.log(`Status: ${state.status}`);
  console.log(`Reason: ${state.reason || 'N/A'}`);
  console.log(`SD ID: ${state.sd?.id || 'N/A'}`);
  console.log(`Phase: ${state.sd?.phase || 'N/A'}`);
  console.log(`Progress: ${state.sd?.progress || 0}%`);
  console.log(`Pending Commands: ${state.pendingCommands?.length || 0}`);
  console.log(`Retry Count: ${state.retryCount}/${state.maxRetries}`);
  console.log(`Consecutive Errors: ${state.consecutiveErrors}`);
  if (state.errorDetails) {
    console.log(`Error: ${state.errorDetails}`);
  }
  console.log(`Updated: ${state.updatedAt || 'Never'}`);
  console.log('');
  process.exit(0);
}

// Minimal mode
if (args.includes('--minimal')) {
  const prompt = generateMinimalPrompt();
  console.log(prompt);
  process.exit(0);
}

// Stdout mode
if (args.includes('--stdout')) {
  const prompt = generateContinuationPrompt();
  console.log(prompt);
  process.exit(0);
}

// Default: write to file
const result = writeContinuationPrompt();

if (result.success) {
  console.log(`Continuation prompt written to: ${result.path}`);
  process.exit(0);
} else {
  console.error(`Error writing prompt: ${result.error}`);
  process.exit(1);
}
