#!/usr/bin/env node
/**
 * Protocol Gate Status CLI - SD-LEO-INFRA-ENHANCED-PROTOCOL-FILE-001
 *
 * Query and manage protocol gate state for debugging and monitoring.
 *
 * Usage:
 *   node scripts/protocol-gate-status.js                 # Show full status
 *   node scripts/protocol-gate-status.js --check-sd <SD> # Check if SD can start
 *   node scripts/protocol-gate-status.js --check-compaction # Check post-compaction state
 *   node scripts/protocol-gate-status.js --record-read <file> <trigger> # Record a file read
 *   node scripts/protocol-gate-status.js --clear       # Clear all gate state (testing)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, '..');
const SESSION_STATE_FILE = path.join(PROJECT_DIR, '.claude', 'unified-session-state.json');

// Dynamic import for the gate module
async function loadGateModule() {
  try {
    const module = await import('./modules/handoff/gates/core-protocol-gate.js');
    return module.default || module;
  } catch (error) {
    console.error(`Failed to load gate module: ${error.message}`);
    return null;
  }
}

/**
 * Read session state
 */
function readSessionState() {
  try {
    if (fs.existsSync(SESSION_STATE_FILE)) {
      const content = fs.readFileSync(SESSION_STATE_FILE, 'utf8');
      const cleanContent = content.replace(/^\uFEFF/, '');
      return JSON.parse(cleanContent);
    }
  } catch (error) {
    console.error(`Could not read session state: ${error.message}`);
  }
  return {};
}

/**
 * Display full protocol gate status
 */
function showStatus() {
  const state = readSessionState();
  const gate = state.protocolGate || {};

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         PROTOCOL GATE STATUS                                ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  console.log('📋 Current Context:');
  console.log(`   SD Run ID:        ${gate.sdRunId || 'none'}`);
  console.log(`   Session ID:       ${gate.sessionId || 'unknown'}`);
  console.log('');

  console.log('📦 Compaction Status:');
  console.log(`   Last Compaction:  ${gate.lastCompactionAt || 'never'}`);
  console.log(`   Compaction Count: ${gate.compactionCount || 0}`);
  console.log('');

  console.log('📚 Protocol Files Read:');
  const fileReads = gate.fileReads || {};
  if (Object.keys(fileReads).length === 0) {
    console.log('   (none recorded)');
  } else {
    for (const [filename, read] of Object.entries(fileReads)) {
      console.log(`   ✅ ${filename}`);
      console.log(`      Trigger: ${read.trigger}`);
      console.log(`      Hash:    ${read.fileHash?.substring(0, 16) || 'unknown'}`);
      console.log(`      Time:    ${read.timestamp}`);
    }
  }
  console.log('');

  // Legacy compatibility check
  const legacyFiles = state.protocolFilesRead || [];
  if (legacyFiles.length > 0) {
    console.log('📜 Legacy Files Read (backward compat):');
    legacyFiles.forEach(f => {
      const readAt = state.protocolFilesReadAt?.[f];
      console.log(`   • ${f} ${readAt ? `(at ${readAt})` : ''}`);
    });
    console.log('');
  }

  // Check for post-compaction requirements
  if (gate.lastCompactionAt && Object.keys(fileReads).length === 0) {
    console.log('⚠️  WARNING: Compaction occurred but no files re-read');
    console.log('   Required files:');
    console.log('   • CLAUDE_CORE.md');
    if (state.sd?.phase) {
      const phaseFile = {
        LEAD: 'CLAUDE_LEAD.md',
        PLAN: 'CLAUDE_PLAN.md',
        EXEC: 'CLAUDE_EXEC.md'
      }[state.sd.phase];
      if (phaseFile) {
        console.log(`   • ${phaseFile} (current phase: ${state.sd.phase})`);
      }
    }
    console.log('');
  }

  console.log('═'.repeat(60));
}

/**
 * Check if SD can start
 */
async function checkSdStart(sdId) {
  const gateModule = await loadGateModule();
  if (!gateModule) {
    console.error('Gate module not available');
    process.exit(1);
  }

  console.log(`\nChecking SD Start Gate for: ${sdId}`);
  const result = await gateModule.validateSdStartGate(sdId);

  console.log('');
  console.log('Result:', result.pass ? '✅ PASS' : '❌ BLOCKED');
  console.log(`Score: ${result.score}/${result.max_score}`);

  if (result.issues?.length > 0) {
    console.log('\nIssues:');
    result.issues.forEach(i => console.log(`  • ${i}`));
  }

  if (result.warnings?.length > 0) {
    console.log('\nWarnings:');
    result.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
  }

  process.exit(result.pass ? 0 : 1);
}

