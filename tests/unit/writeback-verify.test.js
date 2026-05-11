import { describe, test, expect, vi } from 'vitest';
import { updateAndVerify, WritebackVerificationError } from '../../lib/db/writeback-verify.mjs';

function makeClient({ initial = {}, postUpdate = {}, updateError = null, readError = null } = {}) {
  // Mock supabase chain: client.from(table).select(cols).eq(k,v).single() / .update(payload).eq(k,v)
  const state = { table: null, mode: null, payload: null, selectCols: null, filters: [] };
  const reset = () => { state.table = null; state.mode = null; state.payload = null; state.selectCols = null; state.filters = []; };
  const stages = {
    select(cols) { state.mode = state.mode || 'select'; state.selectCols = cols; return chain; },
    update(payload) { state.mode = 'update'; state.payload = payload; return chain; },
    eq(k, v) { state.filters.push([k, v]); return chain; },
    async single() {
      if (readError) { const r = { data: null, error: readError }; reset(); return r; }
      const data = state.mode === 'update_then_read'
        ? postUpdate
        : (Object.keys(postUpdate).length > 0 && state._didUpdate ? postUpdate : initial);
      reset();
      return { data, error: null };
    },
    then(resolve) {
      if (state.mode === 'update') {
        if (updateError) { reset(); return resolve({ data: null, error: updateError }); }
        state._didUpdate = true;
        reset();
        return resolve({ data: null, error: null });
      }
      return resolve({ data: state.mode === 'select' ? initial : null, error: null });
    },
  };
  const chain = { ...stages };
  return {
    from: vi.fn().mockImplementation((table) => { state.table = table; state._didUpdate = state._didUpdate || false; return chain; }),
    _state: state,
  };
}

describe('updateAndVerify', () => {
  test('passes when verifyKeys land in target column', async () => {
    const client = makeClient({
      initial: { metadata: {}, governance_metadata: {} },
      postUpdate: { metadata: {}, governance_metadata: { decomposition_judgment: 'split', cascade_flag_overridden: true } },
    });
    const result = await updateAndVerify({
      client,
      table: 'strategic_directives_v2',
      match: { id: 'SD-X-001' },
      column: 'governance_metadata',
      patch: { decomposition_judgment: 'split', cascade_flag_overridden: true },
      verifyKeys: ['decomposition_judgment', 'cascade_flag_overridden'],
    });
    expect(result.row.governance_metadata.decomposition_judgment).toBe('split');
  });

  test('throws WritebackVerificationError when key absent', async () => {
    const client = makeClient({
      initial: { metadata: {}, governance_metadata: {} },
      postUpdate: { metadata: {}, governance_metadata: {} },
    });
    await expect(updateAndVerify({
      client,
      table: 'strategic_directives_v2',
      match: { id: 'SD-X-001' },
      column: 'governance_metadata',
      patch: {},
      verifyKeys: ['decomposition_judgment'],
      replace: true,
    })).rejects.toThrow(WritebackVerificationError);
  });

  test('column-disambiguation: flags sibling when keys land in wrong column', async () => {
    const client = makeClient({
      initial: { metadata: {}, governance_metadata: {} },
      postUpdate: {
        metadata: { decomposition_judgment: 'split' },
        governance_metadata: {},
      },
    });
    let caught = null;
    try {
      await updateAndVerify({
        client,
        table: 'strategic_directives_v2',
        match: { id: 'SD-X-001' },
        column: 'governance_metadata',
        patch: { decomposition_judgment: 'split' },
        verifyKeys: ['decomposition_judgment'],
        replace: true,
      });
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(WritebackVerificationError);
    expect(caught.foundInSibling).toBe('metadata');
    expect(caught.missing).toEqual(['decomposition_judgment']);
  });

  test('merges patch with existing column (no replace)', async () => {
    const client = makeClient({
      initial: { metadata: {}, governance_metadata: { existing_key: 'kept' } },
      postUpdate: { metadata: {}, governance_metadata: { existing_key: 'kept', new_key: 'added' } },
    });
    const { row } = await updateAndVerify({
      client,
      table: 'strategic_directives_v2',
      match: { id: 'SD-X-001' },
      column: 'governance_metadata',
      patch: { new_key: 'added' },
      verifyKeys: ['new_key'],
    });
    expect(row.governance_metadata.existing_key).toBe('kept');
    expect(row.governance_metadata.new_key).toBe('added');
  });

  test('rejects missing required args', async () => {
    await expect(updateAndVerify({})).rejects.toThrow(/required/);
  });

  test('propagates update error', async () => {
    const client = makeClient({
      initial: { metadata: {}, governance_metadata: {} },
      updateError: { message: 'permission denied' },
    });
    await expect(updateAndVerify({
      client,
      table: 'strategic_directives_v2',
      match: { id: 'SD-X-001' },
      column: 'governance_metadata',
      patch: { x: 1 },
      verifyKeys: ['x'],
      replace: true,
    })).rejects.toThrow(/permission denied/);
  });
});
