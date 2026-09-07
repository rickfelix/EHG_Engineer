/**
 * QF-20260907-463 — describeUndirectableAssignment: 58% of measured live WORK_ASSIGNMENT rows
 * (49/84) carried no field the 'directed' profile (extractDirectedSd, structured-only, no text
 * fallback) can read, so the fast/priority directed-claim path could never fire for them
 * regardless of what the body text said — one HIGH-severity, live-app defect specimen sat
 * unclaimed 12 hours despite naming its target in prose.
 *
 * Distinct from the existing describeUnreadableAssignment (broader 'worker' profile, includes a
 * text scan): a row can be worker-readable yet still directed-unresolvable, which is exactly
 * this gap. These tests pin that a row resolvable ONLY via text scan on the worker profile still
 * correctly reports as undirectable, while a row carrying a structured field does not — and that
 * informational/broadcast nudges and command-target rows are correctly exempted (the ticket's
 * own caution: "NOT ESTABLISHED whether all 49 were intended as directed").
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const REPO = path.resolve(__dirname, '../../..');
const { describeUndirectableAssignment } = require_(path.join(REPO, 'lib/fleet/assignment-target.cjs'));

const row = (over = {}) => ({ message_type: 'WORK_ASSIGNMENT', subject: '', body: '', payload: {}, ...over });

describe('describeUndirectableAssignment (QF-20260907-463)', () => {
  it('THE MEASURED DEFECT: a WORK_ASSIGNMENT naming its target ONLY in text (worker-readable) is still undirectable', () => {
    const r = row({ subject: 'Please pick up QF-20260726-459 next', payload: {} });
    const result = describeUndirectableAssignment(r);
    expect(result).not.toBeNull();
    expect(result.detail).toMatch(/no structured directed target/i);
  });

  it('a row carrying payload.sd_key is NOT flagged', () => {
    expect(describeUndirectableAssignment(row({ payload: { sd_key: 'SD-LEO-ORCH-FOO-001-A' } }))).toBeNull();
  });

  it('a row carrying payload.target_sd is NOT flagged', () => {
    expect(describeUndirectableAssignment(row({ payload: { target_sd: 'QF-20260726-459' } }))).toBeNull();
  });

  it('a row carrying top-level target_sd is NOT flagged', () => {
    expect(describeUndirectableAssignment(row({ target_sd: 'QF-20260726-459' }))).toBeNull();
  });

  it('ANTI-VACUITY: not a WORK_ASSIGNMENT at all — never flagged regardless of shape', () => {
    expect(describeUndirectableAssignment({ message_type: 'INFO', payload: {} })).toBeNull();
  });

  it('an informational/broadcast completion nudge is exempt (legitimately keyless, per the ticket\'s own caution)', () => {
    expect(describeUndirectableAssignment(row({ payload: { kind: 'completion_nudge' } }))).toBeNull();
    expect(describeUndirectableAssignment(row({ payload: { informational: true } }))).toBeNull();
    expect(describeUndirectableAssignment(row({ subject: 'Next work available when QF-20260726-459 completes' }))).toBeNull();
  });

  it('a command-target row (payload.command + premise_measured_at) is exempt', () => {
    const r = row({ payload: { command: '/review-subsystem harness', premise_measured_at: new Date().toISOString() } });
    expect(describeUndirectableAssignment(r)).toBeNull();
  });

  it('never throws on junk input', () => {
    for (const bad of [null, undefined, 42, 'nope', {}]) {
      expect(() => describeUndirectableAssignment(bad)).not.toThrow();
    }
  });
});
