/**
 * SD-LEO-INFRA-REGISTER-TWO-EVERY-001 (DUTY 1) — doc-drift pure-analyzer tests.
 * The script touches the live DB at import-of-main only; the PURE clusterDocDrift / formatDocDriftProposal
 * are unit-tested here without a DB (mirrors lib/adam/adherence-probes.js test style).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clusterDocDrift, formatDocDriftProposal } from '../../scripts/adam-doc-drift-review.mjs';

const DIRMAP = {
  infrastructure: ['docs/06_deployment/', 'docs/operations/'],
  feature: ['docs/04_features/'],
  bugfix: ['docs/troubleshooting/'],
};

test('clusterDocDrift maps by sd_type to doc dirs and ranks by affected-completion count', () => {
  const items = [
    { sd_type: 'infrastructure' }, { sd_type: 'infrastructure' }, { sd_type: 'feature' }, { sd_type: 'bugfix' },
  ];
  const c = clusterDocDrift(items, DIRMAP);
  assert.equal(c.total, 4);
  // infrastructure dirs hit twice -> top of dirRank
  assert.equal(c.dirRank[0].count, 2);
  assert.ok(c.dirRank[0].dir.startsWith('docs/'));
  // type breakdown present
  const infra = c.typeRank.find((t) => t.type === 'infrastructure');
  assert.equal(infra.count, 2);
});

test('clusterDocDrift falls back to the feature dir set for an unknown sd_type', () => {
  const c = clusterDocDrift([{ sd_type: 'totally-unknown' }], DIRMAP);
  assert.equal(c.total, 1);
  assert.deepEqual(c.dirRank.map((d) => d.dir), ['docs/04_features/']);
});

test('clusterDocDrift is TOTAL on odd input (null/array/missing type)', () => {
  assert.equal(clusterDocDrift(null, DIRMAP).total, 0);
  assert.equal(clusterDocDrift(undefined, DIRMAP).total, 0);
  assert.equal(clusterDocDrift([{}], DIRMAP).total, 1); // missing type -> feature fallback, no throw
});

test('formatDocDriftProposal: empty window says nothing to review; non-empty is clustered + propose-only', () => {
  assert.match(formatDocDriftProposal({ total: 0, dirRank: [], typeRank: [] }, 3), /0 completions — nothing to review/);
  const c = clusterDocDrift([{ sd_type: 'infrastructure' }], DIRMAP);
  const out = formatDocDriftProposal(c, 3);
  assert.match(out, /trailing 3d/);
  assert.match(out, /PROPOSE-ONLY/);
  assert.match(out, /CONST-002/);
});
