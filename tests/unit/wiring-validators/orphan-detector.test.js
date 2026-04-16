import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDetector, persistResults } from '../../../scripts/wiring-validators/orphan-detector.js';

const __filename = fileURLToPath(import.meta.url);
const WORKTREE_ROOT = resolve(__filename, '..', '..', '..', '..');

test('persistResults no-ops when supabase is null', async () => {
  const result = await persistResults(null, { sd_key: 'SD-TEST', check_type: 'orphan_detection', status: 'pass', signals_detected: [] });
  assert.equal(result.skipped, true);
});

test('runDetector returns two check_type rows (orphan_detection + pipeline_integration)', () => {
  const results = runDetector({ sdKey: 'SD-TEST', base: 'main', root: WORKTREE_ROOT });
  assert.equal(Array.isArray(results), true);
  assert.equal(results.length, 2);
  const checkTypes = results.map((r) => r.check_type).sort();
  assert.deepEqual(checkTypes, ['orphan_detection', 'pipeline_integration']);
});

test('runDetector output shape conforms to leo_wiring_validations row schema', () => {
  const results = runDetector({ sdKey: 'SD-TEST', base: 'main', root: WORKTREE_ROOT });
  for (const row of results) {
    assert.ok(row.sd_key, 'row has sd_key');
    assert.ok(['pass', 'fail'].includes(row.status), 'row status is pass or fail');
    assert.ok(Array.isArray(row.signals_detected), 'signals_detected is array');
    assert.ok(typeof row.evidence === 'object', 'evidence is object');
  }
});

test('runDetector exits without throwing on empty diff', () => {
  // Pass a non-existent base ref; git diff fails gracefully and returns []
  const results = runDetector({ sdKey: 'SD-NODIFF', base: 'refs/nonexistent', root: WORKTREE_ROOT });
  assert.equal(results[0].signals_detected.length, 0);
  assert.equal(results[0].status, 'pass');
});
