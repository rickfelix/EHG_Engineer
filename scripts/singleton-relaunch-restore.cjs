#!/usr/bin/env node
/**
 * singleton-relaunch-restore.cjs — SD-LEO-INFRA-COORDINATOR-ORCHESTRATED-SINGLETON-REFRESH-001-B (FR-2)
 *
 * Thin CLI wrapper a newly-booted singleton calls to restore the retiring predecessor's
 * handoff-memory: `node scripts/singleton-relaunch-restore.cjs --predecessor-session-id <id>`.
 * Prints the normalized handoff_memory as JSON (or an empty-but-valid shape if the predecessor
 * row/key is absent). Never throws — always exits 0 with valid JSON on stdout.
 */

// Silence dotenvx/dotenv tip-of-the-day lines that would otherwise corrupt our stdout JSON
// contract (mirrors scripts/fleet-liveness-mc.cjs). Consumers parse stdout as JSON; env-tool
// chatter must go to stderr or be suppressed entirely.
process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET || 'true';
process.env.DOTENV_QUIET = process.env.DOTENV_QUIET || 'true';
const _origStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = function muted(chunk, ...rest) {
  const s = typeof chunk === 'string' ? chunk : (Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk));
  if (s.includes('injected env') || s.startsWith('◇')) return process.stderr.write(s, ...rest);
  return _origStdoutWrite(chunk, ...rest);
};

require('dotenv').config();

function parseArgs(argv) {
  const idx = argv.indexOf('--predecessor-session-id');
  return idx >= 0 ? argv[idx + 1] : null;
}

async function main() {
  const predecessorSessionId = parseArgs(process.argv.slice(2));
  if (!predecessorSessionId) {
    console.log(JSON.stringify({ items: [], captured_at: null, predecessor_session_id: null, error: 'missing --predecessor-session-id' }));
    return;
  }

  let supabase = null;
  try { supabase = require('../lib/supabase-client.cjs').createSupabaseServiceClient(); } catch { /* fail-soft below */ }

  const { readHandoffMemory } = require('../lib/coordinator/handoff-memory-store.cjs');
  const hm = await readHandoffMemory(supabase, predecessorSessionId);
  console.log(JSON.stringify(hm));
}

module.exports = { parseArgs, main };

if (require.main === module) {
  main().catch((e) => {
    console.log(JSON.stringify({ items: [], captured_at: null, predecessor_session_id: null, error: e && e.message ? e.message : String(e) }));
  });
}
