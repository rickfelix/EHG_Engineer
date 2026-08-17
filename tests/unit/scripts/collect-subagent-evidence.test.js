/**
 * QF-20260817-186 — scripts/collect-subagent-evidence.js had no ceiling on the
 * orchestrator call at all: a hung DB query, or a supabase client keep-alive handle
 * inside the dynamic import (which opens a DB connection at module load), hung the
 * whole process forever with zero output and no evidence row for the caller to see.
 *
 * The literal steps_to_reproduce recorded on the QF ("node scripts/collect-subagent-
 * evidence.js --sd SD-LEO-FIX-QUIET-HOURS-GATE-001", no --phase) does not actually
 * hang -- parseCollectArgs() throws synchronously on a missing --phase and main()
 * exits 1 immediately (verified live). A corrected, valid invocation against that
 * same SD (--phase LEAD-FINAL-APPROVAL) also completed normally in ~7s (verified
 * live) -- the underlying hang did not reproduce under either invocation shape, so
 * this fixes the class of bug the QF describes (no ceiling => indefinite hang)
 * rather than a specific reproduced trace.
 */
import { describe, it, expect, vi } from 'vitest';
import { getCollectTimeoutMs, withTimeout, parseCollectArgs } from '../../../scripts/collect-subagent-evidence.js';

describe('getCollectTimeoutMs', () => {
  it('defaults to 120000ms (matches the existing per-sub-agent ceiling elsewhere)', () => {
    expect(getCollectTimeoutMs({})).toBe(120_000);
  });

  it('honors a valid SUBAGENT_COLLECT_TIMEOUT_MS override', () => {
    expect(getCollectTimeoutMs({ SUBAGENT_COLLECT_TIMEOUT_MS: '5000' })).toBe(5000);
  });

  it('falls back to the default on a non-numeric override', () => {
    expect(getCollectTimeoutMs({ SUBAGENT_COLLECT_TIMEOUT_MS: 'not-a-number' })).toBe(120_000);
  });

  it('falls back to the default on a zero or negative override (never disables the ceiling)', () => {
    expect(getCollectTimeoutMs({ SUBAGENT_COLLECT_TIMEOUT_MS: '0' })).toBe(120_000);
    expect(getCollectTimeoutMs({ SUBAGENT_COLLECT_TIMEOUT_MS: '-5' })).toBe(120_000);
  });
});

describe('withTimeout', () => {
  it('resolves with the underlying value when it settles before the deadline', async () => {
    await expect(withTimeout(Promise.resolve('done'), 1000, 'fast-op')).resolves.toBe('done');
  });

  it('rejects with the underlying error when it rejects before the deadline', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000, 'failing-op')).rejects.toThrow('boom');
  });

  it('rejects with a named TIMEOUT error when the promise never settles — this is the fix: the caller now fails loud instead of hanging forever', async () => {
    const neverResolves = new Promise(() => {});
    await expect(withTimeout(neverResolves, 20, 'hung-op')).rejects.toThrow(/TIMEOUT: hung-op did not complete within 20ms/);
  });

  it('clears its timer on the resolve path (no dangling handle keeping the process alive)', async () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(global, 'clearTimeout');
    await withTimeout(Promise.resolve('ok'), 1000, 'op');
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
    vi.useRealTimers();
  });
});

describe('parseCollectArgs (pre-existing — regression guard for the malformed QF repro)', () => {
  it('throws a usage error when --phase is missing, exactly as the QF steps_to_reproduce invocation does', () => {
    expect(() => parseCollectArgs(['--sd', 'SD-LEO-FIX-QUIET-HOURS-GATE-001'])).toThrow(/Usage: npm run subagents:collect/);
  });

  it('accepts a valid handoff type + sd', () => {
    expect(parseCollectArgs(['--sd', 'SD-X-001', '--phase', 'LEAD-FINAL-APPROVAL'])).toEqual({
      sd: 'SD-X-001',
      phase: 'LEAD_FINAL',
      handoffType: 'LEAD-FINAL-APPROVAL',
    });
  });
});
