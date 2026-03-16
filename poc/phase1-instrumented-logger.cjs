#!/usr/bin/env node
/**
 * Phase 1: Instrumented Logger for Terminal Identity
 *
 * Monkey-patches getTerminalId() to log every call to a JSONL file.
 * Load via: NODE_OPTIONS="--require ./poc/phase1-instrumented-logger.js"
 *
 * Logs: timestamp, terminal_id, resolution method, latency_ms, pid, ppid
 * Output: .claude/poc-identity-logs/{session-id}.jsonl
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(process.cwd(), '.claude', 'poc-identity-logs');
const SESSION_ID = process.env.CLAUDE_SESSION_ID || `anon-${process.pid}`;
const LOG_FILE = path.join(LOG_DIR, `${SESSION_ID}.jsonl`);

// Ensure log directory exists
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}

function logEntry(entry) {
  const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + '\n';
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
}

// Attempt to patch getTerminalId if terminal-identity module is loaded
try {
  const termIdentity = require('../lib/terminal-identity.js');
  if (termIdentity && typeof termIdentity.getTerminalId === 'function') {
    const original = termIdentity.getTerminalId;
    termIdentity.getTerminalId = async function patchedGetTerminalId(...args) {
      const start = performance.now();
      const result = await original.apply(this, args);
      const latency = Math.round((performance.now() - start) * 100) / 100;
      logEntry({
        terminal_id: result,
        latency_ms: latency,
        pid: process.pid,
        ppid: process.ppid,
        method: 'getTerminalId',
        session: SESSION_ID
      });
      return result;
    };
    logEntry({ event: 'instrumentation_loaded', pid: process.pid, log_file: LOG_FILE });
  }
} catch {
  // Module not available in this context — log startup only
  logEntry({ event: 'instrumentation_standalone', pid: process.pid, log_file: LOG_FILE });
}

// Also export a manual logging function for scripts that can't use --require
module.exports = { logEntry, LOG_FILE, LOG_DIR };

if (require.main === module) {
  console.log('Phase 1 Instrumented Logger');
  console.log('  Log directory:', LOG_DIR);
  console.log('  Log file:', LOG_FILE);
  console.log('  Session:', SESSION_ID);
  console.log('');
  console.log('Usage:');
  console.log('  As --require: NODE_OPTIONS="--require ./poc/phase1-instrumented-logger.js" npm run sd:start ...');
  console.log('  As standalone: node poc/phase1-instrumented-logger.js');
  console.log('');

  // Quick self-test: log current process info
  logEntry({
    event: 'self_test',
    pid: process.pid,
    ppid: process.ppid,
    cwd: process.cwd(),
    node_version: process.version
  });
  console.log('  Self-test entry written to', LOG_FILE);
}
