#!/usr/bin/env node

/**
 * Defer Quick-Fix (durable time-gated defer)
 * SD-LEO-FIX-QUICK-FIXES-NEEDS-001
 *
 * Sets quick_fixes.not_before for a QF so it stops being claimable/auto-startable
 * until the given timestamp passes -- without hand-written SQL. Both worker-checkin.cjs
 * self-claim picker paths (via isAutoStartableQF) and the sd:next display surface
 * (classifyQuickFixes) honor this column.
 *
 * Usage:
 *   node scripts/defer-quick-fix.js QF-20260704-348 --not-before 2026-07-05T21:00:00Z
 *   node scripts/defer-quick-fix.js QF-20260704-348 --not-before 2026-07-05T21:00:00Z --reopen
 *
 * --reopen also sets status='open' on the row (use when re-opening a QF previously
 * held via status='escalated' as a manual defer workaround).
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { createRequire } from 'node:module';
import { isMainModule } from '../lib/utils/is-main-module.js';
import { checkHoldStamp, buildProvenancedStamp, logHoldStateViolation } from '../lib/governance/hold-state-contract.js';

// SD-LEO-INFRA-CHECKIN-DISPATCH-READ-001 (FR-2): the SAME predicate the hand-time read guard
// runs (worker-checkin.cjs isAutoStartableQF -> isChairmanGatedQF). Reused verbatim rather than
// re-derived so the writer can only accept marker combinations the reader actually excludes.
const require_ = createRequire(import.meta.url);
const { isChairmanGatedQF } = require_('../lib/fleet/qf-gated-hold.cjs');

dotenv.config();

export function parseDeferArgs(argv) {
  const args = argv.slice();
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    return { showHelp: true };
  }
  const qfId = args[0];
  let notBefore = null;
  let reopen = false;
  let reason = null;
  let owner = null;
  let releaseCondition = null;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--not-before') {
      notBefore = args[i + 1];
      i++;
    } else if (args[i] === '--reopen') {
      reopen = true;
    } else if (args[i] === '--reason') {
      reason = args[i + 1];
      i++;
    } else if (args[i] === '--owner') {
      owner = args[i + 1];
      i++;
    } else if (args[i] === '--release-condition') {
      releaseCondition = args[i + 1];
      i++;
    }
  }
  return { showHelp: false, qfId, notBefore, reopen, reason, owner, releaseCondition };
}

export function validateNotBefore(value) {
  if (!value) return { valid: false, error: '--not-before <ISO-timestamp> is required' };
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return { valid: false, error: `--not-before: could not parse "${value}" as a timestamp (expected ISO-8601, e.g. 2026-07-05T21:00:00Z)` };
  }
  return { valid: true, iso: new Date(parsed).toISOString() };
}

/**
 * SD-LEO-INFRA-CHECKIN-DISPATCH-READ-001 (FR-2): a deliberate release is only valid when it
 * persists a marker the hand-time guard (isAutoStartableQF) actually reads. Two such markers
 * exist, and this classifier accepts EXACTLY those two — a marker combination the guard cannot
 * see (e.g. owner='worker' + release_condition) is refused, because writing it would feel like
 * a hold while excluding nothing:
 *
 *   time_gated   not_before in ISO form            (isAutoStartableQF's not_before gate)
 *   event_gated  owner='chairman' + release_condition  (isChairmanGatedQF, reused verbatim)
 *
 * The refusal NAMES the missing columns (never a silent completion): before this SD, a worker
 * whose blocker had no natural timestamp had no structured verb at all — the rationale went
 * into verification_notes as prose, the stale-claim sweep later cleared the claim with no
 * marker (correctly — a swept claim is not a deliberate release), and the row returned to the
 * queue fully claimable by the next seat that also could not satisfy the blocking condition.
 */
export function classifyDeliberateHoldMarker({ notBefore, owner, releaseCondition } = {}) {
  if (notBefore) {
    const v = validateNotBefore(notBefore);
    if (!v.valid) return { valid: false, error: v.error };
    return { valid: true, mode: 'time_gated', iso: v.iso };
  }
  if (isChairmanGatedQF({ owner, release_condition: releaseCondition })) {
    return { valid: true, mode: 'event_gated', iso: null };
  }
  const ownerShown = owner && String(owner).trim() ? `'${String(owner).trim()}'` : 'NULL';
  const condShown = releaseCondition && String(releaseCondition).trim() ? 'present' : 'NULL';
  return {
    valid: false,
    code: 'DELIBERATE_RELEASE_MARKER_MISSING',
    error: 'deliberate release refused: no guard-visible hold marker. Missing columns: '
      + 'not_before (time-gated hold) — or, for an event-gated hold, owner=\'chairman\' '
      + `(owner is ${ownerShown}) + release_condition (${condShown}). `
      + 'A rationale recorded only as prose is invisible at hand-time; persist the marker '
      + 'isAutoStartableQF reads (SD-LEO-INFRA-CHECKIN-DISPATCH-READ-001 FR-2).',
  };
}

