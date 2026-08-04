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
import { isMainModule } from '../lib/utils/is-main-module.js';
import { checkHoldStamp, buildProvenancedStamp, logHoldStateViolation } from '../lib/governance/hold-state-contract.js';

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

function displayHelp() {
  console.log(`
Defer Quick-Fix — durable time-gated defer (SD-LEO-FIX-QUICK-FIXES-NEEDS-001)

Usage:
  node scripts/defer-quick-fix.js <QF-ID> --not-before <ISO-timestamp> [--reopen]
    [--reason <text>] [--owner <text>] [--release-condition <text>]

Options:
  --not-before <ts>   Required. ISO-8601 timestamp. The QF is not claimable/
                      auto-startable by any picker until this time passes.
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
  const validation = validateNotBefore(notBefore);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const daysOut = (Date.parse(validation.iso) - Date.now()) / (24 * 60 * 60 * 1000);
  if (daysOut > FAR_FUTURE_PARK_DAYS && !(releaseCondition && String(releaseCondition).trim())) {
    const err = new Error(`--not-before is ${Math.round(daysOut)} days out (>${FAR_FUTURE_PARK_DAYS}) and requires --release-condition -- a far-future park with no release trigger never resurfaces (QF-20260720-137)`);
    err.code = 'FAR_FUTURE_PARK_REQUIRES_RELEASE_CONDITION';
    throw err;
  }

  const supabase = supabaseClient || createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const holdCheck = checkHoldStamp({ reason, owner, review_at: validation.iso, release_condition: releaseCondition });
  if (!holdCheck.ok && holdCheck.mode === 'observe') {
    await logHoldStateViolation(supabase, {
      surface: 'quick_fix_defer',
      stamp: { reason, owner, review_at: validation.iso, release_condition: releaseCondition },
      errors: holdCheck.errors,
    });
  }
  const stamped = buildProvenancedStamp({ reason, owner, release_condition: releaseCondition }, writingSessionId);

  // SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-002 (FR-1): deferring MUST release the seat. Today this
  // clears NEITHER surface, so a deferred QF pins its worker exactly like a returned one — and there
  // is no other way out, because lib/quick-fix-claim.mjs exports claimQuickFix and no releaseQuickFix,
  // and `npm run sd:release` reports "no SD claimed" for a QF since it only queries
  // strategic_directives_v2. Clearing the authoritative column here is the whole release path.
  const update = { not_before: validation.iso, claiming_session_id: null };
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
    console.log(`✅ ${result.id}: not_before=${result.not_before}, status=${result.status}`);
    process.exitCode = 0;
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
