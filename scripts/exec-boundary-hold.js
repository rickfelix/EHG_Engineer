#!/usr/bin/env node

/**
 * exec_boundary_hold set/clear CLI (SD-LEO-INFRA-HOLD-STATE-CONTRACT-001, FR-3).
 *
 * Closes the "set via ad-hoc SQL today" gap: gives the coordinator a real
 * writer/clearer for the phase-scoped EXEC fence instead of a manual UPDATE.
 *
 * Usage:
 *   node scripts/exec-boundary-hold.js set <SD-KEY> --reason "<text>" --owner "<text>" \
 *     --review-at <ISO-timestamp> --release-condition "<text>"
 *   node scripts/exec-boundary-hold.js clear <SD-KEY> --cleared-by "<text>"
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { isMainModule } from '../lib/utils/is-main-module.js';
import { setExecBoundaryHold, clearExecBoundaryHold } from '../lib/fleet/exec-boundary-hold-writer.js';

dotenv.config();

export function parseExecBoundaryHoldArgs(argv) {
  const args = argv.slice();
  const command = args[0];
  if (!command || command === '--help' || command === '-h') return { showHelp: true };
  if (command !== 'set' && command !== 'clear') return { showHelp: true, error: `unknown command: ${command}` };

  const sdKey = args[1];
  const opts = { reason: null, owner: null, reviewAt: null, releaseCondition: null, clearedBy: null };
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--reason') { opts.reason = args[++i]; }
    else if (args[i] === '--owner') { opts.owner = args[++i]; }
    else if (args[i] === '--review-at') { opts.reviewAt = args[++i]; }
    else if (args[i] === '--release-condition') { opts.releaseCondition = args[++i]; }
    else if (args[i] === '--cleared-by') { opts.clearedBy = args[++i]; }
  }
  return { showHelp: false, command, sdKey, ...opts };
}

function displayHelp() {
  console.log(`
exec_boundary_hold set/clear (SD-LEO-INFRA-HOLD-STATE-CONTRACT-001)

Usage:
  node scripts/exec-boundary-hold.js set <SD-KEY> --reason "<text>" --owner "<text>" \\
    --review-at <ISO-timestamp> --release-condition "<text>"
  node scripts/exec-boundary-hold.js clear <SD-KEY> --cleared-by "<text>"
`);
}

async function main() {
  const parsed = parseExecBoundaryHoldArgs(process.argv.slice(2));
  if (parsed.showHelp) {
    if (parsed.error) console.error(`❌ ${parsed.error}`);
    displayHelp();
    process.exit(parsed.error ? 1 : 0);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const { data: sd, error } = await supabase
      .from('strategic_directives_v2').select('id').eq('sd_key', parsed.sdKey).single();
    if (error || !sd) throw new Error(`SD not found: ${parsed.sdKey}`);

    if (parsed.command === 'set') {
      const result = await setExecBoundaryHold(supabase, sd.id, {
        reason: parsed.reason, owner: parsed.owner, reviewAt: parsed.reviewAt,
        releaseCondition: parsed.releaseCondition, writingSessionId: process.env.CLAUDE_SESSION_ID || null,
      });
      console.log(`✅ exec_boundary_hold set on ${parsed.sdKey} (mode=${result.mode}, valid=${result.ok})`);
    } else {
      await clearExecBoundaryHold(supabase, sd.id, { clearedBy: parsed.clearedBy });
      console.log(`✅ exec_boundary_hold cleared on ${parsed.sdKey}`);
    }
    process.exitCode = 0;
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
