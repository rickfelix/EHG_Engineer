#!/usr/bin/env node
/**
 * Backfill quick_fixes rows Tier-3 (routing_tier=3), terminal (completed/closed), with NO
 * SD link (escalated_to_sd_id AND resolution_sd_id both null) -- SD-LEO-ORCH-CAPA-RECORD-
 * TRUTH-002-B FR-4, Population B.
 *
 * THE GAP THIS CLOSES: FR-3 (this SD) now refuses this exact shape going forward
 * (completeQuickFix()'s isUnlinkedTierThreeCompletion() guard), but the 16 rows measured
 * live (2026-09-04) predate that guard entirely. Of those 16, 5 already carry a real,
 * evidence-backed disposition_reason_code (disposition='re_verified',
 * 'reopened_false_positive_keyword_escalation' -- each row's OWN prior text already
 * explains the Tier-3 flag was a mint-time keyword false-positive, re-triaged and verified
 * through normal channels) -- those 5 already satisfy "not left as an undifferentiated
 * historical footnote" and are deliberately left untouched (overwriting a real, specific
 * explanation with a generic backfill label would be a REGRESSION in honesty, not an
 * improvement).
 *
 * The remaining rows split on whether verification_notes documents a real, verified
 * completion (a genuine direct fix that shipped and was verified, but never escalated --
 * 'orphaned_verified_no_escalation') or carries no evidence at all
 * ('orphaned_no_evidence'). Read individually by a human/worker at authoring time --
 * this is NOT a mechanical classifier; DISPOSITIONS is a fixed manifest, not a live query,
 * because the judgment call ("does this verification_notes text actually document a real
 * completion") cannot be soundly automated. Adding a new target row later requires reading
 * it and adding it to this manifest by hand, same as 002-E's per-row backfill migration.
 *
 * MECHANISM: the single canonical writer, lib/quick-fix/status-writer.cjs
 * setQuickFixStatus() -- never a hand-rolled .update(). Same-status "transition"
 * (fromStatus === toStatus) so Guard B's required-fields check does not apply (this is
 * not a real status change, only a disposition_reason_code/disposed_by/disposed_at
 * backfill) -- disposition_reason_code is FREE TEXT, deliberately NOT the separate
 * `disposition` 5/6-value enum column (owned by a different sweep, per 002-C's own
 * precedent header).
 *
 * Dry-run by default, mirroring scripts/reconcile-escalated-completed-sd-quick-fixes.mjs
 * (SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-C). Every run writes a manifest of pre-backfill state.
 *
 * Usage:
 *   node scripts/reconcile-unlinked-tier3-qfs.mjs             (dry-run)
 *   node scripts/reconcile-unlinked-tier3-qfs.mjs --dry-run   (explicit)
 *   node scripts/reconcile-unlinked-tier3-qfs.mjs --live
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { setQuickFixStatus } from '../lib/quick-fix/status-writer.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DISPOSED_BY = 'scripts/reconcile-unlinked-tier3-qfs.mjs';

/**
 * Fixed manifest: id -> {code, note}. Read individually at authoring time (2026-09-04) from
 * each row's title/verification_notes/reason -- see the header comment for why this is not
 * a live-computed classifier.
 */
export const DISPOSITIONS = {
  // orphaned_verified_no_escalation: verification_notes documents a real, verified,
  // merged/shipped completion. Tier-3 escalation to an SD never happened; the work itself
  // is genuine and done. Not retroactively linkable to any specific existing SD (none of
  // these rows' notes name one).
  'QF-20260426-947': { code: 'orphaned_verified_no_escalation', note: 'Shipped as a clean additive PR (capture-window.ps1 utility); auto-escalated to Tier-3 on LOC alone, no behavior-change/security substance to escalate.' },
  'QF-20260504-251': { code: 'orphaned_verified_no_escalation', note: 'PR merged; QF row was not closed at the time due to a since-superseded auto-merge/completion-notification gap, closed retroactively from main.' },
  'QF-20260525-338': { code: 'orphaned_verified_no_escalation', note: 'Fixed directly via merged PR #3938; Tier-3 escalation was itself a false-positive on the filename keyword "credentials" (module-system rename only, no security-logic change) -- verified working.' },
  'QF-20260530-003': { code: 'orphaned_verified_no_escalation', note: 'Test-only addition (0 source LOC) shipped via already-merged PR #667; force_completed with an operator-recorded rationale at completion time.' },
  'QF-20260605-172': { code: 'orphaned_verified_no_escalation', note: 'Shipped via merged PR #4257 (campaign-mode emergency LLM cost-governance fix); code independently verified (unit suites + live model-resolution check) before this backfill.' },
  'QF-20260816-282': { code: 'orphaned_verified_no_escalation', note: 'Shipped via merged PR #7127, CI fully green, merged via the hardened auto-merge sequence; scope explicitly accepted by the completing worker.' },
  'QF-20260816-865': { code: 'orphaned_verified_no_escalation', note: 'CRITICAL prod-breakage direct fix, merged via ehg#788; scope-acceptance caveat already on record in verification_notes (a merged PR proves code landed, not full scope satisfaction) -- this backfill only adds the missing SD-link disposition, it does not re-adjudicate that caveat.' },
  // orphaned_no_evidence: verification_notes and reason are both empty/absent. No basis to
  // classify further -- grandfathered honestly rather than guessed, mirroring 002-E's
  // 'legacy_grandfathered' discipline for its own no-evidence population.
  'QF-20260423-725': { code: 'orphaned_no_evidence', note: 'No verification_notes/reason on record; closed before this backfill discipline existed. Grandfathered rather than guessed.' },
  'QF-20260423-812': { code: 'orphaned_no_evidence', note: 'No verification_notes/reason on record; closed before this backfill discipline existed. Grandfathered rather than guessed.' },
  'QF-20260824-216': { code: 'orphaned_no_evidence', note: 'No verification_notes/reason on record; closed before this backfill discipline existed. Grandfathered rather than guessed.' },
  'QF-20260824-315': { code: 'orphaned_no_evidence', note: 'No verification_notes/reason on record; closed before this backfill discipline existed. Grandfathered rather than guessed.' },
};

