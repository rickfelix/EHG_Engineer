/**
 * Regression test for SD-LEO-INFRA-READ-WRITTEN-UNSCOPED-001: scripts/fleet-dashboard.cjs's
 * printInbox() (coordinator-audience render) stamped read_at UNCONDITIONALLY on every render
 * -- unlike every other census-cataloged write site (solomon-advisory.cjs, adam-advisory.cjs,
 * michael-inbox.cjs), which gate on read_at IS NULL so the column stays a first-delivery
 * timestamp. stampInboxReadAt is the extracted, directly-testable write (printInbox itself has
 * no injectable client, mirroring writeSignalReceipts' own extraction for the same reason).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { stampInboxReadAt } = require('../../../scripts/fleet-dashboard.cjs');

function fakeSupabase(initialRows) {
  const table = initialRows.map((r) => ({ ...r }));
  return {
    table,
    from() {
      let filterIds = null;
      let filterReadAtNull = false;
      let updatePatch = null;
      const q = {
        update(patch) { updatePatch = patch; return q; },
        in(col, vals) { if (col === 'id') filterIds = vals; return q; },
        is(col) { if (col === 'read_at') filterReadAtNull = true; return q; },
        then(res) {
          const targets = table.filter((r) => filterIds?.includes(r.id) && (!filterReadAtNull || r.read_at == null));
          targets.forEach((r) => Object.assign(r, updatePatch));
          return Promise.resolve({ data: targets, error: null }).then(res);
        },
      };
      return q;
    },
  };
}

describe('stampInboxReadAt (SD-LEO-INFRA-READ-WRITTEN-UNSCOPED-001 FR-1)', () => {
  it('a row already carrying read_at keeps its exact value unchanged (idempotent)', async () => {
    const original = '2026-09-01T00:00:00.000Z';
    const sb = fakeSupabase([{ id: 'r1', read_at: original }]);
    await stampInboxReadAt(sb, ['r1']);
    expect(sb.table[0].read_at).toBe(original);
  });

  it('a row with read_at NULL gets it stamped on first call', async () => {
    const sb = fakeSupabase([{ id: 'r1', read_at: null }]);
    await stampInboxReadAt(sb, ['r1']);
    expect(sb.table[0].read_at).not.toBeNull();
  });

  it('a second call over an already-stamped row does not move the timestamp forward', async () => {
    const sb = fakeSupabase([{ id: 'r1', read_at: null }]);
    await stampInboxReadAt(sb, ['r1']);
    const stampedAt = sb.table[0].read_at;
    await stampInboxReadAt(sb, ['r1']);
    expect(sb.table[0].read_at).toBe(stampedAt);
  });

  it('an empty id list is a no-op (no client call attempted)', async () => {
    const sb = fakeSupabase([]);
    await expect(stampInboxReadAt(sb, [])).resolves.toBeUndefined();
  });
});
