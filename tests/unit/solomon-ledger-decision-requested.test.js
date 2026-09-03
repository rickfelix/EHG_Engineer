/**
 * SD-ALTIFYAI-LEO-FIX-SOLOMON-ADVICE-LEDGER-001 (FR-1), INVERTED by QF-20260902-813 — the
 * decision_requested admission discriminator, created fresh at Solomon send time.
 *
 * WHY THE DEFAULT FLIPPED: the original default-TRUE design (opt-out via --informational) was
 * deliberate for its own adoption window — see the two-candidate disproof preserved below (TS-1),
 * which is UNCHANGED by this QF; expectsReply and resolvedReplyClass are still the wrong
 * discriminators for a completely different reason (they collapse to fire-and-forget regardless
 * of decision intent). But default-TRUE outlived its adoption purpose: MEASURED 2026-09-02, 150
 * rows sat decision='pending' in solomon_advice_outcome_ledger because nearly every consult
 * ANSWER (closes the loop, asks nothing further) was still stamped true. Default is now FALSE;
 * --decision is the new explicit opt-IN for a send that genuinely asks the recipient to decide.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const m = require('../../scripts/solomon-advisory.cjs');

const FIXTURE = JSON.parse(readFileSync(
  fileURLToPath(new URL('../fixtures/solomon-ledger-decision-requested-counterexample.json', import.meta.url)),
  'utf8'
));

const SRC = readFileSync(fileURLToPath(new URL('../../scripts/solomon-advisory.cjs', import.meta.url)), 'utf8');

describe('TS-14: the counter-example fixture is intact', () => {
  it('has exactly 34 rows, 15 with a real disposition split 6 accepted / 9 deferred', () => {
    expect(FIXTURE.length).toBe(34);
    const real = FIXTURE.filter((r) => r.decision === 'accepted' || r.decision === 'deferred');
    expect(real.length).toBe(15);
    expect(real.filter((r) => r.decision === 'accepted').length).toBe(6);
    expect(real.filter((r) => r.decision === 'deferred').length).toBe(9);
  });
});

/** Mirrors expectsReply's real semantics: mode==='request', stored on the fixture as the STRING 'true'/'false'. */
function candidateExpectsReply(row) {
  return row.src_expects_reply === 'true';
}

/** Mirrors resolvedReplyClass's real branching at scripts/solomon-advisory.cjs:135. */
function candidateResolvedReplyClass(row) {
  if (row.src_is_reply) return 'fire-and-forget';
  if (candidateExpectsReply(row)) return 'live-handshake';
  return row.src_reply_class || 'fire-and-forget';
}

describe('TS-1: the two disproven candidate discriminators remain wrong for an unrelated reason', () => {
  const realDispositionRows = FIXTURE.filter((r) => r.decision === 'accepted' || r.decision === 'deferred');

  // QF-20260902-813: the old "classifies all 34 fixture rows as true" assertion asserted the
  // PRE-INVERSION default and is gone — resolveDecisionRequested's default is now false. This
  // disproof is about candidateExpectsReply/candidateResolvedReplyClass specifically (they
  // collapse to fire-and-forget regardless of decision intent), which the default flip does not
  // touch — kept verbatim.
  it('control: both disproven candidates would have suppressed all 15 real-disposition rows', () => {
    expect(realDispositionRows.length).toBe(15);
    for (const row of realDispositionRows) {
      const candidateA = candidateExpectsReply(row) ? 'live-handshake' : 'fire-and-forget';
      const candidateB = candidateResolvedReplyClass(row);
      expect(candidateA, `expectsReply candidate for ${row.correlation_id}`).toBe('fire-and-forget');
      expect(candidateB, `resolvedReplyClass candidate for ${row.correlation_id}`).toBe('fire-and-forget');
    }
  });
});

