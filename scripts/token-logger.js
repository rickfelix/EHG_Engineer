#!/usr/bin/env node

/**
 * Token Logging Infrastructure (Haiku-First MVP)
 * LEO Protocol - Model Allocation Framework
 *
 * Purpose: Manual token tracking at SD checkpoints for budget management
 * Enables weekly calibration of model assignments and cost tracking
 *
 * Usage:
 *   node scripts/token-logger.js --sd SD-XYZ --phase LEAD --tokens 42000
 *   node scripts/token-logger.js --log
 *
 * Created: 2025-12-06 (Haiku-First Model Allocation)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN_LOG_FILE = path.join(__dirname, '../.token-log.json');

/**
 * Initialize log file if it doesn't exist
 * Creates structure for weekly token tracking
 */
function ensureLogExists() {
  if (!fs.existsSync(TOKEN_LOG_FILE)) {
    const weekStart = getWeekStart();
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const logStructure = {
      week_start: weekStart.toISOString(),
      week_end: weekEnd.toISOString(),
      budget_limit: 500000, // Configurable - Anthropic Max plan estimate
      tokens_used: 0,
      entries: [],
      metadata: {
        created_at: new Date().toISOString(),
        version: '1.0',
        strategy: 'haiku-first-model-allocation'
      }
    };

    fs.writeFileSync(TOKEN_LOG_FILE, JSON.stringify(logStructure, null, 2));
    console.log('✅ Token log initialized for new week');
  }
}

/**
 * Get the start of the current week (Monday)
 * Resets on Mondays at 2 PM PST (matching Anthropic reset time)
 */
function getWeekStart() {
  const now = new Date();
  const day = now.getDay();

  // Adjust for Monday start (day === 1)
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const weekStart = new Date(now.setDate(diff));

  // Reset to Monday 2 PM (14:00) for alignment with Anthropic
  weekStart.setHours(14, 0, 0, 0);

  return weekStart;
}

/**
 * Determine budget zone based on consumption percentage
 */
function getBudgetZone(percentUsed) {
  const p = parseFloat(percentUsed);
  if (p < 70) return '🟢 GREEN';
  if (p < 85) return '🟡 YELLOW';
  if (p < 95) return '🟠 ORANGE';
  return '🔴 RED';
}

/**
 * Log token usage at a phase boundary
 * Called after each phase completes to track actual consumption
 */
function logTokenUsage({ sd_id, phase, tokens, notes = '' }) {
  if (!sd_id || !phase || !tokens) {
    console.error('❌ Error: Missing required parameters (--sd, --phase, --tokens)');
    process.exit(1);
  }

  ensureLogExists();

  try {
    const log = JSON.parse(fs.readFileSync(TOKEN_LOG_FILE, 'utf8'));

    const entry = {
      timestamp: new Date().toISOString(),
      sd_id: sd_id,
      phase: phase,
      tokens: parseInt(tokens),
      notes: notes || ''
    };

    log.entries.push(entry);
    log.tokens_used += parseInt(tokens);

    fs.writeFileSync(TOKEN_LOG_FILE, JSON.stringify(log, null, 2));

    const percentUsed = ((log.tokens_used / log.budget_limit) * 100).toFixed(1);
    const budgetZone = getBudgetZone(percentUsed);

    console.log(`✅ Logged: ${sd_id} (${phase}) - ${tokens.toLocaleString()} tokens`);
    console.log(`   Weekly total: ${log.tokens_used.toLocaleString()} / ${log.budget_limit.toLocaleString()} (${percentUsed}%) [${budgetZone}]`);

    return { logged: true, zone: budgetZone, percentUsed };
  } catch (_error) {
    console.error(`❌ Error logging tokens: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Display weekly token log with breakdown by phase
 */
function displayWeeklyLog() {
  ensureLogExists();

  try {
    const log = JSON.parse(fs.readFileSync(TOKEN_LOG_FILE, 'utf8'));
    const percentUsed = ((log.tokens_used / log.budget_limit) * 100).toFixed(1);
    const budgetZone = getBudgetZone(percentUsed);

    console.log('\n📊 WEEKLY TOKEN LOG');
    console.log('═'.repeat(70));

    const weekStartDate = new Date(log.week_start).toLocaleDateString();
    const weekEndDate = new Date(log.week_end).toLocaleDateString();
    console.log(`Week: ${weekStartDate} → ${weekEndDate}`);
    console.log(`Budget: ${log.tokens_used.toLocaleString()} / ${log.budget_limit.toLocaleString()} (${percentUsed}%) [${budgetZone}]`);
    console.log('');

    if (log.entries.length === 0) {
      console.log('(No token entries logged yet for this week)');
      console.log('═'.repeat(70) + '\n');
      return;
    }

    // Group by phase
    const byPhase = {};
    log.entries.forEach(entry => {
      if (!byPhase[entry.phase]) {
        byPhase[entry.phase] = { tokens: 0, count: 0 };
      }
      byPhase[entry.phase].tokens += entry.tokens;
      byPhase[entry.phase].count++;
    });

    console.log('By Phase:');
    Object.entries(byPhase).forEach(([phase, data]) => {
      const pct = log.tokens_used > 0 ? ((data.tokens / log.tokens_used) * 100).toFixed(0) : 0;
      console.log(`  ${phase.padEnd(6)}: ${data.tokens.toLocaleString().padStart(10)} tokens (${pct.padStart(3)}%) - ${data.count} entries`);
    });

    console.log(`\nTotal Entries: ${log.entries.length}`);
    console.log('═'.repeat(70) + '\n');
  } catch (_error) {
    console.error(`❌ Error reading log: ${error.message}`);
    process.exit(1);
  }
}

/**
 * CLI Interface
 */
const args = process.argv.slice(2);

if (args.includes('--log')) {
  displayWeeklyLog();
} else if (args.includes('--sd')) {
  const sdIndex = args.indexOf('--sd');
  const phaseIndex = args.indexOf('--phase');
  const tokensIndex = args.indexOf('--tokens');
  const notesIndex = args.indexOf('--notes');

  const _result = logTokenUsage({
    sd_id: args[sdIndex + 1],
    phase: args[phaseIndex + 1],
    tokens: args[tokensIndex + 1],
    notes: notesIndex >= 0 ? args[notesIndex + 1] : ''
  });
} else {
  console.log(`
📋 Token Logger - Haiku-First Model Allocation Framework

Usage:
  Log token usage at phase completion:
  $ node scripts/token-logger.js --sd SD-XYZ --phase LEAD --tokens 42000

  View weekly log:
  $ node scripts/token-logger.js --log

  Optional: Add notes to entry:
  $ node scripts/token-logger.js --sd SD-XYZ --phase PLAN --tokens 78000 --notes "escalation to sonnet"

Examples:
  $ node scripts/token-logger.js --sd SD-USER-DASH-001 --phase LEAD --tokens 42000
  $ node scripts/token-logger.js --sd SD-USER-DASH-001 --phase PLAN --tokens 76000
  $ node scripts/token-logger.js --sd SD-USER-DASH-001 --phase EXEC --tokens 58000
  $ node scripts/token-logger.js --log
`);
}

export {
  logTokenUsage,
  getBudgetZone,
  getWeekStart
};
