/**
 * SD-REFILL-00FHK2ED — eva:health repoint to eva_scheduler_heartbeat.
 * Unit-tests the pure scheduler-row -> worker-shape mapper (no DB).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { mapSchedulerHeartbeat } = require('../../scripts/eva-health-check.cjs');

describe('mapSchedulerHeartbeat (SD-REFILL-00FHK2ED)', () => {
  it('maps the scheduler-instance shape into the worker shape the report expects', () => {
    const r = {
      instance_id: 'sched-1', status: 'running', last_poll_at: '2026-06-21T22:00:00Z',
      circuit_breaker_state: 'CLOSED', poll_count: 120, dispatch_count: 40, error_count: 2,
      metadata: { foo: 'bar' },
    };
    const w = mapSchedulerHeartbeat(r);
    expect(w.worker_id).toBe('sched-1');           // instance_id -> name source
    expect(w.status).toBe('running');
    expect(w.last_heartbeat).toBe('2026-06-21T22:00:00Z'); // last_poll_at
    expect(w.metadata.circuitBroken).toBe(false);  // CLOSED
    expect(w.metadata.totalRuns).toBe(120);        // poll_count
    expect(w.metadata.totalErrors).toBe(2);        // error_count
    expect(w.metadata.consecutiveFailures).toBe(2);
    expect(w.metadata.foo).toBe('bar');            // existing metadata preserved
  });

  it('OPEN circuit breaker -> circuitBroken true', () => {
    expect(mapSchedulerHeartbeat({ circuit_breaker_state: 'OPEN' }).metadata.circuitBroken).toBe(true);
    expect(mapSchedulerHeartbeat({ circuit_breaker_state: 'open' }).metadata.circuitBroken).toBe(true);
    expect(mapSchedulerHeartbeat({ circuit_breaker_state: 'HALF_OPEN' }).metadata.circuitBroken).toBe(false);
  });

  it('is total on missing/odd input (counters default to 0)', () => {
    const w = mapSchedulerHeartbeat({});
    expect(w.metadata.totalRuns).toBe(0);
    expect(w.metadata.totalErrors).toBe(0);
    expect(w.metadata.circuitBroken).toBe(false);
    expect(() => mapSchedulerHeartbeat(null)).not.toThrow();
    expect(mapSchedulerHeartbeat(null).metadata.totalRuns).toBe(0);
    // non-object metadata is ignored, not spread
    expect(mapSchedulerHeartbeat({ metadata: 'x' }).metadata.totalErrors).toBe(0);
  });
});
