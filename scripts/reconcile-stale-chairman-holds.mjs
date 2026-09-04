#!/usr/bin/env node
/**
 * Backfill strategic_directives_v2 rows completed with an UNRELEASED review_hold_reason --
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B FR-4, Population A.
 *
 * THE GAP THIS CLOSES: FR-1/FR-2 now refuse a NEW completion while an unreleased chairman
 * hold stands, but the 11 rows measured live (2026-09-04) all predate that guard (still
 * chairman-gated, not yet applied). review_hold_reason had NO release-check mechanism at
 * all before FR-1 (a one-way latch) -- these rows completed with the field non-null and
 * unfenced_at absent.
 *
 * READ INDIVIDUALLY (2026-09-04, not mechanically classified) -- the 11 rows split into two
 * genuinely different evidentiary shapes:
 *
 *   GROUP 1 (7 rows) -- review_hold_reason itself contains an explicit clearance statement
 *   ("CLEARED for execution 2026-06-27 — converged; chairman authorized execution shift" /
 *   "co-author FR-fill converged; LEAD still gates"). Real evidence the hold WAS resolved;
 *   only the formal releaseHold() stamp was never called. Backfilled via releaseHold()
 *   itself (the ONE sanctioned release writer, lib/fleet/claim-eligibility.cjs) -- NOT a
 *   hand-rolled unfenced_at write, and NOT backdated to the cited 2026-06-27 date:
 *   releaseHold() intentionally has no backdating parameter (its unfenced_at is always
 *   `now()`), and isHoldReleased()'s fallback (no review_hold_at stamp on any of these 11
 *   rows) means the mechanical check only needs unfenced_at present at all, not a specific
 *   date -- backdating would require bypassing the sanctioned writer for no mechanical
 *   benefit. The reason text passed to releaseHold() preserves the original evidence
 *   verbatim so the historical record is not lost.
 *
 *   GROUP 2 (4 rows) -- review_hold_reason describes a review/coordination REQUIREMENT
 *   ("co-author review per partnership contract", "coordinator owns dispatch review",
 *   "sequence the two together in your review"), NOT a clearance statement. No evidence the
 *   review ever happened or concluded favorably. THESE ARE NOT RELEASED BY THIS SCRIPT --
 *   doing so would fabricate a release this backfill has no evidence for, exactly what the
 *   PRD warns against ("do not blanket-stamp all 11 as released just to clear the CHECK").
 *   Flagged instead: a metadata.chairman_hold_backfill marker records the honest
 *   'genuinely_still_held_flagged' disposition, unfenced_at is left untouched, and these 4
 *   rows are called out BY NAME in this script's own log output and in the coordinator
 *   signal sent alongside this commit -- 4 SDs reached status=completed carrying an
 *   explicit, self-declared review requirement with zero evidence it was ever satisfied.
 *
 * RECORDING MECHANISM: metadata.chairman_hold_backfill = {disposition, note, backfilled_by,
 * backfilled_at} on every target row (both groups) -- a narrow, backfill-scoped marker, not
 * a general disposition framework. Group 1 rows ALSO get a real releaseHold() call (a
 * SEPARATE write, since releaseHold() only accepts its own fixed 3 keys and does not extend
 * to a caller's additional fields) -- releaseHold() is called first so a caller reading
 * isHoldReleased() sees the release land even if the marker write is interrupted; the marker
 * write is best-effort documentation on top of the load-bearing release.
 *
 * Dry-run by default, mirroring the sibling scripts (002-C's
 * reconcile-escalated-completed-sd-quick-fixes.mjs, this SD's own
 * reconcile-unlinked-tier3-qfs.mjs). Every run writes a manifest of pre-backfill state.
 *
 * Usage:
 *   node scripts/reconcile-stale-chairman-holds.mjs             (dry-run)
 *   node scripts/reconcile-stale-chairman-holds.mjs --dry-run   (explicit)
 *   node scripts/reconcile-stale-chairman-holds.mjs --live
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { releaseHold, isUnreleasedChairmanHold, isHoldReleased } from '../lib/fleet/claim-eligibility.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKFILLED_BY = 'scripts/reconcile-stale-chairman-holds.mjs';

/**
 * Fixed manifest, keyed by sd_key. Read individually at authoring time (2026-09-04) from
 * each row's metadata.review_hold_reason text -- see the header for why this is not a live
 * classifier. `released: true` rows go through releaseHold(); `released: false` rows get
 * ONLY the flag marker.
 */
