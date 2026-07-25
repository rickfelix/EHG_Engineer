/**
 * QF-20260725-697 — closure probe for the venture production line.
 *
 * The lead cases are the LIVE 2026-07-25 incident: pidfile PID 40684 not running, last
 * stage_executions row 2026-07-13T21:18Z, eleven days silent behind green liveness probes.
 */
import { describe, it, expect } from 'vitest';
import {
  isWorkerAbsent,
  isLineSilent,
  classifyStageLine,
  DEFAULT_SILENT_HOURS,
} from '../../../lib/eva/stage-line-closure.js';

const INCIDENT_LAST_EXEC = '2026-07-13T21:18:21.426Z';
const INCIDENT_NOW = new Date('2026-07-25T09:14:00.000Z');

describe('isWorkerAbsent', () => {
  it('THE INCIDENT: pidfile names PID 40684 and it is not running -> absent', () => {
    expect(isWorkerAbsent({ pid: 40684, pidAlive: false })).toBe(true);
  });

  it('accepts the raw pidfile string (contents are read as text, not a number)', () => {
    expect(isWorkerAbsent({ pid: '40684\n', pidAlive: false })).toBe(true);
  });

  it('a running worker is not absent', () => {
    expect(isWorkerAbsent({ pid: 40684, pidAlive: true })).toBe(false);
  });

  it('no pidfile is NOT absent — a host that never ran the worker must not alarm', () => {
    expect(isWorkerAbsent({ pid: null, pidAlive: null })).toBe(false);
    expect(isWorkerAbsent({})).toBe(false);
  });

  it('UNKNOWN liveness is not absence — fail-quiet, never cry wolf on "cannot tell"', () => {
    expect(isWorkerAbsent({ pid: 40684, pidAlive: null })).toBe(false);
  });

  it('a malformed pidfile is not absence', () => {
    expect(isWorkerAbsent({ pid: 'garbage', pidAlive: false })).toBe(false);
    expect(isWorkerAbsent({ pid: 0, pidAlive: false })).toBe(false);
  });
});

describe('isLineSilent', () => {
  it('THE INCIDENT: eleven days since the last execution -> silent', () => {
    expect(isLineSilent({ lastExecutionAt: INCIDENT_LAST_EXEC, now: INCIDENT_NOW })).toBe(true);
  });

  it('a recent execution is not silence', () => {
    const now = new Date('2026-07-25T09:14:00.000Z');
    expect(isLineSilent({ lastExecutionAt: '2026-07-25T08:00:00.000Z', now })).toBe(false);
  });

  it('honours a custom window on both sides of the boundary', () => {
    const now = new Date('2026-07-25T09:00:00.000Z');
    const twoHoursAgo = '2026-07-25T07:00:00.000Z';
    expect(isLineSilent({ lastExecutionAt: twoHoursAgo, now, silentHours: 1 })).toBe(true);
    expect(isLineSilent({ lastExecutionAt: twoHoursAgo, now, silentHours: 6 })).toBe(false);
  });

  it('a NEVER-executed line is not silent — an empty table is a fresh deploy, not a stall', () => {
    expect(isLineSilent({ lastExecutionAt: null, now: INCIDENT_NOW })).toBe(false);
  });

  it('an unparseable timestamp does not alarm', () => {
    expect(isLineSilent({ lastExecutionAt: 'not-a-date', now: INCIDENT_NOW })).toBe(false);
  });

  it('defaults to the documented 6h budget', () => {
    expect(DEFAULT_SILENT_HOURS).toBe(6);
  });
});

describe('classifyStageLine', () => {
  it('THE INCIDENT: both legs fire and the verdict is unhealthy with both reasons', () => {
    const v = classifyStageLine({
      pid: 40684,
      pidAlive: false,
      lastExecutionAt: INCIDENT_LAST_EXEC,
      now: INCIDENT_NOW,
    });
    expect(v.healthy).toBe(false);
    expect(v.workerAbsent).toBe(true);
    expect(v.lineSilent).toBe(true);
    expect(v.reasons).toHaveLength(2);
    expect(v.reasons.join(' ')).toContain('40684');
  });

  it('LINE SILENT ALONE is unhealthy — the worker-alive-but-producing-nothing case a PID check cannot see', () => {
    const v = classifyStageLine({
      pid: 40684,
      pidAlive: true,
      lastExecutionAt: INCIDENT_LAST_EXEC,
      now: INCIDENT_NOW,
    });
    expect(v.healthy).toBe(false);
    expect(v.workerAbsent).toBe(false);
    expect(v.lineSilent).toBe(true);
  });

  it('WORKER ABSENT ALONE is unhealthy even inside the silence budget', () => {
    const now = new Date('2026-07-25T09:00:00.000Z');
    const v = classifyStageLine({
      pid: 40684,
      pidAlive: false,
      lastExecutionAt: '2026-07-25T08:30:00.000Z',
      now,
    });
    expect(v.healthy).toBe(false);
    expect(v.workerAbsent).toBe(true);
    expect(v.lineSilent).toBe(false);
  });

  it('a live worker with recent executions is healthy and gives no reasons', () => {
    const now = new Date('2026-07-25T09:00:00.000Z');
    const v = classifyStageLine({
      pid: 40684,
      pidAlive: true,
      lastExecutionAt: '2026-07-25T08:30:00.000Z',
      now,
    });
    expect(v).toEqual({ healthy: true, workerAbsent: false, lineSilent: false, reasons: [] });
  });

  it('a host with no pidfile and no executions is healthy — nothing to report, no false alarm', () => {
    expect(classifyStageLine({}).healthy).toBe(true);
  });
});
