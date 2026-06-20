import { describe, it, expect, vi } from 'vitest';
import { resolveExitCode, flushAndExit } from '../../scripts/add-prd-to-database.js';

describe('resolveExitCode (SD-LEO-INFRA-ADD-PRD-EXIT-CODE-SUCCESS-001)', () => {
  it('maps a successful write to exit code 0', () => {
    expect(resolveExitCode('success')).toBe(0);
  });

  it('maps a failed write to exit code 1', () => {
    expect(resolveExitCode('failure')).toBe(1);
  });

  it('treats any non-success outcome as failure (1)', () => {
    expect(resolveExitCode(undefined)).toBe(1);
    expect(resolveExitCode(null)).toBe(1);
    expect(resolveExitCode('error')).toBe(1);
  });
});

describe('flushAndExit', () => {
  it('invokes the injected exit fn with the success code when no output is buffered', () => {
    const exitFn = vi.fn();
    flushAndExit(0, exitFn);
    expect(exitFn).toHaveBeenCalledTimes(1);
    expect(exitFn).toHaveBeenCalledWith(0);
  });

  it('invokes the injected exit fn with the failure code', () => {
    const exitFn = vi.fn();
    flushAndExit(1, exitFn);
    expect(exitFn).toHaveBeenCalledTimes(1);
    expect(exitFn).toHaveBeenCalledWith(1);
  });

  it('exits exactly once (no double-exit)', () => {
    const exitFn = vi.fn();
    flushAndExit(0, exitFn);
    // The synchronous no-buffer path must not schedule a second exit.
    expect(exitFn).toHaveBeenCalledTimes(1);
  });

  it('passing resolveExitCode through flushAndExit yields the mapped code', () => {
    const exitFn = vi.fn();
    flushAndExit(resolveExitCode('success'), exitFn);
    expect(exitFn).toHaveBeenCalledWith(0);
  });
});
