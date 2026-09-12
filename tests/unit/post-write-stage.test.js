// QF-20260912-697: post-write hang class (QF-20260529-852, QF-20260523-820 third occurrence).
import { describe, it, expect, vi } from 'vitest';
import { runPostWriteStage, POST_WRITE_STAGE_TIMEOUT_EXIT_CODE } from '../../lib/completion/post-write-stage.js';

describe('runPostWriteStage', () => {
  it('prints a start marker before running and a done marker after, on success', async () => {
    const log = vi.fn();
    const result = await runPostWriteStage('fixtureStage', async () => 'ok', { log });
    expect(result).toEqual({ ok: true, timedOut: false, result: 'ok', durationMs: expect.any(Number) });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('POST-WRITE STAGE: fixtureStage (started'));
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/POST-WRITE STAGE: fixtureStage done \d+ms$/));
  });

  it('(d) injects a never-resolving stage: prints the TIMED OUT marker, names the stage, and reports timedOut -- never hangs past timeoutMs', async () => {
    const log = vi.fn();
    const neverResolves = () => new Promise(() => {}); // the exact shape QF-20260912-697 measured
    const start = Date.now();
    const result = await runPostWriteStage('hungStage', neverResolves, { timeoutMs: 50, log });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000); // bounded -- this is the whole point of the fix
    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('POST-WRITE STAGE hungStage TIMED OUT after'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('core write already persisted'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('do NOT re-run completion'));
  });

  it('a rejected stage reports ok:false, timedOut:false, and carries the error -- distinct from a timeout', async () => {
    const log = vi.fn();
    const result = await runPostWriteStage('failingStage', async () => { throw new Error('boom'); }, { log });
    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.error.message).toBe('boom');
  });

  it('a late rejection AFTER the timeout wins the race never becomes an unhandled rejection', async () => {
    const log = vi.fn();
    let rejectLate;
    const lateRejector = () => new Promise((_, reject) => { rejectLate = reject; });
    const result = await runPostWriteStage('lateRejectStage', lateRejector, { timeoutMs: 20, log });
    expect(result.timedOut).toBe(true);
    // Reject well after the race already resolved -- if this module didn't attach its own
    // .catch(), this line would surface as an unhandledRejection in the test process.
    rejectLate(new Error('too late'));
    await new Promise((r) => setTimeout(r, 20));
  });

  it('exports the distinct exit code the CLI entrypoint checks for (75)', () => {
    expect(POST_WRITE_STAGE_TIMEOUT_EXIT_CODE).toBe(75);
  });

  it('respects an explicit timeoutMs over the env default', async () => {
    const log = vi.fn();
    const start = Date.now();
    await runPostWriteStage('quickTimeout', () => new Promise(() => {}), { timeoutMs: 10, log });
    expect(Date.now() - start).toBeLessThan(500);
  });
});