export const DISPOSITIONS = {
  'SD-LEO-INFRA-BUILD-SD-REVIEW-GATE-001': {
    released: true,
    releaseReason: 'Backfilled 2026-09-04. Row\'s own review_hold_reason: "CLEARED for execution 2026-06-27 — converged; chairman authorized execution shift. LEAD still gates each." The formal releaseHold() stamp was never called at the time; this backfill closes that gap using the sanctioned writer.',
  },
  'SD-LEO-INFRA-CLEAN-CLONE-LAUNCH-001': {
    released: true,
    releaseReason: 'Backfilled 2026-09-04. Row\'s own review_hold_reason: "CLEARED for execution 2026-06-27 — converged; chairman authorized execution shift. LEAD still gates each." The formal releaseHold() stamp was never called at the time; this backfill closes that gap using the sanctioned writer.',
    // SECURITY finding SEC-1 (evidence 62a7d823): this row also carries a separate
    // requires_human_action_reason ("Blocked on UNMERGED prerequisites... Released by Alpha
    // 2026-06-27; signaled coordinator") that releaseHold()'s shared unfenced_at would
    // otherwise silently co-release without review. Explicitly reviewed 2026-09-04:
    // requires_human_action=false (boolean) was ALREADY the live state before this backfill
    // -- the actual dispatch-eligibility gate was never blocking this row -- and the text
    // itself documents an informal historical release by another party (Alpha). Acknowledged
    // rather than accidentally co-released.
    acknowledgesRequiresHumanAction: true,
  },
  'SD-LEO-INFRA-FLEET-HIBERNATION-MECHANISM-001': {
    released: true,
    releaseReason: 'Backfilled 2026-09-04. Row\'s own review_hold_reason: "CLEARED for execution 2026-06-27 — converged; chairman authorized execution shift. LEAD still gates each." The formal releaseHold() stamp was never called at the time; this backfill closes that gap using the sanctioned writer.',
  },
  'SD-LEO-INFRA-VENTURE-CLOUDFLARE-DEFAULT-001': {
    released: true,
    releaseReason: 'Backfilled 2026-09-04. Row\'s own review_hold_reason: "CLEARED for execution 2026-06-27 — converged; chairman authorized execution shift. LEAD still gates each." The formal releaseHold() stamp was never called at the time; this backfill closes that gap using the sanctioned writer.',
    // SECURITY finding SEC-1 (evidence 62a7d823): this row also carries a separate
    // requires_human_action_reason ("Reserved governance... needs coordinator/Adam pre-claim
    // co-authoring") that releaseHold()'s shared unfenced_at would otherwise silently
    // co-release without review. Explicitly reviewed 2026-09-04: requires_human_action=false
    // (boolean) was ALREADY the live state before this backfill -- the actual dispatch-
    // eligibility gate was never blocking this row. Acknowledged rather than accidentally
    // co-released.
    acknowledgesRequiresHumanAction: true,
  },
  'SD-LEO-INFRA-VENTURE-DEFAULT-CAPABILITIES-EXPAND-001': {
    released: true,
    releaseReason: 'Backfilled 2026-09-04. Row\'s own review_hold_reason: "CLEARED for execution 2026-06-27 — converged; chairman authorized execution shift. LEAD still gates each." The formal releaseHold() stamp was never called at the time; this backfill closes that gap using the sanctioned writer.',
  },
  'SD-LEO-INFRA-SD-PRD-DRIFT-GATE-001': {
    released: true,
    releaseReason: 'Backfilled 2026-09-04. Row\'s own review_hold_reason: "CLEARED for execution 2026-06-27 — co-author FR-fill converged; LEAD still gates." The formal releaseHold() stamp was never called at the time; this backfill closes that gap using the sanctioned writer.',
  },
  'SD-LEO-INFRA-STRUCTURED-SD-FR-FIELD-001': {
    released: true,
    releaseReason: 'Backfilled 2026-09-04. Row\'s own review_hold_reason: "CLEARED for execution 2026-06-27 — co-author FR-fill converged; LEAD still gates." The formal releaseHold() stamp was never called at the time; this backfill closes that gap using the sanctioned writer.',
  },
  // GROUP 2 -- NOT released. review_hold_reason describes a review REQUIREMENT with no
  // evidence it was satisfied. Flagged for chairman confirmation, hold left standing.
  'SD-LEO-INFRA-COVERAGE-MATRIX-SURFACE-001': {
    released: false,
    note: 'review_hold_reason reads "Composes with REWARD-SPINE-ONE-001 (fold-in of sample-audit duty) — sequence the two together in your review; also consumes the PERIODIC-PROCESS-LIVENESS registry." This describes a review DEPENDENCY, not a clearance -- no evidence the sequenced review occurred. SD reached status=completed anyway. Flagged, not released.',
  },
  'SD-LEO-INFRA-PARENT-SCOPE-COVERAGE-001': {
    released: false,
    note: 'review_hold_reason reads "Protocol-level: touches orchestrator parent-completion path (PARENT_DELEGATED_COMPLETION) + child-linkage — dispatch-mechanism-adjacent, co-author review per partnership contract." This describes a review REQUIREMENT, not a clearance -- no evidence the co-author review occurred. SD reached status=completed anyway. Flagged, not released.',
  },
  'SD-LEO-INFRA-PERIODIC-PROCESS-LIVENESS-001': {
    released: false,
    note: 'review_hold_reason reads "Watcher-of-watchers overlaps coordinator liveness duties + session-liveness semantics — co-design review; reuses existing session signals per spec." This describes a co-design review REQUIREMENT, not a clearance -- no evidence the review occurred. SD reached status=completed anyway. Flagged, not released.',
  },
  'SD-LEO-INFRA-REWARD-SPINE-ONE-001': {
    released: false,
    note: 'review_hold_reason reads "Touches the gauges framework the coordinator operates (target-vs-diagnostic marking) + sequencing vs C-009 consumers; Solomon-designed (reasoning review done), coordinator owns dispatch review." Reasoning review is claimed done, but the COORDINATOR dispatch review this text names has no evidence of having occurred. SD reached status=completed anyway. Flagged, not released.',
  },
};

