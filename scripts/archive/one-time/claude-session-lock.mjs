#!/usr/bin/env node
/**
 * Claude Session Lock Mechanism
 *
 * Prevents multiple Claude Code instances from conflicting on the same branch.
 * Creates a lock file when a session starts, releases when it ends.
 *
 * Usage:
 *   node scripts/claude-session-lock.mjs acquire [sd-id]
 *   node scripts/claude-session-lock.mjs release
 *   node scripts/claude-session-lock.mjs check
 *   node scripts/claude-session-lock.mjs status
 *
 * The lock times out after 30 minutes of inactivity.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const LOCK_DIR = '.claude-locks';
const LOCK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function getBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function getLockFile(branch) {
  const safeBranch = branch.replace(/\//g, '_');
  return path.join(LOCK_DIR, `${safeBranch}.lock`);
}

function formatAge(ms) {
  const minutes = Math.floor(ms / 1000 / 60);
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hours, ${minutes % 60} minutes`;
}

function acquire(sdId) {
  const branch = getBranch();
  const lockFile = getLockFile(branch);

  if (!fs.existsSync(LOCK_DIR)) {
    fs.mkdirSync(LOCK_DIR, { recursive: true });
  }

  if (fs.existsSync(lockFile)) {
    const stat = fs.statSync(lockFile);
    const age = Date.now() - stat.mtimeMs;

    if (age < LOCK_TIMEOUT_MS) {
      const content = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      console.error('');
      console.error('╔════════════════════════════════════════════════════════════╗');
      console.error('║  ⚠️  BRANCH LOCK CONFLICT DETECTED                          ║');
      console.error('╠════════════════════════════════════════════════════════════╣');
      console.error(`║  Branch: ${branch.padEnd(49)}║`);
      console.error(`║  Locked by: ${(content.sdId || 'unknown session').padEnd(46)}║`);
      console.error(`║  Lock age: ${formatAge(age).padEnd(47)}║`);
      console.error(`║  Started: ${content.timestamp.padEnd(48)}║`);
      console.error('╠════════════════════════════════════════════════════════════╣');
      console.error('║  Another Claude instance may be working on this branch.    ║');
      console.error('║  Wait for it to finish, or override with --force           ║');
      console.error('╚════════════════════════════════════════════════════════════╝');
      console.error('');
      process.exit(1);
    }

    console.log(`⚠️  Stale lock detected (${formatAge(age)} old), acquiring...`);
  }

  const lockInfo = {
    timestamp: new Date().toISOString(),
    branch: branch,
    sdId: sdId || 'unknown',
    pid: process.pid
  };

  fs.writeFileSync(lockFile, JSON.stringify(lockInfo, null, 2));
  console.log(`🔒 Lock acquired for branch: ${branch}`);
  if (sdId) {
    console.log(`   Working on: ${sdId}`);
  }
}

function release() {
  const branch = getBranch();
  const lockFile = getLockFile(branch);

  if (fs.existsSync(lockFile)) {
    fs.unlinkSync(lockFile);
    console.log(`🔓 Lock released for branch: ${branch}`);
  } else {
    console.log(`ℹ️  No lock to release for branch: ${branch}`);
  }
}

function check() {
  const branch = getBranch();
  const lockFile = getLockFile(branch);

  if (fs.existsSync(lockFile)) {
    const content = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    const stat = fs.statSync(lockFile);
    const age = Date.now() - stat.mtimeMs;
    const isStale = age >= LOCK_TIMEOUT_MS;

    console.log(`Branch '${branch}' is ${isStale ? 'STALE ' : ''}locked.`);
    console.log(`  SD: ${content.sdId}`);
    console.log(`  Acquired: ${content.timestamp}`);
    console.log(`  Age: ${formatAge(age)}`);

    process.exit(isStale ? 0 : 1);
  } else {
    console.log(`Branch '${branch}' is not locked.`);
    process.exit(0);
  }
}

function status() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    CLAUDE SESSION STATUS                       ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const branch = getBranch();
  console.log(`Current branch: ${branch}`);

  // Check lock status
  const lockFile = getLockFile(branch);
  if (fs.existsSync(lockFile)) {
    const content = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    const stat = fs.statSync(lockFile);
    const age = Date.now() - stat.mtimeMs;
    console.log(`Lock status: LOCKED (${formatAge(age)} old)`);
    console.log(`Working on: ${content.sdId}`);
  } else {
    console.log('Lock status: Not locked');
  }

  // Check git status
  console.log('');
  try {
    const untracked = execSync('git status --porcelain | grep "^??" | wc -l', { encoding: 'utf8' }).trim();
    const modified = execSync('git status --porcelain | grep "^ M" | wc -l', { encoding: 'utf8' }).trim();
    const staged = execSync('git status --porcelain | grep "^M" | wc -l', { encoding: 'utf8' }).trim();

    console.log(`Untracked files: ${untracked}`);
    console.log(`Modified files: ${modified}`);
    console.log(`Staged files: ${staged}`);

    if (parseInt(untracked) > 10) {
      console.log('');
      console.log('⚠️  WARNING: Many untracked files. Consider cleanup.');
    }
  } catch (e) {
    console.log('Could not determine git status');
  }

  // Check branch age
  console.log('');
  try {
    const behind = execSync('git rev-list --count HEAD..origin/main 2>/dev/null || echo 0', { encoding: 'utf8' }).trim();
    console.log(`Commits behind main: ${behind}`);
    if (parseInt(behind) > 50) {
      console.log('⚠️  WARNING: Branch is significantly behind main. Consider rebasing.');
    }
  } catch {
    console.log('Could not determine branch status');
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
}

// Parse command
const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
  case 'acquire':
    acquire(arg);
    break;
  case 'release':
    release();
    break;
  case 'check':
    check();
    break;
  case 'status':
    status();
    break;
  case '--force':
    // Force acquire even if locked
    const branch = getBranch();
    const lockFile = getLockFile(branch);
    if (fs.existsSync(lockFile)) {
      fs.unlinkSync(lockFile);
      console.log('⚠️  Force override: Previous lock removed');
    }
    acquire(process.argv[4]);
    break;
  default:
    console.log('Claude Session Lock - Prevent multi-instance conflicts');
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/claude-session-lock.mjs acquire [SD-ID]  - Acquire lock');
    console.log('  node scripts/claude-session-lock.mjs release          - Release lock');
    console.log('  node scripts/claude-session-lock.mjs check            - Check if locked');
    console.log('  node scripts/claude-session-lock.mjs status           - Full status report');
    console.log('  node scripts/claude-session-lock.mjs --force [SD-ID]  - Force acquire');
    console.log('');
    console.log('Lock timeout: 30 minutes');
    process.exit(1);
}
