/**
 * Vitest spec for the LLM stream-progress watchdog.
 *
 * SD-LEO-INFRA-STAGE-ARCHETYPE-GENERATION-001 ARM A — success_criteria #1
 * (stalled stream produces LLMStreamStalled within 90–105s).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  withStreamWatchdog,
  getDefaultStallTimeout,
  DEFAULT_STALL_TIMEOUT_MS,
} from './stream-watchdog.js';
import { LLMStreamStalled } from './llm-stream-stalled.js';

/**
 * Build an Anthropic-shaped stream double:
 *   - on/off via EventEmitter
 *   - finalMessage() resolves/rejects on demand via emit-time control
 *   - abort() rejects finalMessage() and flips a flag so tests can assert it
 */
function makeMockStream() {
  const ee = new EventEmitter();
  let resolveFinal;
  let rejectFinal;
  const finalPromise = new Promise((res, rej) => {
    resolveFinal = res;
    rejectFinal = rej;
  });
  const stream = {
    on: ee.on.bind(ee),
    off: ee.off.bind(ee),
    emit: ee.emit.bind(ee),
    finalMessage: () => finalPromise,
    aborted: false,
    abort() {
      this.aborted = true;
      rejectFinal(new Error('aborted'));
    },
    _resolveFinal: (v) => resolveFinal(v),
    _rejectFinal: (e) => rejectFinal(e),
  };
  return stream;
}

describe('withStreamWatchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete process.env.LLM_STREAM_STALL_TIMEOUT_MS;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects with LLMStreamStalled when no tokens arrive within threshold', async () => {
    const stream = makeMockStream();
    const promise = withStreamWatchdog(stream, {
      threshold: 90000,
      callerLabel: 'unit-test',
    });

    promise.catch(() => { /* swallow for assertion below */ });
    await vi.advanceTimersByTimeAsync(95000);

    await expect(promise).rejects.toBeInstanceOf(LLMStreamStalled);
    expect(stream.aborted).toBe(true);
  });

  it('uses err.name for cross-bundle robustness', async () => {
    const stream = makeMockStream();
    const promise = withStreamWatchdog(stream, {
      threshold: 90000,
      callerLabel: 'cross-bundle',
    });

    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(95000);

    let caught;
    try { await promise; } catch (e) { caught = e; }
    expect(caught.name).toBe('LLMStreamStalled');
    expect(caught.callerLabel).toBe('cross-bundle');
    expect(caught.threshold).toBe(90000);
    expect(caught.msSinceLastToken).toBeGreaterThanOrEqual(90000);
  });

  it('honors LLM_STREAM_STALL_TIMEOUT_MS env override', async () => {
    process.env.LLM_STREAM_STALL_TIMEOUT_MS = '30000';
    const stream = makeMockStream();
    const promise = withStreamWatchdog(stream, { callerLabel: 'env-override' });
    promise.catch(() => { /* silence unhandled-rejection; assertion below */ });

    await vi.advanceTimersByTimeAsync(35000);
    let caught;
    try { await promise; } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(LLMStreamStalled);
    expect(caught.threshold).toBe(30000);
    expect(caught.callerLabel).toBe('env-override');
  });

  it('does not throw when stream completes cleanly', async () => {
    const stream = makeMockStream();
    const promise = withStreamWatchdog(stream, { threshold: 90000 });

    stream.emit('text', 'hello');
    await vi.advanceTimersByTimeAsync(50000);
    stream._resolveFinal({ content: [{ type: 'text', text: 'hello' }] });

    await expect(promise).resolves.toEqual({ content: [{ type: 'text', text: 'hello' }] });
    expect(stream.aborted).toBe(false);
  });

  it('tokens reset the inactivity clock', async () => {
    const stream = makeMockStream();
    const promise = withStreamWatchdog(stream, { threshold: 90000 });

    // Emit 4 tokens at 60s intervals — total elapsed 240s, but never
    // 90s of silence, so the watchdog must not fire.
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(60000);
      stream.emit('text', `chunk-${i}`);
    }
    stream._resolveFinal({ ok: true });

    await expect(promise).resolves.toEqual({ ok: true });
    expect(stream.aborted).toBe(false);
  });

  it('propagates non-stall stream errors unchanged', async () => {
    const stream = makeMockStream();
    const promise = withStreamWatchdog(stream, { threshold: 90000 });

    promise.catch(() => {});
    const sdkErr = new Error('Anthropic 429: rate limited');
    stream._rejectFinal(sdkErr);

    let caught;
    try { await promise; } catch (e) { caught = e; }
    expect(caught).toBe(sdkErr);
    expect(caught.name).not.toBe('LLMStreamStalled');
  });
});

describe('getDefaultStallTimeout', () => {
  beforeEach(() => {
    delete process.env.LLM_STREAM_STALL_TIMEOUT_MS;
  });

  it('defaults to 90000ms when env unset', () => {
    expect(getDefaultStallTimeout()).toBe(DEFAULT_STALL_TIMEOUT_MS);
    expect(DEFAULT_STALL_TIMEOUT_MS).toBe(90000);
  });

  it('parses env override as integer', () => {
    process.env.LLM_STREAM_STALL_TIMEOUT_MS = '15000';
    expect(getDefaultStallTimeout()).toBe(15000);
  });

  it('falls back to default for invalid env values', () => {
    process.env.LLM_STREAM_STALL_TIMEOUT_MS = 'not-a-number';
    expect(getDefaultStallTimeout()).toBe(DEFAULT_STALL_TIMEOUT_MS);
    process.env.LLM_STREAM_STALL_TIMEOUT_MS = '0';
    expect(getDefaultStallTimeout()).toBe(DEFAULT_STALL_TIMEOUT_MS);
    process.env.LLM_STREAM_STALL_TIMEOUT_MS = '-100';
    expect(getDefaultStallTimeout()).toBe(DEFAULT_STALL_TIMEOUT_MS);
  });
});
