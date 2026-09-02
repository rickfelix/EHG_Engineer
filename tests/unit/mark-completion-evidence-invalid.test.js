/**
 * SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001 (FR-5/FR-7) — tests for the pure core of
 * scripts/mark-completion-evidence-invalid.js: the ONLY sanctioned writer of
 * strategic_directives_v2.metadata.completion_evidence_invalid.
 */
import { describe, it, expect } from 'vitest';
import {
  parseArgs,
  refusalReason,
  computeMarkInvalid,
} from '../../scripts/mark-completion-evidence-invalid.js';

const NOW_ISO = '2026-09-02T18:30:00.000Z';
const REASON = 'run 1a1b3087 bypassed a BLOCKED TESTING verdict via --bypass-validation';

describe('parseArgs', () => {
  it('parses --flag value pairs', () => {
    const args = parseArgs(['--sd-id', 'SD-XXX-001', '--reason', 'because']);
    expect(args.sd_id).toBe('SD-XXX-001');
    expect(args.reason).toBe('because');
  });

  it('converts hyphenated flags to snake_case keys', () => {
    const args = parseArgs(['--offending-handoff-id', 'abc-123']);
    expect(args.offending_handoff_id).toBe('abc-123');
  });

  it('treats a bare flag (no following value) as boolean true', () => {
    const args = parseArgs(['--help']);
    expect(args.help).toBe('true');
  });
});

describe('refusalReason', () => {
  it('refuses without --sd-id', () => {
    expect(refusalReason({ reason: REASON })).toMatch(/missing --sd-id/);
  });

  it('refuses without --reason', () => {
    expect(refusalReason({ sd_id: 'SD-XXX-001' })).toMatch(/missing --reason/);
  });

  it('refuses a --reason shorter than 20 characters', () => {
    expect(refusalReason({ sd_id: 'SD-XXX-001', reason: 'too short' })).toMatch(/at least 20 characters/);
  });

  it('accepts a well-formed invocation', () => {
    expect(refusalReason({ sd_id: 'SD-XXX-001', reason: REASON })).toBeNull();
  });
});

describe('computeMarkInvalid', () => {
  it('sets completion_evidence_invalid=true and stamps reason/actor/timestamp', () => {
    const { updates } = computeMarkInvalid(
      { metadata: { foo: 'bar' } },
      { reason: REASON, actor: 'session-abc', nowIso: NOW_ISO },
    );
    expect(updates.metadata.completion_evidence_invalid).toBe(true);
    expect(updates.metadata.completion_evidence_invalid_reason).toBe(REASON);
    expect(updates.metadata.completion_evidence_invalid_by).toBe('session-abc');
    expect(updates.metadata.completion_evidence_invalid_at).toBe(NOW_ISO);
    // Prior metadata preserved, not clobbered.
    expect(updates.metadata.foo).toBe('bar');
  });

  it('records offendingHandoffId when provided, null otherwise', () => {
    const withId = computeMarkInvalid({ metadata: {} }, { reason: REASON, actor: 'a', offendingHandoffId: 'handoff-1a1b3087', nowIso: NOW_ISO });
    expect(withId.updates.metadata.completion_evidence_invalid_offending_handoff_id).toBe('handoff-1a1b3087');

    const withoutId = computeMarkInvalid({ metadata: {} }, { reason: REASON, actor: 'a', nowIso: NOW_ISO });
    expect(withoutId.updates.metadata.completion_evidence_invalid_offending_handoff_id).toBeNull();
  });

  it('tolerates null/missing metadata without throwing', () => {
    for (const metadata of [null, undefined, [], 'nope']) {
      const { updates } = computeMarkInvalid({ metadata }, { reason: REASON, actor: 'a', nowIso: NOW_ISO });
      expect(updates.metadata.completion_evidence_invalid).toBe(true);
    }
  });

  it('caps an overlong reason at 1000 characters', () => {
    const long = 'x'.repeat(2000);
    const { updates } = computeMarkInvalid({ metadata: {} }, { reason: long, actor: 'a', nowIso: NOW_ISO });
    expect(updates.metadata.completion_evidence_invalid_reason.length).toBe(1000);
  });
});
