#!/usr/bin/env node
/**
 * STANDING CHECK — SD-LEO-INFRA-RELEASED-MID-PHASE-001 / FR-3.
 *
 * THE QUESTION: is there any unclaimed non-terminal SD that is neither reachable by an
 * automated claim path nor explicitly held with a reason? Such a row is not dispatchable and
 * not parked — it is simply unseen, and only surfaces when a health probe happens to notice.
 *
 * WHY THIS SHIPS AS A STANDING CHECK RATHER THAN A ONE-OFF: the SD's acceptance is
 * population-scoped. A one-row receipt proves the row we looked at; a population query proves
 * the class. And it must be able to FAIL — see the pinned expectations below.
 *
 * ── TWO CONSTRAINTS LEARNED THE HARD WAY, BOTH FROM GETTING THEM WRONG FIRST ──
 *
 * 1. IMPORT THE PREDICATE, NEVER RE-LIST THE KEYS. The first probe written for this SD
 *    hard-coded a guessed hold-key list and over-counted the class by 50% (reported 6, actual
 *    4): it missed that `status='deferred'` IS the canonical park state, and that an
 *    orchestrator is unclaimed by design. classifyAllDispatchIneligibility is exported and is
 *    PURE / SYNCHRONOUS / DB-FREE — there is no reason to restate its logic here, and every
 *    restatement drifts.
 *
 * 2. NEVER COMPUTE AN AGE IN JS FROM updated_at. strategic_directives_v2.updated_at is
 *    TIMEZONE-NAIVE (no Z, no offset) while claude_sessions.heartbeat_at carries one.
 *    Date.parse() reads a naive ISO string as LOCAL time, so on a UTC-4 host every age comes
 *    out 4 hours SHORT — in the alert-SUPPRESSING direction, which is how a row once showed a
 *    NEGATIVE age. Filter server-side (.lt) where Postgres compares naive-to-naive, and let
 *    the DB do the arithmetic. Root cause is filed separately as
 *    SD-LEO-INFRA-NAIVE-TIMESTAMP-SKEW-001.
 *
 * ── WHAT "REACHABLE" MEANS, AND WHY THE HOLD CLASSIFIER ALONE IS NOT ENOUGH ──
 * A row can be hold-free and still unreachable. The draft-tier claim sources DO fetch these
 * rows (worker-checkin.cjs:888/:922/:964/:1000 query .in('status',['draft','active']) with no
 * phase filter) and then VETO them via isSdInFlight's `current_phase != 'LEAD'` leg
 * (worker-checkin.cjs:1029, merged-pool-self-claim.cjs:268). The one tier that deliberately
 * skips that veto — adoptOrphanInProgress — filters `.eq('status','in_progress')`. So a
 * status='active' mid-phase row falls BETWEEN TWO TIERS. Reachability must model the phase
 * veto, not just the hold classifier; scoring on holds alone returns ZERO today and would
 * make this check unable to show the very bug it exists to close.
 *
 * PINNED EXPECTATIONS: 4 before the FR-2 widening, 0 after. A check that cannot demonstrate
 * the defect cannot demonstrate its removal.
 *
 * Usage:
 *   node scripts/audit-unreachable-midphase-sds.mjs           # human-readable
 *   node scripts/audit-unreachable-midphase-sds.mjs --json    # machine-readable
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// IMPORTED, NOT RE-LISTED. See constraint 1 above.
const { classifyAllDispatchIneligibility } = require('../lib/fleet/claim-eligibility.cjs');

/** Statuses that are neither terminal nor draft — i.e. work that has genuinely started. */
export const NON_TERMINAL_STARTED_STATUSES = Object.freeze(['active', 'in_progress', 'pending_approval']);

/**
 * The phase veto that makes a started row invisible to the draft-tier claim sources.
 * Mirrors isSdInFlight's leg: anything past LEAD is treated as in-flight and skipped.
 */
