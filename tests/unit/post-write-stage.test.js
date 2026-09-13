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

  // QF-20260913-273: fn() used to be called directly (`const fnPromise = fn();`), so a caller
  // passing a thenable with no .catch method (e.g. a raw Supabase PostgrestFilterBuilder --
  // PromiseLike, but not a real Promise) crashed on the very next line's `fnPromise.catch(...)`
  // with 'fnPromise.catch is not a function', escalating a best-effort post-write step into a
  // process-ending TypeError. scripts/modules/learning/sd-creation.js:430 hit this on
  // essentially every /learn auto-approve that created an SD.
  it('(QF-20260913-273) a thenable-without-catch (e.g. a raw Supabase query builder) resolves through the stage instead of throwing', async () => {
    const log = vi.fn();
    // Mimics a PostgrestFilterBuilder: thenable (has .then), but no .catch/.finally.
    const thenableOnly = () => ({
      then(resolve) { resolve({ data: null, error: null }); },
    });
    const result = await runPostWriteStage('thenableStage', thenableOnly, { log });
    expect(result.ok).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.result).toEqual({ data: null, error: null });
  });

  // QF-20260913-273: a SYNCHRONOUS throw inside fn (before any await) used to escape
  // runPostWriteStage entirely -- `const fnPromise = fn();` ran outside the function's own
  // try/catch (which starts on the next-but-one line), so the throw propagated straight out of
  // runPostWriteStage uncaught, defeating the whole "never block/crash the caller" contract.
  it('(QF-20260913-273) a synchronous throw inside fn returns ok:false instead of escaping runPostWriteStage', async () => {
    const log = vi.fn();
    const syncThrower = () => { throw new Error('sync boom'); };
    const result = await runPostWriteStage('syncThrowStage', syncThrower, { log });
    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.error.message).toBe('sync boom');
  });
});
