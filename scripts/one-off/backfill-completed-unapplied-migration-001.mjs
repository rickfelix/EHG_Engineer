#!/usr/bin/env node
/**
 * FR-6 backfill for SD-LEO-INFRA-COMPLETED-UNAPPLIED-MIGRATION-001.
 *
 * Re-dispositions the three 2026-08-29/30 specimen SDs (SD-LEO-INFRA-CHAIRMAN-SMS-RELAY-001,
 * SD-LEO-INFRA-REJECT-PATH-VENTURE-001, SD-LEO-INFRA-DIRECTION-BLIND-KILL-001) that shipped
 * status=completed while their own migrations were unapplied -- the exact defect this SD fixes.
 * (SD-LEO-INFRA-DIRECTION-BLIND-KILL-001 added per a live success_criteria amendment; per
 * VALIDATION sub-agent review, live-verified via classifyMigrationApplyState.)
 *
 * Writes are strictly additive/idempotent:
 *   - metadata.completion_integrity_flag (JSONB merge, never overwrites other metadata keys)
 *   - for a chairman-gated specimen (sub-class B) STILL awaiting its ceremony (status is
 *     CEREMONY_PENDING/NOT_APPLIED/PARTIAL at backfill time), a chairman_decisions row via the
 *     SAME idempotent recordPendingDecision() path FR-2 wires -- existence-checked first. A
 *     sub-class B specimen whose ceremony has ALREADY landed by backfill time (status=APPLIED)
 *     gets the provenance flag only -- minting a decision for an already-resolved item would be
 *     a spurious ask, not a fix.
 * Does NOT change strategic_directives_v2.status/current_phase, and does NOT apply either
 * pending migration (operator/ceremony lane, explicitly out of scope per the SD).
 *
 * Usage:
 *   node scripts/one-off/backfill-completed-unapplied-migration-001.mjs --dry-run
 *   node scripts/one-off/backfill-completed-unapplied-migration-001.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { classifyMigrationApplyState as defaultClassify } from '../modules/handoff/executors/lead-final-approval/chairman-apply-state.js';
import { recordPendingDecision as defaultRecordPendingDecision } from '../../lib/chairman/record-pending-decision.mjs';

export const RULING = '967e551d';

// Statuses that mean "the migration is live" -- no chairman ceremony still outstanding.
const RESOLVED_STATUSES = new Set(['APPLIED', 'NO_DDL']);

export const SPECIMENS = [
  // database/migrations/ files are recorded by classifyMigrationApplyState using the BASENAME
  // only (no directory prefix) -- unlike database/chairman-gated/, which keeps the full
  // relative path so CHAIRMAN_GATED_PREFIX matching in verify-migration-apply-state.mjs works.
  { sdKey: 'SD-LEO-INFRA-CHAIRMAN-SMS-RELAY-001', file: '20260829_sms_relay_staging_routed_at_column.sql', subClass: 'A' },
  { sdKey: 'SD-LEO-INFRA-REJECT-PATH-VENTURE-001', file: 'database/chairman-gated/20260829_reject_path_type_aware_and_live_kill_gate.sql', subClass: 'B' },
  { sdKey: 'SD-LEO-INFRA-DIRECTION-BLIND-KILL-001', file: 'database/chairman-gated/20260830_direction_aware_kill_gate_and_honest_rollback_audit.sql', subClass: 'B' },
];

/**
 * Core backfill logic, dependency-injected for the unit tier (TESTABILITY per CLAUDE_EXEC.md
 * "Testability-Aware Implementation"). The CLI entrypoint (main(), below) calls this with real
 * collaborators; tests call it with mocked ones -- same code path, no duplicated logic.
 *
 * @param {Object} supabase
 * @param {Object} [deps]
 * @param {Function} [deps.classifyMigrationApplyState]
 * @param {Function} [deps.recordPendingDecision]
 * @param {boolean} [deps.dryRun=false]
 * @returns {Promise<Array<{sdKey:string, action:string}>>} per-specimen outcome log
 */