/** Fetch the live target population and cross-check it against DISPOSITIONS. */
export async function findTargetRows(supabase) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, status, metadata')
    .eq('status', 'completed')
    .not('metadata->>review_hold_reason', 'is', null);
  if (error) {
    const e = new Error(`[reconcile-stale-chairman-holds] fetch failed: ${error.message}`);
    e.code = 'RECONCILE_FETCH_FAILED';
    throw e;
  }
  const rows = (data || []).filter((r) => isUnreleasedChairmanHold(r.metadata));
  const known = rows.filter((r) => DISPOSITIONS[r.sd_key]);
  const unknown = rows.filter((r) => !DISPOSITIONS[r.sd_key]);
  return { known, unknown };
}

/**
 * @param {object} supabase
 * @param {{sd_key: string, metadata: object}} row - full row (metadata needed for the
 *   co-release safety check below, not just the sd_key).
 * @param {{released:boolean, releaseReason?:string, note?:string, acknowledgesRequiresHumanAction?:boolean}} d
 */
export async function backfillRow(supabase, row, d) {
  const sdKey = row.sd_key;
  const metadata = row.metadata || {};
  const { mergeMetadataKeys } = await import('../lib/coordinator/safe-metadata-merge.mjs');
  let released = false;
  if (d.released) {
    // ROOT-CAUSE FIX (SECURITY finding SEC-1, evidence 62a7d823, 2026-09-04): releaseHold()
    // writes ONE shared unfenced_at per row. If this row ALSO carries an unreleased
    // requires_human_action_reason that this manifest entry has not explicitly reviewed and
    // acknowledged, releasing review_hold_reason here would SILENTLY co-release that
    // unrelated hold too -- isHoldReleased()'s "no set-at stamp -> any unfenced_at releases
    // it" fallback applies per-key, not per-call. Refuse rather than guess; a human/worker
    // must read the row and either set acknowledgesRequiresHumanAction:true (with the
    // reviewed rationale, as the 2 rows this finding was raised against now do) or handle
    // the second hold separately.
    const hasUnacknowledgedSecondHold =
      typeof metadata.requires_human_action_reason === 'string' &&
      metadata.requires_human_action_reason.trim().length > 0 &&
      !isHoldReleased(metadata, 'requires_human_action_at') &&
      !d.acknowledgesRequiresHumanAction;
    if (hasUnacknowledgedSecondHold) {
      const e = new Error(`[reconcile-stale-chairman-holds] ${sdKey} also carries an unreleased requires_human_action_reason this manifest entry does not acknowledge -- releasing review_hold_reason would silently co-release it via the shared unfenced_at field. Read the row and add acknowledgesRequiresHumanAction:true with a reviewed rationale, or handle it separately.`);
      e.code = 'UNACKNOWLEDGED_SECOND_HOLD';
      throw e;
    }
    const result = await releaseHold(supabase, sdKey, { releaser: BACKFILLED_BY, reason: d.releaseReason });
    if (!result.released) {
      const e = new Error(`[reconcile-stale-chairman-holds] releaseHold failed for ${sdKey}: ${result.error}`);
      e.code = 'RELEASE_FAILED';
      throw e;
    }
    released = true;
  }
  const marker = {
    disposition: d.released ? 'informally_released_stamp_backfilled' : 'genuinely_still_held_flagged',
    note: d.released ? d.releaseReason : d.note,
    backfilled_by: BACKFILLED_BY,
    backfilled_at: new Date().toISOString(),
  };
  const merge = await mergeMetadataKeys(sdKey, { chairman_hold_backfill: marker });
  if (!merge.merged) {
    const e = new Error(`[reconcile-stale-chairman-holds] marker write failed for ${sdKey}: ${merge.error}`);
    e.code = 'MARKER_WRITE_FAILED';
    throw e;
  }
  return { sdKey, released, disposition: marker.disposition };
}

