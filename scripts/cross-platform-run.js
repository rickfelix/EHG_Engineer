#!/usr/bin/env node

/**
 * Cross-Platform Script Runner
 *
 * Detects OS and runs the appropriate script version:
 * - Windows: Uses .ps1 (PowerShell) if available, otherwise .sh via Git Bash
 * - Linux/macOS/WSL: Uses .sh (Bash)
 *
 * Usage:
 *   node scripts/cross-platform-run.js <script-name> [args...]
 *
 * Example:
 *   node scripts/cross-platform-run.js run-human-like-tests --category accessibility
 *   node scripts/cross-platform-run.js leo_compliance_audit
 *
 * Part of SD-WIN-MIG-002-NPM: npm Script Cross-Platform Compatibility
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get script name and arguments
const args = process.argv.slice(2);
const scriptName = args[0];
const scriptArgs = args.slice(1);

if (!scriptName) {
  console.error('Usage: node scripts/cross-platform-run.js <script-name> [args...]');
  console.error('Example: node scripts/cross-platform-run.js run-human-like-tests --category accessibility');
  process.exit(1);
}

// Determine platform
const isWindows = os.platform() === 'win32';

// Build script paths
const psScript = join(__dirname, `${scriptName}.ps1`);
const shScript = join(__dirname, `${scriptName}.sh`);

// Check what's available
const hasPowerShell = existsSync(psScript);
const hasBash = existsSync(shScript);

if (!hasPowerShell && !hasBash) {
  console.error(`Error: No script found for "${scriptName}"`);
  console.error(`  Looked for: ${psScript}`);
  console.error(`  Looked for: ${shScript}`);
  process.exit(1);
}

let command;
let commandArgs;

if (isWindows) {
  if (hasPowerShell) {
    // Use PowerShell on Windows when .ps1 is available
    command = 'powershell.exe';
    commandArgs = [
      '-ExecutionPolicy', 'Bypass',
      '-NoProfile',
      '-File', psScript,
      ...scriptArgs
    ];
    console.log(`[cross-platform] Running PowerShell: ${scriptName}.ps1`);
  } else if (hasBash) {
    // Fall back to Git Bash on Windows if no .ps1 exists
    // Check common Git Bash locations
    const gitBashPaths = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      process.env.GIT_BASH_PATH || ''
    ].filter(Boolean);

    const gitBash = gitBashPaths.find(p => existsSync(p));

    if (gitBash) {
      command = gitBash;
      commandArgs = [shScript, ...scriptArgs];
      console.log(`[cross-platform] Running via Git Bash: ${scriptName}.sh`);
    } else {
      console.error('Error: No PowerShell script available and Git Bash not found.');
      console.error(`  Script "${scriptName}" requires bash but only .sh version exists.`);
      console.error(`  Install Git for Windows or create ${scriptName}.ps1`);
      process.exit(1);
    }
  }
} else {
  // Linux/macOS/WSL - use bash
  if (hasBash) {
    command = 'bash';
    commandArgs = [shScript, ...scriptArgs];
    console.log(`[cross-platform] Running Bash: ${scriptName}.sh`);
  } else {
    console.error(`Error: No .sh script found for "${scriptName}" on this platform.`);
    process.exit(1);
  }
}

// Spawn the process
const child = spawn(command, commandArgs, {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: {
    ...process.env,
    // Ensure colors work
    FORCE_COLOR: '1'
  }
});

child.on('error', (err) => {
  console.error(`Error executing script: ${err.message}`);
  process.exit(1);
});

child.on('close', (code) => {
  process.exit(code || 0);
});
