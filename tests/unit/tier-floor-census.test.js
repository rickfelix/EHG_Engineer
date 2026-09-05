import { describe, it, expect } from 'vitest';
import { KNOWN_SURFACES, PARENT_LEAD_KNOWN_SURFACES, sweep } from '../../scripts/tier-floor-census.mjs';

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
    // SD-FDBK-INFRA-RETIRE-SEAT-TIER-001 (ratification 20dc072b) deleted enforceTierGate and its
    // tierBlocks() call from sd-start.js entirely -- zero tier-code hits remain, reverting to the
    // pre-FR-2 (SD-LEO-INFRA-TIER-FLOOR-PROVENANCE-001) baseline this file started from.
    expect(files.has('scripts/sd-start.js')).toBe(false);
    // claimable-leaves.mjs's deferral comment still doesn't literally spell any of the swept
    // tokens (it says "tier axes"/"tier-FILTERED", not min_tier_rank/tier_rank/tierRank) -- it
    // is documented in the KNOWN_SURFACES table by file:line citation instead, not by sweep hit.
  });

  it('excludes .worktrees and node_modules paths', () => {
    const hits = sweep(process.cwd());
    for (const h of hits) {
      expect(h.file.startsWith('.worktrees/')).toBe(false);
      expect(h.file.includes('node_modules/')).toBe(false);
    }
  });
});

// SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-F FR-1/FR-3(a): the parent-lead/dependency axis is a
// SEPARATE table from KNOWN_SURFACES on purpose -- mirrors the tier-axis roster-accuracy suite
// above, not merged into it, so the two axes' posture vocabularies never bleed into each other.
const PARENT_LEAD_PATTERN = 'parent_sd_id|parentLeadPending|parentLeadPendingVerdict';

describe('tier-floor-census PARENT_LEAD_KNOWN_SURFACES', () => {
  it('records all 9 confirmed-wired surfaces plus the 3 investigated candidates', () => {
    const files = PARENT_LEAD_KNOWN_SURFACES.map((s) => s.file);
    // The 9 confirmed-wired surfaces (PRD FR-1)
    expect(files).toContain('lib/fleet/claim-eligibility.cjs');
    expect(files).toContain('lib/fleet/belt-depth.cjs');
    expect(files).toContain('lib/fleet/belt-census.cjs');
    expect(files).toContain('lib/checkin/steps/merged-pool-self-claim.cjs');
    expect(files).toContain('scripts/worker-checkin.cjs');
    expect(files).toContain('scripts/lib/claimable-leaves.mjs');
    expect(files).toContain('scripts/lib/capacity-inputs.mjs');
    expect(files).toContain('scripts/coordinator-backlog-rank.mjs');
    expect(files).toContain('scripts/coordinator-self-review.mjs');
    // The 3 investigated candidates (PRD FR-2)
    expect(files).toContain('scripts/adam-quiet-tick.mjs');
    expect(files).toContain('lib/claim/queue-resolver.cjs');
    expect(files).toContain('lib/coordinator/detectors.cjs');
    expect(PARENT_LEAD_KNOWN_SURFACES.length).toBe(12);
  });

  it('never reports two contradictory postures for the same file:line', () => {
    const seen = new Map();
    for (const s of PARENT_LEAD_KNOWN_SURFACES) {
      const key = `${s.file}:${s.line}`;
      expect(seen.has(key)).toBe(false);
      seen.set(key, s.posture);
    }
  });

  it('every row has a non-empty posture and note', () => {
    for (const s of PARENT_LEAD_KNOWN_SURFACES) {
      expect(s.posture).toBeTruthy();
      expect(s.note).toBeTruthy();
    }
  });

  it('the queue-resolver.cjs candidate carries a decided posture, not a placeholder "unresolved" left for later', () => {
    const row = PARENT_LEAD_KNOWN_SURFACES.find((s) => s.file === 'lib/claim/queue-resolver.cjs');
    expect(row).toBeTruthy();
    expect(row.posture.toLowerCase()).not.toBe('unresolved');
    expect(row.note).toMatch(/DECISION/);
  });
});

describe('sweep() parent-lead axis (parameterized pattern)', () => {
  it('finds real hits in the live repo, including all 9 confirmed-wired surfaces', () => {
    const hits = sweep(process.cwd(), PARENT_LEAD_PATTERN);
    const files = new Set(hits.map((h) => h.file));
    expect(hits.length).toBeGreaterThan(0);
    expect(files.has('lib/fleet/claim-eligibility.cjs')).toBe(true);
    expect(files.has('lib/fleet/belt-depth.cjs')).toBe(true);
    expect(files.has('lib/fleet/belt-census.cjs')).toBe(true);
    expect(files.has('lib/checkin/steps/merged-pool-self-claim.cjs')).toBe(true);
    expect(files.has('scripts/worker-checkin.cjs')).toBe(true);
    expect(files.has('scripts/lib/claimable-leaves.mjs')).toBe(true);
    expect(files.has('scripts/lib/capacity-inputs.mjs')).toBe(true);
    // coordinator-backlog-rank.mjs's :37 header comment literally names "parentLeadPending" (as
    // one of the predicates it reuses) even though no call site in the file invokes it -- so it
    // DOES appear in the literal sweep; its KNOWN_SURFACES row still records it as transitive.
    expect(files.has('scripts/coordinator-backlog-rank.mjs')).toBe(true);
    // coordinator-self-review.mjs never spells any of the three tokens anywhere -- confirmed
    // absent from the literal sweep (see its transitive note in PARENT_LEAD_KNOWN_SURFACES).
    expect(files.has('scripts/coordinator-self-review.mjs')).toBe(false);
    // queue-resolver.cjs and detectors.cjs DO contain the literal token (parent_sd_id) even
    // though neither calls the shared predicate -- that is exactly why FR-2 required recording
    // them explicitly instead of leaving them to surface as unexplained "unrecognized" hits.
    expect(files.has('lib/claim/queue-resolver.cjs')).toBe(true);
    expect(files.has('lib/coordinator/detectors.cjs')).toBe(true);
    // adam-quiet-tick.mjs's checkIdleBesideClaimable never references the literal token, but the
    // file DOES surface via an unrelated call site (fetchInFlightItems's `.is('parent_sd_id',
    // null)` population filter) -- see the row's note for why that is a different, out-of-scope
    // concern rather than a second parent-lead-pending consumer.
    expect(files.has('scripts/adam-quiet-tick.mjs')).toBe(true);
  });

  it('default pattern argument still behaves exactly as the tier-axis sweep (backward compatible)', () => {
    const defaultHits = sweep(process.cwd());
    const explicitTierHits = sweep(process.cwd(), 'min_tier_rank|tier_rank|tierRank');
    expect(defaultHits).toEqual(explicitTierHits);
  });
});
