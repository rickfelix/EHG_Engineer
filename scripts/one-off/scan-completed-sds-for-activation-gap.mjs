#!/usr/bin/env node
/**
 * scan-completed-sds-for-activation-gap.mjs
 *
 * SD-LEO-INFRA-REQUIRE-END-END-001 / FR-6
 *
 * Retroactive scanner. Iterates SDs marked status='completed' since the
 * configured cutoff (default 2026-01-01) and runs the trigger evaluator
 * against each. For SDs that would TRIGGER the activation invariant gate,
 * runs a heuristic coverage check (modeled on audit-activation-chain.mjs)
 * and emits one feedback row per SD with coverage_score < 0.8.
 *
 * Idempotency (mirrors auto-resolve-recovered.js pattern):
 *   - dedupe key = (category='harness_backlog', title startsWith
 *     '[ACTIVATION_CHAIN_GAP] SD-<KEY>', status NOT IN
 *     ('resolved','wont_fix','duplicate'))
 *   - SELECT-then-INSERT; UPDATE never overwrites resolved rows
 *   - Re-run is safe (no duplicate rows emitted)
 *
 * Defaults to --dry-run mode. Pass --commit to write feedback rows.
 *
 * Usage:
 *   node scripts/one-off/scan-completed-sds-for-activation-gap.mjs            # dry-run
 *   node scripts/one-off/scan-completed-sds-for-activation-gap.mjs --commit   # writes
 *   node scripts/one-off/scan-completed-sds-for-activation-gap.mjs --since 2026-03-01
 *   node scripts/one-off/scan-completed-sds-for-activation-gap.mjs --json
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { evaluateTrigger } from '../modules/activation-invariant/trigger-evaluator.js';

const PATH_HEURISTICS = {
  schema: /(database\/migrations|migrations|\.sql$)/i,
  worker: /(worker|consumer|job|orchestrator|service)/i,
  ui: /(src\/components|src\/pages|\.tsx$|\.jsx$|panel|page|route)/i,
  test: /(\.test\.[jt]s$|\.spec\.[jt]s$|tests\/)/i,
};

function parseArgs(argv) {
  const args = { dryRun: true, since: '2026-01-01', json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--commit') args.dryRun = false;
    else if (a === '--json') args.json = true;
    else if (a === '--since' && argv[i + 1]) { args.since = argv[++i]; }
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function collectTouchedFiles(sd) {
  const meta = sd?.metadata || {};
  const files = [];
  if (Array.isArray(meta.files_to_modify)) files.push(...meta.files_to_modify.map(f => f.path || f));
  if (Array.isArray(meta.files_modified)) files.push(...meta.files_modified.map(f => f.path || f));
  if (Array.isArray(sd?.key_changes)) {
    for (const kc of sd.key_changes) {
      const text = [kc?.change, kc?.detail, kc?.title, kc?.impact, kc?.description].filter(Boolean).join(' ');
      const m = text.match(/[\w/-]+\.(?:sql|tsx?|jsx?|mjs|cjs|ts|js)\b/g) || [];
      files.push(...m);
    }
  }
  return [...new Set(files)].filter(Boolean);
}

function coverageScore(files) {
  const dims = { schema: 0, worker: 0, ui: 0, test: 0 };
  for (const f of files) {
    for (const [d, r] of Object.entries(PATH_HEURISTICS)) if (r.test(f)) dims[d]++;
  }
  const passedDims = Object.values(dims).filter(n => n > 0).length;
  return { dims, passedDims, total: 4, ratio: passedDims / 4 };
}

async function findExistingFeedbackRow(supabase, sdKey) {
  const titlePrefix = `[ACTIVATION_CHAIN_GAP] SD-${sdKey}`;
  const { data } = await supabase
    .from('feedback')
    .select('id, status, title')
    .ilike('title', `${titlePrefix}%`)
    .not('status', 'in', '(resolved,wont_fix,duplicate)')
    .limit(1);
  return data && data.length > 0 ? data[0] : null;
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  if (args.help) {
    console.log('Usage: scan-completed-sds-for-activation-gap.mjs [--commit] [--since YYYY-MM-DD] [--json]');
    process.exit(0);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(2);
  }
  const supabase = createClient(url, key);

  console.log(`[ACTIVATION_CHAIN_SCAN] mode=${args.dryRun ? 'DRY-RUN' : 'COMMIT'} since=${args.since}`);
  console.log('─'.repeat(72));

  // Page through completed SDs since cutoff.
  const PAGE_SIZE = 200;
  let offset = 0;
  let totalScanned = 0;
  let triggered = 0;
  let flagged = 0;
  const flaggedList = [];

  for (;;) {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, metadata, key_changes, description, scope, completion_date, created_at')
      .eq('status', 'completed')
      .gte('completion_date', args.since)
      .order('completion_date', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error('Page query failed:', error.message);
      process.exit(2);
    }
    if (!data || data.length === 0) break;

    for (const sd of data) {
      totalScanned++;
      const trig = evaluateTrigger(sd);
      if (!trig.triggered) continue;
      triggered++;

      const files = collectTouchedFiles(sd);
      const score = coverageScore(files);
      if (score.ratio >= 0.8) continue; // 4/4 or close enough — chain looks complete

      flagged++;
      const missing = Object.entries(score.dims).filter(([, n]) => n === 0).map(([d]) => d).join(',');

      const titlePrefix = `[ACTIVATION_CHAIN_GAP] SD-${sd.sd_key}`;
      const title = `${titlePrefix} missing: ${missing}`;
      const body = [
        '```json',
        JSON.stringify({
          sd_key: sd.sd_key,
          sd_id: sd.id,
          coverage: score.ratio,
          dimensions: score.dims,
          missing: missing.split(','),
          files_examined_count: files.length,
        }, null, 2),
        '```',
        '',
        'Detected by retroactive scan from SD-LEO-INFRA-REQUIRE-END-END-001 / FR-6.',
        'Remediation: file a follow-up SD per gap to author the missing activation-invariant test and seed/wire data.',
      ].join('\n');

      const flaggedEntry = { sd_key: sd.sd_key, missing, coverage: score.ratio };
      flaggedList.push(flaggedEntry);

      // Dedupe by title prefix; skip if existing active row.
      const existing = await findExistingFeedbackRow(supabase, sd.sd_key);
      if (existing) {
        flaggedEntry.action = 'skipped_existing';
        flaggedEntry.existing_id = existing.id;
        if (!args.json) console.log(`  ⊙ ${sd.sd_key} — existing row ${existing.id}`);
        continue;
      }

      if (args.dryRun) {
        flaggedEntry.action = 'dry_run_would_insert';
        if (!args.json) console.log(`  ◇ ${sd.sd_key} — would INSERT (missing: ${missing})`);
      } else {
        const { data: ins, error: insErr } = await supabase
          .from('feedback')
          .insert({
            title,
            description: body,
            category: 'harness_backlog',
            severity: 'medium',
            status: 'new',
            source: 'scan-completed-sds-for-activation-gap',
            metadata: {
              sd_key: sd.sd_key,
              sd_id: sd.id,
              coverage_score: score.ratio,
              missing_dimensions: missing.split(','),
              detected_by_sd: 'SD-LEO-INFRA-REQUIRE-END-END-001',
            },
          })
          .select('id')
          .single();
        if (insErr) {
          flaggedEntry.action = 'insert_error';
          flaggedEntry.error = insErr.message;
          if (!args.json) console.log(`  ✗ ${sd.sd_key} — INSERT failed: ${insErr.message}`);
        } else {
          flaggedEntry.action = 'inserted';
          flaggedEntry.feedback_id = ins.id;
          if (!args.json) console.log(`  ✓ ${sd.sd_key} — feedback ${ins.id}`);
        }
      }
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const summary = {
    mode: args.dryRun ? 'dry_run' : 'commit',
    since: args.since,
    scanned: totalScanned,
    triggered,
    flagged_with_gap: flagged,
    coverage_avg: 'see individual rows',
    flagged_list: flaggedList,
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log('─'.repeat(72));
    console.log(`Scanned ${totalScanned} completed SDs; ${triggered} triggered the heuristic; ${flagged} flagged with gap`);
    console.log(args.dryRun ? '(dry-run — no writes performed; re-run with --commit to emit feedback rows)' : '(commit mode — feedback rows emitted as listed above)');
  }
  process.exit(0);
}

main().catch(err => {
  console.error('UNEXPECTED ERROR:', err);
  process.exit(2);
});