function displayHelp() {
  console.log(`
Defer Quick-Fix — durable time-gated defer (SD-LEO-FIX-QUICK-FIXES-NEEDS-001)

Usage:
  node scripts/defer-quick-fix.js <QF-ID> --not-before <ISO-timestamp> [--reopen]
    [--reason <text>] [--owner <text>] [--release-condition <text>]

  Event-gated form (SD-LEO-INFRA-CHECKIN-DISPATCH-READ-001 FR-2 — a blocker with no
  natural timestamp; excluded from the worker lane via the chairman-gated hold marker):
  node scripts/defer-quick-fix.js <QF-ID> --owner chairman \\
    --release-condition <text> --reason <text> [--reopen]

Options:
  --not-before <ts>   ISO-8601 timestamp. The QF is not claimable/
                      auto-startable by any picker until this time passes.
                      Required unless the event-gated form (owner='chairman'
                      + --release-condition + --reason) is used instead — a
                      deliberate release MUST persist one of the two markers
                      the hand-time guard reads, or it is refused loudly.
  --reopen            Also set status='open' (use when clearing a manual
                      status='escalated' defer workaround).
  --reason <text>     Hold-state contract stamp (SD-LEO-INFRA-HOLD-STATE-CONTRACT-001):
                      why this QF is deferred. Optional while
                      HOLD_STATE_CONTRACT_MODE=observe (default); required
                      once enforce mode is armed.
  --owner <text>      Hold-state contract stamp: who reviews/releases this defer.
  --release-condition <text>  Hold-state contract stamp: the condition under
                      which this defer should be released. REQUIRED whenever
                      --not-before is more than 30 days out (QF-20260720-137) --
                      a far-future park always needs a release trigger.

Example:
  node scripts/defer-quick-fix.js QF-20260704-348 --not-before 2026-07-05T21:00:00Z --reopen \\
    --reason "waiting on sibling QF" --owner coordinator --release-condition "sibling merges"
`);
}

// QF-20260720-137: a not_before park beyond this horizon has no natural review
// trigger (the 2027-sentinel class -- 6 retro-promoted QFs parked indefinitely
// with reason=NULL, no owner, no release_condition, never resurfacing). Applies
// to ANY caller of this shared write path, not just retro-sourced QFs, and is
// enforced unconditionally -- independent of HOLD_STATE_CONTRACT_MODE, which
// only governs the reason/owner/release_condition stamp as a whole.
const FAR_FUTURE_PARK_DAYS = 30;

