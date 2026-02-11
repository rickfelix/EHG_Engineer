#!/usr/bin/env node

/**
 * EVA Idea Evaluate CLI
 * SD: SD-LEO-ENH-EVA-INTAKE-DISPOSITION-001
 *
 * Evaluates pending intake items through the feedback/vetting pipeline.
 * Supports bulk mode (default) and interactive mode (--interactive).
 *
 * Usage:
 *   npm run eva:ideas:evaluate                          # Bulk mode (all items)
 *   npm run eva:ideas:evaluate -- --source todoist      # Filter by source
 *   npm run eva:ideas:evaluate -- --limit 5             # Limit items
 *   npm run eva:ideas:evaluate -- --interactive         # Interactive mode
 *   npm run eva:ideas:evaluate -- --interactive --limit 10  # Interactive with limit
 */

import dotenv from 'dotenv';
dotenv.config();

import readline from 'readline';
import { evaluatePendingItems, evaluateItemsInteractive } from '../lib/integrations/evaluation-bridge.js';

const VALID_DISPOSITIONS = [
  'actionable', 'already_exists', 'research_needed',
  'consideration_only', 'significant_departure', 'needs_triage'
];

const args = process.argv.slice(2);
const sourceType = (() => {
  const idx = args.indexOf('--source');
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
})();
const limit = (() => {
  const idx = args.indexOf('--limit');
  return idx >= 0 && idx + 1 < args.length ? parseInt(args[idx + 1]) : undefined;
})();
const verbose = args.includes('--verbose') || args.includes('-v');
const interactive = args.includes('--interactive') || args.includes('-i');

/**
 * Create a readline interface for interactive prompts
 */
function createPrompt() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Ask user a question and return the answer
 */
function ask(rl, question) {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer.trim()));
  });
}

/**
 * Interactive mode: ask user to confirm or override disposition
 */
async function askUserDisposition(item, aiDisposition) {
  const rl = createPrompt();

  console.log('');
  console.log('-'.repeat(60));
  console.log(`  Item ${item.index}/${item.total}: ${item.title}`);
  console.log('-'.repeat(60));
  if (item.description) {
    console.log(`  Description: ${item.description.substring(0, 200)}${item.description.length > 200 ? '...' : ''}`);
  }
  console.log(`  Source: ${item._sourceType}`);
  console.log('');
  console.log(`  AI Disposition: ${aiDisposition.disposition} (${aiDisposition.confidence}% confidence)`);
  if (aiDisposition.reason) {
    console.log(`  Reasoning: ${aiDisposition.reason}`);
  }
  if (aiDisposition.conflict_with) {
    console.log(`  Conflict: ${aiDisposition.conflict_with}`);
  }
  console.log('');
  console.log('  Options:');
  console.log('    [1] actionable           - Clear, implementable item');
  console.log('    [2] already_exists        - Codebase already has this');
  console.log('    [3] research_needed       - Requires investigation');
  console.log('    [4] consideration_only    - Strategic thought only');
  console.log('    [5] significant_departure - Major architectural change needed');
  console.log('    [6] needs_triage          - Needs human review');
  console.log('    [enter] Accept AI suggestion');
  console.log('    [s] Skip this item');
  console.log('    [q] Quit interactive mode');
  console.log('');

  const answer = await ask(rl, '  Your choice: ');
  rl.close();

  if (answer.toLowerCase() === 'q') {
    console.log('  Exiting interactive mode.');
    process.exit(0);
  }

  if (answer.toLowerCase() === 's') {
    return { skip: true };
  }

  if (answer === '' || answer === '0') {
    // Accept AI suggestion
    return { disposition: aiDisposition.disposition };
  }

  const choiceMap = {
    '1': 'actionable',
    '2': 'already_exists',
    '3': 'research_needed',
    '4': 'consideration_only',
    '5': 'significant_departure',
    '6': 'needs_triage'
  };

  const chosen = choiceMap[answer];
  if (chosen) {
    return { disposition: chosen };
  }

  // Try to match by name
  const matched = VALID_DISPOSITIONS.find(d => d.startsWith(answer.toLowerCase()));
  if (matched) {
    return { disposition: matched };
  }

  // Default: accept AI suggestion
  console.log('  Unrecognized input, accepting AI suggestion.');
  return { disposition: aiDisposition.disposition };
}

async function runBulkMode() {
  console.log('');
  console.log('='.repeat(60));
  console.log('EVA Idea Evaluation (Bulk Mode)');
  console.log('='.repeat(60));
  if (sourceType) console.log(`  Source: ${sourceType}`);
  if (limit) console.log(`  Limit:  ${limit}`);
  console.log('');

  const results = await evaluatePendingItems({ sourceType, limit, verbose });

  console.log('--- Results ---');
  for (const [source, counts] of Object.entries(results)) {
    if (counts.evaluated > 0) {
      console.log(`  ${source}: ${counts.evaluated} evaluated`);
      console.log(`    Approved:       ${counts.approved}`);
      console.log(`    Rejected:       ${counts.rejected}`);
      console.log(`    Needs Revision: ${counts.needsRevision}`);
      console.log(`    Errors:         ${counts.errors}`);
    }
  }

  console.log('');
  console.log('='.repeat(60));
}

async function runInteractiveMode() {
  console.log('');
  console.log('='.repeat(60));
  console.log('EVA Idea Evaluation (Interactive Mode)');
  console.log('='.repeat(60));
  console.log('  Each item will be shown with AI disposition.');
  console.log('  Confirm, override, or skip each item.');
  if (sourceType) console.log(`  Source: ${sourceType}`);
  if (limit) console.log(`  Limit:  ${limit}`);
  console.log('');

  const results = await evaluateItemsInteractive({
    sourceType,
    limit,
    askUser: askUserDisposition
  });

  console.log('');
  console.log('='.repeat(60));
  console.log('Interactive Evaluation Results');
  console.log('='.repeat(60));
  console.log(`  Total items:  ${results.total}`);
  console.log(`  Confirmed:    ${results.confirmed}`);
  console.log(`  Overridden:   ${results.overridden}`);
  console.log(`  Skipped:      ${results.skipped}`);
  console.log(`  Errors:       ${results.errors}`);

  if (results.items.length > 0) {
    console.log('');
    console.log('  Details:');
    for (const item of results.items) {
      if (item.action === 'skipped') {
        console.log(`    [SKIP] ${item.title}`);
      } else if (item.action === 'error') {
        console.log(`    [ERR]  ${item.title}: ${item.error}`);
      } else {
        const override = item.wasOverridden ? ` (overridden from ${item.aiDisposition})` : '';
        console.log(`    [${item.status.toUpperCase().padEnd(6)}] ${item.title} → ${item.finalDisposition}${override}`);
      }
    }
  }

  console.log('');
  console.log('='.repeat(60));
}

async function main() {
  if (interactive) {
    await runInteractiveMode();
  } else {
    await runBulkMode();
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
