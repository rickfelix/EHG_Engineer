import { describe, it, expect } from 'vitest';
import {
  filterPatternsForLearning,
  REJECT_REASONS,
} from '../../scripts/modules/learning/filter.mjs';

const baseline = (overrides = {}) => ({
  pattern_id: 'PAT-TEST-001',
  source: 'retrospective',
  assigned_sd_id: null,
  dedup_fingerprint: 'a1b2c3d4e5f6789012345678901234ab',
  metadata: {},
  severity_weight: 8,
  occurrence_count: 4,
  ...overrides,
});

describe('filterPatternsForLearning — happy path', () => {
  it('passes a high-signal retrospective pattern with no metadata flags', () => {
    const result = filterPatternsForLearning([baseline()]);
    expect(result.kept).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  it('passes feedback_cluster source patterns', () => {
    const result = filterPatternsForLearning([
      baseline({ source: 'feedback_cluster' }),
    ]);
    expect(result.kept).toHaveLength(1);
  });
});

describe('FR-1: source allow-list', () => {
  it("rejects source='manual' as LOW_SIGNAL_SOURCE", () => {
    const result = filterPatternsForLearning([baseline({ source: 'manual' })]);
    expect(result.kept).toHaveLength(0);
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.LOW_SIGNAL_SOURCE);
  });

  it("rejects unknown source values", () => {
    const result = filterPatternsForLearning([baseline({ source: 'something_else' })]);
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.LOW_SIGNAL_SOURCE);
  });

  it("rejects retrospective source when metadata.origin='auto_rca'", () => {
    const result = filterPatternsForLearning([
      baseline({ metadata: { origin: 'auto_rca' } }),
    ]);
    expect(result.kept).toHaveLength(0);
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.LOW_SIGNAL_SOURCE);
  });

  it('honors a custom allowSources option', () => {
    const result = filterPatternsForLearning(
      [baseline({ source: 'manual' })],
      { allowSources: ['manual'] }
    );
    expect(result.kept).toHaveLength(1);
  });
});

describe('FR-2: auto_captured + unreviewed', () => {
  it('rejects metadata.auto_captured=true AND metadata.human_reviewed=false', () => {
    const result = filterPatternsForLearning([
      baseline({ metadata: { auto_captured: true, human_reviewed: false } }),
    ]);
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.AUTO_CAPTURED_UNREVIEWED);
  });

  it('passes when metadata.auto_captured=true AND metadata.human_reviewed=true', () => {
    const result = filterPatternsForLearning([
      baseline({ metadata: { auto_captured: true, human_reviewed: true } }),
    ]);
    expect(result.kept).toHaveLength(1);
  });

  it('passes when metadata has no auto_captured key (backward-compat)', () => {
    const result = filterPatternsForLearning([
      baseline({ metadata: { unrelated: 'value' } }),
    ]);
    expect(result.kept).toHaveLength(1);
  });

  it('passes when metadata is null', () => {
    const result = filterPatternsForLearning([baseline({ metadata: null })]);
    expect(result.kept).toHaveLength(1);
  });
});

describe('FR-3: status-aware assigned_sd_id', () => {
  const sdId = '11111111-1111-1111-1111-111111111111';

  it('passes when assigned_sd_id IS NULL', () => {
    const result = filterPatternsForLearning([baseline({ assigned_sd_id: null })]);
    expect(result.kept).toHaveLength(1);
  });

  it("rejects when SD status='draft'", () => {
    const result = filterPatternsForLearning(
      [baseline({ assigned_sd_id: sdId })],
      { sdStatusMap: new Map([[sdId, 'draft']]) }
    );
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.ALREADY_ASSIGNED_OPEN_SD);
  });

  it.each([['planning'], ['executing'], ['completed'], ['pending_approval']])(
    "rejects when SD status='%s'",
    (status) => {
      const result = filterPatternsForLearning(
        [baseline({ assigned_sd_id: sdId })],
        { sdStatusMap: new Map([[sdId, status]]) }
      );
      expect(result.rejected[0].reason).toBe(
        REJECT_REASONS.ALREADY_ASSIGNED_OPEN_SD
      );
    }
  );

  it("PASSES when SD status='cancelled' (re-opens the pattern)", () => {
    const result = filterPatternsForLearning(
      [baseline({ assigned_sd_id: sdId })],
      { sdStatusMap: new Map([[sdId, 'cancelled']]) }
    );
    expect(result.kept).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  it('rejects when SD id is not in the status map (orphan reference)', () => {
    const result = filterPatternsForLearning(
      [baseline({ assigned_sd_id: sdId })],
      { sdStatusMap: new Map() }
    );
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.ALREADY_ASSIGNED_OPEN_SD);
  });
});

