/**
 * SD-LEO-FIX-QUIET-HOURS-GATE-001 (FR-5/FR-6) — formatSendResult() reason-aware held-path
 * formatting. Extracted from scripts/adam-chairman-sms.mjs's top-level CLI logic (which is
 * guarded behind isMainModule() so importing this file for the function alone does not trigger
 * the CLI's argv parsing / enforceCliSendGuard / process.exit(0) side effects).
 *
 * TESTING-identified (2026-08-17): the pre-existing CLI test only exercises --dry-run, which
 * returns before the real send/held path is reached, so this was previously a source-pin-only
 * concern. formatSendResult is a plain, pure function -- direct unit assertions, no subprocess.
 */
import { describe, it, expect } from 'vitest';
import { formatSendResult } from '../../../scripts/adam-chairman-sms.mjs';

describe('formatSendResult()', () => {
  it("QH-TS-6a: reason==='blocked' with a quiet_hours blockedReason produces the quiet-hours-specific DROPPED/no-retry language", () => {
    const label = formatSendResult({
      sent: false, held: true, reason: 'blocked', verdict: 'blocked',
      blockedReasons: ['quiet_hours: within 22:00-06:00 ET quiet window'],
    });
    expect(label).toMatch(/DROPPED/);
    expect(label).toMatch(/NOT.*retried/i);
    expect(label).toMatch(/quiet hours/i);
  });

  it("QH-TS-6g: reason==='blocked' via rate_cap (NOT quiet_hours) does not claim quiet hours caused it", () => {
    const label = formatSendResult({
      sent: false, held: true, reason: 'blocked', verdict: 'blocked',
      blockedReasons: ['rate_cap: rate cap reached (3/3)'],
    });
    expect(label).toMatch(/DROPPED/);
    expect(label).not.toMatch(/quiet hours/i);
    expect(label).toMatch(/rate_cap/);
  });

  it("QH-TS-6h: reason==='blocked' via no_secrets does not tell the operator to just re-send (that would re-send the secret)", () => {
    const label = formatSendResult({
      sent: false, held: true, reason: 'blocked', verdict: 'blocked',
      blockedReasons: ['no_secrets: secret(s) detected: PROVIDER_KEY'],
    });
    expect(label).toMatch(/DROPPED/);
    expect(label).not.toMatch(/quiet hours/i);
    expect(label).not.toMatch(/re-send after the quiet window/i);
    expect(label).toMatch(/no_secrets/);
  });

  it("QH-TS-6i: reason==='blocked' with no blockedReasons array (defensive) falls back to a generic, non-quiet-hours-specific message", () => {
    const label = formatSendResult({ sent: false, held: true, reason: 'blocked', verdict: 'blocked' });
    expect(label).toMatch(/DROPPED/);
    expect(label).not.toMatch(/quiet hours/i);
  });

  it("QH-TS-6b: reason==='over_ask_held' does NOT produce DROPPED/no-retry language", () => {
    const label = formatSendResult({ sent: false, held: true, overAsk: true, reason: 'over_ask_held' });
    expect(label).not.toMatch(/DROPPED/);
    expect(label).not.toMatch(/will NOT be retried/i);
  });

  it("QH-TS-6c: reason==='gate_unavailable' does NOT produce DROPPED/no-retry language", () => {
    const label = formatSendResult({ sent: false, held: true, reason: 'gate_unavailable' });
    expect(label).not.toMatch(/DROPPED/);
  });

  it("QH-TS-6d: reason==='gate_unavailable_status' does NOT produce DROPPED/no-retry language", () => {
    const label = formatSendResult({ sent: false, held: true, reason: 'gate_unavailable_status' });
    expect(label).not.toMatch(/DROPPED/);
  });

  it('QH-TS-6e: a successful send returns null (nothing extra to print)', () => {
    expect(formatSendResult({ sent: true, reason: 'sent', verdict: 'pass' })).toBeNull();
  });

  it('QH-TS-6f: a null/undefined result returns null (defensive)', () => {
    expect(formatSendResult(null)).toBeNull();
    expect(formatSendResult(undefined)).toBeNull();
  });
});
