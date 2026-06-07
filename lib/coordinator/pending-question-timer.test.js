/**
 * Unit tests for the coordinator pending-question timer / default-proceed (FR-004).
 * SD-LEO-INFRA-COORDINATOR-PENDING-QUESTION-001.
 *
 * Network-free: the pure core (decidePendingQuestions) is exercised against injected
 * question rows + an injected clock + classifier. The IO wiring (planAndApply
 * PendingQuestions / applyAutoProceed) is exercised against a fake supabase that
 * records updates — NO real DB, NO cron, NO network.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  decidePendingQuestions,
  isCriticalQuestion,
  recommendedOption,
  CRITICAL_CATEGORIES,
  DEFAULT_TIMEOUT_MS,
  planAndApplyPendingQuestions,
  applyAutoProceed,
} = require('./pending-question-timer.cjs');

const NOW = Date.parse('2026-06-07T12:00:00Z');
const MIN = 60 * 1000;

/**
 * Build an operator_question feedback row. An explicit `metadata` override REPLACES
 * the default metadata wholesale (so "no recommendation" / free-text-category cases
 * are precise), matching how the escalate script writes a single metadata object.
 */
function q(over = {}) {
  return {
    id: over.id ?? 'fb-1',
    title: over.title ?? 'Worker question',
    description: over.description ?? 'Should we use option A or option B?',
    category: 'operator_question',
    status: over.status ?? 'new',
    created_at: over.created_at ?? new Date(NOW - 10 * MIN).toISOString(),
    metadata: 'metadata' in over ? over.metadata : { worker: 'Bravo', recommended_option: 'approach A' },
  };
}

const opts = (over = {}) => Object.assign({ now: NOW, timeoutMs: DEFAULT_TIMEOUT_MS, autoProceedEnabled: true }, over);

describe('decidePendingQuestions — pure core (FR-001/002/003)', () => {
  it('(a) non-critical question aged >= timeout → auto_proceed on the recommended option', () => {
    const [d] = decidePendingQuestions([q({ created_at: new Date(NOW - 12 * MIN).toISOString() })], opts());
    expect(d.action).toBe('auto_proceed');
    expect(d.recommended_option).toBe('approach A');
    expect(d.id).toBe('fb-1');
  });

  it('(b) non-critical question aged < timeout → NO auto_proceed (resurface)', () => {
    const [d] = decidePendingQuestions([q({ created_at: new Date(NOW - 3 * MIN).toISOString() })], opts());
    expect(d.action).toBe('resurface');
  });

  it('(c) every still-open question is re-surfaced each tick (not dropped)', () => {
    const young = q({ id: 'young', created_at: new Date(NOW - 1 * MIN).toISOString() });
    const aged = q({ id: 'aged', created_at: new Date(NOW - 30 * MIN).toISOString() });
    const decisions = decidePendingQuestions([young, aged], opts());
    // Both questions yield a decision (none silently dropped); the young one is surfaced.
    expect(decisions).toHaveLength(2);
    expect(decisions.find((d) => d.id === 'young').action).toBe('resurface');
    expect(decisions.find((d) => d.id === 'aged').action).toBe('auto_proceed');
  });

  it('(d) CRITICAL-category questions → hard_wait, NEVER auto_proceed even when stale', () => {
    const stale = (cat) => q({
      id: cat,
      created_at: new Date(NOW - 60 * MIN).toISOString(), // very stale
      metadata: { question_category: cat, recommended_option: 'do it' },
    });
    for (const cat of ['budget_exceed', 'security_concern', 'venture_kill', 'strategy_change']) {
      const [d] = decidePendingQuestions([stale(cat)], opts());
      expect(d.action, 'category ' + cat + ' must hard_wait').toBe('hard_wait');
    }
  });

  it('(d2) critical classified from free-text category/description (no canonical key)', () => {
    const stale = q({
      id: 'freetext',
      created_at: new Date(NOW - 60 * MIN).toISOString(),
      metadata: { question_category: 'should we kill this venture?', recommended_option: 'kill' },
    });
    const [d] = decidePendingQuestions([stale], opts());
    expect(d.action).toBe('hard_wait');
  });

  it('(e) an already auto_proceeded / resolved question is NOT re-processed (idempotent)', () => {
    const resolved = q({ id: 'res', status: 'resolved', created_at: new Date(NOW - 60 * MIN).toISOString() });
    const marked = q({
      id: 'mark',
      status: 'new', // still 'new' but carries the marker
      created_at: new Date(NOW - 60 * MIN).toISOString(),
      metadata: { recommended_option: 'approach A', auto_proceeded: true, auto_proceeded_at: new Date(NOW - 5 * MIN).toISOString() },
    });
    const decisions = decidePendingQuestions([resolved, marked], opts());
    expect(decisions.every((d) => d.action === 'skip')).toBe(true);
  });

  it('ambiguity fail-safe: aged non-critical with NO recommended option → hard_wait (never auto-act)', () => {
    const noRec = q({ id: 'norec', created_at: new Date(NOW - 30 * MIN).toISOString(), metadata: { worker: 'Bravo' } });
    const [d] = decidePendingQuestions([noRec], opts());
    expect(d.action).toBe('hard_wait');
  });

  it('flag OFF: aged + recommended → resurface (no auto_proceed) — flag gates the WRITE behavior', () => {
    const aged = q({ created_at: new Date(NOW - 30 * MIN).toISOString() });
    const [d] = decidePendingQuestions([aged], opts({ autoProceedEnabled: false }));
    expect(d.action).toBe('resurface');
    expect(d.recommended_option).toBe('approach A');
  });
});

