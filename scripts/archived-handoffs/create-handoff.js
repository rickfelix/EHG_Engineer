#!/usr/bin/env node
// Convenience wrapper for template system
// Usage: node scripts/create-handoff.js <FROM> <TO> <SD-ID>
import { spawn } from 'child_process';
const args = process.argv.slice(2);
if (args.length !== 3) {
  console.error('Usage: node scripts/create-handoff.js <FROM> <TO> <SD-ID>');
  process.exit(1);
}
spawn('node', ['templates/create-handoff.js', ...args], { stdio: 'inherit' });