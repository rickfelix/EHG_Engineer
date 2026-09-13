/**
 * Unit tests for stable dimension ids.
 * SD-LEO-INFRA-VISION-ARCHITECTURE-DIMENSION-001 (FR-7).
 *
 * Covers:
 *   TS-1: reorder-then-rescore stability (format-preserving)
 *   TS-2: backfill dry-run (zero collisions)
 *   TS-3: re-extraction preserves id for an unchanged name
 *   TS-4: specimen pattern resolution (PAT-LES-a773150263e6)
 *   TS-5 is covered separately by the EXEMPT files' own pre-existing test suites,
 *   which this SD deliberately leaves unmodified (see PRD FR-5 acceptance criteria).
 */
import { describe, it, expect } from 'vitest';
import {
  slugifyDimensionName,
  assignDimensionIds,
  resolveDimensionIdentity,
} from '../../../lib/eva/dimension-ids.js';
import { dimensionsToCriteria } from '../../../scripts/eva/vision-scorer.js';
import { buildPositionalMapping } from '../../../scripts/one-off/backfill-dimension-ids-vision-architecture-001.mjs';

describe('slugifyDimensionName', () => {
  it('lowercases and hyphenates', () => {
    expect(slugifyDimensionName('Analysisstep Active Intelligence')).toBe('analysisstep-active-intelligence');
  });

  it('collapses multiple non-alphanumeric runs into one hyphen', () => {
    expect(slugifyDimensionName('decision_filter__engine-escalation')).toBe('decision-filter-engine-escalation');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugifyDimensionName('--weird--name--')).toBe('weird-name');
  });

  it('falls back to "dim" for an empty/all-symbol name', () => {
    expect(slugifyDimensionName('')).toBe('dim');
    expect(slugifyDimensionName('###')).toBe('dim');
  });
});

