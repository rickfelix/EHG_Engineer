#!/usr/bin/env node
/**
 * correct-sd-is-parent.mjs — deliberate is_parent correction writer
 * SD-LEO-INFRA-DATABASE-SCHEMA-OBJECT-001 (D3 — closes feedback 44b3621b)
 *
 * Records a DELIBERATE correction of a Strategic Directive's metadata.is_parent to
 * false. This is the PRODUCER half of the guard added to auto_set_is_parent() in
 * 20260521_guard_auto_set_is_parent_corrected_parent.sql — without this writer the
 * guard would be a permanent no-op (the writer-consumer asymmetry the SD closes).
 *
 * It performs ONE atomic update that:
 *   1. sets metadata.is_parent = false, and
 *   2. appends a {from, to:false, reason, changed_at} entry to
 *      governance_metadata.is_parent_change_history
 *
 * The trigger guard reads the MOST-RECENT is_parent_change_history entry; when its
 * `to` is false, a subsequent child parent_sd_id write will NOT re-promote the parent
 * to is_parent=true. A later genuine re-parenting can append a {to:true} entry (or the
 * trigger's normal path runs once the latest entry is not false), so corrections are
 * reversible by intent rather than sticky.
 *
 * Usage:
 *   node scripts/correct-sd-is-parent.mjs <SD-KEY-or-UUID> --reason "<why>" [--dry-run]
 *
 * Mirrors SD-FDBK-GEN-FIX-TRG-ENFORCE-001 (PR #3815). EHG_Engineer / consolidated DB.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseArgs(argv) {
  const args = { sd: null, reason: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--reason') { args.reason = argv[++i]; }
    else if (a.startsWith('--reason=')) { args.reason = a.slice('--reason='.length); }
    else if (a === '--dry-run') { args.dryRun = true; }
    else if (!a.startsWith('--') && !args.sd) { args.sd = a; }
  }
  return args;
}

function isFalseValue(v) {
  return v === false || v === 'false';
}

async function main() {
  const { sd, reason, dryRun } = parseArgs(process.argv.slice(2));
  if (!sd || !reason) {
    console.error('Usage: node scripts/correct-sd-is-parent.mjs <SD-KEY-or-UUID> --reason "<why>" [--dry-run]');
    console.error('Both an SD identifier and a non-empty --reason are required (the reason is recorded in the audit marker).');
    process.exit(1);
  }
  if (reason.trim().length < 10) {
    console.error('--reason must be a substantive explanation (>= 10 chars); it is persisted in the is_parent_change_history audit trail.');
    process.exit(1);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const queryField = UUID_RE.test(sd) ? 'id' : 'sd_key';
  const { data: row, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, metadata, governance_metadata')
    .eq(queryField, sd)
    .maybeSingle();

  if (fetchErr) { console.error('Lookup error:', fetchErr.message); process.exit(1); }
  if (!row) { console.error(`Strategic Directive not found for ${queryField}=${sd}`); process.exit(1); }

  const metadata = row.metadata || {};
  const governance = row.governance_metadata || {};
  const history = Array.isArray(governance.is_parent_change_history)
    ? governance.is_parent_change_history
    : [];
  const latest = history.length ? history[history.length - 1] : null;
  const currentIsParent = metadata.is_parent;

  // Idempotency: already corrected (is_parent false AND latest marker already to=false).
  if (isFalseValue(currentIsParent) && latest && isFalseValue(latest.to)) {
    console.log(`No-op: ${row.sd_key} already has metadata.is_parent=false with a matching is_parent_change_history marker.`);
    console.log(`  latest marker: ${JSON.stringify(latest)}`);
    process.exit(0);
  }

  const changedAt = new Date().toISOString();
  const entry = {
    from: currentIsParent === undefined ? null : currentIsParent,
    to: false,
    reason: reason.trim(),
    changed_at: changedAt,
    changed_by: 'correct-sd-is-parent.mjs'
  };

  const newMetadata = { ...metadata, is_parent: false };
  const newGovernance = { ...governance, is_parent_change_history: [...history, entry] };

  console.log(`SD: ${row.sd_key} (${row.id})`);
  console.log(`  metadata.is_parent: ${JSON.stringify(currentIsParent)} -> false`);
  console.log(`  appending is_parent_change_history entry: ${JSON.stringify(entry)}`);

  if (dryRun) {
    console.log('\n--dry-run: no write performed.');
    process.exit(0);
  }

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: newMetadata, governance_metadata: newGovernance })
    .eq('id', row.id);

  if (updateErr) { console.error('Update error:', updateErr.message); process.exit(1); }

  console.log('\n✅ Correction recorded. auto_set_is_parent() will no longer re-promote this parent on child writes.');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
