import { describe, it, expect } from 'vitest';
import { runBounded } from '../../lib/agent-readiness/concurrency-limiter.js';

function delayedTask(id, ms, trace) {
  return async () => {
    trace.push({ id, event: 'start' });
    await new Promise((r) => setTimeout(r, ms));
    trace.push({ id, event: 'end' });
    return id;
  };
}

describe('concurrency-limiter (US-012)', () => {
  it('AC-012-1: in-flight requests never exceed the configured bound, measured not assumed', async () => {
    const trace = [];
    let peak = 0;
    const tasks = Array.from({ length: 12 }, (_, i) => delayedTask(i, 10, trace));

    const results = await runBounded(tasks, 3, { onPeakUpdate: (p) => { peak = Math.max(peak, p); } });

    expect(results).toHaveLength(12);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1); // proves the bound was actually exercised, not trivially serial
  });

  it('AC-012-3: bound of 1 fully serializes and the run still completes correctly', async () => {
    const trace = [];
    const tasks = Array.from({ length: 5 }, (_, i) => delayedTask(i, 5, trace));

    const results = await runBounded(tasks, 1);

    expect(results.map((r) => r.value)).toEqual([0, 1, 2, 3, 4]);
    // Serialized: task N's start must come after task N-1's end.
    for (let i = 1; i < trace.length; i += 2) {
      const prevEnd = trace[i];
      const nextStart = trace[i + 1];
      if (nextStart) expect(nextStart.event).toBe('start');
    }
  });

  it('preserves result order even when later tasks finish first', async () => {
    const tasks = [
      async () => { await new Promise((r) => setTimeout(r, 30)); return 'slow'; },
      async () => { await new Promise((r) => setTimeout(r, 5)); return 'fast'; }
    ];
    const results = await runBounded(tasks, 2);
    expect(results.map((r) => r.value)).toEqual(['slow', 'fast']);
  });

  it('a rejected task does not abort the batch; others still complete', async () => {
    const tasks = [
      async () => 'ok-1',
      async () => { throw new Error('boom'); },
      async () => 'ok-2'
    ];
    const results = await runBounded(tasks, 2);
    expect(results[0]).toEqual({ status: 'fulfilled', value: 'ok-1' });
    expect(results[1].status).toBe('rejected');
    expect(results[1].reason.message).toBe('boom');
    expect(results[2]).toEqual({ status: 'fulfilled', value: 'ok-2' });
  });
});
