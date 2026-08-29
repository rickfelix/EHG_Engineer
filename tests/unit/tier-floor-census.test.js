import { describe, it, expect } from 'vitest';
import { KNOWN_SURFACES, sweep } from '../../scripts/tier-floor-census.mjs';

describe('tier-floor-census KNOWN_SURFACES', () => {
  it('records all 7 seeded enforcement/deferred surfaces plus writer/non-enforcing rows', () => {
    const files = KNOWN_SURFACES.map((s) => s.file);
    expect(files).toContain('lib/coordinator/dispatch.cjs');
    expect(files).toContain('lib/fleet/claim-eligibility.cjs');
    expect(files).toContain('lib/fleet/tier-claimable.cjs');
    expect(files).toContain('scripts/sd-start.js');
    expect(files).toContain('scripts/lib/claimable-leaves.mjs');
    expect(files).toContain('lib/checkin/steps/merged-pool-self-claim.cjs');
    expect(files).toContain('scripts/worker-checkin.cjs');
  });

  it('never reports two contradictory postures for the same file:line', () => {
    const seen = new Map();
    for (const s of KNOWN_SURFACES) {
      const key = `${s.file}:${s.line}`;
      expect(seen.has(key)).toBe(false);
      seen.set(key, s.posture);
    }
  });

  it('every row has a non-empty posture and note', () => {
    for (const s of KNOWN_SURFACES) {
      expect(s.posture).toBeTruthy();
      expect(s.note).toBeTruthy();
    }
  });
});

describe('sweep()', () => {
  it('finds real hits in the live repo, including known enforcing surfaces', () => {
    const hits = sweep(process.cwd());
    const files = new Set(hits.map((h) => h.file));
    expect(hits.length).toBeGreaterThan(0);
    expect(files.has('lib/coordinator/dispatch.cjs')).toBe(true);
    expect(files.has('lib/fleet/claim-eligibility.cjs')).toBe(true);
    // Confirms the SD's own measured claim: sd-start.js has ZERO tier-code hits pre-FR-2, and
    // claimable-leaves.mjs's deferral comment doesn't literally spell any of the swept tokens
    // (it says "tier axes"/"tier-FILTERED", not min_tier_rank/tier_rank/tierRank) -- both are
    // documented in the KNOWN_SURFACES table by file:line citation instead, not by sweep hit.
    expect(files.has('scripts/sd-start.js')).toBe(false);
  });

  it('excludes .worktrees and node_modules paths', () => {
    const hits = sweep(process.cwd());
    for (const h of hits) {
      expect(h.file.startsWith('.worktrees/')).toBe(false);
      expect(h.file.includes('node_modules/')).toBe(false);
    }
  });
});
