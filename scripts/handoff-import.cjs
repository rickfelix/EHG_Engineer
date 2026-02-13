#!/usr/bin/env node

/**
 * Handoff Import Script
 *
 * Reads the handoff package from .claude/handoff/ and:
 * - Validates the package exists and is recent
 * - Copies state files back to .claude/
 * - Detects memory file merge scenarios (for Claude to resolve)
 * - Displays the briefing
 * - Suggests next action
 *
 * Memory merging is handled by Claude (via the /handoff-in command),
 * NOT by this script. This script only detects conflicts.
 *
 * Usage: node scripts/handoff-import.cjs
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const HANDOFF_DIR = path.join(PROJECT_ROOT, '.claude', 'handoff');
const MEMORY_DEST = path.join(
  os.homedir(),
  '.claude',
  'projects',
  'C--Users-rickf-Projects--EHG-EHG-Engineer',
  'memory'
);
const CLAUDE_DIR = path.join(PROJECT_ROOT, '.claude');

function fileHash(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

function formatAge(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute(s) ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour(s) ago`;
  const days = Math.floor(hours / 24);
  return `${days} day(s) ago`;
}

function restoreStateFiles() {
  const stateDir = path.join(HANDOFF_DIR, 'state');
  const restored = [];

  if (!fs.existsSync(stateDir)) return restored;

  const files = fs.readdirSync(stateDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const src = path.join(stateDir, file);
    const dest = path.join(CLAUDE_DIR, file);
    fs.copyFileSync(src, dest);
    restored.push(file);
  }
  return restored;
}

function analyzeMemoryFiles() {
  const handoffMemDir = path.join(HANDOFF_DIR, 'memory');
  const results = {
    copy: [],      // Only in handoff → copy directly
    keep: [],      // Only at destination → keep as-is
    identical: [], // Same content → skip
    merge: []      // Different content → Claude must merge
  };

  if (!fs.existsSync(handoffMemDir)) return results;

  const handoffFiles = fs.readdirSync(handoffMemDir).filter(f => f.endsWith('.md'));
  const destFiles = fs.existsSync(MEMORY_DEST)
    ? fs.readdirSync(MEMORY_DEST).filter(f => f.endsWith('.md'))
    : [];

  const destSet = new Set(destFiles);
  const handoffSet = new Set(handoffFiles);

  for (const file of handoffFiles) {
    const handoffPath = path.join(handoffMemDir, file);
    const destPath = path.join(MEMORY_DEST, file);

    if (!destSet.has(file)) {
      // Only in handoff — copy directly
      results.copy.push(file);
    } else {
      // Exists in both — compare
      const handoffHash = fileHash(handoffPath);
      const destHash = fileHash(destPath);
      if (handoffHash === destHash) {
        results.identical.push(file);
      } else {
        results.merge.push(file);
      }
    }
  }

  // Files only at destination
  for (const file of destFiles) {
    if (!handoffSet.has(file)) {
      results.keep.push(file);
    }
  }

  return results;
}

function copyNonConflictingMemory(analysis) {
  const handoffMemDir = path.join(HANDOFF_DIR, 'memory');

  if (!fs.existsSync(MEMORY_DEST)) {
    fs.mkdirSync(MEMORY_DEST, { recursive: true });
  }

  // Copy files that only exist in handoff
  for (const file of analysis.copy) {
    fs.copyFileSync(
      path.join(handoffMemDir, file),
      path.join(MEMORY_DEST, file)
    );
  }
}

function main() {
  console.log('');
  console.log('========================================');
  console.log('  HANDOFF IMPORT');
  console.log('========================================');
  console.log('');

  // 1. Check handoff package exists
  const metadataPath = path.join(HANDOFF_DIR, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    console.error('  ERROR: No handoff package found at .claude/handoff/');
    console.error('  Run /handoff-out on the other account first.');
    process.exit(1);
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

  // 2. Check age
  const handoffTime = new Date(metadata.timestampISO || metadata.timestamp);
  const ageMs = Date.now() - handoffTime.getTime();
  const ageStr = formatAge(ageMs);
  const isStale = ageMs > 24 * 60 * 60 * 1000; // >24 hours

  console.log(`  Package timestamp: ${metadata.timestamp}`);
  console.log(`  Handoff age: ${ageStr}`);
  if (isStale) {
    console.log('  WARNING: Handoff package is over 24 hours old!');
    console.log('  Consider running /handoff-out again on the source account.');
  }
  console.log('');

  // 3. Restore state files
  console.log('  Restoring state files...');
  const restoredState = restoreStateFiles();
  for (const f of restoredState) {
    console.log(`    Restored: ${f}`);
  }
  if (restoredState.length === 0) {
    console.log('    No state files to restore');
  }
  console.log('');

  // 4. Analyze memory files
  console.log('  Analyzing memory files...');
  const analysis = analyzeMemoryFiles();

  // Copy non-conflicting files
  copyNonConflictingMemory(analysis);

  // Report
  console.log('');
  console.log('  Memory Merge Results:');
  for (const f of analysis.copy) {
    console.log(`    ${f}: COPIED (not present at destination)`);
  }
  for (const f of analysis.keep) {
    console.log(`    ${f}: KEPT (only at destination, not in handoff)`);
  }
  for (const f of analysis.identical) {
    console.log(`    ${f}: IDENTICAL (no changes needed)`);
  }
  for (const f of analysis.merge) {
    console.log(`    ${f}: NEEDS MERGE (different in handoff vs destination)`);
  }

  if (analysis.copy.length === 0 && analysis.keep.length === 0 &&
      analysis.identical.length === 0 && analysis.merge.length === 0) {
    console.log('    No memory files found');
  }
  console.log('');

  // 5. Display briefing
  const briefingPath = path.join(HANDOFF_DIR, 'briefing.md');
  if (fs.existsSync(briefingPath)) {
    const briefing = fs.readFileSync(briefingPath, 'utf8');
    console.log('--- BRIEFING ---');
    console.log(briefing);
    console.log('--- END BRIEFING ---');
  }
  console.log('');

  // 6. Output structured data for Claude to use
  const output = {
    success: true,
    age: ageStr,
    isStale,
    restoredState,
    memoryAnalysis: {
      copied: analysis.copy,
      kept: analysis.keep,
      identical: analysis.identical,
      needsMerge: analysis.merge
    },
    activeSD: metadata.activeSD,
    sessionSettings: metadata.sessionSettings,
    handoffMemoryDir: path.join(HANDOFF_DIR, 'memory'),
    memoryDestDir: MEMORY_DEST
  };

  console.log('HANDOFF_IMPORT_RESULT=' + JSON.stringify(output));
  console.log('');

  // 7. Suggest next action
  if (analysis.merge.length > 0) {
    console.log(`  ACTION REQUIRED: ${analysis.merge.length} memory file(s) need merging.`);
    console.log('  Claude will handle this automatically via /handoff-in.');
  }

  if (metadata.activeSD) {
    console.log(`  Suggested: /leo continue (to resume ${metadata.activeSD.sdKey})`);
  } else {
    console.log('  Suggested: npm run sd:next (to see the queue)');
  }

  console.log('');
  console.log('========================================');
}

main();
