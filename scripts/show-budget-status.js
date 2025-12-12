#!/usr/bin/env node

/**
 * Token Budget Status Display
 * LEO Protocol - Haiku-First Model Allocation Framework
 *
 * Purpose: Real-time budget visibility with traffic-light status indicator
 * Shows weekly token consumption, burn rate, and projected exhaustion
 *
 * Usage:
 *   node scripts/show-budget-status.js
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
 * Display budget status with traffic-light indicator
 */
function displayBudgetStatus() {
  // Check if log exists
  if (!fs.existsSync(TOKEN_LOG_FILE)) {
    console.log('📋 No token log found. Start logging tokens with:');
    console.log('   node scripts/token-logger.js --sd SD-XYZ --phase LEAD --tokens 45000\n');
    return;
  }

  try {
    const log = JSON.parse(fs.readFileSync(TOKEN_LOG_FILE, 'utf8'));
    const weekStart = new Date(log.week_start);
    const weekEnd = new Date(log.week_end);
    const now = new Date();

    // Calculate time remaining
    const daysElapsed = Math.floor((now - weekStart) / (24 * 60 * 60 * 1000));
    const daysRemaining = Math.ceil((weekEnd - now) / (24 * 60 * 60 * 1000));
    const hoursRemaining = Math.floor(((weekEnd - now) % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

    // Calculate consumption
    const percentUsed = (log.tokens_used / log.budget_limit) * 100;
    const barLength = 30;
    const filledLength = Math.round((percentUsed / 100) * barLength);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

    // Calculate burn rate
    const burnRate = daysElapsed > 0 ? log.tokens_used / daysElapsed : 0;
    const projectedFinal = burnRate * 7;
    const projectedStatus = projectedFinal > log.budget_limit ? '⚠️  ON TRACK TO EXCEED' : '✅ ON TARGET';

    // Determine traffic light
    let light = '🟢 GREEN';
    let recommendation = 'Use models per assignment freely';
    let lightEmoji = '🟢';

    if (percentUsed >= 95) {
      light = '🔴 RED';
      lightEmoji = '🔴';
      recommendation = 'Budget nearly exhausted. Pause work or prepare for overage.';
    } else if (percentUsed >= 85) {
      light = '🟠 ORANGE';
      lightEmoji = '🟠';
      recommendation = 'Consider deferring non-critical SDs to next week.';
    } else if (percentUsed >= 70) {
      light = '🟡 YELLOW';
      lightEmoji = '🟡';
      recommendation = 'Monitor burn rate. Upgrade models cautiously.';
    }

    // Display
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              ANTHROPIC WEEKLY TOKEN BUDGET STATUS              ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log(`║ ${light.padEnd(62)} ║`);
    console.log('║                                                                ║');
    console.log(`║ [TOKENS] ${bar} ${percentUsed.toFixed(1)}% ║`);
    console.log(`║ ${log.tokens_used.toLocaleString().padEnd(18)} / ${log.budget_limit.toLocaleString()} tokens                   ║`);
    console.log('║                                                                ║');

    if (daysRemaining > 0) {
      console.log(`║ [BURN RATE] ${burnRate.toFixed(0).padEnd(10)} tokens/day                          ║`);
      console.log(`║ ${projectedStatus.padEnd(60)} ║`);
      console.log(`║ Projected final: ${projectedFinal.toLocaleString()} tokens${(projectedFinal > log.budget_limit ? ' (EXCEEDS LIMIT)' : '').padEnd(28)} ║`);
    } else {
      console.log('║ [BURN RATE] Fresh week (no usage yet)                          ║');
    }

    console.log('║                                                                ║');

    if (daysRemaining > 0) {
      console.log(`║ [TIMELINE] Day ${daysElapsed} of 7 (${daysRemaining} days, ${hoursRemaining} hours remaining)${' '.repeat(Math.max(0, 28 - (`Day ${daysElapsed} of 7 (${daysRemaining} days, ${hoursRemaining} hours remaining)`).length))}║`);
      const resetTime = weekEnd.toLocaleString('en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Los_Angeles' });
      console.log(`║ Reset: ${resetTime} PST${' '.repeat(Math.max(0, 55 - (`Reset: ${resetTime} PST`).length))}║`);
    } else {
      console.log('║ [TIMELINE] Week completed - awaiting reset                     ║');
    }

    console.log('║                                                                ║');
    console.log('║ 📋 RECOMMENDATION:                                            ║');
    console.log(`║ ${recommendation.padEnd(62)} ║`);
    console.log('║                                                                ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log('║ USAGE BY PHASE (THIS WEEK)                                     ║');

    // Calculate by phase
    const byPhase = {};
    log.entries.forEach(entry => {
      if (!byPhase[entry.phase]) byPhase[entry.phase] = { tokens: 0, count: 0 };
      byPhase[entry.phase].tokens += entry.tokens;
      byPhase[entry.phase].count++;
    });

    if (Object.keys(byPhase).length === 0) {
      console.log('║ (No entries logged yet)                                        ║');
    } else {
      Object.entries(byPhase).forEach(([phase, data]) => {
        const pct = log.tokens_used > 0 ? ((data.tokens / log.tokens_used) * 100).toFixed(0) : 0;
        const phaseStr = `${phase.padEnd(6)}: ${data.tokens.toLocaleString().padStart(10)} tokens (${pct.padStart(3)}%) [${data.count} entry/entries]`;
        console.log(`║ ${phaseStr.padEnd(62)} ║`);
      });
    }

    console.log('║                                                                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
  } catch (error) {
    console.error(`❌ Error reading budget status: ${error.message}`);
    process.exit(1);
  }
}

// Run
displayBudgetStatus();

export { displayBudgetStatus };
