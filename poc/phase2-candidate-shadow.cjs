#!/usr/bin/env node
/**
 * Phase 2: Shadow Mode Candidate Comparator
 *
 * Runs the candidate identity resolution alongside the existing one.
 * Logs both values and flags disagreements. Uses the existing value
 * for actual decisions — shadow mode only.
 *
 * Usage: NODE_OPTIONS="--require ./poc/phase2-candidate-shadow.js" npm run sd:start ...
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(process.cwd(), '.claude', 'poc-identity-logs');
const SESSION_ID = process.env.CLAUDE_SESSION_ID || `shadow-${process.pid}`;
const SHADOW_LOG = path.join(LOG_DIR, `shadow-${SESSION_ID}.jsonl`);

try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}

function logShadow(entry) {
  const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + '\n';
  try { fs.appendFileSync(SHADOW_LOG, line); } catch {}
}

// Attempt to patch getTerminalId with shadow comparison
try {
  const termIdentity = require('../lib/terminal-identity.js');
  const { findClaudeCodePidNative } = require('./native-tree-walk.js');

  if (termIdentity && typeof termIdentity.getTerminalId === 'function') {
    const original = termIdentity.getTerminalId;

    termIdentity.getTerminalId = async function shadowGetTerminalId(...args) {
      // Run both in parallel
      const [existingResult, candidateResult] = await Promise.allSettled([
        original.apply(this, args),
        findClaudeCodePidNative()
      ]);

      const existing = existingResult.status === 'fulfilled' ? existingResult.value : 'ERROR';
      const candidate = candidateResult.status === 'fulfilled' ? candidateResult.value : { pid: null, error: 'failed' };

      const match = existing === candidate?.pid?.toString() ||
                    (existing && candidate?.pid && existing.includes(String(candidate.pid)));

      logShadow({
        existing_terminal_id: existing,
        candidate_pid: candidate?.pid,
        candidate_method: candidate?.method,
        candidate_latency_ms: candidate?.latency_ms,
        match: match ? 'AGREE' : 'DISAGREE',
        pid: process.pid
      });

      if (!match) {
        logShadow({
          event: 'MISMATCH_DETECTED',
          existing_terminal_id: existing,
          candidate_pid: candidate?.pid,
          candidate_chain: candidate?.chain?.slice(0, 3)
        });
      }

      // Return existing value — shadow mode does not change behavior
      return existing;
    };

    logShadow({ event: 'shadow_mode_loaded', pid: process.pid, log_file: SHADOW_LOG });
  }
} catch (e) {
  logShadow({ event: 'shadow_mode_error', error: e.message, pid: process.pid });
}

// Analysis utility
function analyzeShadowLogs(logDir) {
  const files = fs.readdirSync(logDir || LOG_DIR).filter(f => f.startsWith('shadow-') && f.endsWith('.jsonl'));
  let total = 0, agrees = 0, disagrees = 0;

  for (const file of files) {
    const lines = fs.readFileSync(path.join(logDir || LOG_DIR, file), 'utf8').trim().split('\n');
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.match) {
          total++;
          if (entry.match === 'AGREE') agrees++;
          else disagrees++;
        }
      } catch {}
    }
  }

  return {
    total_comparisons: total,
    agrees,
    disagrees,
    mismatch_rate: total > 0 ? Math.round((disagrees / total) * 10000) / 100 + '%' : 'N/A',
    pass: disagrees === 0
  };
}

if (require.main === module) {
  console.log('========================================');
  console.log('  PHASE 2: SHADOW MODE COMPARATOR');
  console.log('========================================');

  if (process.argv[2] === 'analyze') {
    const results = analyzeShadowLogs();
    console.log('  Analysis Results:');
    console.log('    Total comparisons:', results.total_comparisons);
    console.log('    Agrees:', results.agrees);
    console.log('    Disagrees:', results.disagrees);
    console.log('    Mismatch rate:', results.mismatch_rate);
    console.log('    Pass:', results.pass ? 'YES' : 'NO');
  } else {
    console.log('  Shadow log:', SHADOW_LOG);
    console.log('');
    console.log('  Usage:');
    console.log('    Run:     NODE_OPTIONS="--require ./poc/phase2-candidate-shadow.js" npm run sd:start ...');
    console.log('    Analyze: node poc/phase2-candidate-shadow.js analyze');
  }
  console.log('========================================');
}

module.exports = { analyzeShadowLogs };
