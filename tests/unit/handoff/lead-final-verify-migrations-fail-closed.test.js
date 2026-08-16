// QF-20260816-723 (C3 #7099 bug_002). verifyMigrationsApplied's table-existence probe
// treated ANY non-"Could not find" error as table-exists (fail-open) — a transient
// fetch-failed/RLS/5xx during the probe masked an unapplied migration and let the
// UNAPPLIED_MIGRATIONS rejection be silently skipped. classifyTableProbeError is the
// extracted, pure classification the loop now delegates to; these pin fail-closed behavior.
import { describe, it, expect } from 'vitest';
import { classifyTableProbeError } from '../../../scripts/modules/handoff/executors/lead-final-approval/index.js';

describe('classifyTableProbeError', () => {
  it('no error -> found', () => {
    expect(classifyTableProbeError(null)).toBe('found');
  });

  it('PGRST116 -> found (exists, unreadable)', () => {
    expect(classifyTableProbeError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })).toBe('found');
  });

  it('permission denied -> found (exists, unreadable)', () => {
    expect(classifyTableProbeError({ message: 'permission denied for table foo' })).toBe('found');
  });

  it('"Could not find" -> missing', () => {
    expect(classifyTableProbeError({ message: 'Could not find the table \'public.foo\' in the schema cache' })).toBe('missing');
  });

  it('"does not exist" -> missing', () => {
    expect(classifyTableProbeError({ message: 'relation "foo" does not exist' })).toBe('missing');
  });

  it('unexpected error (e.g. fetch failed) -> missing_unexpected, never silently found', () => {
    expect(classifyTableProbeError({ message: 'fetch failed' })).toBe('missing_unexpected');
  });
});
