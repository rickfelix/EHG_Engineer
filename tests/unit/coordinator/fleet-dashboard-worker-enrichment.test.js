/**
 * QF-20260704-737 — WORKERS section Progress/Phase/Fails/WIP rendered '?'/'-'/0% for every
 * worker despite the enriched-heartbeat pipeline (current_phase, handoff_fail_count,
 * has_uncommitted_changes) existing on claude_sessions. Root cause: (1) the source-side
 * telemetry merge (SD-LEO-INFRA-WORKER-SOURCE-SIDE-001) queried claude_sessions but omitted
 * these three columns from its select + Object.assign, and (2) the Progress lookup used
 * d.children (scoped to ONE orchestrator's children) instead of the already-comprehensive
 * d.sdStatusMap. These tests exercise printWorkers directly with a mock `d` to prove both are
 * now surfaced instead of falling back to the placeholder values.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { printWorkers } = require('../../../scripts/fleet-dashboard.cjs');

let logSpy;
beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { logSpy.mockRestore(); });
const output = () => logSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');

function baseSession(overrides = {}) {
  return {
    session_id: 's1', sd_key: 'SD-FOO-001', tty: 'tty1',
    heartbeat_age_seconds: 5, heartbeat_age_human: '5s',
    ...overrides,
  };
}

// Fields printWorkers reads unconditionally beyond activeSessions (unrelated to this fix).
const EMPTY_D_EXTRAS = { staleSessions: [], idleSessions: [], drainAgents: [] };

describe('printWorkers — enrichment fields (QF-20260704-737)', () => {
  it('renders real Phase/Fails/WIP from session-level enrichment instead of ?/-/-', () => {
    const s = baseSession({ current_phase: 'EXEC', handoff_fail_count: 2, has_uncommitted_changes: true });
    printWorkers({ activeSessions: [s], children: [], sdStatusMap: {}, mc: null, mcByWorker: {}, ...EMPTY_D_EXTRAS });
    const out = output();
    expect(out).toContain('EXEC');
    expect(out).toMatch(/\b2\b/);
    expect(out).toContain('Y');
  });

  it('falls back to ?/-/- when a session genuinely has no enrichment data', () => {
    const s = baseSession({ current_phase: undefined, handoff_fail_count: null, has_uncommitted_changes: null });
    printWorkers({ activeSessions: [s], children: [], sdStatusMap: {}, mc: null, mcByWorker: {}, ...EMPTY_D_EXTRAS });
    expect(output()).toContain('?');
  });

  it('resolves Progress from d.sdStatusMap (any sd_key), not just d.children (one orchestrator)', () => {
    const s = baseSession({ sd_key: 'SD-STANDALONE-042' });
    printWorkers({
      activeSessions: [s],
      children: [], // the orchestrator-scoped list — deliberately empty
      sdStatusMap: { 'SD-STANDALONE-042': { sd_key: 'SD-STANDALONE-042', progress_percentage: 63 } },
      mc: null, mcByWorker: {},
      ...EMPTY_D_EXTRAS,
    });
    expect(output()).toContain('63');
  });
});
