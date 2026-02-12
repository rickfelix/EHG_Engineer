#!/usr/bin/env node
/**
 * auto-state-updater.js
 *
 * Runs periodically (on Write/Edit hooks) to keep session-state.md updated
 * with current work state. This ensures the case file always reflects reality.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectDir = process.env.CLAUDE_PROJECT_DIR || 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer';
const stateFile = path.join(projectDir, '.claude', 'session-state.md');
const _hookInput = process.env.CLAUDE_TOOL_INPUT || '';

// Only update state file periodically (not every single edit)
// Check if state file was updated in last 5 minutes
try {
  if (fs.existsSync(stateFile)) {
    const stats = fs.statSync(stateFile);
    const ageMinutes = (Date.now() - stats.mtimeMs) / 60000;

    // Only update if file is older than 5 minutes
    if (ageMinutes < 5) {
      process.exit(0);
    }
  }
} catch (_e) {
  // Continue with update
}

// Get current git status
let _gitStatus = '';
let currentBranch = '';
let _recentCommits = '';

try {
  _gitStatus = execSync('git status --porcelain', { cwd: projectDir, encoding: 'utf8' }).trim();
  currentBranch = execSync('git branch --show-current', { cwd: projectDir, encoding: 'utf8' }).trim();
  _recentCommits = execSync('git log -3 --oneline', { cwd: projectDir, encoding: 'utf8' }).trim();
} catch (_e) {
  // Ignore git errors
}

// Only append a timestamp marker if state file exists
// Full state updates are done by /context-compact or manually
if (fs.existsSync(stateFile)) {
  const timestamp = new Date().toISOString();
  const marker = `\n\n---\n*Auto-checkpoint: ${timestamp}*\n*Branch: ${currentBranch}*\n`;

  // Read current content
  let content = fs.readFileSync(stateFile, 'utf8');

  // Remove old auto-checkpoint markers (keep only latest)
  content = content.replace(/\n\n---\n\*Auto-checkpoint:.*?\n\*Branch:.*?\n/g, '');

  // Append new marker
  fs.writeFileSync(stateFile, content + marker, 'utf8');
}
