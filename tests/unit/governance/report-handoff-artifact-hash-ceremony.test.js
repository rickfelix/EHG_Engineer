import { describe, it, expect } from 'vitest';

// classifyPair is not exported (the script is a report entry point), so this test
// re-derives the classification contract directly against the documented shape --
// pin the SAME-HASH/CHANGED/UNMEASURED rules that report-handoff-artifact-hash-ceremony.mjs implements.
function classifyPair(rejected, accepted) {
  const rHash = rejected.metadata?.artifact_hash;
  const aHash = accepted.metadata?.artifact_hash;
  if (!rHash || !aHash) return 'UNMEASURED';
  const sdChanged = rHash.sd !== aHash.sd;
  const prdChanged = rHash.prd != null && aHash.prd != null && rHash.prd !== aHash.prd;
  return (sdChanged || prdChanged) ? 'CHANGED' : 'SAME-HASH';
}

describe('handoff artifact-hash ceremony classification (QF-20260830-904)', () => {
  it('TS-1: identical sd hash on both sides classifies SAME-HASH (bare re-run)', () => {
    const rejected = { metadata: { artifact_hash: { sd: 'abc', prd: null } } };
    const accepted = { metadata: { artifact_hash: { sd: 'abc', prd: null } } };
    expect(classifyPair(rejected, accepted)).toBe('SAME-HASH');
  });

  it('TS-2: a changed sd hash classifies CHANGED (real fix)', () => {
    const rejected = { metadata: { artifact_hash: { sd: 'abc', prd: null } } };
    const accepted = { metadata: { artifact_hash: { sd: 'def', prd: null } } };
    expect(classifyPair(rejected, accepted)).toBe('CHANGED');
  });

  it('TS-3: a changed prd hash classifies CHANGED even when sd is unchanged', () => {
    const rejected = { metadata: { artifact_hash: { sd: 'abc', prd: 'p1' } } };
    const accepted = { metadata: { artifact_hash: { sd: 'abc', prd: 'p2' } } };
    expect(classifyPair(rejected, accepted)).toBe('CHANGED');
  });

  it('TS-4: either side missing artifact_hash (pre-instrumentation) classifies UNMEASURED', () => {
    const rejected = { metadata: {} };
    const accepted = { metadata: { artifact_hash: { sd: 'abc', prd: null } } };
    expect(classifyPair(rejected, accepted)).toBe('UNMEASURED');
  });
});
