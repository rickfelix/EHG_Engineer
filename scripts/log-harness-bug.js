#!/usr/bin/env node
// Log a harness-level bug to the `feedback` table (category='harness_backlog').
// Replaces the deprecated docs/harness-backlog.md append-only log.
//
// SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B (PA-5 refactor): the actual insert
// logic moved to lib/governance/emit-feedback.js so PA-5's capability-suppression
// warning emission can reuse the same dedup-hash pattern. This file is now a
// CLI wrapper.
//
// Usage:
//   node scripts/log-harness-bug.js "<symptom>" [--file <path>] [--sd <sd-key>] [--severity high|medium|low]
//
// Examples:
//   node scripts/log-harness-bug.js "vision-scorer doesn't read quality_checked column"
//   node scripts/log-harness-bug.js "splitPostgreSQLStatements breaks on -- comments" \
//     --file scripts/lib/supabase-connection.js --sd SD-LEO-INFRA-PR-TRACKING-BACKFILL-001
//
// Idempotent: a SHA-256 dedup_hash over (date::symptom::file) prevents duplicate inserts.
// Filter rows: category='harness_backlog' AND status='new' for the open backlog.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { emitFeedback } from '../lib/governance/emit-feedback.js';

async function main() {
  const rawArgs = process.argv.slice(2);
  const flags = {};
  const positional = [];
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i].startsWith('--')) {
      flags[rawArgs[i].slice(2)] = rawArgs[i + 1];
      i++;
    } else {
      positional.push(rawArgs[i]);
    }
  }

  const symptom = positional[0];
  if (!symptom || flags.help) {
    console.error('Usage: node scripts/log-harness-bug.js "<symptom>" [--file <path>] [--sd <sd-key>] [--severity high|medium|low]');
    process.exitCode = symptom ? 0 : 2;
    return;
  }

  const file = flags.file ?? null;
  const sd = flags.sd ?? null;
  const severity = flags.severity ?? 'medium';

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
    process.exitCode = 1;
    return;
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    const result = await emitFeedback({
      supabase: sb,
      title: symptom,
      description: symptom,
      severity,
      source_type: 'manual_feedback',
      dedup_key: file,
      metadata: {
        logged_via: 'log-harness-bug.js',
        source_location: file,
        deferred_from_sd_key: sd,
      },
    });

    if (result.deduped) {
      console.log(`Already logged today: feedback row ${result.id} (no duplicate written)`);
    } else {
      console.log(`Logged harness bug: feedback row ${result.id}`);
      console.log(`  category=harness_backlog status=new severity=${severity}`);
      if (sd) console.log(`  deferred_from_sd_key=${sd}`);
      if (file) console.log(`  source_location=${file}`);
      console.log('\nQuery open backlog:');
      console.log("  category='harness_backlog' AND status='new'");
    }
  } catch (e) {
    console.error('emitFeedback failed:', e.message);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
