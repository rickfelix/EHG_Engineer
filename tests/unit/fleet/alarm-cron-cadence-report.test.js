// SD-LEO-INFRA-LOOP-LIVENESS-DISCRIMINATOR-001 FR-6 — delivered-cadence read for the FR-5
// host-local alarm crons. Reuses scripts/periodic-liveness-watcher.mjs's own evaluateRow rather
// than a second bespoke classifier.

import { describe, it, expect } from 'vitest';
import { buildCadenceReport, REPORTED_PROCESS_KEYS } from '../../../scripts/alarm-cron-cadence-report.mjs';

const NOW = Date.parse('2026-09-06T12:00:00Z');
const minutesAgo = (m) => new Date(NOW - m * 60 * 1000).toISOString();

function row(over = {}) {
  return {
    process_key: 'host_cron:fleet-down-alert',
    display_name: 'x',
    process_type: 'standalone_cron',
    expected_interval_seconds: 900,
    grace_multiplier: 3,
    liveness_source: 'self_stamped',
    liveness_source_ref: {},
    currently_expected_active: true,
    last_fired_at: null,
    ...over,
  };
}

describe('REPORTED_PROCESS_KEYS', () => {
  it('covers exactly the two FR-6 host-cron rows (periodic-liveness-watcher self-tracks separately)', () => {
    expect(REPORTED_PROCESS_KEYS).toEqual(['host_cron:fleet-down-alert', 'host_cron:fleet-worker-pulse']);
  });
});

describe('buildCadenceReport', () => {
  it('OK: a recently-fired row within its interval*grace window', async () => {
    const rows = [row({ process_key: 'host_cron:fleet-down-alert', last_fired_at: minutesAgo(5) })];
    const results = await buildCadenceReport(rows, { now: NOW });
    const r = results.find((x) => x.process_key === 'host_cron:fleet-down-alert');
    expect(r.state).toBe('OK');
  });

  it('OVERDUE: a row whose last_fired_at is older than interval*grace', async () => {
    const rows = [row({ process_key: 'host_cron:fleet-down-alert', last_fired_at: minutesAgo(999), expected_interval_seconds: 900, grace_multiplier: 3 })];
    const results = await buildCadenceReport(rows, { now: NOW });
    const r = results.find((x) => x.process_key === 'host_cron:fleet-down-alert');
    expect(r.state).toBe('OVERDUE');
  });

  it('UNVERIFIED, never a bare 0/blank: a registered row that has never fired', async () => {
    const rows = [row({ process_key: 'host_cron:fleet-down-alert', last_fired_at: null })];
    const results = await buildCadenceReport(rows, { now: NOW });
    const r = results.find((x) => x.process_key === 'host_cron:fleet-down-alert');
    expect(r.state).toBe('UNVERIFIED');
    expect(r.state).not.toBe(0);
  });

  it('UNVERIFIED, never a bare 0/blank: a process_key with NO row at all in the registry', async () => {
    const results = await buildCadenceReport([], { now: NOW });
    expect(results).toHaveLength(REPORTED_PROCESS_KEYS.length);
    for (const r of results) {
      expect(r.state).toBe('UNVERIFIED');
      expect(r.reason).toBe('not_registered_in_periodic_process_registry');
    }
  });

  it('always reports exactly REPORTED_PROCESS_KEYS.length results, regardless of which rows are present', async () => {
    const rows = [row({ process_key: 'host_cron:fleet-down-alert', last_fired_at: minutesAgo(5) })];
    const results = await buildCadenceReport(rows, { now: NOW });
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.process_key).sort()).toEqual([...REPORTED_PROCESS_KEYS].sort());
  });
});
