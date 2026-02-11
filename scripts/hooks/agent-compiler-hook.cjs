#!/usr/bin/env node
/**
 * Session-start hook: Ensure generated agent .md files exist and are current.
 * Runs the prompt compiler in incremental mode (skips if inputs unchanged).
 *
 * SD-LEO-INFRA-BRIDGE-AGENT-SYSTEMS-001 (FR-6)
 *
 * This is a CJS wrapper because Claude Code hooks require CJS format.
 * It spawns the ESM compiler as a child process.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const AGENTS_DIR = path.join(ROOT, '.claude', 'agents');

// Quick check: do generated .md files exist?
const partials = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.partial.md'));
const generated = fs.readdirSync(AGENTS_DIR).filter(f =>
  f.endsWith('.md') &&
  !f.endsWith('.partial.md') &&
  !['AGENT-MANIFEST.md', 'README.md', '_model-tracking-section.md'].includes(f)
);

// If all expected .md files exist, run incremental (fast skip)
// If some are missing, run full generation
const mode = generated.length >= partials.length ? '--incremental' : '';

try {
  const start = Date.now();
  const output = execSync(
    `node "${path.join(ROOT, 'scripts', 'generate-agent-md-from-db.js')}" ${mode}`,
    {
      cwd: ROOT,
      timeout: 15000, // 15s hard limit
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    }
  );

  const duration = Date.now() - start;
  const stdout = output.toString();

  // Extract key info for hook output
  if (stdout.includes('No changes detected')) {
    console.log(`SessionStart:agent-compiler: no changes (${duration}ms)`);
  } else if (stdout.includes('compilation complete')) {
    const match = stdout.match(/(\d+) compiled/);
    const count = match ? match[1] : '?';
    console.log(`SessionStart:agent-compiler: ${count} agents compiled (${duration}ms)`);
  }
} catch (err) {
  // Don't block session start on compiler failure
  const stderr = err.stderr?.toString() || err.message;
  if (stderr.includes('Missing Supabase credentials')) {
    console.log('SessionStart:agent-compiler: skipped (no DB credentials)');
  } else {
    console.error(`SessionStart:agent-compiler: FAILED - ${stderr.substring(0, 200)}`);
  }
}
