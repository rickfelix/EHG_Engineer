// QF-20260912-219: pure arg-parsing for the new sd-hold-stamp CLI.
import { describe, it, expect } from 'vitest';
import { parseArgs } from '../../scripts/sd-hold-stamp.mjs';

describe('sd-hold-stamp.mjs parseArgs', () => {
  it('parses a full set invocation', () => {
    const { sdKey, opts } = parseArgs([
      'SD-EXAMPLE-001', '--key', 'needs_coordinator_review',
      '--reason', 'deliberate hold', '--review-at', '2026-09-19', '--actor', 'coordinator:7a723d7e',
    ]);
    expect(sdKey).toBe('SD-EXAMPLE-001');
    expect(opts).toEqual({
      clear: false,
      key: 'needs_coordinator_review',
      reason: 'deliberate hold',
      reviewAt: '2026-09-19',
      actor: 'coordinator:7a723d7e',
    });
  });

  it('parses --clear as a boolean flag with no value consumed', () => {
    const { opts } = parseArgs(['SD-EXAMPLE-002', '--key', 'requires_human_action', '--clear', '--reason', 'return to belt']);
    expect(opts.clear).toBe(true);
    expect(opts.reason).toBe('return to belt');
  });

  it('defaults clear to false and leaves unset options undefined', () => {
    const { opts } = parseArgs(['SD-EXAMPLE-003']);
    expect(opts.clear).toBe(false);
    expect(opts.key).toBeUndefined();
    expect(opts.reviewAt).toBeUndefined();
  });
});
