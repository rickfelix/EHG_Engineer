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

enforceCliSendGuard({
  scriptName: 'scripts/adam-chairman-decision.mjs',
  flags: [
    { name: '--dry-run' }, { name: '--body', takesValue: true }, { name: '--option', takesValue: true },
    { name: '--recommend', takesValue: true }, { name: '--reply-instruction', takesValue: true },
    { name: '--reply-id', takesValue: true }, { name: '--no-reply-policy', takesValue: true },
    { name: '--decision-id', takesValue: true }, { name: '--dedupe-key', takesValue: true },
  ],
});

const DRY = process.argv.includes('--dry-run');
function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
function argValues(flag) {
  const out = [];
  for (let i = 0; i < process.argv.length; i++) if (process.argv[i] === flag) out.push(process.argv[i + 1]);
  return out;
}

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
if (!bodyText || !bodyText.trim() || options.length < 2 || !noReplyConsequence || !noReplyConsequence.trim() || !decisionId) {
  console.warn('[adam-chairman-decision] --body, at least two --option, --no-reply-policy, and --decision-id are required — nothing sent');
  process.exit(0);
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
if (DRY) {
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
