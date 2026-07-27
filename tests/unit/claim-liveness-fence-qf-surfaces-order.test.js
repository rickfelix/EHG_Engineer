/**
 * SD-LEO-INFRA-CLAIM-LIVENESS-FENCE-001 FR-3 — per-surface coverage for the two QF entry points
 * that are CLI scripts: scripts/qf-start.js and scripts/create-quick-fix.js.
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT. These are top-level scripts with process.exit calls and
 * real DB side effects; exercising them behaviourally needs a harness this SD does not have.
 * tests/unit/claim-liveness-fence-qf-lane.test.js covers the third surface
 * (lib/quick-fix-claim.mjs) BEHAVIOURALLY, which is the strongest of the three.
 *
 * So these are SOURCE-ORDER assertions, and they are deliberately not dressed up as equivalent.
 * They do catch the specific regression that matters most here: a fence that runs AFTER the claim
 * write. That ordering bug is invisible to a "does it call the fence" check — the call is present,
 * the refusal happens, and the row is ALREADY PINNED to a dead session. It is exactly the shape of
 * the original defect, so it is worth pinning even with a weaker instrument.
 *
 * FR-3's acceptance criterion asks for a test per surface; this is the honest version of that for
 * the two surfaces that are scripts.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('FR-3 — scripts/qf-start.js fences before it claims', () => {
  const src = read('scripts/qf-start.js');

  it('calls the liveness fence', () => {
    expect(src).toContain('claimantLivenessFence');
  });

  it('calls it BEFORE the claim_sd RPC — a refusal after the write still pins the row', () => {
    const fenceIdx = src.indexOf('claimantLivenessFence(');
    const rpcIdx = src.indexOf("supabase.rpc('claim_sd'");
    expect(fenceIdx, 'fence call not found').toBeGreaterThan(-1);
    expect(rpcIdx, 'claim_sd call not found').toBeGreaterThan(-1);
    expect(
      fenceIdx,
      'the liveness fence must precede claim_sd; claim_sd arbitrates OWNERSHIP, not liveness, so it '
      + 'will hand the QF to a session whose process is gone',
    ).toBeLessThan(rpcIdx);
  });

  it('fails OPEN if the fence itself throws', () => {
    // A broken probe must not stop a legitimate worker from claiming. Pinned because the obvious
    // "fix" during an incident is to let the catch fall through to a refusal.
    const fenceIdx = src.indexOf('claimantLivenessFence(');
    const after = src.slice(fenceIdx, fenceIdx + 900);
    expect(after).toMatch(/catch/);
    expect(after).toMatch(/failing open|fail open/i);
  });
});

describe('FR-3 — scripts/create-quick-fix.js fences before its creator self-claim', () => {
  const src = read('scripts/create-quick-fix.js');

  it('calls the liveness fence', () => {
    expect(src).toContain('claimantLivenessFence');
  });

  it('calls it BEFORE the direct claiming_session_id update', () => {
    const fenceIdx = src.indexOf('claimantLivenessFence(');
    const writeIdx = src.indexOf('claiming_session_id: creatorSessionId');
    expect(fenceIdx).toBeGreaterThan(-1);
    expect(writeIdx, 'creator self-claim write not found').toBeGreaterThan(-1);
    expect(fenceIdx).toBeLessThan(writeIdx);
  });

  it('fails OPEN if the fence itself throws', () => {
    const fenceIdx = src.indexOf('claimantLivenessFence(');
    const after = src.slice(fenceIdx, fenceIdx + 900);
    expect(after).toMatch(/catch/);
    expect(after).toMatch(/failing open|fail open/i);
  });
});

describe('FR-3 — all three QF surfaces are accounted for', () => {
  it('names each surface and how it is covered, so a dropped one is visible', () => {
    // A checklist that fails if a surface loses its fence. The coverage TYPE differs per surface
    // and that is stated rather than hidden.
    const surfaces = [
      { file: 'lib/quick-fix-claim.mjs', coverage: 'behavioural (qf-lane suite)' },
      { file: 'scripts/qf-start.js', coverage: 'source-order (this suite)' },
      { file: 'scripts/create-quick-fix.js', coverage: 'source-order (this suite)' },
    ];
    for (const s of surfaces) {
      expect(read(s.file), `${s.file} lost its liveness fence — coverage was ${s.coverage}`)
        .toContain('claimantLivenessFence');
    }
  });
});
