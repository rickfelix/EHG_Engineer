/**
 * SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-D (FR-4) — topic_id multi-party thread primitive.
 *
 * insertCoordinationRow(supabase, row, { topicId }) stamps row.payload.topic_id before insert
 * (merging into any existing payload, never clobbering other keys); getThreadByTopicId(supabase,
 * topicId) reads the thread back grouped + ordered by created_at ASC. Follows the same lightweight
 * chain-stub mocking convention as tests/unit/coordinator-dispatch-terminal-guard.test.js (which
 * covers the same lib/coordinator/dispatch.cjs choke point).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { insertCoordinationRow, getThreadByTopicId } = require('../../../lib/coordinator/dispatch.cjs');

const silentLog = { warn() {}, error() {}, log() {} };
// Sentinel target short-circuits assertValidTarget (no claude_sessions lookup needed), and a
// non-WORK_ASSIGNMENT message_type short-circuits assertSdDispatchable / assertWorkerTierAllowed /
// stampEffortRecommendation (each bails at message_type !== 'WORK_ASSIGNMENT') — so the fake below
// only needs to model the 'session_coordination' table itself.
const TARGET = 'broadcast-coordinator';

/** Minimal fake supabase client modeling only session_coordination insert + select/eq/order reads. */
function createFakeSupabase() {
  const rows = [];
  let counter = 0;
  return {
    _rows: rows,
    from(table) {
      if (table !== 'session_coordination') {
        // Not expected to be hit given TARGET is a sentinel + message_type is not WORK_ASSIGNMENT,
        // but stub defensively so an unexpected call fails loudly instead of throwing on undefined.
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
          const stored = {
            id: `row-${++counter}`,
            created_at: row.created_at || new Date().toISOString(),
            ...row,
          };
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
          // FR-6 (count-truncation discipline): getThreadByTopicId now adds a unique-key
          // .order('id') tiebreaker after .order('created_at') — keep the PRIMARY sort key.
          if (!chain._order) chain._order = col;
          return chain;
        },
        // FR-6: getThreadByTopicId paginates via fetchAllPaginated, whose pages end in .range().
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
              if (col === 'payload->>topic_id') {
                data = data.filter((r) => r.payload && r.payload.topic_id === val);
              } else {
                data = data.filter((r) => r[col] === val);
              }
            }
            if (chain._order) {
              data.sort((a, b) => new Date(a[chain._order]) - new Date(b[chain._order]));
            }
            if (chain._range) {
              data = data.slice(chain._range[0], chain._range[1] + 1);
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

describe('insertCoordinationRow + getThreadByTopicId: topic_id thread primitive', () => {
  it('groups 3 messages sharing a topic_id and returns them ordered by created_at ASC', async () => {
    const sb = createFakeSupabase();
    const topicId = 'topic-abc-123';

    // Insert out of chronological order to prove getThreadByTopicId re-sorts, not just echoes insert order.
    await insertCoordinationRow(sb, {
      message_type: 'INFO', target_session: TARGET, sender_type: 'coordinator',
      created_at: '2026-07-02T10:02:00.000Z', payload: { body: 'third' },
    }, { logger: silentLog, topicId });
    await insertCoordinationRow(sb, {
      message_type: 'INFO', target_session: TARGET, sender_type: 'adam',
      created_at: '2026-07-02T10:00:00.000Z', payload: { body: 'first' },
    }, { logger: silentLog, topicId });
    await insertCoordinationRow(sb, {
      message_type: 'INFO', target_session: TARGET, sender_type: 'solomon',
      created_at: '2026-07-02T10:01:00.000Z', payload: { body: 'second' },
    }, { logger: silentLog, topicId });

    // An unrelated message (different topic_id) must NOT show up in the thread.
    await insertCoordinationRow(sb, {
      message_type: 'INFO', target_session: TARGET, sender_type: 'coordinator',
      created_at: '2026-07-02T10:03:00.000Z', payload: { body: 'unrelated' },
    }, { logger: silentLog, topicId: 'topic-other' });

    const { data, error } = await getThreadByTopicId(sb, topicId);

    expect(error).toBeNull();
    expect(data).toHaveLength(3);
    expect(data.map((r) => r.payload.body)).toEqual(['first', 'second', 'third']);
    expect(data.every((r) => r.payload.topic_id === topicId)).toBe(true);
  });

  it('backward-compat: insertCoordinationRow WITHOUT opts.topicId does not add a topic_id key at all', async () => {
    const sb = createFakeSupabase();

    // Case 1: row.payload already has keys — those must survive unchanged, and no topic_id key added.
    await insertCoordinationRow(sb, {
      message_type: 'INFO', target_session: TARGET, sender_type: 'coordinator',
      payload: { body: 'no topic here', foo: 'bar' },
    }, { logger: silentLog });

    // Case 2: row.payload is undefined entirely — must not throw, and no payload.topic_id materializes.
    await insertCoordinationRow(sb, {
      message_type: 'INFO', target_session: TARGET, sender_type: 'coordinator',
    }, { logger: silentLog });

    expect(sb._rows).toHaveLength(2);
    // Original payload keys survive unchanged; no topic_id key is added. protocol_comms_version is
    // a SEPARATE, unrelated stamp from sibling SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-C (FR-2)
    // that insertCoordinationRow also applies to any row with a payload object -- not this test's
    // concern, so assert its presence rather than pretending it doesn't exist.
    expect(sb._rows[0].payload).toMatchObject({ body: 'no topic here', foo: 'bar' });
    expect(Object.prototype.hasOwnProperty.call(sb._rows[0].payload, 'topic_id')).toBe(false);
    expect(sb._rows[0].payload).toHaveProperty('protocol_comms_version');
    // A payload-less row stays payload-less -- protocol_comms_version stamping only stamps INTO an
    // existing payload object, never invents one (some rows are payload-less by design).
    expect(sb._rows[1].payload).toBeUndefined();
  });
});
