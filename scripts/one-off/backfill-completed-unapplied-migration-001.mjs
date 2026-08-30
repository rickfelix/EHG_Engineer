#!/usr/bin/env node
/**
 * FR-6 backfill for SD-LEO-INFRA-COMPLETED-UNAPPLIED-MIGRATION-001.
 *
 * Re-dispositions the two 2026-08-29 specimen SDs (SD-LEO-INFRA-CHAIRMAN-SMS-RELAY-001,
 * SD-LEO-INFRA-REJECT-PATH-VENTURE-001) that shipped status=completed while their own
 * migrations were unapplied -- the exact defect this SD fixes.
 *
 * Writes are strictly additive/idempotent:
 *   - metadata.completion_integrity_flag (JSONB merge, never overwrites other metadata keys)
 *   - for the chairman-gated specimen only (sub-class B), a chairman_decisions row via the
 *     SAME idempotent recordPendingDecision() path FR-2 wires -- existence-checked first.
 * Does NOT change strategic_directives_v2.status/current_phase, and does NOT apply either
 * pending migration (operator/ceremony lane, explicitly out of scope per the SD).
 *
 * Usage:
 *   node scripts/one-off/backfill-completed-unapplied-migration-001.mjs --dry-run
 *   node scripts/one-off/backfill-completed-unapplied-migration-001.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { classifyMigrationApplyState } from '../modules/handoff/executors/lead-final-approval/chairman-apply-state.js';
import { recordPendingDecision } from '../../lib/chairman/record-pending-decision.mjs';

const RULING = '967e551d';
const DRY_RUN = process.argv.includes('--dry-run');

const SPECIMENS = [
  // database/migrations/ files are recorded by classifyMigrationApplyState using the BASENAME
  // only (no directory prefix) -- unlike database/chairman-gated/, which keeps the full
  // relative path so CHAIRMAN_GATED_PREFIX matching in verify-migration-apply-state.mjs works.
  { sdKey: 'SD-LEO-INFRA-CHAIRMAN-SMS-RELAY-001', file: '20260829_sms_relay_staging_routed_at_column.sql', subClass: 'A' },
  { sdKey: 'SD-LEO-INFRA-REJECT-PATH-VENTURE-001', file: 'database/chairman-gated/20260829_reject_path_type_aware_and_live_kill_gate.sql', subClass: 'B' },
];

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { files, error } = await classifyMigrationApplyState();
  if (error) {
    console.error(`BACKFILL ABORTED: classifier error: ${error}`);
    process.exit(1);
  }

  for (const spec of SPECIMENS) {
    const { data: sd, error: sdErr } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, metadata')
      .eq('sd_key', spec.sdKey)
      .maybeSingle();
    if (sdErr || !sd) {
      console.error(`SKIP ${spec.sdKey}: SD not found (${sdErr?.message || 'no row'})`);
      continue;
    }

    if (sd.metadata?.completion_integrity_flag) {
      console.log(`SKIP ${spec.sdKey}: completion_integrity_flag already present (idempotent no-op).`);
      continue;
    }

    const fileState = files.find((f) => f.file === spec.file);
    const statusAtBackfill = fileState?.status || 'UNKNOWN';

    console.log(`${spec.sdKey}: sub-class ${spec.subClass}, file ${spec.file}, live status ${statusAtBackfill}`);

    if (DRY_RUN) {
      console.log(`  DRY-RUN: would set metadata.completion_integrity_flag and${spec.subClass === 'B' ? '' : ' NOT'} mint a chairman_decisions row.`);
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
      continue;
    }
    console.log('  ✅ completion_integrity_flag written.');

    if (spec.subClass === 'B') {
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
      } else if (existing && existing.length > 0) {
        console.log(`  chairman_decisions row already exists (id=${existing[0].id}) — idempotent skip.`);
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
        } else {
          console.log(`  ✅ chairman_decisions row minted (id=${res.id}).`);
        }
      }
    }
  }
}

main().catch((e) => { console.error('BACKFILL FAILED:', e); process.exit(1); });
