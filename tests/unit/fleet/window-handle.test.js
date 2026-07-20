/**
 * SD-LEO-INFRA-FLEET-SPAWN-CONTROL-001 FR-1/FR-3, TR-5 (SECURITY: numeric-PID-only interpolation).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  assertValidPid,
  buildHandleCaptureCommand,
  parseHandleOutput,
  captureWindowHandle,
  buildFocusCommand,
  focusWindow,
} from '../../../lib/fleet/window-handle.js';

describe('assertValidPid (TR-5 SECURITY guardrail)', () => {
  it('accepts a positive integer', () => {
    expect(assertValidPid(1234)).toBe(1234);
    expect(assertValidPid('5678')).toBe(5678);
  });

  it('rejects non-numeric, negative, zero, and NaN values', () => {
    expect(() => assertValidPid('123; shutdown /s')).toThrow(/not a valid PID/);
    expect(() => assertValidPid(-1)).toThrow(/not a valid PID/);
    expect(() => assertValidPid(0)).toThrow(/not a valid PID/);
    expect(() => assertValidPid('abc')).toThrow(/not a valid PID/);
    expect(() => assertValidPid(null)).toThrow(/not a valid PID/);
  });
});

describe('buildHandleCaptureCommand', () => {
  it('interpolates ONLY the coerced numeric PID into the command string', () => {
    const cmd = buildHandleCaptureCommand('4242');
    expect(cmd.program).toBe('powershell');
    expect(cmd.args.join(' ')).toContain('Get-Process -Id 4242');
    expect(cmd.args.join(' ')).not.toContain(';');
  });

  it('throws before building any command for an invalid PID', () => {
    expect(() => buildHandleCaptureCommand('4242; malicious')).toThrow(/not a valid PID/);
  });
});

describe('parseHandleOutput', () => {
  it('parses a non-zero handle', () => {
    expect(parseHandleOutput('  131074\n')).toBe(131074);
  });

  it('returns null for zero (window not yet created)', () => {
    expect(parseHandleOutput('0')).toBeNull();
  });

  it('returns null for empty/garbage output', () => {
    expect(parseHandleOutput('')).toBeNull();
    expect(parseHandleOutput('garbage')).toBeNull();
  });
});

describe('captureWindowHandle (bounded retry)', () => {
  it('returns the handle on the first successful attempt', async () => {
    const execFn = vi.fn().mockResolvedValue({ stdout: '131074' });
    const result = await captureWindowHandle(4242, { execFn, sleepFn: vi.fn() });
    expect(result).toEqual({ handle: 131074, handleCaptureFailed: false, attempts: 1 });
    expect(execFn).toHaveBeenCalledTimes(1);
  });

  it('retries while the window has not been created yet, then succeeds', async () => {
    const execFn = vi.fn()
      .mockResolvedValueOnce({ stdout: '0' })
      .mockResolvedValueOnce({ stdout: '0' })
      .mockResolvedValueOnce({ stdout: '99887766' });
    const sleepFn = vi.fn().mockResolvedValue();
    const result = await captureWindowHandle(4242, { execFn, sleepFn, maxAttempts: 5, delayMs: 10 });
    expect(result).toEqual({ handle: 99887766, handleCaptureFailed: false, attempts: 3 });
    expect(sleepFn).toHaveBeenCalledTimes(2);
  });

  it('marks handleCaptureFailed=true after exhausting maxAttempts (never silently null)', async () => {
    const execFn = vi.fn().mockResolvedValue({ stdout: '0' });
    const result = await captureWindowHandle(4242, { execFn, sleepFn: vi.fn(), maxAttempts: 3, delayMs: 1 });
    expect(result).toEqual({ handle: null, handleCaptureFailed: true, attempts: 3 });
    expect(execFn).toHaveBeenCalledTimes(3);
  });
});

describe('buildFocusCommand', () => {
  it('interpolates a coerced numeric handle', () => {
    const cmd = buildFocusCommand(131074);
    expect(cmd.args.join(' ')).toContain('[IntPtr]131074');
  });

  it('throws for an invalid handle', () => {
    expect(() => buildFocusCommand(0)).toThrow(/invalid handle/);
    expect(() => buildFocusCommand(null)).toThrow(/invalid handle/);
  });
});

describe('focusWindow', () => {
  it('returns true on success', async () => {
    const execFn = vi.fn().mockResolvedValue({ stdout: '' });
    expect(await focusWindow(131074, { execFn })).toBe(true);
  });

  it('returns false (never throws) for a stale/invalid handle', async () => {
    const execFn = vi.fn().mockRejectedValue(new Error('window closed'));
    expect(await focusWindow(131074, { execFn })).toBe(false);
    expect(await focusWindow(0, {})).toBe(false);
  });
});
