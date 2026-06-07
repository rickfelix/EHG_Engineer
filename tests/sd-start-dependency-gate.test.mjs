/**
 * Tests for the pre-claim dependency gate decision logic.
 * SD-FDBK-INFRA-DEPENDENCY-BLOCKS-ADVISORY-001 (FR-004)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDependencyGate, formatDependencyRefusal } from '../lib/sd-start/dependency-gate.mjs';

test('refuses when a dependency is not completed (FR-002)', () => {
  const r = evaluateDependencyGate([{ sd_id: 'SD-A', status: 'in_progress' }], { force: false });
  assert.equal(r.verdict, 'refuse');
  assert.equal(r.blocking.length, 1);
  assert.equal(r.blocking[0].sd_id, 'SD-A');
});

test('proceeds when all dependencies are completed (FR-001)', () => {
  const r = evaluateDependencyGate([
    { sd_id: 'SD-A', status: 'completed' },
    { sd_id: 'SD-B', status: 'completed' },
  ]);
  assert.equal(r.verdict, 'proceed');
  assert.equal(r.warn, false);
  assert.equal(r.blocking.length, 0);
});

test('proceeds (no block) when there are no dependencies (FR-001)', () => {
  assert.equal(evaluateDependencyGate([]).verdict, 'proceed');
  assert.equal(evaluateDependencyGate(null).verdict, 'proceed');
  assert.equal(evaluateDependencyGate(undefined).verdict, 'proceed');
});

test('--force converts a refusal into warn-and-proceed (FR-003)', () => {
  const r = evaluateDependencyGate([{ sd_id: 'SD-A', status: 'draft' }], { force: true });
  assert.equal(r.verdict, 'proceed');
  assert.equal(r.warn, true);
  assert.equal(r.blocking.length, 1);
});

test('unresolved references warn but never hard-block (fail-safe, FR-003)', () => {
  const r = evaluateDependencyGate([{ sd_id: 'SD-GONE', status: null }]);
  assert.equal(r.verdict, 'proceed');
  assert.equal(r.warn, true);
  assert.equal(r.unresolved.length, 1);
});

test('mixed: one completed + one in_progress still refuses', () => {
  const r = evaluateDependencyGate([
    { sd_id: 'SD-DONE', status: 'completed' },
    { sd_id: 'SD-WIP', status: 'in_progress' },
  ]);
  assert.equal(r.verdict, 'refuse');
  assert.equal(r.blocking.length, 1);
  assert.equal(r.blocking[0].sd_id, 'SD-WIP');
});

test('formatDependencyRefusal lists blocking and unresolved entries', () => {
  const body = formatDependencyRefusal(
    [{ sd_id: 'SD-WIP', status: 'in_progress' }],
    [{ sd_id: 'SD-GONE', status: null }],
  );
  assert.match(body, /SD-WIP/);
  assert.match(body, /in_progress/);
  assert.match(body, /SD-GONE/);
});
