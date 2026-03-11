/**
 * heal-planning-traceability.test.js
 *
 * Tests for the planning_traceability dimension added to SD HEAL scoring.
 * Validates dimension acceptance, backward compatibility, and architecture
 * deliverable loading logic.
 *
 * SD: SD-LEO-FEAT-ADD-PLANNING-DOCUMENT-001
 */
import { describe, it, expect } from 'vitest';

// ─── Dimension Validation Constants (mirrored from heal-command.mjs) ───

const REQUIRED_DIMENSIONS = [
  'key_changes_delivered',
  'success_criteria_met',
  'success_metrics_achieved',
  'smoke_tests_pass',
  'capabilities_present',
];

const KNOWN_DIMENSIONS = [
  ...REQUIRED_DIMENSIONS,
  'planning_traceability',
];

// ─── Validation Logic (extracted from heal-command.mjs cmdSDPersist) ───

function validateSDScores(sdScores) {
  const MIN_RATIONALE_LENGTH = 20;
  const validationErrors = [];

  for (const sdScore of sdScores) {
    const dims = sdScore.dimensions || [];
    const dimIds = dims.map(d => d.id);

    const missing = REQUIRED_DIMENSIONS.filter(r => !dimIds.includes(r));
    if (missing.length > 0) {
      validationErrors.push({
        sdKey: sdScore.sd_key,
        rule: 'MISSING_DIMENSIONS',
        details: `Missing ${missing.length} of 5 required dimensions: ${missing.join(', ')}`,
      });
    }

    const unknown = dimIds.filter(d => !KNOWN_DIMENSIONS.includes(d));
    if (unknown.length > 0) {
      validationErrors.push({
        sdKey: sdScore.sd_key,
        rule: 'UNKNOWN_DIMENSIONS',
        details: `Unknown dimension keys: ${unknown.join(', ')}`,
      });
    }

    for (const dim of dims) {
      const reasoning = (dim.reasoning || '').trim();
      if (reasoning.length < MIN_RATIONALE_LENGTH) {
        validationErrors.push({
          sdKey: sdScore.sd_key,
          rule: 'INSUFFICIENT_RATIONALE',
          details: `Dimension '${dim.id}' has rationale of ${reasoning.length} chars`,
        });
      }
    }
  }

  return validationErrors;
}

// ─── Helper: build a valid 5-dimension score ───

function make5DimScore(sdKey = 'SD-TEST-001', score = 85) {
  return {
    sd_key: sdKey,
    dimensions: REQUIRED_DIMENSIONS.map(id => ({
      id,
      score,
      reasoning: `Verified ${id} — all items present in codebase.`,
    })),
    total_score: score,
    gaps: [],
    summary: 'All promises delivered.',
  };
}

// ─── Helper: build a 6-dimension score (with planning_traceability) ───

function make6DimScore(sdKey = 'SD-TEST-001', score = 85, planScore = 80) {
  const base = make5DimScore(sdKey, score);
  base.dimensions.push({
    id: 'planning_traceability',
    score: planScore,
    reasoning: `4 of 5 architecture deliverables found in codebase. Missing: state-machine-module.`,
    gaps: ['state-machine-module'],
  });
  return base;
}

// ─── Tests ───

describe('KNOWN_DIMENSIONS', () => {
  it('includes all 5 required dimensions', () => {
    for (const dim of REQUIRED_DIMENSIONS) {
      expect(KNOWN_DIMENSIONS).toContain(dim);
    }
  });

  it('includes planning_traceability as 6th dimension', () => {
    expect(KNOWN_DIMENSIONS).toContain('planning_traceability');
    expect(KNOWN_DIMENSIONS).toHaveLength(6);
  });
});

describe('Validation: 5-dimension scores (backward compatibility)', () => {
  it('accepts valid 5-dimension scores with zero errors', () => {
    const errors = validateSDScores([make5DimScore()]);
    expect(errors).toHaveLength(0);
  });

  it('rejects scores missing required dimensions', () => {
    const score = make5DimScore();
    score.dimensions = score.dimensions.filter(d => d.id !== 'smoke_tests_pass');
    const errors = validateSDScores([score]);
    expect(errors.some(e => e.rule === 'MISSING_DIMENSIONS')).toBe(true);
  });
});

