#!/usr/bin/env node
/**
 * CLI: park / unpark a Strategic Directive (status='deferred' = the canonical parked
 * state). Replaces the cancel-to-park anti-pattern and the dead do_not_auto_start flag.
 *
 *   node scripts/sd-park.js park   <SD-KEY> --reason "<why>" [--actor <role>] \
 *     [--review-at <ISO-timestamp>] [--release-condition "<text>"]
 *   node scripts/sd-park.js unpark <SD-KEY> [--restore <status>] [--actor <role>]
 *
 * Park excludes the SD from sd:next recommendations + the stale-session sweep while
 * keeping it fully queryable; unpark restores a workable status (re-claim via sd-start).
 * SD-LEO-INFRA-PARKED-STATUS-REPLACE-001.
 *
 * --review-at/--release-condition (SD-LEO-INFRA-HOLD-STATE-CONTRACT-001) are OPTIONAL —
 * omitting them is unchanged behavior while HOLD_STATE_CONTRACT_MODE=observe (default;
 * only logs a calibration row), and lets an operator satisfy 'enforce' mode when armed.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { park, unpark } from '../lib/sd-park.js';

function flag(rest, name) {
  const i = rest.indexOf('--' + name);
  return i >= 0 ? rest[i + 1] : undefined;
}

async function main() {
  const [verb, sdKey, ...rest] = process.argv.slice(2);
  if (!['park', 'unpark'].includes(verb) || !sdKey) {
    console.error('Usage:');
    console.error('  node scripts/sd-park.js park   <SD-KEY> --reason "<why>" [--actor <role>] [--review-at <ISO-timestamp>] [--release-condition "<text>"]');
    console.error('  node scripts/sd-park.js unpark <SD-KEY> [--restore <status>] [--actor <role>]');
    process.exit(1);
  }
  const actor = flag(rest, 'actor') || 'cli';
  if (actor === 'EXEC') { console.error('refusing --actor EXEC (enforce_doctrine_of_constraint)'); process.exit(1); }
  const { createDatabaseClient } = await import('../lib/supabase-connection.js');
  const client = await createDatabaseClient('engineer', { verify: false });
  try {
    if (verb === 'park') {
      const reason = flag(rest, 'reason');
      if (!reason) { console.error('park requires --reason "<why>"'); process.exit(1); }
      const reviewAt = flag(rest, 'review-at');
      const releaseCondition = flag(rest, 'release-condition');
      // Best-effort only: this CLI's canonical write path is the pg `client` above
      // (createDatabaseClient, gated on DB creds). The Supabase-js client here exists
      // solely to log an observe-mode calibration row and must never break the park
      // itself if the API creds (distinct from the DB creds) aren't provisioned in this
      // environment -- logHoldStateViolation() already no-ops on a falsy client.
      let supabaseForViolationLog = null;
      try {
        supabaseForViolationLog = createClient(
          process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );
      } catch { /* fail-soft: violation logging is best-effort, never blocks the park itself */ }
      const r = await park(client, sdKey, {
        reason, actor, reviewAt, releaseCondition,
        writingSessionId: process.env.CLAUDE_SESSION_ID || null,
        supabaseForViolationLog,
      });
      console.log(`✓ parked ${r.sdKey}: ${r.parked_from_status} → ${r.status}${r.edge ? ' (progress normalized to dodge auto_transition)' : ''}; claim released`);
    } else {
      const r = await unpark(client, sdKey, { actor, restoreStatus: flag(rest, 'restore') });
      console.log(`✓ unparked ${r.sdKey} → ${r.status} (re-claim via: node scripts/sd-start.js ${r.sdKey})`);
    }
  } finally {
    if (client && typeof client.end === 'function') await client.end();
  }
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