describe('FR-4: ghost-UUID fingerprint', () => {
  it("rejects fingerprint='fecb45e8-1234-5678-9abc-def012345678' (LEARN-131 replay)", () => {
    const result = filterPatternsForLearning([
      baseline({ dedup_fingerprint: 'fecb45e8-1234-5678-9abc-def012345678' }),
    ]);
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.UUID_FINGERPRINT);
  });

  it('passes 32-char md5 hash fingerprints (no hyphens)', () => {
    const result = filterPatternsForLearning([
      baseline({ dedup_fingerprint: 'a1b2c3d4e5f6789012345678901234ab' }),
    ]);
    expect(result.kept).toHaveLength(1);
  });

  it('passes when dedup_fingerprint IS NULL (legacy patterns)', () => {
    const result = filterPatternsForLearning([
      baseline({ dedup_fingerprint: null }),
    ]);
    expect(result.kept).toHaveLength(1);
  });

  it('regex is case-insensitive', () => {
    const result = filterPatternsForLearning([
      baseline({ dedup_fingerprint: 'FECB45E8-1234-5678-9ABC-DEF012345678' }),
    ]);
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.UUID_FINGERPRINT);
  });
});

describe('FR-6: bypass option', () => {
  it('returns input unchanged when bypass=true even if patterns would normally be rejected', () => {
    const noisy = baseline({ source: 'manual', dedup_fingerprint: 'fecb45e8-1234-5678-9abc-def012345678' });
    const result = filterPatternsForLearning([noisy], { bypass: true });
    expect(result.kept).toEqual([noisy]);
    expect(result.rejected).toHaveLength(0);
  });
});

describe('rejection ordering — first failing check wins', () => {
  it("source rejection (FR-1) wins over fingerprint rejection (FR-4)", () => {
    const result = filterPatternsForLearning([
      baseline({
        source: 'manual',
        dedup_fingerprint: 'fecb45e8-1234-5678-9abc-def012345678',
      }),
    ]);
    expect(result.rejected[0].reason).toBe(REJECT_REASONS.LOW_SIGNAL_SOURCE);
  });
});

describe('LEARN-128/130/131 historical replay', () => {
  it('filters all 3 patterns that previously produced cancelled LEARN-FIX SDs', () => {
    const fixture = [
      baseline({
        pattern_id: 'PAT-LEARN-130',
        source: 'retrospective',
        metadata: { origin: 'auto_rca' },
      }),
      baseline({
        pattern_id: 'PAT-LEARN-131',
        dedup_fingerprint: 'fecb45e8-1234-5678-9abc-def012345678',
      }),
      baseline({
        pattern_id: 'PAT-LEARN-128',
        assigned_sd_id: '22222222-2222-2222-2222-222222222222',
      }),
    ];
    const result = filterPatternsForLearning(fixture, {
      sdStatusMap: new Map([['22222222-2222-2222-2222-222222222222', 'completed']]),
    });
    expect(result.kept).toHaveLength(0);
    expect(result.rejected).toHaveLength(3);
    const reasons = result.rejected.map((r) => r.reason).sort();
    expect(reasons).toEqual([
      REJECT_REASONS.ALREADY_ASSIGNED_OPEN_SD,
      REJECT_REASONS.LOW_SIGNAL_SOURCE,
      REJECT_REASONS.UUID_FINGERPRINT,
    ]);
  });
});

describe('input validation', () => {
  it('throws TypeError when patterns is not an array', () => {
    expect(() => filterPatternsForLearning(null)).toThrow(TypeError);
    expect(() => filterPatternsForLearning('string')).toThrow(TypeError);
  });

  it('returns empty arrays for empty input', () => {
    const result = filterPatternsForLearning([]);
    expect(result.kept).toEqual([]);
    expect(result.rejected).toEqual([]);
  });
});
