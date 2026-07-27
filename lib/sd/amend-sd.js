/**
 * Canonical SD-amendment path — SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-D.
 *
 * THE DEFECT: once a PRD exists, editing an SD's description/scope reaches nobody. EXEC builds to
 * the PRD it already holds (CLAUDE_EXEC.md:60-69 consults the SD only on ambiguity, and only for
 * strategic_objectives), and the one content-comparison gate (plan-to-exec/gates/sd-prd-drift.js)
 * runs once at PLAN-TO-EXEC and is advisory by default. So the ORIGINAL flows and the CORRECTION
 * stalls one hop short, silently, with no error to its author.
 *
 * WHY THIS DOES NOT TOUCH THE DRIFT GATE. Flipping SD_PRD_DRIFT_ENFORCING=true looks like the fix
 * and is not one. Measured over the 400 most recently created SDs with the gate's own exported
 * extractSdFrs(): 354 (88.5%) have NO extractable FRs, so sd-prd-drift.js:166-168 takes its
 * {passed:true, skipped:true} branch BEFORE `enforcing` is ever consulted — `required` only decides
 * whether a FAILING gate blocks, and a vacuously PASSING gate blocks nothing. VALIDATION
 * (2ba1c482) reproduced all five figures exactly and confirmed the branch ordering structurally.
 *
 * WHAT THIS DOES INSTEAD: wires the missing PRODUCER for payload kind 'fence_notice'.
 * SD-LEO-INFRA-MID-FLIGHT-DIRECTIVE-001 purpose-built that kind for exactly this shape — a busy
 * worker that must see something promptly, deliver-not-consume, priority-exempt from the inbox row
 * cap — and it has consumers and drain-set wiring but NO producer anywhere in the codebase. The
 * mechanism existed and simply never travelled, which is this SD family's own thesis.
 *
 * SCOPE LIMIT, stated rather than implied: there is no chokepoint for SD writes (~30+ one-off
 * scripts call .update() on strategic_directives_v2 directly). This establishes the canonical
 * amendment path and notifies through it; it does not retrofit historical call sites. Universal
 * coverage would need a DB trigger on description/scope, which is chairman-gated DDL and is
 * deliberately left as a separate follow-on.
 *
 * @module lib/sd/amend-sd
 */

import { createRequire } from 'module';
import { isActiveSD } from './active-sd-predicate.js';

const require = createRequire(import.meta.url);

/**
 * Phases in which a worker may already be building against a PRD, so an amendment has a consumer
 * that must be told. Measured 2026-07-27 against the live in-flight population (14 SDs with
 * status in_progress/active): {EXEC:9, PLAN_VERIFICATION:4, PLAN_PRD:1}. EXEC_COMPLETE is included
 * because a parent/child can be amended between EXEC and its verification handoff.
 *
 * LEAD_* phases are deliberately absent: no PRD exists yet, so there is nothing to have drifted
 * from — and FR-4 requires those amendments stay silent rather than train workers to ignore the
 * channel. The PRD-existence check below enforces that independently of this list.
 */
export const ACTIVE_BUILD_PHASES = Object.freeze([
  'PLAN_PRD',
  'PLAN_VERIFICATION',
  'EXEC',
  'EXEC_COMPLETE',
]);

/**
 * The ONLY columns this helper will write. SECURITY (cbe69100) found that passing `patch` straight
 * into .update() lets a caller reach governance-relevant columns. status and sd_type are covered by
 * their own triggers (trg_enforce_sd_quality_advancement, trg_enforce_sd_type_change_governance),
 * but claiming_session_id is a plain nullable TEXT column normally written ONLY via the claim_sd /
 * release_sd RPCs — which add FOR UPDATE SKIP LOCKED row-locking and conflict-matrix checks that a
 * raw column write bypasses entirely.
 *
 * SECURITY rated this non-blocking because today's only caller (scripts/amend-sd.js) never builds
 * those keys, and deferred it as a condition binding on the NEXT caller. It is enforced here now
 * instead: this helper is advertised as the canonical amendment path, and leaving a hazard whose
 * only guard is a future author reading a condition is precisely the failure mode this SD family
 * exists to remove. A correction that depends on someone remembering it has not been delivered.
 */
export const AMENDABLE_FIELDS = Object.freeze(['description', 'scope', 'metadata']);

/**
 * PURE: does this SD row sit in a phase where an amendment has a live consumer?
 * Composes the EXISTING active-SD predicate (status/is_active/archived_at, lib/sd/active-sd-predicate.js)
 * rather than re-deriving it — that helper is the established SSOT for the status dimension and
 * re-deriving it inline is the writer/consumer asymmetry its own module comment warns about.
 * This function adds only the phase dimension, which that helper does not cover.
 *
 * @param {Object} row - SD row with status, is_active, archived_at, current_phase.
 * @returns {boolean}
 */
export function isInActiveBuildPhase(row) {
  if (!isActiveSD(row)) return false;
  return ACTIVE_BUILD_PHASES.includes(String(row?.current_phase || '').toUpperCase());
}

/**
 * Amend an SD and notify the session building it.
 *
 * The SD update is applied FIRST and independently of delivery: a notice that cannot be delivered
 * must never roll back the amendment (FR-3). The caller is told both facts via the return contract
 * so "the row changed but nobody was told" is a reportable state rather than a silent success.
 *
 * @param {Object} supabase
 * @param {string} sdKey
 * @param {Object} patch - fields to update (e.g. {description, scope}).
 * @param {Object} [opts]
 * @param {string} [opts.senderSession] - amending session id; defaults to CLAUDE_SESSION_ID.
 * @param {string} [opts.reason] - short human-readable note carried in the notice body.
 * @param {Function} [opts.dispatch] - seam for tests ONLY; defaults to the real dispatchToWorker.
 *   Injected rather than module-mocked so a unit test never needs live credentials to prove the
 *   payload shape — probing via an injected seam, never by editing the live call site.
 * @param {Object} [opts.logger]
 * @returns {Promise<{sdUpdated:boolean, noticeDelivered:boolean, noticeRequired:boolean, warning:(string|null), errorCode:(string|null)}>}
 */
