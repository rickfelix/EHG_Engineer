#!/usr/bin/env node
/**
 * Gate 0: Env Var Propagation Test
 *
 * Tests whether a custom environment variable survives the full
 * node -> cmd -> bash -> bash -> node spawn chain on Windows.
 *
 * Result: FAIL (2026-03-16) — MSYS2 scrubs custom env vars.
 * This means Option A (env var primary) is not viable.
 */

const { execSync } = require('child_process');

const testUUID = '550e8400-e29b-41d4-a716-446655440000';
process.env.CLAUDE_SESSION_ID = testUUID;

console.log('========================================');
console.log('  GATE 0: ENV VAR PROPAGATION TEST');
console.log('========================================');
console.log('  Chain: node -> cmd -> bash -> bash -> node');
console.log('  Set:   CLAUDE_SESSION_ID=' + testUUID);
console.log('');

// Use child_process.spawn for cleaner argument passing (avoids shell quoting hell)
const { spawnSync } = require('child_process');

function runChain(name, file, args) {
  const result = spawnSync(file, args, { env: process.env, encoding: 'utf8', timeout: 10000, shell: false });
  return { name, stdout: (result.stdout || '').trim(), stderr: (result.stderr || '').trim(), status: result.status };
}

// Write a temp script that prints the env var — avoids all quoting issues
const fs = require('fs');
const path = require('path');
const tmpScript = path.join(__dirname, '_gate0_probe.cjs');
fs.writeFileSync(tmpScript, 'console.log(process.env.CLAUDE_SESSION_ID || "EMPTY");');

const chains = [
  { name: 'direct node', ...runChain('direct node', 'node', [tmpScript]) },
  { name: 'cmd -> node', ...runChain('cmd -> node', 'cmd', ['/c', 'node', tmpScript]) },
  { name: 'bash -> node', ...runChain('bash -> node', 'bash', ['-c', 'node ' + tmpScript.replace(/\\/g, '/')]) },
  { name: 'bash -> bash -> node', ...runChain('bash -> bash -> node', 'bash', ['-c', 'bash -c "node ' + tmpScript.replace(/\\/g, '/') + '"']) },
];

// Cleanup temp script
try { fs.unlinkSync(tmpScript); } catch {}

let allPass = true;

for (const chain of chains) {
  const pass = chain.stdout === testUUID;
  if (!pass) allPass = false;
  console.log(`  ${pass ? 'PASS' : 'FAIL'} [${chain.name}]: ${chain.stdout || chain.stderr || '(empty)'}`);
}

console.log('');
console.log('========================================');
console.log('  RESULT: ' + (allPass ? 'ALL PASS — Option A viable' : 'FAIL — env vars scrubbed by MSYS2'));
console.log('========================================');
process.exit(allPass ? 0 : 1);
