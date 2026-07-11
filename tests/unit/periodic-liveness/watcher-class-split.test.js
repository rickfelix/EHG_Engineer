import { describe, it, expect } from 'vitest';
import { parseLivenessClasses, partitionRowsByClasses } from '../../../lib/periodic-liveness/class-split.mjs';

// SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-A TR-1 pin: the CI venue must NEVER evaluate
// role_session (claude_sessions_heartbeat) rows — hasPidAlive is host-local, so a CI evaluation
// degrades to stale-timestamp reads and false-OVERDUEs live sessions.

const rows = [
  { process_key: 'role_session:adam', liveness_source: 'claude_sessions_heartbeat' },
  { process_key: 'scheduler_round:__poll_loop__', liveness_source: 'eva_scheduler_heartbeat' },
  { process_key: 'gha_cron:backlog-rank-cron.yml', liveness_source: 'self_stamped' },
];

describe('parseLivenessClasses', () => {
  it('unset/empty means no filter (pre-split behavior)', () => {
    expect(parseLivenessClasses(undefined)).toBeNull();
    expect(parseLivenessClasses('')).toBeNull();
    expect(parseLivenessClasses('   ')).toBeNull();
  });

  it('parses the CI and dev-host filter strings', () => {
    expect([...parseLivenessClasses('self_stamped,eva_scheduler_heartbeat')]).toEqual(['self_stamped', 'eva_scheduler_heartbeat']);
    expect([...parseLivenessClasses('claude_sessions_heartbeat')]).toEqual(['claude_sessions_heartbeat']);
  });
});

describe('partitionRowsByClasses', () => {
  it('CI filter excludes every role_session row (the false-OVERDUE guard)', () => {
    const ci = partitionRowsByClasses(rows, parseLivenessClasses('self_stamped,eva_scheduler_heartbeat'));
    expect(ci.evaluate.map((r) => r.process_key)).toEqual(['scheduler_round:__poll_loop__', 'gha_cron:backlog-rank-cron.yml']);
    expect(ci.skipped.map((r) => r.process_key)).toEqual(['role_session:adam']);
    expect(ci.evaluate.some((r) => r.liveness_source === 'claude_sessions_heartbeat')).toBe(false);
  });

  it('dev-host filter is the exact complement — no row double-evaluated across venues', () => {
    const ciClasses = parseLivenessClasses('self_stamped,eva_scheduler_heartbeat');
    const devClasses = parseLivenessClasses('claude_sessions_heartbeat');
    const ci = partitionRowsByClasses(rows, ciClasses);
    const dev = partitionRowsByClasses(rows, devClasses);
    const union = [...ci.evaluate, ...dev.evaluate].map((r) => r.process_key).sort();
    expect(union).toEqual(rows.map((r) => r.process_key).sort()); // full coverage
    const overlap = ci.evaluate.filter((r) => dev.evaluate.includes(r));
    expect(overlap).toEqual([]); // zero double evaluation
  });

  it('no filter evaluates everything (byte-identical pre-split behavior)', () => {
    const all = partitionRowsByClasses(rows, null);
    expect(all.evaluate).toHaveLength(3);
    expect(all.skipped).toHaveLength(0);
  });
});