export async function amendSd(supabase, sdKey, patch, opts = {}) {
  const { senderSession = process.env.CLAUDE_SESSION_ID, reason = null, logger = console, dispatch } = opts;
  const out = { sdUpdated: false, noticeDelivered: false, noticeRequired: false, warning: null, errorCode: null };

  if (!patch || typeof patch !== 'object' || Object.keys(patch).length === 0) {
    out.errorCode = 'AMEND_EMPTY_PATCH';
    out.warning = 'refusing to amend with an empty patch';
    return out;
  }

  // Fail CLOSED on an out-of-scope column rather than silently dropping it: a caller who thinks it
  // just released a claim, and got a success back because the key was quietly ignored, is worse off
  // than one that got an error.
  const illegal = Object.keys(patch).filter((k) => !AMENDABLE_FIELDS.includes(k));
  if (illegal.length > 0) {
    out.errorCode = 'AMEND_FIELD_NOT_AMENDABLE';
    out.warning = `refusing to write non-amendable column(s): ${illegal.join(', ')}. `
      + `This path writes only ${AMENDABLE_FIELDS.join('/')}. claiming_session_id must go through `
      + 'the claim_sd/release_sd RPCs (row-locking + conflict matrix); status/sd_type have their own '
      + 'governance triggers.';
    return out;
  }

  const { data: sd, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, status, is_active, archived_at, current_phase, claiming_session_id')
    .eq('sd_key', sdKey)
    .maybeSingle();

  if (readErr || !sd) {
    out.errorCode = readErr ? 'AMEND_READ_FAILED' : 'AMEND_SD_NOT_FOUND';
    out.warning = readErr ? `read failed: ${readErr.message}` : `SD not found: ${sdKey}`;
    return out;
  }

  const { error: upErr } = await supabase
    .from('strategic_directives_v2')
    .update(patch)
    .eq('sd_key', sdKey);

  if (upErr) {
    out.errorCode = 'AMEND_UPDATE_FAILED';
    out.warning = `update failed: ${upErr.message}`;
    return out;
  }
  out.sdUpdated = true;

  // FR-4: an amendment with no in-flight consumer emits nothing and warns about nothing. A notice
  // on every SD edit would flood the priority-exempt lane this SD depends on being trustworthy.
  if (!isInActiveBuildPhase(sd)) return out;

  // FR-4: no PRD means nothing has been built against yet — nothing to have drifted from. Checked
  // on sd_id, NOT directive_id: product_requirements_v2 keys the SD by sd_id, and querying
  // directive_id returns 0 rows for every SD, which reads as a false "no PRD".
  const { data: prds } = await supabase
    .from('product_requirements_v2')
    .select('id')
    .eq('sd_id', sd.id)
    .limit(1);
  if (!prds || prds.length === 0) return out;

  out.noticeRequired = true;

  if (!sd.claiming_session_id) {
    out.errorCode = 'AMEND_NO_CONSUMER';
    out.warning = `${sdKey} is in ${sd.current_phase} with a PRD but has no claiming session — `
      + 'the amendment reached the row and no worker. Re-dispatch or re-claim before relying on it.';
    return out;
  }

  // Reuse the validated coordination writer. dispatchToWorker wraps insertCoordinationRow and adds
  // the 'worker' role hint; hand-rolling a session_coordination insert would bypass its target
  // liveness/tier/terminal guards.
  const dispatchToWorker = dispatch || require('../coordinator/dispatch.cjs').dispatchToWorker;
  const changed = Object.keys(patch).join(', ');

  try {
    await dispatchToWorker(supabase, {
      sender_session: senderSession,
      target_session: sd.claiming_session_id,
      message_type: 'INFO',
      subject: `[SD AMENDED] ${sdKey} — ${changed} changed mid-build`,
      payload: {
        // FR-5: reuse the EXISTING kind verbatim. It is already in DIRECTIVE_KINDS and
        // PRIORITY_EXEMPT_DIRECTIVE_KINDS, and tests/unit/coord-adam-comms-resilient.test.js
        // source-pins that array with toEqual — minting a new kind would break that pin plus the
        // duplicated array in tests/unit/fleet/drain-sets-adam-reconciliation.test.js.
        kind: 'fence_notice',
        // FR-5 disjointness from sibling -C: this stays a ONE-WAY directive. No reply_class and no
        // adam_advisory kind, so it never enters -C's alreadyAnswered dedup / ping-on-silence path.
        sd_key: sdKey,
        amended_fields: Object.keys(patch),
        body: `${sdKey} was amended while you hold it in ${sd.current_phase}. Fields changed: `
          + `${changed}. You are building to a PRD written before this change — re-read the SD `
          + `before continuing.${reason ? ` Reason: ${reason}` : ''}`,
      },
    }, { logger });
    out.noticeDelivered = true;
  } catch (e) {
    // Typed codes from assertValidTarget (dispatch.cjs:129-178): DISPATCH_TARGET_INVALID /
    // DISPATCH_TARGET_UNKNOWN / DISPATCH_TARGET_STALE / DISPATCH_LOOKUP_FAILED. Translate rather
    // than invent new error vocabulary.
    out.errorCode = e?.code || 'AMEND_DISPATCH_FAILED';
    out.warning = `${sdKey} was updated but the worker was NOT notified (${out.errorCode}): ${e?.message || e}`;
  }

  return out;
}