export async function deferQuickFix(qfId, notBefore, { reopen = false, reason, owner, releaseCondition, writingSessionId, supabaseClient = null } = {}) {
  // SD-LEO-INFRA-CHECKIN-DISPATCH-READ-001 (FR-2): accept exactly the two guard-visible marker
  // shapes; refuse everything else LOUDLY, naming the missing columns, before any DB write.
  const marker = classifyDeliberateHoldMarker({ notBefore, owner, releaseCondition });
  if (!marker.valid) {
    const err = new Error(marker.error);
    if (marker.code) err.code = marker.code;
    throw err;
  }

  if (marker.mode === 'time_gated') {
    const daysOut = (Date.parse(marker.iso) - Date.now()) / (24 * 60 * 60 * 1000);
    if (daysOut > FAR_FUTURE_PARK_DAYS && !(releaseCondition && String(releaseCondition).trim())) {
      const err = new Error(`--not-before is ${Math.round(daysOut)} days out (>${FAR_FUTURE_PARK_DAYS}) and requires --release-condition -- a far-future park with no release trigger never resurfaces (QF-20260720-137)`);
      err.code = 'FAR_FUTURE_PARK_REQUIRES_RELEASE_CONDITION';
      throw err;
    }
  } else if (!(reason && String(reason).trim())) {
    // Event-gated: owner + release_condition are guaranteed by the classifier; the rationale
    // itself must ALSO land structured — an event hold whose "why" exists only as prose is the
    // exact half-marker state FR-2 exists to refuse.
    const err = new Error('event-gated release refused: missing column: reason. An owner=\'chairman\' + release_condition hold must carry its rationale in the reason column, not as prose (SD-LEO-INFRA-CHECKIN-DISPATCH-READ-001 FR-2).');
    err.code = 'DELIBERATE_RELEASE_MARKER_MISSING';
    throw err;
  }

  const supabase = supabaseClient || createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Hold-state contract check stays scoped to the time-gated path (byte-identical to before this
  // SD — every pre-existing write was time-gated). The event-gated arm cannot satisfy review_at
  // by construction (its release trigger is the condition, not a timestamp) and already enforces
  // {reason, owner, release_condition} unconditionally above — stricter than observe mode.
  if (marker.mode === 'time_gated') {
    const holdCheck = checkHoldStamp({ reason, owner, review_at: marker.iso, release_condition: releaseCondition });
    if (!holdCheck.ok && holdCheck.mode === 'observe') {
      await logHoldStateViolation(supabase, {
        surface: 'quick_fix_defer',
        stamp: { reason, owner, review_at: marker.iso, release_condition: releaseCondition },
        errors: holdCheck.errors,
      });
    }
  }
  const stamped = buildProvenancedStamp({ reason, owner, release_condition: releaseCondition }, writingSessionId);

  // SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-002 (FR-1): deferring MUST release the seat. Today this
  // clears NEITHER surface, so a deferred QF pins its worker exactly like a returned one — and there
  // is no other way out, because lib/quick-fix-claim.mjs exports claimQuickFix and no releaseQuickFix,
  // and `npm run sd:release` reports "no SD claimed" for a QF since it only queries
  // strategic_directives_v2. Clearing the authoritative column here is the whole release path.
  const update = { claiming_session_id: null };
  if (marker.mode === 'time_gated') update.not_before = marker.iso;
  if (reopen) update.status = 'open';
  if (stamped.reason) update.reason = stamped.reason;
  if (stamped.owner) update.owner = stamped.owner;
  if (stamped.release_condition) update.release_condition = stamped.release_condition;

  // Who holds it RIGHT NOW. Must be read BEFORE the update, because the update nulls
  // claiming_session_id and its RETURNING clause would hand back the already-cleared value — leaving
  // no way to find the mirror that needs clearing. Fail-soft: if this read fails the defer still
  // proceeds, and the mirror-clear below is simply skipped rather than blocking the release.
  let existing = null;
  try {
    const { data: cur } = await supabase
      .from('quick_fixes').select('claiming_session_id').eq('id', qfId).maybeSingle();
    existing = cur;
  } catch { /* fail-soft: release is the durable outcome; mirror-clear is best-effort */ }

  const { data, error } = await supabase
    .from('quick_fixes')
    .update(update)
    .eq('id', qfId)
    .select('id, status, not_before, reason, owner, release_condition')
    .single();

  if (error) {
    throw new Error(`Failed to defer ${qfId}: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Quick-fix not found: ${qfId}`);
  }

  // SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-002 (FR-1), second surface: clearing the authoritative
  // column above frees the QF, but the seat stays pinned until the claude_sessions MIRROR is cleared
  // too — resume.cjs derives ctx.mySd from that mirror. Both or neither; clearing one is what
  // produced the half-released states this SD documents.
  //
  // COMPARE-AND-SET, NOT A BLANKET CLEAR. Only a mirror still pointing at THIS QF is cleared, so a
  // session that has already moved to other work is never stomped — the same hazard FR-6 describes
  // in the SD claim path, which issues a bare update with no CAS.
  //
  // FAIL-SOFT: the defer itself has already succeeded and is the durable outcome. A mirror-clear
  // failure must not turn a successful release into a thrown error, so it is reported and swallowed.
  const priorHolder = existing && existing.claiming_session_id;
  if (priorHolder) {
    try {
      const { error: mirrorErr } = await supabase
        .from('claude_sessions')
        .update({ sd_key: null })
        .eq('session_id', priorHolder)
        .eq('sd_key', qfId);
      if (mirrorErr) throw new Error(mirrorErr.message);
    } catch (err) {
      console.warn(`⚠️  ${qfId} was released, but clearing the claude_sessions mirror for `
        + `${priorHolder} FAILED: ${(err && err.message) || err}. That seat may still resume this QF `
        + 'until its mirror is cleared; re-run this command or clear sd_key directly.');
    }
  }

  return data;
}

async function main() {
  const parsed = parseDeferArgs(process.argv.slice(2));
  if (parsed.showHelp) {
    displayHelp();
    process.exit(0);
  }

  try {
    const result = await deferQuickFix(parsed.qfId, parsed.notBefore, {
      reopen: parsed.reopen,
      reason: parsed.reason,
      owner: parsed.owner,
      releaseCondition: parsed.releaseCondition,
      writingSessionId: process.env.CLAUDE_SESSION_ID || null,
    });
    console.log(result.not_before
      ? `✅ ${result.id}: not_before=${result.not_before}, status=${result.status}`
      : `✅ ${result.id}: event-gated hold (owner=${result.owner}, release_condition=${result.release_condition}), status=${result.status}`);
    process.exitCode = 0;
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
