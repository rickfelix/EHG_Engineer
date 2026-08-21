/**
 * SD-ALTIFYAI-LEO-FIX-SOLOMON-ADVICE-LEDGER-001 (FR-1) — the decision_requested admission
 * discriminator, created fresh at Solomon send time via --informational, deliberately NOT
 * derived from any existing payload field.
 *
 * TWO CANDIDATE DISCRIMINATORS WERE MEASURED AGAINST LIVE TRAFFIC AND DISPROVEN BEFORE THIS ONE
 * WAS CHOSEN — expectsReply (mode==='request', dead by construction) and resolvedReplyClass
 * (collapses to 'fire-and-forget' for effectively all live Solomon sends). This file's TS-1
 * replays that disproof against the preserved 34-row counter-example fixture so the argument is
 * executable, not narrative — and per TESTING's PLAN-phase finding, the assertion must actually
 * READ the fixture row-by-row (a constant-result call proves nothing).
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

describe('TS-1: resolveDecisionRequested never suppresses a row that received a real disposition', () => {
  const realDispositionRows = FIXTURE.filter((r) => r.decision === 'accepted' || r.decision === 'deferred');

  it('classifies all 34 fixture rows as true with --informational omitted (the pre-adoption state)', () => {
    for (const row of FIXTURE) {
      // Per-row, reading actual fixture content — a constant-result call would pass vacuously.
      expect(m.resolveDecisionRequested({ informational: undefined }), `row ${row.correlation_id}`).toBe(true);
    }
  });

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

describe('FR-1: resolveDecisionRequested — pure contract', () => {
  it('returns true when informational is omitted (default, non-suppressing)', () => {
    expect(m.resolveDecisionRequested({})).toBe(true);
    expect(m.resolveDecisionRequested()).toBe(true);
  });

  it('returns false ONLY for the literal boolean true', () => {
    expect(m.resolveDecisionRequested({ informational: true })).toBe(false);
  });

  // TS-3a: a non-boolean parse result must never silently no-op the strict identity check.
  it('TS-3a: a non-boolean informational value never no-ops the signal (strict !== true)', () => {
    expect(m.resolveDecisionRequested({ informational: 'true' })).toBe(true); // string, not boolean
    expect(m.resolveDecisionRequested({ informational: 1 })).toBe(true);
    expect(m.resolveDecisionRequested({ informational: false })).toBe(true);
  });
});

describe('TS-3: decision_requested is orthogonal to reply_class in BOTH directions', () => {
  it('all four replyTo x informational combinations produce the expected decision_requested, with reply_class always fire-and-forget and no reply_expected_by stamped', () => {
    const cases = [
      { replyTo: undefined, informational: undefined, expectDecisionRequested: true },
      { replyTo: undefined, informational: true, expectDecisionRequested: false },
      { replyTo: 'corr-abc', informational: undefined, expectDecisionRequested: true },
      { replyTo: 'corr-abc', informational: true, expectDecisionRequested: false }, // the case that killed candidate #2
    ];
    for (const c of cases) {
      const payload = m.buildAdvisoryPayload({
        body: 'x', senderCallsign: 'solomon-test', repo: '/tmp', correlationId: 'corr-x',
        replyTo: c.replyTo, informational: c.informational,
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

describe('TS-3b (wiring): the CLI argv parse threads informational all the way to buildAdvisoryPayload', () => {
  it('the source registers --informational in BOOL_FLAGS AND passes it into the buildAdvisoryPayload call site', () => {
    // Two independent facts, both required — a maintainer could add one and forget the other,
    // which is exactly the class of gap TESTING flagged at PLAN (registering the flag proves
    // TS-2 but says nothing about whether the parsed value ever reaches the payload builder).
    expect(/const BOOL_FLAGS = \[[^\]]*'--informational'[^\]]*\]/.test(SRC)).toBe(true);
    expect(/const informationalArg = argv\.indexOf\('--informational'\) >= 0/.test(SRC)).toBe(true);
    expect(/buildAdvisoryPayload\(\{[^}]*informational: informationalArg[^}]*\}\)/.test(SRC)).toBe(true);
  });
});