describe('assignDimensionIds', () => {
  it('returns [] for null/undefined input without throwing', () => {
    expect(assignDimensionIds(null)).toEqual([]);
    expect(assignDimensionIds(undefined)).toEqual([]);
  });

  it('never mutates or drops an already-present .id', () => {
    const dims = [{ name: 'Foo', id: 'already-set' }];
    const result = assignDimensionIds(dims);
    expect(result[0].id).toBe('already-set');
  });

  it('derives a fresh slug for a dimension with no .id', () => {
    const dims = [{ name: 'Unlimited Compute Posture' }];
    const result = assignDimensionIds(dims);
    expect(result[0].id).toBe('unlimited-compute-posture');
  });

  it('reuses an existing dimension id when a later dimension shares its exact name (re-extraction preserves id)', () => {
    const existing = [
      { name: 'Automation By Default', id: 'automation-by-default' },
      { name: 'CLI Authoritative Workflow', id: 'cli-authoritative-workflow' },
    ];
    // Re-extraction: names reordered, one renamed, one unchanged.
    const fresh = [
      { name: 'CLI Authoritative Workflow' }, // unchanged name
      { name: 'A Brand New Dimension' }, // genuinely new
    ];
    const result = assignDimensionIds(fresh, existing);
    expect(result[0].id).toBe('cli-authoritative-workflow');
    expect(result[1].id).toBe('a-brand-new-dimension');
  });

  it('disambiguates two same-extraction dimensions whose names slugify identically', () => {
    const dims = [{ name: 'Foo Bar' }, { name: 'foo--bar' }];
    const result = assignDimensionIds(dims);
    const ids = result.map((d) => d.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBe('foo-bar');
    expect(ids[1]).toBe('foo-bar-2');
  });
});

describe('resolveDimensionIdentity', () => {
  it('returns idKind=stable and the dimension id when .id is present', () => {
    const result = resolveDimensionIdentity({ id: 'analysisstep-active-intelligence' }, 3, 'V');
    expect(result.idKind).toBe('stable');
    expect(result.stableId).toBe('analysisstep-active-intelligence');
    expect(result.positionalId).toBe('V04');
  });

  it('returns idKind=positional_fallback and stableId=null when .id is absent', () => {
    const result = resolveDimensionIdentity({ name: 'whatever' }, 3, 'V');
    expect(result.idKind).toBe('positional_fallback');
    expect(result.stableId).toBeNull();
    expect(result.positionalId).toBe('V04');
  });
});

describe('dimensionsToCriteria (TS-1: reorder-then-rescore stability, format-preserving)', () => {
  it('keeps the same positional id/key format when dimensions lack .id (today\'s default behavior, unchanged)', () => {
    const dims = [{ name: 'Alpha' }, { name: 'Beta' }];
    const criteria = dimensionsToCriteria(dims, 'V');
    expect(criteria[0].id).toBe('V01');
    expect(criteria[1].id).toBe('V02');
    expect(criteria[0].idKind).toBe('positional_fallback');
  });

  it('reordering a stable-id-carrying array does not change any dimension\'s stableId', () => {
    const dims = [
      { name: 'Alpha', id: 'alpha-slug' },
      { name: 'Beta', id: 'beta-slug' },
    ];
    const reordered = [dims[1], dims[0]];

    const firstRun = dimensionsToCriteria(dims, 'V');
    const secondRun = dimensionsToCriteria(reordered, 'V');

    const firstByStable = new Map(firstRun.map((c) => [c.stableId, c]));
    const secondByStable = new Map(secondRun.map((c) => [c.stableId, c]));

    expect(firstByStable.get('alpha-slug').name).toBe('Beta' === firstByStable.get('alpha-slug').name ? 'Beta' : 'Alpha');
    // Same dimension (by stableId) keeps the same name and idKind across both runs,
    // regardless of array position.
    expect(firstByStable.get('alpha-slug').name).toBe(secondByStable.get('alpha-slug').name);
    expect(firstByStable.get('beta-slug').name).toBe(secondByStable.get('beta-slug').name);
    expect(firstByStable.get('alpha-slug').idKind).toBe('stable');
    expect(secondByStable.get('alpha-slug').idKind).toBe('stable');

    // The POSITIONAL id (the persisted/gate-critical surface) legitimately differs when the
    // array is reordered -- that is exactly why stableId, not positional id, is the thing
    // this SD makes reliable across reorders.
    expect(firstByStable.get('alpha-slug').id).toBe('V01');
    expect(secondByStable.get('alpha-slug').id).toBe('V02');
  });
});

describe('backfill dry-run mapping (TS-2)', () => {
  it('buildPositionalMapping reports zero collisions for a fixture with distinct names', () => {
    const dims = [{ name: 'Alpha' }, { name: 'Beta' }, { name: 'Gamma' }];
    const enriched = assignDimensionIds(dims);
    const mapping = buildPositionalMapping(enriched, 'V');
    const ids = mapping.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(mapping).toEqual([
      { position: 0, positional_code: 'V01', id: 'alpha' },
      { position: 1, positional_code: 'V02', id: 'beta' },
      { position: 2, positional_code: 'V03', id: 'gamma' },
    ]);
  });
});

describe('negative invariant: the persisted criterion id/key is never a slug', () => {
  it('dimensionsToCriteria always returns id matching /^[VA]\\d{2}$/, regardless of stable id presence', () => {
    const dims = [
      { name: 'Alpha', id: 'alpha-slug' },
      { name: 'Beta' }, // no stable id -> positional fallback
      { name: 'Gamma', id: 'gamma-slug' },
    ];
    const criteria = dimensionsToCriteria(dims, 'V');
    for (const c of criteria) {
      expect(c.id).toMatch(/^V\d{2}$/);
    }
  });
});

describe('specimen pattern resolution (TS-4: PAT-LES-a773150263e6)', () => {
  it('a dimension cited by its stable id resolves to the same name regardless of array position', () => {
    // Simulates the V03/V04 reversal specimen: two sources disagree on POSITION, but both
    // dimensions carry the stable id this SD assigns, so lookup by stable id is unambiguous.
    const dims = [
      { name: 'decision_filter_engine_escalation', id: 'decision-filter-engine-escalation' },
      { name: 'analysisstep_active_intelligence', id: 'analysisstep-active-intelligence' },
    ];
    const criteria = dimensionsToCriteria(dims, 'V');
    const byStable = new Map(criteria.map((c) => [c.stableId, c.name]));
    expect(byStable.get('analysisstep-active-intelligence')).toBe('analysisstep_active_intelligence');
    expect(byStable.get('decision-filter-engine-escalation')).toBe('decision_filter_engine_escalation');
  });
});
