#!/usr/bin/env node
/**
 * Unified Inbox CLI
 * SD-LEO-ORCH-SELF-IMPROVING-LEO-001-D
 *
 * Usage:
 *   node scripts/leo-unified-inbox.js              # Text output (concise)
 *   node scripts/leo-unified-inbox.js --verbose     # Text output (detailed)
 *   node scripts/leo-unified-inbox.js --format json # JSON output for tooling
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { buildUnifiedInbox } from '../lib/inbox/unified-inbox-builder.js';
import { formatText, formatJSON } from '../lib/inbox/format-inbox.js';

const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const jsonOutput = args.includes('--format') && args[args.indexOf('--format') + 1] === 'json';
const completedDays = (() => {
  const idx = args.indexOf('--completed-days');
  return idx >= 0 ? parseInt(args[idx + 1], 10) || 30 : 30;
})();

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    process.stderr.write('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set\n');
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const result = await buildUnifiedInbox(supabase, {
    includeCompleted: true,
    completedDaysBack: completedDays
  });

  if (jsonOutput) {
    process.stdout.write(formatJSON(result) + '\n');
  } else {
    process.stdout.write(formatText(result, { verbose }) + '\n');
  }
}

main().catch(err => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
