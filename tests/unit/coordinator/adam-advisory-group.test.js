/**
 * Unit tests — SD-LEO-FIX-SOLOMON-MULTI-PART-001
 * lib/coordinator/adam-advisory-store.cjs — resolveGroupForAdvisory / stampActionedGroup
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolveGroupForAdvisory, stampActionedGroup } = require('../../../lib/coordinator/adam-advisory-store.cjs');

// Minimal thenable supabase builder matching the query chain resolveGroupForAdvisory /
// stampActionedGroup (via stampActioned) actually issue.
function makeSupabase({ selectResult, updateResult = { error: null } } = {}) {
  const chain = {
    from() { return chain; },
    select() { return chain; },
    eq() { return chain; },
    gte() { return chain; },
    order() { return chain; },
    limit() { return Promise.resolve(selectResult); },
    update() { return chain; },
    then(res, rej) { return Promise.resolve(updateResult).then(res, rej); },
  };
  return chain;
}

describe('resolveGroupForAdvisory', () => {
  it('resolves a full 2-part group when a sibling row is found', async () => {
    const advisoryRow = { id: 'row-2', target_session: 'coord-1', sender_session: 'solomon-1', subject: 'VERDICT 2/2' };
    const siblingData = [
      { id: 'row-1', subject: 'VERDICT 1/2', body: 'first', target_session: 'coord-1', sender_session: 'solomon-1', created_at: '2026-07-17T13:15:12Z' },
      { id: 'row-2', subject: 'VERDICT 2/2', body: 'second', target_session: 'coord-1', sender_session: 'solomon-1', created_at: '2026-07-17T13:16:12Z' },
    ];
    const supabase = makeSupabase({ selectResult: { data: siblingData, error: null } });
    const group = await resolveGroupForAdvisory(supabase, advisoryRow);
    expect(group.isMultiPart).toBe(true);
    expect(group.isComplete).toBe(true);
    expect(group.memberIds).toEqual(['row-1', 'row-2']);
  });

  it('degrades to a singleton group when the row has no target_session/sender_session', async () => {
    const advisoryRow = { id: 'row-1', subject: 'VERDICT 1/2' };
    const supabase = makeSupabase({ selectResult: { data: [], error: null } });
    const group = await resolveGroupForAdvisory(supabase, advisoryRow);
    expect(group).toMatchObject({ id: 'row-1', memberIds: ['row-1'], isMultiPart: false, isComplete: true, total: 1 });
  });

  it('degrades to a singleton group on a lookup error (never throws)', async () => {
    const advisoryRow = { id: 'row-1', target_session: 'coord-1', sender_session: 'solomon-1', subject: 'VERDICT 1/2' };
    const supabase = makeSupabase({ selectResult: { data: null, error: { message: 'boom' } } });
    const group = await resolveGroupForAdvisory(supabase, advisoryRow);
    expect(group.memberIds).toEqual(['row-1']);
  });
});

describe('stampActionedGroup', () => {
  it('stamps actioned_at on every member row of the group', async () => {
    const supabase = makeSupabase({ updateResult: { error: null } });
    const group = { rows: [{ id: 'row-1', payload: { kind: 'adam_advisory' } }, { id: 'row-2', payload: { kind: 'adam_advisory' } }] };
    const { error } = await stampActionedGroup(supabase, group, '2026-07-17T00:00:00.000Z');
    expect(error).toBeNull();
  });

  it('returns the first error encountered without stopping the remaining stamps', async () => {
    let call = 0;
    const supabase = {
      from() { return this; },
      update() { return this; },
      eq() { return this; },
      then(res) {
        call += 1;
        return Promise.resolve(call === 1 ? { error: { message: 'row-1 failed' } } : { error: null }).then(res);
      },
    };
    const group = { rows: [{ id: 'row-1', payload: {} }, { id: 'row-2', payload: {} }] };
    const { error } = await stampActionedGroup(supabase, group, '2026-07-17T00:00:00.000Z');
    expect(error.message).toBe('row-1 failed');
  });
});