describe('FR-1 (QF-20260902-813 inversion): resolveDecisionRequested — pure contract', () => {
  it('returns false by default (informational and decision both omitted)', () => {
    expect(m.resolveDecisionRequested({})).toBe(false);
    expect(m.resolveDecisionRequested()).toBe(false);
  });

  it('returns true ONLY when decision is the literal boolean true', () => {
    expect(m.resolveDecisionRequested({ decision: true })).toBe(true);
  });

  it('legacy informational:true is a redundant-but-harmless synonym for the (now-default) false', () => {
    expect(m.resolveDecisionRequested({ informational: true })).toBe(false);
  });

  it('decision wins over informational when both are set (an explicit ask overrides the legacy opt-out)', () => {
    expect(m.resolveDecisionRequested({ informational: true, decision: true })).toBe(true);
  });

  // TS-3a: a non-boolean parse result must never silently no-op the strict identity check.
  it('TS-3a: a non-boolean decision value never no-ops the signal (strict === true)', () => {
    expect(m.resolveDecisionRequested({ decision: 'true' })).toBe(false); // string, not boolean
    expect(m.resolveDecisionRequested({ decision: 1 })).toBe(false);
    expect(m.resolveDecisionRequested({ decision: false })).toBe(false);
  });
});

describe('TS-3 (QF-20260902-813): decision_requested is orthogonal to reply_class in BOTH directions', () => {
  it('all replyTo x decision combinations produce the expected decision_requested, with reply_class always fire-and-forget and no reply_expected_by stamped', () => {
    const cases = [
      { replyTo: undefined, decision: undefined, expectDecisionRequested: false },
      { replyTo: undefined, decision: true, expectDecisionRequested: true },
      { replyTo: 'corr-abc', decision: undefined, expectDecisionRequested: false }, // the reproduction case named in the QF
      { replyTo: 'corr-abc', decision: true, expectDecisionRequested: true }, // --decision overrides even a reply_to answer
    ];
    for (const c of cases) {
      const payload = m.buildAdvisoryPayload({
        body: 'x', senderCallsign: 'solomon-test', repo: '/tmp', correlationId: 'corr-x',
        replyTo: c.replyTo, decision: c.decision,
      });
      expect(payload.decision_requested, JSON.stringify(c)).toBe(c.expectDecisionRequested);
      expect(payload.reply_class, JSON.stringify(c)).toBe('fire-and-forget');
      expect(payload.reply_expected_by).toBeUndefined();
    }
  });

  it('decision_requested is stamped unconditionally — always present, never conditionally omitted', () => {
    const payload = m.buildAdvisoryPayload({ body: 'x', senderCallsign: 's', repo: '/tmp', correlationId: 'c' });
    expect(payload).toHaveProperty('decision_requested');
    expect(typeof payload.decision_requested).toBe('boolean');
  });
});

describe('TS-3b (wiring): the CLI argv parse threads informational/decision all the way to buildAdvisoryPayload', () => {
  it('the source registers --informational in BOOL_FLAGS AND passes it into the buildAdvisoryPayload call site', () => {
    // Two independent facts, both required — a maintainer could add one and forget the other,
    // which is exactly the class of gap TESTING flagged at PLAN (registering the flag proves
    // TS-2 but says nothing about whether the parsed value ever reaches the payload builder).
    expect(/const BOOL_FLAGS = \[[^\]]*'--informational'[^\]]*\]/.test(SRC)).toBe(true);
    expect(/const informationalArg = argv\.indexOf\('--informational'\) >= 0/.test(SRC)).toBe(true);
    expect(/buildAdvisoryPayload\(\{[^}]*informational: informationalArg[^}]*\}\)/.test(SRC)).toBe(true);
  });

  // QF-20260902-813: the new --decision opt-in flag needs the same two-fact wiring proof.
  it('the source registers --decision in BOOL_FLAGS AND passes it into the buildAdvisoryPayload call site', () => {
    expect(/const BOOL_FLAGS = \[[^\]]*'--decision'[^\]]*\]/.test(SRC)).toBe(true);
    expect(/const decisionArg = argv\.indexOf\('--decision'\) >= 0/.test(SRC)).toBe(true);
    expect(/buildAdvisoryPayload\(\{[^}]*decision: decisionArg[^}]*\}\)/.test(SRC)).toBe(true);
  });
});
