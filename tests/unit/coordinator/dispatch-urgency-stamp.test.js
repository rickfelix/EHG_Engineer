/**
 * SD-LEO-FIX-COORDINATOR-RULING-REVERSES-001 (FR-1, FR-3).
 *
 * insertCoordinationRow/dispatchToWorker(supabase, row, { urgency }) stamps row.payload.urgency
 * before insert, validated (fail-open) against lib/coordinator/urgency-levels.cjs. VALIDATION's
 * LEAD-TO-PLAN finding (sub_agent_execution_results 39101e4d) was that the already-merged reader
 * (scripts/hooks/coordination-inbox.cjs) had ZERO writer and its 4 tests were pure-function tests
 * fed hand-built rows — never a row actually produced by a writer. TS-5 below closes that gap by
 * feeding a writer-produced row into the real reader functions.
 *
 * Follows the same lightweight chain-stub mocking convention as
 * tests/unit/coordinator/dispatch-topic-id.test.js (same lib/coordinator/dispatch.cjs choke point).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { insertCoordinationRow } = require('../../../lib/coordinator/dispatch.cjs');
const { isKnownUrgency, URGENCY_LEVELS } = require('../../../lib/coordinator/urgency-levels.cjs');
const { mergePriorityExempt, classifyToolActiveLaneBlind } = require('../../../scripts/hooks/coordination-inbox.cjs');

const TARGET = 'broadcast-coordinator';

// Full chain stub (select/eq/order/range), mirroring dispatch-topic-id.test.js's fake — needed so
// assertSendBackpressure / assertCorrelationNotDisposed (both called on every insertCoordinationRow
// invocation, unconditional on target) resolve cleanly to "0 prior rows" instead of fail-open
// warning on a missing .select(), which would pollute TS-3's exact-one-warning assertion.
function createFakeSupabase() {
  const rows = [];
  let counter = 0;
  return {
    _rows: rows,
    from(table) {
      if (table !== 'session_coordination') {
        const generic = {
          select() { return generic; },
          eq() { return generic; },
          limit() { return generic; },
          maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        };
        return generic;
      }
      const chain = {
        _mode: null,
        _filters: [],
        _order: null,
        insert(row) {
          chain._mode = 'insert';
          const stored = { id: `row-${++counter}`, created_at: row.created_at || new Date().toISOString(), ...row };
          rows.push(stored);
          chain._result = stored;
          return chain;
        },
        select() {
          if (chain._mode !== 'insert') chain._mode = 'select';
          return chain;
        },
        eq(col, val) {
          chain._filters.push([col, val]);
          return chain;
        },
        order(col) {
          if (!chain._order) chain._order = col;
          return chain;
        },
        range(from, to) {
          chain._range = [from, to];
          return chain;
        },
        then(resolve, reject) {
          let result;
          if (chain._mode === 'insert') {
            result = { data: chain._result, error: null };
          } else {
            let data = rows.slice();
            for (const [col, val] of chain._filters) {
              data = data.filter((r) => r[col] === val);
            }
            result = { data, error: null };
          }
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

const warnings = [];
const capturingLog = { warn(msg) { warnings.push(msg); }, error() {}, log() {} };
const silentLog = { warn() {}, error() {}, log() {} };

describe('lib/coordinator/urgency-levels.cjs: isKnownUrgency', () => {
  it('TS-4: returns true only for the recognized "interrupt" level', () => {
    expect(isKnownUrgency('interrupt')).toBe(true);
  });

  it('TS-4: returns false for an unrecognized string, without throwing', () => {
    expect(isKnownUrgency('bogus')).toBe(false);
  });

  it('TS-4: returns false for null/undefined/empty-string, without throwing', () => {
    expect(isKnownUrgency(null)).toBe(false);
    expect(isKnownUrgency(undefined)).toBe(false);
    expect(isKnownUrgency('')).toBe(false);
  });

  it('exposes the enum as a frozen array so a caller cannot mutate the shared source of truth', () => {
    expect(URGENCY_LEVELS).toContain('interrupt');
    expect(Object.isFrozen(URGENCY_LEVELS)).toBe(true);
  });
});

describe('insertCoordinationRow({ urgency }): writer side of payload.urgency', () => {
  it('TS-1: opts.urgency="interrupt" stamps payload.urgency on the inserted row', async () => {
    const sb = createFakeSupabase();
    await insertCoordinationRow(sb, {
      message_type: 'INFO', target_session: TARGET, sender_type: 'coordinator',
      payload: { kind: 'coordinator_request', topic: 'ruling', body: 'reverses in-flight work' },
    }, { logger: silentLog, urgency: 'interrupt' });

    expect(sb._rows).toHaveLength(1);
    expect(sb._rows[0].payload.urgency).toBe('interrupt');
    // Unrelated payload keys survive unchanged.
    expect(sb._rows[0].payload).toMatchObject({ kind: 'coordinator_request', topic: 'ruling', body: 'reverses in-flight work' });
  });

  it('TS-2: omitting opts.urgency produces no urgency key at all (byte-identical to pre-change behavior)', async () => {
    const sb = createFakeSupabase();
    await insertCoordinationRow(sb, {
      message_type: 'INFO', target_session: TARGET, sender_type: 'coordinator',
      payload: { kind: 'coordinator_request', topic: 'ruling', body: 'a routine ruling' },
    }, { logger: silentLog });

    expect(sb._rows).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(sb._rows[0].payload, 'urgency')).toBe(false);
  });

  it('TS-3: an unrecognized urgency value is still written (fail-open) and logs a warning naming it', async () => {
    const sb = createFakeSupabase();
    warnings.length = 0;
    await insertCoordinationRow(sb, {
      message_type: 'INFO', target_session: TARGET, sender_type: 'coordinator',
      payload: { kind: 'coordinator_request', topic: 'ruling' },
    }, { logger: capturingLog, urgency: 'not-a-real-level' });

    expect(sb._rows).toHaveLength(1);
    expect(sb._rows[0].payload.urgency).toBe('not-a-real-level');
    // Scoped to THIS mechanism's own warning — the fake stub's other chain calls (backpressure /
    // disposition checks, unrelated to urgency) may also fail-open-warn on an incomplete mock, so
    // this asserts presence of the urgency warning rather than an exact total warning count.
    expect(warnings.some((w) => /not-a-real-level/.test(w))).toBe(true);
  });

  it('TS-5: a row produced by the writer is correctly recognized by the already-merged reader\'s pure functions', async () => {
    const sb = createFakeSupabase();
    const NOW = Date.parse('2026-09-13T12:00:00.000Z');

    await insertCoordinationRow(sb, {
      message_type: 'INFO', target_session: TARGET, sender_type: 'coordinator',
      created_at: new Date(NOW - 3 * 60000).toISOString(),
      subject: '[RULING] reverses buildCanaryWaiver',
      payload: { kind: 'coordinator_request', topic: 'ruling', body: 'reverses in-flight work' },
    }, { logger: silentLog, urgency: 'interrupt' });

    const writerRow = sb._rows[0];
    expect(writerRow.payload.urgency).toBe('interrupt');

    // Reader half 1: the lane-blind nudge recognizes a 3-minute-old writer row as blind under the
    // interrupt cutMinutes:2 (mirrors coordination-inbox.cjs main()'s real call), but NOT under
    // the default 15-minute cut for a non-interrupt row of the same age.
    expect(classifyToolActiveLaneBlind(writerRow, { now: NOW, cutMinutes: 2 }).blind).toBe(true);
    expect(classifyToolActiveLaneBlind(writerRow, { now: NOW }).blind).toBe(false);

    // Reader half 2: mergePriorityExempt places the writer-produced row ahead of an unrelated
    // oldest-five batch it does not otherwise belong to.
    const oldestBatch = [{ id: 'older-1' }, { id: 'older-2' }];
    const merged = mergePriorityExempt([writerRow], oldestBatch);
    expect(merged[0].id).toBe(writerRow.id);
    expect(merged).toHaveLength(3);
  });
});
