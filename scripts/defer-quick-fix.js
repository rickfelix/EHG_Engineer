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

  const update = { not_before: validation.iso };
  if (reopen) update.status = 'open';
  if (stamped.reason) update.reason = stamped.reason;
  if (stamped.owner) update.owner = stamped.owner;
  if (stamped.release_condition) update.release_condition = stamped.release_condition;

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