/**
 * Fetch the live target population and cross-check it against DISPOSITIONS. Rows found live
 * but missing from the manifest are reported, never silently skipped or silently guessed --
 * a NEW row in this population needs a human read before it can be backfilled.
 * @param {object} supabase
 */
export async function findTargetRows(supabase) {
  const { data, error } = await supabase
    .from('quick_fixes')
    .select('id, status, routing_tier, escalated_to_sd_id, resolution_sd_id, disposition_reason_code')
    .eq('routing_tier', 3)
    .in('status', ['completed', 'closed'])
    .is('escalated_to_sd_id', null)
    .is('resolution_sd_id', null);
  if (error) {
    const e = new Error(`[reconcile-unlinked-tier3] fetch failed: ${error.message}`);
    e.code = 'RECONCILE_FETCH_FAILED';
    throw e;
  }
  const rows = data || [];
  // Already self-explained by an existing, non-null disposition_reason_code -- deliberately
  // left untouched (see header). Not a target for this script's write.
  const alreadyExplained = rows.filter((r) => r.disposition_reason_code != null);
  const needsBackfill = rows.filter((r) => r.disposition_reason_code == null);
  const known = needsBackfill.filter((r) => DISPOSITIONS[r.id]);
  const unknown = needsBackfill.filter((r) => !DISPOSITIONS[r.id]);
  return { alreadyExplained, known, unknown, status: Object.fromEntries(rows.map((r) => [r.id, r.status])) };
}

export async function backfillRow(supabase, id, status, disposition) {
  return setQuickFixStatus(supabase, id, {
    status, // same-status write -- see header (Guard B does not apply)
    disposition_reason_code: `${disposition.code}: ${disposition.note}`,
    disposed_by: DISPOSED_BY,
    disposed_at: new Date().toISOString(),
  });
}

function writeManifest(result, mode) {
  const outDir = path.join(__dirname, 'one-off', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(outDir, `${stamp}-reconcile-unlinked-tier3-manifest.json`);
  fs.writeFileSync(outPath, JSON.stringify({ mode, generated_at: new Date().toISOString(), ...result }, null, 2));
  return outPath;
}

export async function run({ supabase, live = false, log = console.log } = {}) {
  const { alreadyExplained, known, unknown, status } = await findTargetRows(supabase);
  log(`${alreadyExplained.length} row(s) already self-explained (existing disposition_reason_code) -- left untouched.`);
  log(`${known.length} row(s) in this backfill's manifest, ready to write.`);
  for (const r of known) log(`  ${r.id} -> ${DISPOSITIONS[r.id].code}`);
  if (unknown.length > 0) {
    log(`⚠ ${unknown.length} row(s) found live but NOT in DISPOSITIONS -- skipped, need a human read before backfilling:`);
    for (const r of unknown) log(`  ${r.id}`);
  }

  const manifestPath = writeManifest({ alreadyExplained: alreadyExplained.map((r) => r.id), known: known.map((r) => r.id), unknown: unknown.map((r) => r.id) }, live ? 'live' : 'dry-run');
  log(`Manifest written: ${manifestPath}`);

  if (!live) {
    log('Dry-run — no writes made. Pass --live to backfill.');
    return { known, unknown };
  }

  const backfilled = [];
  for (const r of known) {
    const result = await backfillRow(supabase, r.id, status[r.id], DISPOSITIONS[r.id]);
    log(`  backfilled ${r.id}`);
    backfilled.push(result);
  }
  log(`Backfilled ${backfilled.length} row(s).`);
  return { known, unknown, backfilled };
}

async function main() {
  const args = process.argv.slice(2);
  const live = args.includes('--live');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  await run({ supabase, live });
}

import { isMainModule } from '../lib/utils/is-main-module.js';
if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('[reconcile-unlinked-tier3] FATAL:', e && e.message);
    process.exitCode = 1;
  });
}