export async function runBackfill(supabase, {
  classifyMigrationApplyState = defaultClassify,
  recordPendingDecision = defaultRecordPendingDecision,
  dryRun = false,
} = {}) {
  const outcomes = [];
  const { files, error } = await classifyMigrationApplyState();
  if (error) {
    console.error(`BACKFILL ABORTED: classifier error: ${error}`);
    return [{ sdKey: null, action: 'aborted_classifier_error', error }];
  }

  for (const spec of SPECIMENS) {
    const { data: sd, error: sdErr } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, metadata')
      .eq('sd_key', spec.sdKey)
      .maybeSingle();
    if (sdErr || !sd) {
      console.error(`SKIP ${spec.sdKey}: SD not found (${sdErr?.message || 'no row'})`);
      outcomes.push({ sdKey: spec.sdKey, action: 'skip_not_found' });
      continue;
    }

    if (sd.metadata?.completion_integrity_flag) {
      console.log(`SKIP ${spec.sdKey}: completion_integrity_flag already present (idempotent no-op).`);
      outcomes.push({ sdKey: spec.sdKey, action: 'skip_already_flagged' });
      continue;
    }

    const fileState = files.find((f) => f.file === spec.file);
    const statusAtBackfill = fileState?.status || 'UNKNOWN';

    console.log(`${spec.sdKey}: sub-class ${spec.subClass}, file ${spec.file}, live status ${statusAtBackfill}`);

    if (dryRun) {
      const wouldMintDecision = spec.subClass === 'B' && !RESOLVED_STATUSES.has(statusAtBackfill);
      console.log(`  DRY-RUN: would set metadata.completion_integrity_flag and${wouldMintDecision ? '' : ' NOT'} mint a chairman_decisions row.`);
      outcomes.push({ sdKey: spec.sdKey, action: 'dry_run' });
      continue;
    }

    const flag = {
      sub_class: spec.subClass,
      migration_file: spec.file,
      status_at_backfill: statusAtBackfill,
      ruling: RULING,
      backfilled_at: new Date().toISOString(),
    };
    const { error: updErr } = await supabase
      .from('strategic_directives_v2')
      .update({ metadata: { ...sd.metadata, completion_integrity_flag: flag } })
      .eq('id', sd.id);
    if (updErr) {
      console.error(`  FAILED to write completion_integrity_flag: ${updErr.message}`);
      outcomes.push({ sdKey: spec.sdKey, action: 'flag_write_failed', error: updErr.message });
      continue;
    }
    console.log('  ✅ completion_integrity_flag written.');

    if (spec.subClass !== 'B') {
      outcomes.push({ sdKey: spec.sdKey, action: 'flagged_sub_class_a' });
      continue;
    }

    if (RESOLVED_STATUSES.has(statusAtBackfill)) {
      // The ceremony already landed (independently, before this backfill ran) -- provenance
      // flag only. Minting a chairman_decisions row for an already-resolved item would be a
      // spurious ask, the same class of noise FR-2's idempotency guard exists to prevent.
      console.log(`  live status is ${statusAtBackfill} -- ceremony already resolved, no decision minted.`);
      outcomes.push({ sdKey: spec.sdKey, action: 'flagged_sub_class_b_already_resolved' });
      continue;
    }

    const title = `${spec.sdKey}: apply chairman-gated migration ${spec.file}`;
    const { data: existing, error: existErr } = await supabase
      .from('chairman_decisions')
      .select('id')
      .eq('decision_type', 'migration_apply')
      .eq('status', 'pending')
      .eq('summary', title)
      .limit(1);
    if (existErr) {
      console.error(`  chairman_decisions existence check failed: ${existErr.message}`);
      outcomes.push({ sdKey: spec.sdKey, action: 'flagged_sub_class_b_decision_check_failed', error: existErr.message });
    } else if (existing && existing.length > 0) {
      console.log(`  chairman_decisions row already exists (id=${existing[0].id}) — idempotent skip.`);
      outcomes.push({ sdKey: spec.sdKey, action: 'flagged_sub_class_b_decision_already_exists', decisionId: existing[0].id });
    } else {
      const res = await recordPendingDecision(supabase, {
        title,
        decisionType: 'migration_apply',
        context: { sd_key: spec.sdKey, migration_file: spec.file, status: statusAtBackfill, backfilled: true },
        recommendation: 'fix',
        blocking: false,
      });
      if (!res.recorded) {
        console.error(`  FAILED to mint chairman_decisions row: ${res.error}`);
        outcomes.push({ sdKey: spec.sdKey, action: 'flagged_sub_class_b_decision_mint_failed', error: res.error });
      } else {
        console.log(`  ✅ chairman_decisions row minted (id=${res.id}).`);
        outcomes.push({ sdKey: spec.sdKey, action: 'flagged_sub_class_b_decision_minted', decisionId: res.id });
      }
    }
  }
  return outcomes;
}

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  await runBackfill(supabase, { dryRun: process.argv.includes('--dry-run') });
}

if (process.argv[1] && process.argv[1].endsWith('backfill-completed-unapplied-migration-001.mjs')) {
  main().catch((e) => { console.error('BACKFILL FAILED:', e); process.exit(1); });
}
