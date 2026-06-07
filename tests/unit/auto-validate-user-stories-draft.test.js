/**
 * SD-FDBK-INFRA-COMPLETION-FLAG-HARNESS-001 (feedback d53400a5)
 *
 * autoValidateUserStories() had two gaps that left PLAN-created user stories stuck at
 * EXEC-TO-PLAN (forcing a manual `update user_stories set status='completed', validation_status='validated'`):
 *   1. It queried user_stories by sd_id and only worked when passed the SD UUID — an sd_key
 *      (CLI path) matched nothing.
 *   2. It only promoted status='ready' -> 'completed'; add-prd creates stories as status='draft',
 *      so draft stories were never promoted and never auto-validated.
 *
 * These tests inject a mock Supabase client (the function accepts sbClient) and assert:
 *   - an sd_key is resolved to the UUID via strategic_directives_v2 before querying;
 *   - draft stories are included in the ready/draft -> completed promotion (.in('status',['ready','draft']))
 *     and then validation_status -> validated.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoValidateUserStories } from '../../scripts/auto-validate-user-stories-on-exec-complete.js';

/**
 * Minimal chainable + awaitable mock of the supabase-js query builder.
 * opts: { uuid, stories, deliverables }. Returns { client, recorded }.
 */
function makeClient(opts) {
  const recorded = { resolvedByKey: null, promoteStatusIn: null, validateCalled: false };
  function builder(table) {
    const st = { table, op: 'select', updateData: null, eqs: {}, ins: {} };
    const resolve = () => {
      if (st.table === 'strategic_directives_v2') {
        recorded.resolvedByKey = st.eqs.sd_key ?? null;
        return { data: { id: opts.uuid }, error: null };
      }
      if (st.table === 'sd_scope_deliverables') return { data: opts.deliverables, error: null };
      if (st.table === 'user_stories') {
        if (st.op === 'update') {
          if (st.updateData?.status === 'completed') recorded.promoteStatusIn = st.ins.status ?? null;
          if (st.updateData?.validation_status === 'validated') recorded.validateCalled = true;
          return { data: opts.stories, error: null };
        }
        return { data: opts.stories, error: null };
      }
      return { data: [], error: null };
    };
    const api = {
      select() { return api; },
      update(d) { st.op = 'update'; st.updateData = d; return api; },
      eq(k, v) { st.eqs[k] = v; return api; },
      in(k, arr) { st.ins[k] = arr; return api; },
      maybeSingle() { return Promise.resolve(resolve()); },
      then(res, rej) { return Promise.resolve(resolve()).then(res, rej); },
    };
    return api;
  }
  return { client: { from: builder }, recorded };
}

test('draft stories are promoted (ready+draft) and then validated', async () => {
  const stories = [{ id: 's1', title: 'Story 1', status: 'draft', validation_status: 'pending' }];
  const { client, recorded } = makeClient({
    uuid: '11111111-1111-1111-1111-111111111111',
    stories,
    deliverables: [{ deliverable_name: 'd', completion_status: 'completed' }],
  });
  const res = await autoValidateUserStories('11111111-1111-1111-1111-111111111111', client);
  assert.deepEqual(recorded.promoteStatusIn, ['ready', 'draft'], 'promotion must include draft, not just ready');
  assert.equal(recorded.validateCalled, true, 'completed stories must be auto-validated');
  assert.equal(res.validated, true);
});

test('an sd_key is resolved to the UUID before querying user_stories', async () => {
  const stories = [{ id: 's1', title: 'Story 1', status: 'draft', validation_status: 'pending' }];
  const { client, recorded } = makeClient({
    uuid: '22222222-2222-2222-2222-222222222222',
    stories,
    deliverables: [{ deliverable_name: 'd', completion_status: 'completed' }],
  });
  await autoValidateUserStories('SD-FDBK-INFRA-COMPLETION-FLAG-HARNESS-001', client);
  assert.equal(recorded.resolvedByKey, 'SD-FDBK-INFRA-COMPLETION-FLAG-HARNESS-001',
    'a non-UUID sd_key must be resolved via strategic_directives_v2');
});

test('a UUID is used directly (no sd_key resolution lookup)', async () => {
  const stories = [{ id: 's1', title: 'Story 1', status: 'ready', validation_status: 'pending' }];
  const { client, recorded } = makeClient({
    uuid: 'unused',
    stories,
    deliverables: [{ deliverable_name: 'd', completion_status: 'completed' }],
  });
  await autoValidateUserStories('33333333-3333-3333-3333-333333333333', client);
  assert.equal(recorded.resolvedByKey, null, 'a UUID must not trigger an sd_key resolution lookup');
});
