/**
 * Unit smoke tests for printFeedback — the feedback work-store section of the fleet
 * coordinator dashboard (scripts/fleet-dashboard.cjs).
 * SD: SD-LEO-INFRA-COORDINATOR-DASHBOARD-SURFACES-001
 *
 * printFeedback is READ-ONLY / additive: it surfaces untriaged feedback + harness
 * backlog on the /coordinator all single-pane view. These tests inject a mock supabase
 * client and capture console output to prove:
 *   - both subsections render with counts when rows are present,
 *   - an explicit empty-state line is printed when both queries return zero rows,
 *   - every feedback query applies a status filter AND a row limit (anti-flood guard),
 *   - a query error degrades gracefully (notice, no throw) — FR-4.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { printFeedback } = require('../../../scripts/fleet-dashboard.cjs');

// Chainable mock of the supabase query builder for the `feedback` table. Records each
// query's method chain so tests can assert a status filter + limit were applied, and
// distinguishes the two queries: the harness-backlog query calls .eq('category',
// 'harness_backlog'); the untriaged query calls .neq('category','harness_backlog').
function mockSupabase({ untriaged = [], backlog = [], failOn = null } = {}) {
  const recorded = [];
  function builder() {
    const state = { category_eq: null, statusFiltered: false, limited: false };
    const chain = {
      select() { return chain; },
      not(col) { if (col === 'status') state.statusFiltered = true; return chain; },
      eq(col, val) { if (col === 'category') state.category_eq = val; return chain; },
      neq(col) { if (col === 'status') state.statusFiltered = true; return chain; },
      order() { return chain; },
      limit() {
        state.limited = true;
        recorded.push(state);
        const isBacklog = state.category_eq === 'harness_backlog';
        if (failOn === 'untriaged' && !isBacklog) return Promise.resolve({ data: null, error: { message: 'simulated untriaged failure' } });
        if (failOn === 'backlog' && isBacklog) return Promise.resolve({ data: null, error: { message: 'simulated backlog failure' } });
        return Promise.resolve({ data: isBacklog ? backlog : untriaged, error: null });
      },
    };
    return chain;
  }
  return { from() { return builder(); }, _recorded: recorded };
}

let logSpy;
beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { logSpy.mockRestore(); });
const output = () => logSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');

const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();

describe('printFeedback — populated', () => {
  test('renders FEEDBACK header and both subsections with counts', async () => {
    const sb = mockSupabase({
      untriaged: [
        { id: '1', priority: 'high', category: 'bug', title: 'Untriaged bug A', status: 'new', created_at: hoursAgo(1) },
        { id: '2', priority: 'low', category: 'enhancement', title: 'Untriaged enh B', status: 'open', created_at: hoursAgo(2) },
      ],
      backlog: [
        { id: '3', title: 'Deferred harness item', status: 'new', created_at: hoursAgo(5) },
      ],
    });
    await printFeedback({}, { supabase: sb });
    const out = output();
    expect(out).toContain('FEEDBACK');
    expect(out).toContain('Untriaged feedback (2)');
    expect(out).toContain('Harness backlog (1)');
    expect(out).toContain('Untriaged bug A');
    expect(out).toContain('Deferred harness item');
  });
});

describe('printFeedback — empty state', () => {
  test('prints explicit no-pending line when both queries return zero rows', async () => {
    const sb = mockSupabase({ untriaged: [], backlog: [] });
    await printFeedback({}, { supabase: sb });
    const out = output();
    expect(out).toContain('FEEDBACK');
    expect(out).toContain('(no pending feedback or harness backlog)');
  });
});

describe('printFeedback — anti-flood guards', () => {
  test('applies a status filter and a row limit to every feedback query', async () => {
    const sb = mockSupabase({
      untriaged: [{ id: '1', priority: 'med', category: 'x', title: 't', status: 'new', created_at: hoursAgo(1) }],
      backlog: [],
    });
    await printFeedback({}, { supabase: sb });
    expect(sb._recorded.length).toBe(2); // untriaged + harness backlog
    for (const q of sb._recorded) {
      expect(q.statusFiltered).toBe(true);
      expect(q.limited).toBe(true);
    }
  });
});

describe('printFeedback — graceful error (FR-4)', () => {
  test('prints a notice and does not throw when a query errors', async () => {
    const sb = mockSupabase({ failOn: 'untriaged' });
    await expect(printFeedback({}, { supabase: sb })).resolves.toBeUndefined();
    expect(output()).toContain('feedback query failed');
  });
});
