#!/usr/bin/env node
/**
 * One-time audit walker: surfaces pre-existing code-vs-DB content parity gaps
 * in already-completed SDs.
 * SD: SD-LEO-INFRA-CODE-CONTENT-PARITY-001 (FR-4)
 *
 * Usage:
 *   node scripts/audit-completed-sd-db-content-parity.js [--since YYYY-MM-DD] [--sd-id <key>] [--dry-run]
 *
 * Reads each completed SD's metadata.db_content_assertions (when present), runs
 * the same gate logic against live DB rows, and writes a feedback row per drift
 * detected (category='harness_backlog', source_type='manual_feedback',
 * metadata.parity_gap_detected=true, metadata.audit_run_id=<UUID>).
 *
 * --dry-run skips all feedback writes — prints findings to stdout only.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { validateDbContentParity } from '../scripts/modules/handoff/gates/db-content-parity-gate.js';
// SD-FDBK-INFRA-MIGRATE-EMIT-FEEDBACK-001 FR-5: route through canonical helper
import { emitFeedback } from '../lib/governance/emit-feedback.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: with no --since/--sd-id filter this
// walks EVERY completed SD ever (a growing table), so paginate.
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

function parseArgs(argv) {
  const flags = { since: null, sdId: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--since') flags.since = argv[++i];
    else if (a === '--sd-id') flags.sdId = argv[++i];
    else if (a === '--dry-run') flags.dryRun = true;
  }
  return flags;
}

export async function runAudit({ supabase, since, sdId, dryRun, auditRunId }) {
  const buildQuery = () => {
    let q = supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status, updated_at, metadata')
      .eq('status', 'completed');
    if (since) q = q.gte('updated_at', since);
    if (sdId) q = q.eq('sd_key', sdId);
    return q.order('id', { ascending: true }); // unique tiebreaker (FR-6)
  };
  let sds;
  try {
    sds = await fetchAllPaginated(buildQuery);
  } catch (e) {
    throw new Error(`SD walk failed: ${e.message}`);
  }

  const findings = [];
  for (const sd of sds || []) {
    const assertions = Array.isArray(sd.metadata?.db_content_assertions) ? sd.metadata.db_content_assertions : [];
    if (assertions.length === 0) continue;

    const result = await validateDbContentParity(sd.sd_key, supabase);
    if (result.pass) continue;

    findings.push({ sd_key: sd.sd_key, mismatches: result.mismatches });

    if (dryRun) continue;

    const summary = result.mismatches
      .map((m) => `${m.table}/${JSON.stringify(m.row_filter)}: ${m.column} expected=${JSON.stringify(m.expected)} actual=${JSON.stringify(m.actual)}`)
      .join('; ');
    const title = `DB content parity gap: ${sd.sd_key}`;
    // SD-FDBK-INFRA-MIGRATE-EMIT-FEEDBACK-001 FR-5: canonical helper invocation.
    // dedup_key includes auditRunId so cross-audit-run dedup is intentional (re-runs DO insert).
    await emitFeedback({
      supabase,
      type: 'enhancement',
      severity: 'medium',
      title,
      description: `Audit detected ${result.mismatches.length} content-parity mismatch(es): ${summary}`,
      dedup_key: `audit-content-parity:${sd.sd_key}:${auditRunId}`,
      metadata: {
        logged_via: 'audit-completed-sd-db-content-parity.js',
        deferred_from_sd_key: sd.sd_key,
        parity_gap_detected: true,
        audit_run_id: auditRunId,
        mismatch_count: result.mismatches.length,
        mismatches: result.mismatches,
      },
    });
  }
  return findings;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
    process.exitCode = 1;
    return;
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const auditRunId = crypto.randomUUID();

  console.log(`[parity-audit] run_id=${auditRunId} dry_run=${flags.dryRun} since=${flags.since || '(all)'} sd=${flags.sdId || '(all)'}`);
  const findings = await runAudit({ supabase, ...flags, auditRunId });

  if (findings.length === 0) {
    console.log('[parity-audit] No drift detected. ✅');
    return;
  }
  for (const f of findings) {
    console.log(`[parity-audit] DRIFT ${f.sd_key} — ${f.mismatches.length} mismatch(es)`);
    for (const m of f.mismatches) {
      console.log(`  ${m.table}/${JSON.stringify(m.row_filter)}: ${m.column} expected=${JSON.stringify(m.expected)} actual=${JSON.stringify(m.actual)}`);
    }
  }
  console.log(`[parity-audit] ${findings.length} SD(s) with drift.${flags.dryRun ? ' (dry-run; no feedback rows written)' : ''}`);
}

const isDirectInvoke = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('audit-completed-sd-db-content-parity.js');
if (isDirectInvoke) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