describe('critical-category source is the canonical OATH-3 list', () => {
  it('CRITICAL_CATEGORIES contains the five EVA-Constitution OATH-3 escalation categories', () => {
    for (const c of ['budget_exceed', 'strategy_change', 'external_commitment', 'security_concern', 'conflicting_directive']) {
      expect(CRITICAL_CATEGORIES.has(c)).toBe(true);
    }
  });

  it('isCriticalQuestion + recommendedOption helpers behave', () => {
    expect(isCriticalQuestion(q({ metadata: { question_category: 'security_concern' } }))).toBe(true);
    expect(isCriticalQuestion(q({ metadata: { question_category: 'ui_color_choice' }, description: 'red or blue button?' }))).toBe(false);
    expect(recommendedOption(q())).toBe('approach A');
    expect(recommendedOption(q({ metadata: { worker: 'x' } }))).toBe(null);
  });
});

// ── IO wiring (fake supabase, still network-free) ───────────────────────────

function makeFakeSupabase({ rows = [] } = {}) {
  const updates = [];
  const sb = {
    from(table) {
      if (table !== 'feedback') throw new Error('unexpected table ' + table);
      const builder = {
        _op: null,
        select() { return builder; },
        eq(col, val) { (builder._eq = builder._eq || []).push([col, val]); return builder; },
        order() { return builder; },
        limit() {
          // terminal for the SELECT path
          return Promise.resolve({ data: rows, error: null });
        },
        update(patch) {
          const u = { patch, eq: [] };
          updates.push(u);
          const upd = {
            eq(col, val) { u.eq.push([col, val]); return upd; },
            then(resolve) { return Promise.resolve({ error: null }).then(resolve); },
          };
          return upd;
        },
      };
      return builder;
    },
  };
  return { sb, updates };
}

describe('planAndApplyPendingQuestions — tick wiring (network-free)', () => {
  it('flag ON: aged non-critical question is auto-proceeded and marked resolved', async () => {
    const rows = [q({ id: 'go', created_at: new Date(NOW - 30 * MIN).toISOString() })];
    const { sb, updates } = makeFakeSupabase({ rows });
    const res = await planAndApplyPendingQuestions(sb, { env: { COORD_QUESTION_AUTO_PROCEED_V1: 'true' }, now: NOW });
    expect(res.enabled).toBe(true);
    expect(res.autoProceeded).toBe(1);
    expect(updates).toHaveLength(1);
    expect(updates[0].patch.status).toBe('resolved');
    expect(updates[0].patch.resolution_notes).toContain('AUTO-PROCEEDED');
    expect(updates[0].patch.metadata.auto_proceeded).toBe(true);
    // idempotency guard: update is scoped to the still-open row
    expect(updates[0].eq).toEqual(expect.arrayContaining([['id', 'go'], ['status', 'new']]));
  });

  it('flag OFF: NO writes occur (inert), aged question resurfaces instead', async () => {
    const rows = [q({ id: 'noop', created_at: new Date(NOW - 30 * MIN).toISOString() })];
    const { sb, updates } = makeFakeSupabase({ rows });
    const res = await planAndApplyPendingQuestions(sb, { env: { COORD_QUESTION_AUTO_PROCEED_V1: 'false' }, now: NOW });
    expect(res.enabled).toBe(false);
    expect(res.autoProceeded).toBe(0);
    expect(res.resurfaced).toBe(1);
    expect(updates).toHaveLength(0);
  });

  it('flag ON: a CRITICAL stale question is hard-waited, NOT written', async () => {
    const rows = [q({ id: 'crit', created_at: new Date(NOW - 60 * MIN).toISOString(), metadata: { question_category: 'budget_exceed', recommended_option: 'spend it' } })];
    const { sb, updates } = makeFakeSupabase({ rows });
    const res = await planAndApplyPendingQuestions(sb, { env: { COORD_QUESTION_AUTO_PROCEED_V1: 'true' }, now: NOW });
    expect(res.autoProceeded).toBe(0);
    expect(res.hardWaited).toBe(1);
    expect(updates).toHaveLength(0);
  });

  it('applyAutoProceed is fail-open when the DB update errors', async () => {
    const erroring = {
      from() {
        return {
          update() {
            return { eq() { return { eq() { return Promise.resolve({ error: { message: 'boom' } }); } }; } };
          },
        };
      },
    };
    const res = await applyAutoProceed(erroring, q(), { recommended_option: 'A', reason: 'r' }, NOW);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('boom');
  });
});
