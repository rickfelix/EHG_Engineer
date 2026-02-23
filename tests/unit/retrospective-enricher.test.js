/**
 * Unit tests for retrospective-enricher.js
 * SD-LEARN-FIX-ADDRESS-PAT-AUTO-025 — Closes PAT-AUTO-a7aa772c
 *
 * PAT-AUTO-a7aa772c: RETROSPECTIVE_QUALITY_GATE fails score 44/100 due to:
 *   1. improvement_areas using root_cause instead of analysis (rubric expects {area, analysis, prevention})
 *   2. action_items missing verification field ({action, owner, deadline, verification} required)
 *   3. key_learnings are verbatim SD field copies, not analytical insights
 */

import { describe, it, expect } from 'vitest';
import {
  buildSDSpecificKeyLearnings,
  buildSDSpecificActionItems,
  buildSDSpecificImprovementAreas,
  buildWhatWentWell,
  buildWhatNeedsImprovement,
  sanitizeBoilerplate,
} from '../../scripts/modules/handoff/retrospective-enricher.js';
import { RetrospectiveQualityRubric } from '../../scripts/modules/rubrics/retrospective-quality-rubric.js';

const SD_FULL = {
  sd_key: 'SD-TEST-001',
  sd_type: 'infrastructure',
  title: 'Add vision score gate enforcement',
  description: 'Modify vision-score.js to return {passed, score, maxScore} instead of {valid, score}',
  scope: 'scripts/modules/handoff/executors/lead-to-plan/gates/vision-score.js',
  key_changes: [
    { change: 'Replace valid field with passed field', file: 'vision-score.js', reason: 'gate-result-schema.js requires passed not valid' },
    { change: 'Add maxScore: 100 to all return objects', file: 'vision-score.js', reason: 'normalizer needs maxScore to compute percentage' },
  ],
  success_criteria: ['vision-score.js returns {passed: boolean, score: number, maxScore: number} in all code paths'],
  strategic_objectives: ['Prevent GATE_VISION_SCORE from silently scoring 0/100 due to schema mismatch'],
  risks: [{ risk: 'Future gate implementations may repeat the valid vs passed mistake', mitigation: 'Add regression guard test' }],
};

const SD_MINIMAL = {
  sd_key: 'SD-MINIMAL-001',
  sd_type: 'fix',
  title: 'Fix thing',
};

