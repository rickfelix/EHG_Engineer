/**
 * SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001 (FR-5/FR-7) — tests for the pure core of
 * scripts/mark-completion-evidence-invalid.js: the ONLY sanctioned writer of
 * strategic_directives_v2.metadata.completion_evidence_invalid.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  parseArgs,
  refusalReason,
  computeMarkInvalid,
  resolveSD,
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

// SECURITY review finding S2 (EXEC-TO-PLAN evidence, measured 2026-09-02): resolveSD's
// non-UUID branch previously interpolated --sd-id unvalidated into a PostgREST .or() filter
// string. This script is the ONLY sanctioned writer of completion_evidence_invalid, so an
// unguarded filter meant an arbitrary --sd-id argument could mark an UNRELATED SD's evidence
// invalid and unlock its completed->active reopen.
describe('resolveSD (FR-5) — PostgREST filter injection guard', () => {
  function mockSupabase(row) {
    const or = vi.fn(() => ({
      limit: vi.fn(() => ({
        single: vi.fn(async () => ({ data: row, error: row ? null : { message: 'not found' } })),
      })),
    }));
    const select = vi.fn(() => ({ or }));
    const from = vi.fn(() => ({ select }));
    return { from, _or: or };
  }

  it('rejects an --sd-id value that injects an additional OR clause', async () => {
    const sb = mockSupabase({ id: 'x', sd_key: 'SD-DECOY-001', status: 'completed' });
    await expect(resolveSD(sb, 'NO-SUCH-KEY,status.eq.completed')).rejects.toThrow(/Invalid --sd-id format/);
    expect(sb._or).not.toHaveBeenCalled();
  });

  it('rejects other PostgREST metacharacter payloads (comma, dot-operator, parens)', async () => {
    const sb = mockSupabase(null);
    for (const payload of ['SD-X,or(status.eq.completed)', 'a.eq.b', 'SD-X)or(id.eq.y']) {
      await expect(resolveSD(sb, payload)).rejects.toThrow(/Invalid --sd-id format/);
    }
  });

  it('accepts a well-formed SD-KEY and queries sd_key.eq.<value> verbatim', async () => {
    const sb = mockSupabase({ id: 'x', sd_key: 'SD-XXX-001', status: 'active' });
    const sd = await resolveSD(sb, 'SD-XXX-001');
    expect(sd.sd_key).toBe('SD-XXX-001');
    expect(sb._or).toHaveBeenCalledWith('sd_key.eq.SD-XXX-001');
  });

  it('accepts a well-formed UUID and queries the uuid_id/id OR-branch verbatim', async () => {
    const sb = mockSupabase({ id: 'x', uuid_id: '64cba683-adb9-47f0-ae62-8238f4e3b9c0', status: 'active' });
    const uuid = '64cba683-adb9-47f0-ae62-8238f4e3b9c0';
    const sd = await resolveSD(sb, uuid);
    expect(sd.uuid_id).toBe(uuid);
    expect(sb._or).toHaveBeenCalledWith(`uuid_id.eq.${uuid},id.eq.${uuid}`);
  });
});
