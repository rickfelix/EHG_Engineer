/**
 * SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 (FR-4, CRITICAL) — VALIDATION sub-agent finding F1: the
 * naive release fix (re-dispatch a held row's already-composed body through sendChairmanSMS)
 * would fold message.options/replyInstruction/noReplyConsequence into the body a SECOND time,
 * doubling the text the chairman receives. opts.skipCompose is the fix (option (b) — the ONLY
 * option compatible with tests/unit/comms/chairman-sms-gate-hold-persistence.test.js:52-58's
 * existing contract that a held row's body is captured ALREADY composed).
 *
 * This file exercises the real sendChairmanSMS (not a mock), asserting on the EXACT wire body via
 * the injected sender.send seam — an occurrence-count assertion, not toContain(), since toContain
 * would pass whether the labeled options appear once or twice.
 */
import { describe, it, expect, vi } from 'vitest';
import { sendChairmanSMS } from '../../../lib/comms/adam-outbound/chairman-sms-gate/index.js';

const passEval = vi.fn().mockResolvedValue({ verdict: 'pass', authorityClass: 'sms' });
const zoneStub = vi.fn().mockResolvedValue({ zone: 'America/New_York' });
const skipConsult = vi.fn().mockResolvedValue({ action: 'skip', reason: 'gate-not-triggered' });

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

describe('sendChairmanSMS opts.skipCompose (FR-4)', () => {
  it('WITHOUT skipCompose: composes options/replyInstruction into the body exactly once (baseline, unchanged behavior)', async () => {
    const sender = { send: vi.fn().mockResolvedValue({ sid: 'SM-1' }) };
    const message = {
      type: 'decision',
      body: 'Approve the deploy?',
      options: [{ label: 'A: approve' }, { label: 'B: reject' }],
      replyInstruction: 'Reply with the option letter.',
      noReplyConsequence: 'No reply means hold.',
    };
    const r = await sendChairmanSMS(message, {}, {
      evaluate: passEval, sender, resolveChairmanZone: zoneStub, runPreSendConsultLane: skipConsult,
    });
    expect(r.sent).toBe(true);
    const sentBody = sender.send.mock.calls[0][0].body;
    expect(countOccurrences(sentBody, 'A: approve')).toBe(1);
    expect(countOccurrences(sentBody, 'Reply with the option letter.')).toBe(1);
  });

  it('WITH skipCompose: a message whose body is ALREADY fully composed (matching a held row) is dispatched VERBATIM -- no second composition pass', async () => {
    const sender = { send: vi.fn().mockResolvedValue({ sid: 'SM-2' }) };
    // Simulates chairman_held_sends.body/options/replyInstruction/noReplyConsequence reconstructed
    // by releaseHeldSend -- body is the ALREADY-composed text (options/instruction folded in once
    // by the hold-time pass through this same gate), yet options/replyInstruction/
    // noReplyConsequence are STILL present as separate fields (needed for the rubric's
    // labeled_options/reply_instruction/reply_ids checks) even though skipCompose prevents them
    // from being folded into the body a second time.
    const alreadyComposedBody = 'Approve the deploy?\n\nA: approve\nB: reject\n\nReply with the option letter.';
    const message = {
      type: 'decision',
      body: alreadyComposedBody,
      options: [{ label: 'A: approve' }, { label: 'B: reject' }],
      replyInstruction: 'Reply with the option letter.',
      replyId: 'rid-1',
      noReplyConsequence: 'No reply means hold.',
    };
    const r = await sendChairmanSMS(message, {}, {
      evaluate: passEval, sender, resolveChairmanZone: zoneStub, runPreSendConsultLane: skipConsult,
      skipCompose: true,
    });
    expect(r.sent).toBe(true);
    const sentBody = sender.send.mock.calls[0][0].body;
    // The load-bearing assertion: exactly ONE occurrence each, never two. A regression to the
    // pre-fix double-composition shape would push these to 2.
    expect(countOccurrences(sentBody, 'A: approve')).toBe(1);
    expect(countOccurrences(sentBody, 'Reply with the option letter.')).toBe(1);
    expect(sentBody).toBe(alreadyComposedBody);
  });

  it('WITH skipCompose but the caller omits noReplyConsequence in the pre-composed body already: verifies skipCompose does not ADD text either, only skips composing', async () => {
    const sender = { send: vi.fn().mockResolvedValue({ sid: 'SM-3' }) };
    const alreadyComposedBody = 'Approve X?\n\nA\nB';
    const r = await sendChairmanSMS(
      { type: 'decision', body: alreadyComposedBody, options: [{ label: 'A' }, { label: 'B' }], replyInstruction: 'ri', replyId: 'rid-2' },
      {},
      { evaluate: passEval, sender, resolveChairmanZone: zoneStub, runPreSendConsultLane: skipConsult, skipCompose: true },
    );
    expect(r.sent).toBe(true);
    expect(sender.send.mock.calls[0][0].body).toBe(alreadyComposedBody);
  });
});