/**
 * Check post-compaction state
 */
async function checkPostCompaction(phase) {
  const gateModule = await loadGateModule();
  if (!gateModule) {
    console.error('Gate module not available');
    process.exit(1);
  }

  // SD-LEO-INFRA-ROLE-CONTRACT-READ-GATE-001 / FR-4: validatePostCompactionGate was REMOVED. It was
  // the only caller of a gate that had no live caller, hard-blocked on paper, and accepted a 1-line
  // read as a satisfied "post-compaction re-read" — a trap for anyone later solving exactly this
  // problem, since its name is what they would search for. Coverage now lives in
  // lib/protocol/contract-read-coverage.cjs (union-of-ranges + delivered lines).
  console.log(`\nPost-Compaction Gate check REMOVED (phase: ${phase || 'unknown'})`);
  console.log('  See lib/protocol/contract-read-coverage.cjs — this archived script is no longer a gate status tool.');
  const result = { pass: true, score: 0, max_score: 0, issues: [], warnings: ['validatePostCompactionGate removed by SD-LEO-INFRA-ROLE-CONTRACT-READ-GATE-001'] };

  console.log('');
  console.log('Result:', result.pass ? '✅ PASS' : '❌ BLOCKED');
  console.log(`Score: ${result.score}/${result.max_score}`);

  if (result.issues?.length > 0) {
    console.log('\nIssues:');
    result.issues.forEach(i => console.log(`  • ${i}`));
  }

  process.exit(result.pass ? 0 : 1);
}

/**
 * Record a file read
 */
async function recordRead(filename, trigger, sdRunId, sessionId) {
  const gateModule = await loadGateModule();
  if (!gateModule) {
    console.error('Gate module not available');
    process.exit(1);
  }

  gateModule.recordProtocolFileRead(filename, trigger, sdRunId, sessionId);
  console.log(`\n✅ Recorded read of ${filename} (trigger: ${trigger})`);
}

/**
 * Clear all gate state
 */
function clearState() {
  const state = readSessionState();

  state.protocolGate = {
    sdRunId: null,
    sessionId: null,
    lastCompactionAt: null,
    fileReads: {},
    compactionCount: 0
  };
  state.protocolFilesRead = [];
  state.protocolFilesReadAt = {};

  const dir = path.dirname(SESSION_STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(SESSION_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');

  console.log('\n✅ Protocol gate state cleared');
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Protocol Gate Status CLI

Usage:
  node scripts/protocol-gate-status.js                           Show full status
  node scripts/protocol-gate-status.js --check-sd <SD-ID>        Check if SD can start
  node scripts/protocol-gate-status.js --check-compaction [phase] Check post-compaction state
  node scripts/protocol-gate-status.js --record-read <file> <trigger> [sdRunId] [sessionId]
  node scripts/protocol-gate-status.js --clear                   Clear all gate state

Triggers: SD_START, POST_COMPACTION, HANDOFF, SESSION_START
`);
    process.exit(0);
  }

  if (args.includes('--check-sd')) {
    const idx = args.indexOf('--check-sd');
    const sdId = args[idx + 1];
    if (!sdId) {
      console.error('SD ID required');
      process.exit(1);
    }
    await checkSdStart(sdId);
    return;
  }

  if (args.includes('--check-compaction')) {
    const idx = args.indexOf('--check-compaction');
    const phase = args[idx + 1] || null;
    await checkPostCompaction(phase);
    return;
  }

  if (args.includes('--record-read')) {
    const idx = args.indexOf('--record-read');
    const filename = args[idx + 1];
    const trigger = args[idx + 2] || 'MANUAL';
    const sdRunId = args[idx + 3] || null;
    const sessionId = args[idx + 4] || null;

    if (!filename) {
      console.error('Filename required');
      process.exit(1);
    }

    await recordRead(filename, trigger, sdRunId, sessionId);
    return;
  }

  if (args.includes('--clear')) {
    clearState();
    return;
  }

  showStatus();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