function writeManifest(result, mode) {
  const outDir = path.join(__dirname, 'one-off', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(outDir, `${stamp}-reconcile-stale-chairman-holds-manifest.json`);
  fs.writeFileSync(outPath, JSON.stringify({ mode, generated_at: new Date().toISOString(), ...result }, null, 2));
  return outPath;
}

export async function run({ supabase, live = false, log = console.log } = {}) {
  const { known, unknown } = await findTargetRows(supabase);
  const group1 = known.filter((r) => DISPOSITIONS[r.sd_key].released);
  const group2 = known.filter((r) => !DISPOSITIONS[r.sd_key].released);

  log(`${group1.length} row(s) with real clearance evidence (Group 1 -- will be RELEASED via releaseHold()):`);
  for (const r of group1) log(`  ${r.sd_key}`);
  log(`${group2.length} row(s) with NO clearance evidence, only a review requirement (Group 2 -- FLAGGED, hold left standing, chairman confirmation needed):`);
  for (const r of group2) log(`  ${r.sd_key}`);
  if (unknown.length > 0) {
    log(`⚠ ${unknown.length} row(s) found live but NOT in DISPOSITIONS -- skipped, need a human read before backfilling:`);
    for (const r of unknown) log(`  ${r.sd_key}`);
  }

  const manifestPath = writeManifest(
    { group1: group1.map((r) => r.sd_key), group2: group2.map((r) => r.sd_key), unknown: unknown.map((r) => r.sd_key) },
    live ? 'live' : 'dry-run',
  );
  log(`Manifest written: ${manifestPath}`);

  if (!live) {
    log('Dry-run — no writes made. Pass --live to backfill.');
    return { group1, group2, unknown };
  }

  const backfilled = [];
  for (const r of known) {
    const result = await backfillRow(supabase, r, DISPOSITIONS[r.sd_key]);
    log(`  backfilled ${r.sd_key} (released=${result.released})`);
    backfilled.push(result);
  }
  log(`Backfilled ${backfilled.length} row(s).`);
  return { group1, group2, unknown, backfilled };
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
    console.error('[reconcile-stale-chairman-holds] FATAL:', e && e.message);
    process.exitCode = 1;
  });
}
