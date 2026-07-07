/**
 * QF-20260707-875: preventive staleness WARN for routing-critical comms CLIs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { warnIfCheckoutStale } from '../../../lib/coordinator/checkout-staleness.cjs';

describe('warnIfCheckoutStale', () => {
  let stderrSpy;
  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterEach(() => stderrSpy.mockRestore());

  it('does NOT warn when up to date (0 commits behind)', () => {
    const fakeExec = vi.fn().mockReturnValue('0\n');
    warnIfCheckoutStale('test-cli', fakeExec);
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('WARNs with the commit count when behind origin', () => {
    const fakeExec = vi.fn().mockReturnValue('18\n');
    warnIfCheckoutStale('adam-advisory.cjs', fakeExec);
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    const message = stderrSpy.mock.calls[0][0];
    expect(message).toContain('18');
    expect(message).toContain('adam-advisory.cjs');
    expect(message).toContain('WARN');
  });

  it('never throws and never warns when git errors (detached HEAD / no upstream)', () => {
    const fakeExec = vi.fn().mockImplementation(() => { throw new Error('no upstream configured'); });
    expect(() => warnIfCheckoutStale('worker-signal.cjs', fakeExec)).not.toThrow();
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
