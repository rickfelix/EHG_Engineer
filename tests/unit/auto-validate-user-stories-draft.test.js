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
import { autoValidateUserStories, classifyDesignOnly, storyMeetsDesignBar } from '../../scripts/auto-validate-user-stories-on-exec-complete.js';

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
        // opts.sdRow lets a test supply metadata/description for design-only classification.
        return { data: { id: opts.uuid, ...(opts.sdRow || {}) }, error: null };
      }
      if (st.table === 'sd_scope_deliverables') return { data: opts.deliverables, error: null };
      if (st.table === 'user_stories') {
        if (st.op === 'update') {
          if (st.updateData?.status === 'completed') {
            recorded.promoteStatusIn = st.ins.status ?? null;
            if (st.ins.id) recorded.promotedIds = st.ins.id;
          }
          if (st.updateData?.validation_status === 'validated') {
            recorded.validateCalled = true;
            if (st.ins.id) recorded.validatedIds = st.ins.id;
          }
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

// SD-FDBK-INFRA-COMPLETION-FLAG-HARNESS-001 FR-3: regression + edge coverage (>=6 cases total).

test('ready stories still promoted+validated (no regression for the original path)', async () => {
  const stories = [{ id: 's1', title: 'Story 1', status: 'ready', validation_status: 'pending' }];
  const { client, recorded } = makeClient({
    uuid: '44444444-4444-4444-4444-444444444444',
    stories,
    deliverables: [{ deliverable_name: 'd', completion_status: 'completed' }],
  });
  const res = await autoValidateUserStories('44444444-4444-4444-4444-444444444444', client);
  assert.deepEqual(recorded.promoteStatusIn, ['ready', 'draft'], 'ready stories still promoted via the widened set');
  assert.equal(recorded.validateCalled, true);
  assert.equal(res.validated, true);
});

test('deliverables incomplete short-circuits with no promotion or validation', async () => {
  const stories = [{ id: 's1', title: 'Story 1', status: 'draft', validation_status: 'pending' }];
  const { client, recorded } = makeClient({
    uuid: '55555555-5555-5555-5555-555555555555',
    stories,
    deliverables: [{ deliverable_name: 'd', completion_status: 'pending' }],
  });
  const res = await autoValidateUserStories('55555555-5555-5555-5555-555555555555', client);
  assert.equal(res.validated, false, 'incomplete deliverables must not validate');
  assert.equal(res.message, 'Deliverables incomplete');
  assert.equal(recorded.promoteStatusIn, null, 'no promotion when deliverables are incomplete');
  assert.equal(recorded.validateCalled, false, 'no validation when deliverables are incomplete');
});

test('no user stories returns the {validated:true,count:0} contract (infra/docs SDs)', async () => {
  const { client, recorded } = makeClient({
    uuid: '66666666-6666-6666-6666-666666666666',
    stories: [],
    deliverables: [{ deliverable_name: 'd', completion_status: 'completed' }],
  });
  const res = await autoValidateUserStories('66666666-6666-6666-6666-666666666666', client);
  assert.equal(res.validated, true, 'no stories is an acceptable pass for infra/docs SDs');
  assert.equal(res.count, 0);
  assert.equal(recorded.promoteStatusIn, null, 'nothing to promote when there are no stories');
});

// ── SD-LEO-INFRA-VALIDATE-DESIGN-ONLY-STORIES-001 ──────────────────────────────────────────────

test('classifyDesignOnly: explicit metadata.design_only flag wins', () => {
  assert.equal(classifyDesignOnly({ metadata: { design_only: true } }, []).designOnly, true);
});

test('classifyDesignOnly: all-docs deliverable paths → design-only; any code path → not', () => {
  assert.equal(classifyDesignOnly({}, [{ deliverable_name: 'docs/04_features/spec.md' }]).designOnly, true);
  assert.equal(classifyDesignOnly({}, [{ deliverable_name: 'docs/x.md' }, { deliverable_name: 'src/foo.ts' }]).designOnly, false);
});

test('classifyDesignOnly: generic deliverable names + a design-only marker in SD text → design-only', () => {
  const sd = { description: 'DESIGN-ONLY — NO build and NO code in this SD; reviewable spec.' };
  const generic = [{ deliverable_name: 'Documentation updated' }, { deliverable_name: 'Core functionality implemented' }];
  assert.equal(classifyDesignOnly(sd, generic).designOnly, true);
});

test('classifyDesignOnly: generic names + no marker → FAIL-OPEN to not-design-only', () => {
  const generic = [{ deliverable_name: 'Documentation updated' }, { deliverable_name: 'Unit tests written' }];
  assert.equal(classifyDesignOnly({ description: 'Add a feature' }, generic).designOnly, false);
});

test('storyMeetsDesignBar: substantive non-boilerplate ACs pass; thin/boilerplate fail', () => {
  const good = { title: 'Review the spec', acceptance_criteria: [
    'Opening the design spec, a reviewer can see the cockpit purpose stated clearly.',
    'The spec ends with an open-questions section for the chairman.' ] };
  assert.equal(storyMeetsDesignBar(good).ok, true);
  assert.equal(storyMeetsDesignBar({ title: 't', acceptance_criteria: ['only one criterion here, long enough'] }).ok, false, '<2 substantive → fail');
  assert.equal(storyMeetsDesignBar({ title: 't', acceptance_criteria: ['It is built successfully', 'Works as expected'] }).ok, false, 'boilerplate → fail');
  // substantive + non-boilerplate, no literal "spec" keyword → PASS (the per-story spec-keyword check
  // was dropped; the SD is already classified design-only, and a good design AC can describe content).
  assert.equal(storyMeetsDesignBar({ title: 't', acceptance_criteria: [
    'The metric reads months-of-runway = liquid cash / monthly net burn.',
    'No alternative formula is left ambiguous in the document.' ] }).ok, true);
});

test('storyMeetsDesignBar: OBJECT-shaped acceptance_criteria are normalized (not silently dropped)', () => {
  // ~half the corpus stores ACs as {given,when,then} objects — these must be measured, not ignored.
  const objStory = { title: 'Object ACs', acceptance_criteria: [
    { given: 'the metric-definition section of the spec is open', when: 'an engineer reads the formula', then: 'it reads months-of-runway = liquid cash / monthly net burn' },
    { scenario: 'A reviewer checks the open-questions list and finds the chairman decisions enumerated.' } ] };
  assert.equal(storyMeetsDesignBar(objStory).ok, true, 'object ACs must be normalized + pass the bar');
  // an object AC that is empty/thin still fails
  assert.equal(storyMeetsDesignBar({ title: 't', acceptance_criteria: [{ given: '', when: '', then: '' }] }).ok, false);
});

test('design-only branch: good story validated, thin story surfaced (advisory, not rubber-stamped)', async () => {
  const stories = [
    { id: 'g1', title: 'Good', status: 'ready', validation_status: 'pending', implementation_context: 'see the design spec',
      acceptance_criteria: ['The spec documents the gauge purpose and data source clearly.', 'The spec lists open questions for the chairman.'] },
    { id: 't1', title: 'Thin', status: 'ready', validation_status: 'pending',
      acceptance_criteria: ['It is built successfully'] },
  ];
  const { client, recorded } = makeClient({
    uuid: '77777777-7777-7777-7777-777777777777',
    sdRow: { metadata: { design_only: true } },
    stories,
    deliverables: [{ deliverable_name: 'docs/04_features/spec.md', completion_status: 'completed' }],
  });
  const res = await autoValidateUserStories('77777777-7777-7777-7777-777777777777', client);
  assert.equal(res.designOnly, true);
  assert.equal(res.validated, false, 'a thin story keeps the SD from a clean validated pass');
  assert.equal(res.passing, 1, 'only the good story is validated');
  assert.equal(res.failing, 1, 'the thin story is surfaced');
  assert.ok(res.warnings.some(w => w.includes('Thin')), 'the thin story is named in the warnings');
  // Option A: ALL design stories are promoted status->completed (so USER_STORY_COVERAGE is not
  // hard-blocked), but only the good story is validation_status->validated.
  assert.deepEqual([...(recorded.promotedIds || [])].sort(), ['g1', 't1'], 'all stories promoted to completed');
  assert.deepEqual(recorded.validatedIds, ['g1'], 'only the good story is validated');
});

test('FR-3: a design-only SD with a spec deliverable but ZERO stories is surfaced, not auto-passed', async () => {
  const { client } = makeClient({
    uuid: '88888888-8888-8888-8888-888888888888',
    sdRow: { metadata: { design_only: true } },
    stories: [],
    deliverables: [{ deliverable_name: 'docs/04_features/spec.md', completion_status: 'completed' }],
  });
  const res = await autoValidateUserStories('88888888-8888-8888-8888-888888888888', client);
  assert.equal(res.validated, false, 'design-only + zero stories must NOT silently auto-pass');
  assert.equal(res.designOnly, true);
  assert.ok(res.warnings && res.warnings.length >= 1, 'the zero-stories case is surfaced as a warning');
});
