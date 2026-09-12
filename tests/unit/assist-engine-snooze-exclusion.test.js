/**
 * SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C FR-2: lib/quality/snooze-manager.js's /inbox snooze never
 * touches status (only snoozed_until + metadata.snooze) — so loadInboxItems()'s status-based
 * exclude list alone cannot see an actively-snoozed item. This tests the added snoozed_until
 * filter directly against a live-shaped query builder (a fake that actually evaluates .or(),
 * unlike sibling filter tests' pass-through fakes, since the behavior under test IS the filter).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const FEEDBACK_TABLE = 'v_feedback_with_sensemaking';
let currentFixture = [];

function makeQueryBuilder(rows) {
  const state = { notFilters: [], orClause: null };
  const builder = {
    select: () => builder,
    not: (col, op, val) => { state.notFilters.push({ col, op, val }); return builder; },
    or: (clause) => { state.orClause = clause; return builder; },
    order: () => builder,
    range: () => {
      const now = Date.now();
      const filtered = rows.filter((r) => {
        for (const f of state.notFilters) {
          if (f.op === 'in') {
            const excluded = f.val.replace(/[()]/g, '').split(',');
            if (excluded.includes(r.status)) return false;
          }
        }
        if (state.orClause) {
          // Mirrors: snoozed_until.is.null,snoozed_until.lte.<now>
          const isNull = r.snoozed_until == null;
          const lte = r.snoozed_until != null && new Date(r.snoozed_until).getTime() <= now;
          if (!isNull && !lte) return false;
        }
        return true;
      });
      return Promise.resolve({ data: filtered, error: null });
    },
  };
  return builder;
}

vi.mock('../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({
    from: (table) => (table === FEEDBACK_TABLE ? makeQueryBuilder(currentFixture) : makeQueryBuilder([])),
  }),
}));

const { AssistEngine } = await import('../../lib/quality/assist-engine.js');

function row({ id, type = 'issue', status = 'new', snoozedUntil = null }) {
  return {
    id, type, status, category: null,
    strategic_directive_id: null, resolution_sd_id: null,
    ai_triage_classification: 'triaged',
    created_at: '2020-01-01T00:00:00.000Z',
    snoozed_until: snoozedUntil,
    metadata: {},
  };
}

describe('FR-2: loadInboxItems excludes actively-snoozed rows', () => {
  afterEach(() => vi.restoreAllMocks());

  it('excludes a row whose snoozed_until is in the future', async () => {
    currentFixture = [
      row({ id: 'snoozed1', snoozedUntil: new Date(Date.now() + 3_600_000).toISOString() }),
      row({ id: 'plain1' }),
    ];
    const engine = new AssistEngine({ dryRun: true });
    const { issues } = await engine.loadInboxItems();
    expect(issues.map((i) => i.id)).toEqual(['plain1']);
  });

  it('does NOT exclude a row whose snoozed_until is in the past (expired, not yet woken)', async () => {
    currentFixture = [
      row({ id: 'expired1', snoozedUntil: new Date(Date.now() - 3_600_000).toISOString() }),
    ];
    const engine = new AssistEngine({ dryRun: true });
    const { issues } = await engine.loadInboxItems();
    expect(issues.map((i) => i.id)).toEqual(['expired1']);
  });

  it('does not exclude a row with snoozed_until=null', async () => {
    currentFixture = [row({ id: 'never-snoozed', snoozedUntil: null })];
    const engine = new AssistEngine({ dryRun: true });
    const { issues } = await engine.loadInboxItems();
    expect(issues.map((i) => i.id)).toEqual(['never-snoozed']);
  });
});