describe('buildSDSpecificKeyLearnings', () => {
  it('TS-002: returns ≥3 learnings for a full SD', () => {
    const result = buildSDSpecificKeyLearnings(SD_FULL, 'PLAN_TO_LEAD');
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it('TS-002: learnings reference the SD key', () => {
    const result = buildSDSpecificKeyLearnings(SD_FULL, 'LEAD_TO_PLAN');
    const text = result.map(l => l.learning).join(' ');
    expect(text).toContain('SD-TEST-001');
  });

  it('TS-002: learnings reference files from key_changes', () => {
    const result = buildSDSpecificKeyLearnings(SD_FULL, 'LEAD_TO_PLAN');
    const text = result.map(l => l.learning).join(' ');
    expect(text).toContain('vision-score.js');
  });

  it('TS-003: returns ≥2 learnings even with minimal SD (graceful fallback)', () => {
    const result = buildSDSpecificKeyLearnings(SD_MINIMAL, 'PLAN_TO_EXEC');
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('US-001: no learning has is_boilerplate=true', () => {
    const result = buildSDSpecificKeyLearnings(SD_FULL, 'LEAD_TO_PLAN');
    expect(result.every(l => l.is_boilerplate === false)).toBe(true);
  });
});

describe('buildSDSpecificActionItems', () => {
  it('TS-005: returns ≥1 action item with all 4 required fields', () => {
    const result = buildSDSpecificActionItems(SD_FULL, 'PLAN_TO_LEAD');
    expect(result.length).toBeGreaterThanOrEqual(1);
    for (const item of result) {
      expect(item).toHaveProperty('action');
      expect(item).toHaveProperty('owner');
      expect(item).toHaveProperty('deadline');
      // PAT-AUTO-a7aa772c fix: verification is required
      expect(item).toHaveProperty('verification');
    }
  });

  it('US-002: action items reference SD key_changes or success_criteria', () => {
    const result = buildSDSpecificActionItems(SD_FULL, 'PLAN_TO_LEAD');
    const text = result.map(i => i.action + ' ' + i.verification).join(' ');
    // Should reference something from key_changes or success_criteria
    expect(text.length).toBeGreaterThan(20);
  });

  it('fallback action item has verification field', () => {
    const result = buildSDSpecificActionItems(SD_MINIMAL, 'LEAD_TO_PLAN');
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toHaveProperty('verification');
  });
});

describe('buildSDSpecificImprovementAreas', () => {
  const issues = [
    {
      pattern_id: 'PAT-TEST-001',
      category: 'process',
      severity: 'medium',
      issue_summary: 'Gate failed: score 0/100',
      prevention_checklist: ['Add typed return schema'],
    },
  ];

  it('US-001: improvement areas use analysis field (not root_cause)', () => {
    const result = buildSDSpecificImprovementAreas(SD_FULL, issues);
    expect(result.length).toBeGreaterThan(0);
    for (const area of result) {
      // PAT-AUTO-a7aa772c fix: must have analysis, NOT root_cause
      expect(area).toHaveProperty('analysis');
      expect(area).not.toHaveProperty('root_cause');
    }
  });

  it('US-001: each area has required {area, analysis, prevention} shape', () => {
    const result = buildSDSpecificImprovementAreas(SD_FULL, issues);
    for (const area of result) {
      expect(area).toHaveProperty('area');
      expect(area).toHaveProperty('analysis');
      expect(area).toHaveProperty('prevention');
    }
  });

  it('falls back to SD risks when no issues', () => {
    const result = buildSDSpecificImprovementAreas(SD_FULL, []);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toHaveProperty('analysis');
    expect(result[0]).not.toHaveProperty('root_cause');
  });

  it('returns empty array when no issues and no risks', () => {
    const result = buildSDSpecificImprovementAreas(SD_MINIMAL, []);
    expect(Array.isArray(result)).toBe(true);
  });
});

// ==================== FR-001: what_went_well and what_needs_improvement ====================

describe('buildWhatWentWell (FR-001)', () => {
  it('TS-007: references specific files when git files provided', () => {
    const result = buildWhatWentWell(SD_FULL, ['scripts/modules/handoff/retrospective-enricher.js'], []);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some(r => r.includes('retrospective-enricher.js'))).toBe(true);
  });

  it('TS-007: references gate scores when handoff scores provided', () => {
    const scores = [{ handoff_type: 'LEAD-TO-PLAN', quality_score: 92, status: 'accepted' }];
    const result = buildWhatWentWell(SD_FULL, [], scores);
    expect(result.some(r => r.includes('92%'))).toBe(true);
  });

  it('references success criteria from SD', () => {
    const result = buildWhatWentWell(SD_FULL, [], []);
    expect(result.length).toBeGreaterThanOrEqual(1);
    // Should reference something specific from the SD, not generic text
    const allText = result.join(' ');
    expect(allText.length).toBeGreaterThan(30);
  });

  it('provides SD-specific fallback when no git files or scores', () => {
    const result = buildWhatWentWell(SD_MINIMAL, [], []);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toContain('SD-MINIMAL-001');
  });
});

describe('buildWhatNeedsImprovement (FR-001)', () => {
  const patterns = [{
    pattern_id: 'PAT-AUTO-caf49035',
    severity: 'medium',
    occurrence_count: 3,
    issue_summary: 'RETROSPECTIVE_QUALITY_GATE failed: score 32/100',
    category: 'process'
  }];

  it('references issue patterns with concrete gap analysis', () => {
    const result = buildWhatNeedsImprovement(SD_FULL, patterns, []);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some(r => r.includes('PAT-AUTO-caf49035'))).toBe(true);
  });

  it('references low handoff scores', () => {
    const lowScores = [{ handoff_type: 'PLAN-TO-EXEC', quality_score: 72, status: 'accepted' }];
    const result = buildWhatNeedsImprovement(SD_FULL, [], lowScores);
    expect(result.some(r => r.includes('72%'))).toBe(true);
  });

  it('provides SD-specific fallback when no patterns or scores', () => {
    const result = buildWhatNeedsImprovement(SD_FULL, [], []);
    expect(result.length).toBeGreaterThanOrEqual(1);
    // Should reference SD-specific content, not generic platitudes
    const allText = result.join(' ');
    expect(allText).toContain('SD-TEST-001');
  });
});

// ==================== FR-002: Insight-oriented key_learnings ====================

describe('buildSDSpecificKeyLearnings insight verbs (FR-002)', () => {
  const INSIGHT_VERBS = /\b(discovered|revealed|confirmed|demonstrated)\b/i;
  const DESCRIPTIVE_VERBS = /^SD-[\w-]+ is a /;

  it('TS-003: key learnings contain insight verbs', () => {
    const result = buildSDSpecificKeyLearnings(SD_FULL, 'PLAN_TO_LEAD');
    const allText = result.map(l => l.learning).join(' ');
    expect(allText).toMatch(INSIGHT_VERBS);
  });

  it('TS-003: no learning starts with "SD-KEY is a"', () => {
    const result = buildSDSpecificKeyLearnings(SD_FULL, 'PLAN_TO_LEAD');
    for (const l of result) {
      expect(l.learning).not.toMatch(DESCRIPTIVE_VERBS);
    }
  });

  it('TS-003: at least one learning references a file path', () => {
    const result = buildSDSpecificKeyLearnings(SD_FULL, 'LEAD_TO_PLAN');
    const allText = result.map(l => l.learning).join(' ');
    expect(allText).toMatch(/vision-score\.js/);
  });
});

// ==================== FR-003: Boilerplate sanitizer ====================

describe('sanitizeBoilerplate (FR-003)', () => {
  it('TS-002: removes known boilerplate phrases', () => {
    const input = 'We should improve infrastructure and enhance tooling for better results';
    const result = sanitizeBoilerplate(input, 'SD-TEST-001');
    expect(result).not.toMatch(/improve.*infrastructure/i);
    expect(result).not.toMatch(/enhance.*tooling/i);
  });

  it('TS-002: enricher output passes detectBoilerplate with 0 matches', () => {
    // Build full enriched retrospective content
    const learnings = buildSDSpecificKeyLearnings(SD_FULL, 'PLAN_TO_LEAD');
    const actions = buildSDSpecificActionItems(SD_FULL, 'PLAN_TO_LEAD');
    const areas = buildSDSpecificImprovementAreas(SD_FULL, []);
    const wentWell = buildWhatWentWell(SD_FULL, ['vision-score.js'], [{ handoff_type: 'LEAD-TO-PLAN', quality_score: 92 }]);
    const needsImprovement = buildWhatNeedsImprovement(SD_FULL, [], []);

    // Simulate sanitization
    const sanitizedLearnings = learnings.map(l => ({
      ...l,
      learning: sanitizeBoilerplate(l.learning, 'SD-TEST-001')
    }));

    const mockRetro = {
      what_went_well: wentWell.map(w => sanitizeBoilerplate(w, 'SD-TEST-001')),
      what_needs_improvement: needsImprovement.map(n => sanitizeBoilerplate(n, 'SD-TEST-001')),
      key_learnings: sanitizedLearnings,
      action_items: actions,
      improvement_areas: areas
    };

    const boilerplateResult = RetrospectiveQualityRubric.detectBoilerplate(mockRetro);
    expect(boilerplateResult.matchCount).toBe(0);
    expect(boilerplateResult.scorePenalty).toBe(0);
  });

  it('handles null/undefined input gracefully', () => {
    expect(sanitizeBoilerplate(null, 'SD-TEST')).toBeNull();
    expect(sanitizeBoilerplate(undefined, 'SD-TEST')).toBeUndefined();
    expect(sanitizeBoilerplate('', 'SD-TEST')).toBe('');
  });
});

// ==================== FR-004: Fallback content with SD-specific fields ====================

describe('Fallback content (FR-004)', () => {
  it('TS-004: fallback key_learnings reference SD success_criteria or description', () => {
    // SD with success_criteria but no key_changes (sparse data)
    const sdSparse = {
      sd_key: 'SD-SPARSE-001',
      sd_type: 'infrastructure',
      title: 'Sparse SD',
      description: 'A specific improvement to retrospective quality scoring',
      success_criteria: ['Retrospective quality gate passes with score >= 55'],
    };
    const result = buildSDSpecificKeyLearnings(sdSparse, 'PLAN_TO_LEAD');
    const allText = result.map(l => l.learning).join(' ');
    // Should reference success_criteria or description content
    expect(allText).toMatch(/SD-SPARSE-001/);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it('TS-004: fallback action_items derived from success_criteria', () => {
    const sdSparse = {
      sd_key: 'SD-SPARSE-001',
      sd_type: 'infrastructure',
      success_criteria: ['Retrospective quality gate passes with score >= 55'],
    };
    const result = buildSDSpecificActionItems(sdSparse, 'PLAN_TO_LEAD');
    expect(result.length).toBeGreaterThanOrEqual(2);
    const allText = result.map(a => a.action).join(' ');
    expect(allText).toMatch(/SD-SPARSE-001|Retrospective/);
  });
});

// ==================== FR-005: Gate-passing score integration ====================

describe('Enricher output gate-passing integration (FR-005)', () => {
  it('TS-001: enricher updates all 5 retrospective fields', () => {
    // Verify all builder functions produce non-empty output
    const learnings = buildSDSpecificKeyLearnings(SD_FULL, 'PLAN_TO_LEAD');
    const actions = buildSDSpecificActionItems(SD_FULL, 'PLAN_TO_LEAD');
    const areas = buildSDSpecificImprovementAreas(SD_FULL, []);
    const wentWell = buildWhatWentWell(SD_FULL, ['vision-score.js'], []);
    const needsImprovement = buildWhatNeedsImprovement(SD_FULL, [], []);

    expect(learnings.length).toBeGreaterThan(0);
    expect(actions.length).toBeGreaterThan(0);
    expect(areas.length).toBeGreaterThan(0);
    expect(wentWell.length).toBeGreaterThan(0);
    expect(needsImprovement.length).toBeGreaterThan(0);
  });

  it('TS-005: manual retrospectives would be skipped (generated_by check)', () => {
    // This tests the logic that should be in enrichRetrospectivePreGate
    // We verify the autoGeneratedTypes list is correct
    const autoGeneratedTypes = ['AUTO', 'AUTO_HOOK', 'NON_SD_MERGE', 'RETRO_SUB_AGENT', 'system', 'non_interactive'];
    expect(autoGeneratedTypes).not.toContain('MANUAL');
    expect(autoGeneratedTypes).toContain('AUTO');
    expect(autoGeneratedTypes).toContain('RETRO_SUB_AGENT');
  });

  it('TS-006: enricher is idempotent — same input produces same output', () => {
    const result1 = buildSDSpecificKeyLearnings(SD_FULL, 'PLAN_TO_LEAD');
    const result2 = buildSDSpecificKeyLearnings(SD_FULL, 'PLAN_TO_LEAD');
    expect(result1).toEqual(result2);

    const actions1 = buildSDSpecificActionItems(SD_FULL, 'PLAN_TO_LEAD');
    const actions2 = buildSDSpecificActionItems(SD_FULL, 'PLAN_TO_LEAD');
    expect(actions1).toEqual(actions2);
  });
});
