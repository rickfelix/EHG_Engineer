/**
 * One-off metadata migration: convert SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-A's blanket
 * requires_human_action/do_not_auto_dispatch fence to the phase-scoped exec_boundary_hold
 * fence, and stamp metadata.switchon_action so the EXEC_BOUNDARY_HOLD gate's switch-on
 * branch (SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-D FR-1) applies to it.
 *
 * NOT a DB schema migration -- a read-modify-write of one SD row's metadata JSONB.
 *
 * Defaults to --dry-run (prints the before/after diff, makes ZERO writes). Requires
 * --apply to actually write. Captures the COMPLETE pre-migration metadata verbatim into
 * metadata.switchon_migrated_from_legacy_fence for auditability/reversibility, and
 * archives every requires_human_action / legacy-fence key (not just the boolean) so no
 * contradictory fence marker survives the migration.
 *
 * Explicitly does NOT touch SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-B or -C -- -B is
 * chairman-PARKED for an unrelated demand-gating business reason (already once wrongly
 * unfenced and re-fenced by the coordinator, Adam corr 9fceef99); -C depends on -B.
 *
 * Usage:
 *   node scripts/one-off/apply-switchon-gate-opco-a.mjs --dry-run   (default)
 *   node scripts/one-off/apply-switchon-gate-opco-a.mjs --apply
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const TARGET_SD_KEY = 'SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-A';
const UNTOUCHED_SIBLINGS = ['SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-B', 'SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-C'];

// Every live top-level metadata key this migration retires -- moved verbatim (plus a
// full-object snapshot) into metadata.switchon_migrated_from_legacy_fence, then unset.
const LEGACY_KEYS = [
  'requires_human_action', 'requires_human_action_at', 'requires_human_action_by', 'requires_human_action_reason',
  'do_not_auto_dispatch', 'do_not_auto_dispatch_exec', 'do_not_auto_dispatch_reason',
  'irreversible_exec_chairman_gated', 'hold',
];

export function buildMigratedMetadata(existingMetadata) {
  const md = existingMetadata || {};
  const archived = {};
  for (const key of LEGACY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(md, key)) archived[key] = md[key];
  }

  const next = { ...md };
  for (const key of LEGACY_KEYS) delete next[key];

  next.exec_boundary_hold = true;
  next.exec_boundary_hold_reason = (md.requires_human_action_reason && String(md.requires_human_action_reason))
    || 'Irreversible EXEC (live venture deploy, payment-account creation, DNS mutation) is chairman-gated; migrated from the legacy blanket fence.';
  next.exec_boundary_hold_set_at = new Date().toISOString();
  next.switchon_action = 'live-venture-deploy';
  next.switchon_context = {
    also_named: ['live-payment-account-creation', 'dns-mutation'],
    note: 'op-co-A EXEC touches all 3; any single NEVER_AUTO_CLASSES member yields the identical always-consequential outcome, so switchon_action=live-venture-deploy is representative, not exhaustive.',
  };
  next.switchon_migrated_from_legacy_fence = {
    migrated_at: new Date().toISOString(),
    migrated_by: 'scripts/one-off/apply-switchon-gate-opco-a.mjs',
    sd_key: TARGET_SD_KEY,
    archived_keys: archived,
    full_pre_migration_metadata_snapshot: md,
  };

  return next;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: row, error } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, metadata')
    .eq('sd_key', TARGET_SD_KEY)
    .single();
  if (error || !row) {
    console.error(`Failed to load ${TARGET_SD_KEY}:`, error?.message || 'not found');
    process.exitCode = 1;
    return;
  }

  const before = row.metadata || {};
  const after = buildMigratedMetadata(before);

  console.log(`\n=== ${TARGET_SD_KEY} metadata migration (${apply ? 'APPLY' : 'DRY-RUN'}) ===`);
  console.log('\n--- BEFORE (legacy keys only) ---');
  for (const key of LEGACY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(before, key)) console.log(`  ${key}:`, JSON.stringify(before[key]));
  }
  console.log('\n--- AFTER (new keys only) ---');
  for (const key of ['exec_boundary_hold', 'exec_boundary_hold_reason', 'switchon_action', 'switchon_context']) {
    console.log(`  ${key}:`, JSON.stringify(after[key]));
  }
  console.log('\n--- LEGACY KEYS PRESENT AFTER MIGRATION (must be zero) ---');
  const remaining = LEGACY_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(after, k));
  console.log(`  ${remaining.length === 0 ? 'none' : remaining.join(', ')}`);

  if (!apply) {
    console.log('\n[DRY-RUN] No writes made. Re-run with --apply to write.');
    return;
  }

  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: after })
    .eq('sd_key', TARGET_SD_KEY);
  if (updateError) {
    console.error('Update failed:', updateError.message);
    process.exitCode = 1;
    return;
  }
  console.log(`\n[APPLIED] ${TARGET_SD_KEY} metadata migrated.`);
  console.log(`[UNTOUCHED, as designed] ${UNTOUCHED_SIBLINGS.join(', ')}`);
}

if (isMainModule(import.meta.url)) {
  main();
}
