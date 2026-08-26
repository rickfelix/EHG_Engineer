#!/usr/bin/env node
// adam-chairman-decision.mjs — QF-20260719-188: CLI authoring surface for chairman DECISION
// packets. adam-chairman-sms.mjs is status-only (--body/--kind/--dedupe-key); the rubric-engine
// lint hard-blocks any decision-shaped body unless the message carries the structured fields
// (labeled options, replyInstruction, replyId, DETAILS keyword, no-reply consequence) — so every
// decision sent via the status CLI bounced at the gate. This wrapper maps flags to that structured
// shape and routes through the SAME rubric-gated sendChairmanSMS path adam-chairman-sms.mjs already
// uses, so decisions get gate+staging+owed-state instead of bouncing to the raw fallback.
import 'dotenv/config';
import crypto from 'crypto';
import { enforceCliSendGuard } from '../lib/notifications/cli-send-guard.mjs';
import { sendChairmanSMS } from '../lib/comms/adam-outbound/chairman-sms-gate/index.js';
import { resolveQuietHoursContext } from '../lib/comms/adam-outbound/quiet-hours-extension.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

// SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-5): same pattern as lib/exec-context-guard.mjs's
// UUID_REGEX — chairman_held_sends.decision_id (and chairman_decisions.id) are typed uuid, and a
// non-UUID literal reaching the hold-path insert fails with Postgres 22P02, which the insert's own
// try/catch (chairman-sms-gate/index.js) swallows as a silent, unreconcilable loss of the hold row.
// Rejecting BEFORE any write is attempted turns that into a loud, immediate CLI error instead.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-5): pure argument parser + validator, extracted so
 * this CLI is unit-testable without executing enforceCliSendGuard (which reads process.argv and
 * calls process.exit) or sendChairmanSMS. Takes an explicit argv array (flags only, no leading
 * node/script tokens — the same slice enforceCliSendGuard's default already uses) rather than
 * reading process.argv internally, so a test can pass a synthetic argv without any global state.
 *
 * Validation order matters (FR-5): the UUID check on --decision-id runs BEFORE the --dry-run
 * branch is examined downstream, so a --dry-run invocation observes the same rejection a real
 * send would — dry-run must never mask a malformed decision id.
 *
 * @param {string[]} argv - flag/value tokens, e.g. process.argv.slice(2)
 * @returns {{ok:true, dry:boolean, message:object} | {ok:false, exitCode:number, error:string}}
 */
export function parseDecisionArgs(argv) {
  function argValue(flag) {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
  }
  function argValues(flag) {
    const out = [];
    for (let i = 0; i < argv.length; i++) if (argv[i] === flag) out.push(argv[i + 1]);
    return out;
  }

  const dry = argv.includes('--dry-run');
  const bodyText = argValue('--body');
  const options = argValues('--option').map((label) => ({ label }));
  const recommend = argValue('--recommend');
  const replyId = argValue('--reply-id') || crypto.randomBytes(4).toString('hex');
  const noReplyConsequence = argValue('--no-reply-policy');
  const replyInstruction = argValue('--reply-instruction')
    || `Reply with the option letter, or DETAILS for more context (ref ${replyId}).`;
  const decisionId = argValue('--decision-id');

  // SD-LEO-INFRA-SMS-DECIDE-REPLY-MATCHABLE-001 FR-4: --decision-id is required, not optional.
  // Without it the chairman-sms-gate's staging guard never fires (it only fires when a decisionId
  // is present), and the decisionId must reference an EXISTING chairman_decisions row anyway for a
  // letter reply to resolve anything — a decision packet with no decisionId has nothing to answer.
  // Existing convention for this class of "nothing to send" input: exit 0, not an error — matches
  // every other malformed-input branch below it (missing --body/--option/--no-reply-policy).
  if (!bodyText || !bodyText.trim() || options.length < 2 || !noReplyConsequence || !noReplyConsequence.trim() || !decisionId) {
    return {
      ok: false, exitCode: 0,
      error: '--body, at least two --option, --no-reply-policy, and --decision-id are required — nothing sent',
    };
  }

  // SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-5): a MALFORMED --decision-id is a genuine input
  // error (distinct from the "nothing to send" class above), so it exits 1, not 0.
  if (!UUID_REGEX.test(decisionId)) {
    return {
      ok: false, exitCode: 1,
      error: `--decision-id "${decisionId}" is not a valid UUID — chairman_held_sends.decision_id/chairman_decisions.id are typed uuid; a non-UUID value would fail the hold-path insert silently (Postgres 22P02) deep in the send path instead of here, at the point of resolution — refusing before any write is attempted`,
    };
  }

  const body = recommend ? `${bodyText.trim()}\nRecommend: ${recommend.trim()}` : bodyText.trim();
  const message = {
    type: 'decision',
    body,
    options,
    replyInstruction,
    replyId,
    noReplyConsequence: noReplyConsequence.trim(),
    decisionId,
    dedupeKey: argValue('--dedupe-key') || null,
  };
  return { ok: true, dry, message };
}

if (isMainModule(import.meta.url)) {
  enforceCliSendGuard({
    scriptName: 'scripts/adam-chairman-decision.mjs',
    flags: [
      { name: '--dry-run' }, { name: '--body', takesValue: true }, { name: '--option', takesValue: true },
      { name: '--recommend', takesValue: true }, { name: '--reply-instruction', takesValue: true },
      { name: '--reply-id', takesValue: true }, { name: '--no-reply-policy', takesValue: true },
      { name: '--decision-id', takesValue: true }, { name: '--dedupe-key', takesValue: true },
    ],
  });

  const parsed = parseDecisionArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.warn(`[adam-chairman-decision] ${parsed.error}`);
    process.exit(parsed.exitCode);
  }
  const { dry, message } = parsed;
  if (dry) {
    console.log('=== [ADAM CHAIRMAN DECISION — DRY RUN] no send ===\n' + JSON.stringify(message, null, 2));
  } else {
    // QF-20260720-824: honor a recorded chairman window-extension; default window unchanged.
    // SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 (FR-3): also resolves the chairman's location zone
    // in the SAME batched preference read (resolveQuietHoursContext), replacing the narrower
    // resolveAllowQuietHours call -- one round trip, not two.
    const now = new Date();
    const { allowQuietHours, chairmanZone } = await resolveQuietHoursContext(now);
    const context = { now, allowQuietHours, chairmanZone };
    const r = await sendChairmanSMS(message, context);
    console.log('ADAM-CHAIRMAN-DECISION', JSON.stringify(r));
  }
}
