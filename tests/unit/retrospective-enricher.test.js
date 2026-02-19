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
} from '../../scripts/modules/handoff/retrospective-enricher.js';

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