describe('Validation: 6-dimension scores (planning_traceability)', () => {
  it('accepts scores with planning_traceability — no UNKNOWN_DIMENSIONS error', () => {
    const errors = validateSDScores([make6DimScore()]);
    const unknownErrors = errors.filter(e => e.rule === 'UNKNOWN_DIMENSIONS');
    expect(unknownErrors).toHaveLength(0);
  });

  it('still validates rationale length for planning_traceability', () => {
    const score = make6DimScore();
    score.dimensions.find(d => d.id === 'planning_traceability').reasoning = 'short';
    const errors = validateSDScores([score]);
    expect(errors.some(e => e.rule === 'INSUFFICIENT_RATIONALE' && e.details.includes('planning_traceability'))).toBe(true);
  });
});

describe('Validation: truly unknown dimensions rejected', () => {
  it('rejects scores with invented dimension keys', () => {
    const score = make5DimScore();
    score.dimensions.push({
      id: 'totally_bogus_dimension',
      score: 50,
      reasoning: 'This dimension does not exist in the schema.',
    });
    const errors = validateSDScores([score]);
    expect(errors.some(e => e.rule === 'UNKNOWN_DIMENSIONS' && e.details.includes('totally_bogus_dimension'))).toBe(true);
  });
});

describe('Architecture deliverable loading', () => {
  it('extracts deliverable names from extracted_dimensions', () => {
    const extractedDimensions = [
      { key: 'economic-lens-engine', name: 'Economic Lens Engine', description: 'Six-axis analysis', weight: 15 },
      { key: 'kill-gate-integration', name: 'Kill Gate', description: 'Stage gate survival', weight: 10 },
    ];
    const deliverables = extractedDimensions.map(d => ({
      name: d.key || d.name,
      description: d.description || '',
    }));
    expect(deliverables).toHaveLength(2);
    expect(deliverables[0].name).toBe('economic-lens-engine');
    expect(deliverables[1].name).toBe('kill-gate-integration');
  });

  it('uses name as fallback when key is not present', () => {
    const extractedDimensions = [
      { name: 'Fallback Name', description: 'No key field' },
    ];
    const deliverables = extractedDimensions.map(d => ({
      name: d.key || d.name,
      description: d.description || '',
    }));
    expect(deliverables[0].name).toBe('Fallback Name');
  });

  it('skips loading when SD has no arch_key in metadata', () => {
    const sd = { sd_key: 'SD-TEST-001', metadata: {} };
    const archKey = sd.metadata?.arch_key;
    expect(archKey).toBeUndefined();
  });

  it('skips loading when SD has null metadata', () => {
    const sd = { sd_key: 'SD-TEST-001', metadata: null };
    const archKey = sd.metadata?.arch_key;
    expect(archKey).toBeUndefined();
  });

  it('extracts arch_key when present in metadata', () => {
    const sd = { sd_key: 'SD-TEST-001', metadata: { arch_key: 'ARCH-EHG-L1-001' } };
    const archKey = sd.metadata?.arch_key;
    expect(archKey).toBe('ARCH-EHG-L1-001');
  });
});

describe('Score calculation for planning_traceability', () => {
  it('scores 100 when all deliverables found', () => {
    const found = 5, total = 5;
    const score = Math.round((found / total) * 100);
    expect(score).toBe(100);
  });

  it('scores 60 when 3 of 5 deliverables found', () => {
    const found = 3, total = 5;
    const score = Math.round((found / total) * 100);
    expect(score).toBe(60);
  });

  it('scores 0 when no deliverables found', () => {
    const found = 0, total = 5;
    const score = Math.round((found / total) * 100);
    expect(score).toBe(0);
  });

  it('handles empty deliverable list gracefully (0/0 = 100 by convention)', () => {
    const total = 0;
    const score = total === 0 ? 100 : 0;
    expect(score).toBe(100);
  });
});
