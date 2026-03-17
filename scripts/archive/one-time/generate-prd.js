#!/usr/bin/env node
// Convenience wrapper for template system
// Usage: node scripts/generate-prd.js <SD-ID> [--force]
import { spawn } from 'child_process';
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/generate-prd.js <SD-ID> [--force]');
  process.exit(1);
}
spawn('node', ['templates/generate-prd.js', ...args], { stdio: 'inherit' });