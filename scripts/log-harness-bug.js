#!/usr/bin/env node
// Log a harness-level bug to the `feedback` table (category='harness_backlog').
// Replaces the deprecated docs/harness-backlog.md append-only log.
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
import crypto from 'node:crypto';

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

  const today = new Date().toISOString().slice(0, 10);
  const dedupHash = crypto
    .createHash('sha256')
    .update(`${today}::${symptom}::${file || ''}`)
    .digest('hex');

  const { data: existing } = await sb
    .from('feedback')
    .select('id')
    .eq('category', 'harness_backlog')
    .eq('metadata->>dedup_hash', dedupHash)
    .maybeSingle();

  if (existing) {
    console.log(`Already logged today: feedback row ${existing.id} (no duplicate written)`);
    return;
  }

  const title = symptom.length > 120 ? `${symptom.slice(0, 117)}...` : symptom;

  const { data, error } = await sb
    .from('feedback')
    .insert({
      type: 'enhancement',
      category: 'harness_backlog',
      status: 'new',
      severity,
      source_application: 'EHG_Engineer',
      source_type: 'manual_feedback',
      title,
      description: symptom,
      metadata: {
        logged_via: 'log-harness-bug.js',
        original_date: today,
        source_location: file,
        deferred_from_sd_key: sd,
        dedup_hash: dedupHash,
      },
    })
    .select('id')
    .single();

  if (error) {
    console.error('INSERT failed:', error.message);
    process.exitCode = 1;
    return;
  }

  console.log(`Logged harness bug: feedback row ${data.id}`);
  console.log(`  category=harness_backlog status=new severity=${severity}`);
  if (sd) console.log(`  deferred_from_sd_key=${sd}`);
  if (file) console.log(`  source_location=${file}`);
  console.log('\nQuery open backlog:');
  console.log("  category='harness_backlog' AND status='new'");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
