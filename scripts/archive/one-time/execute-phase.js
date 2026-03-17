#!/usr/bin/env node
// Convenience wrapper for template system
// Usage: node scripts/execute-phase.js <PHASE> <SD-ID> [--force]
import { spawn } from 'child_process';
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node scripts/execute-phase.js <PHASE> <SD-ID> [--force]');
  process.exit(1);
}
spawn('node', ['templates/execute-phase.js', ...args], { stdio: 'inherit' });