export function isPhaseVetoed(row) {
  const phase = row?.current_phase;
  return Boolean(phase) && phase !== 'LEAD';
}

/**
 * Which automated path, if any, can adopt this row today?
 *
 * PURE — no I/O, no clock. This is the function tests exercise; the script below only
 * supplies rows. Returns a path name, or null when nothing can reach it.
 */
export function reachableBy(row) {
  const status = row?.status;
  const phase = row?.current_phase;

  // recoverStrandedFinal — worker-checkin.cjs:1086-1111
  if (status === 'pending_approval' && phase === 'LEAD_FINAL') return 'resume_final';

  // adoptOrphanInProgress — worker-checkin.cjs:1231-1283. Deliberately skips the phase veto.
  // FR-2 widens this predicate to include 'active'; until it lands, only in_progress qualifies.
  if (ADOPTION_STATUSES.includes(status)) return 'resume_orphan';

  // Draft-tier sources fetch draft|active but veto anything past LEAD.
  if (!isPhaseVetoed(row)) return 'draft_tier';

  return null;
}

/**
 * The statuses adoptOrphanInProgress accepts — IMPORTED FROM THE ADOPTION PATH ITSELF, not
 * restated here.
 *
 * This is the same discipline as importing the hold classifier: a literal copied into this
 * file would agree with the adoption path on the day it was written and drift silently
 * afterwards, at which point the check reports on a population the fleet no longer has. One
 * constant, one definition, imported across the seam.
 */
export const ADOPTION_STATUSES = require('./worker-checkin.cjs').ADOPTABLE_ORPHAN_STATUSES;

/**
 * Is this row deliberately held, with someone accountable for it?
 * Delegates entirely to the shipped classifier — see constraint 1.
 */
export function heldReason(row) {
  if (row?.status === 'deferred') return 'parked (status=deferred)';
  if (row?.sd_type === 'orchestrator') return 'orchestrator (unclaimed by design)';
  const axes = classifyAllDispatchIneligibility(row, { cwd: process.cwd() }) || [];
  if (Array.isArray(axes) && axes.length > 0) {
    return axes.map((a) => (typeof a === 'string' ? a : a?.axis || a?.reason || 'ineligible')).join(', ');
  }
  return null;
}

/** The verdict for one row. PURE. */
export function classifyRow(row) {
  const held = heldReason(row);
  const reachable = reachableBy(row);
  return {
    sd_key: row?.sd_key,
    status: row?.status,
    current_phase: row?.current_phase,
    held,
    reachable,
    // The population this SD exists to drive to zero: neither reachable nor held.
    unreachable_and_unheld: !held && !reachable,
  };
}

async function main() {
  const json = process.argv.includes('--json');
  const db = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  // Paginated: PostgREST caps an unbounded select at 1000 and truncates SILENTLY.
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('strategic_directives_v2')
      .select('sd_key,status,current_phase,sd_type,metadata,updated_at')
      .in('status', NON_TERMINAL_STARTED_STATUSES)
      .is('claiming_session_id', null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`population query failed: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }

  const verdicts = rows.map(classifyRow);
  const offenders = verdicts.filter((v) => v.unreachable_and_unheld);

  if (json) {
    console.log(JSON.stringify({ scanned: rows.length, offenders, count: offenders.length }, null, 2));
  } else {
    console.log(`[unreachable-midphase] scanned=${rows.length} unreachable_and_unheld=${offenders.length}`);
    for (const o of offenders) console.log(`  ${o.sd_key}  ${o.status}/${o.current_phase}`);
    if (offenders.length === 0) console.log('  none — every started unclaimed row is reachable or explicitly held');
  }

  // Non-zero exit so this can gate. FR-2 has not landed until this reaches 0.
  process.exit(offenders.length > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href) {
  main().catch((e) => { console.error('[unreachable-midphase] fatal:', e.message); process.exit(2); });
}
