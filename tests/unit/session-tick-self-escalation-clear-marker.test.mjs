/**
 * Regression test for QF-20260831-587's self-escalation clear PATCH — pins the FR-7
 * (lib/retention/retention-ack-marker.cjs) contract: an AUTOMATED acknowledged_at stamp must
 * never be bare. A bare stamp is indistinguishable from a genuine coordinator reply and would
 * inflate the answered-rate metric lib/coordinator/detectors.cjs computes for
 * signal_type='stuck' rows (adversarial-review finding on PR #7857).
 *
 * Source-pinned, same pattern as the sibling session-tick-*.test.mjs files — session-tick.cjs
 * has no module.exports (a standalone detached daemon), so behavior is asserted against the
 * source rather than invoked directly.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '../..');
const tickPath = resolve(repoRoot, 'scripts/session-tick.cjs');
const tickSrc = readFileSync(tickPath, 'utf8');

test('QF-20260831-587: the clear-PATCH stamps auto_acked (never a bare acknowledged_at)', () => {
  const block = tickSrc.match(/clear\.shouldClear[\s\S]+?\n\s*\}\s*\n\s*return;/);
  assert.ok(block, 'the shouldClearSelfEscalation branch should exist in checkSelfWakeOverdue');
  assert.match(block[0], /auto_acked:\s*true/, 'must mark the stamp as automated, per FR-7');
  assert.match(block[0], /auto_ack_source:/, 'must record which mechanism auto-acked it');
  assert.doesNotMatch(
    block[0],
    /body:\s*JSON\.stringify\(\{\s*acknowledged_at:\s*new Date\(nowMs\)\.toISOString\(\)\s*\}\)/,
    'must not regress to a bare {acknowledged_at} body — that shape is what FR-7 exists to prevent',
  );
});

test('QF-20260831-587: the clear-PATCH merges the existing payload rather than replacing it', () => {
  const block = tickSrc.match(/clear\.shouldClear[\s\S]+?\n\s*\}\s*\n\s*return;/);
  assert.match(block[0], /\.\.\.\(r\.payload \|\| \{\}\)/, 'must spread the fetched row\'s existing payload before adding the marker keys');
});
