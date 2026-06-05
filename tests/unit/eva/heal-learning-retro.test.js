/**
 * SD-FDBK-ENH-COMPLETION-HEAL-LEARNING-001 — heal learning-capture durability.
 *
 * Deterministic tests for the pure builder (buildHealLearningRetro) and the rubric
 * estimator (estimateRetroQualityScore) extracted from captureHealLearnings. These
 * prove the heal-learning INCIDENT payload (a) omits the dead quality_score and the
 * status (caller inserts DRAFT then promotes), (b) is enriched from real heal-scorer
 * data so a representative multi-dimension failure legitimately clears the >=70
 * publish quality floor, and (c) a degenerate/thin payload scores <70 (so the writer
 * keeps it DRAFT rather than letting the publish-floor RAISE silently drop it).
 *
 * Maps to PRD FR-1/FR-2/FR-4 and test_scenarios TS-1/TS-2/TS-4.
 */
import { describe, it, expect } from 'vitest';
import { buildHealLearningRetro, estimateRetroQualityScore } from '../../../scripts/eva/heal-command.mjs';

const richFailing = { sdKey: 'SD-TEST-HEAL-001', scoreId: 'score-abc-123', score: 71, action: 'corrective' };
const richSdScore = {
  dimensions: [
    { id: 'key_changes_delivered', score: 60, reasoning: 'Two of the four stated key_changes are not present in the diff for this directive.' },
    { id: 'success_criteria_met', score: 70, reasoning: 'The success criteria reference an E2E flow that is not yet covered by any test.' },
    { id: 'success_metrics_achieved', score: 80, reasoning: 'The latency metric target is plausible but no measurement evidence was captured.' },
    { id: 'smoke_tests_pass', score: 95, reasoning: 'Smoke steps are concrete and would pass against the shipped behavior.' },
    { id: 'capabilities_present', score: 96, reasoning: 'The promised capability is wired and reachable from the documented entry point.' },
  ],
  gaps: ['No measurement evidence captured for the latency metric.'],
};
const ctx = { delta: null, sdUuid: '00000000-0000-0000-0000-000000000abc' };

describe('buildHealLearningRetro (pure payload builder)', () => {
  const row = buildHealLearningRetro(richFailing, richSdScore, ctx);

  it('returns an INCIDENT/SUB_THRESHOLD_SCORE retrospective payload with the canonical fields', () => {
    expect(row.retro_type).toBe('INCIDENT');
    expect(row.trigger_event).toBe('SUB_THRESHOLD_SCORE');
    expect(row.generated_by).toBe('SUB_AGENT');
    expect(row.learning_category).toBe('PROCESS_IMPROVEMENT');
    expect(row.sd_id).toBe(ctx.sdUuid);
    expect(row.title).toContain('SD-TEST-HEAL-001');
  });

  it('omits the dead quality_score and the status (caller inserts DRAFT then promotes)', () => {
    expect(row).not.toHaveProperty('quality_score');
    expect(row).not.toHaveProperty('status');
  });

  it('enriches arrays from real dimension data (one learning per dimension + counts for the rubric)', () => {
    // 5 dimensions -> 5 per-dimension learnings (+1 scorer gap) so key_learnings >= 5 (+30 tier)
    expect(row.key_learnings.length).toBeGreaterThanOrEqual(5);
    expect(row.what_went_well.length).toBeGreaterThanOrEqual(3);
    expect(row.action_items.length).toBeGreaterThanOrEqual(3);
    expect(row.what_needs_improvement.length).toBeGreaterThanOrEqual(3);
    // action_items are objects (the trigger requires non-empty action_items on publish)
    expect(typeof row.action_items[0]).toBe('object');
    expect(row.action_items[0]).toHaveProperty('action');
  });

  it('carries the dedup key and dimension scores in metadata', () => {
    expect(row.metadata.score_id).toBe('score-abc-123');
    expect(row.metadata.gap_count).toBe(3);
    expect(row.metadata.dimension_scores.key_changes_delivered).toBe(60);
    expect(row.metadata.dimension_scores.capabilities_present).toBe(96);
  });

  it('includes a numeric-specificity token that matches the rubric bonus regex', () => {
    const blob = JSON.stringify(row.what_went_well);
    expect(/[0-9]+ (lines?|files?|tests?|hours?|minutes?|LOC|components?)/.test(blob)).toBe(true);
  });
});

describe('estimateRetroQualityScore (mirrors the validate trigger rubric)', () => {
  it('scores a representative multi-dimension heal retro >= 70 (clears the publish floor)', () => {
    const row = buildHealLearningRetro(richFailing, richSdScore, ctx);
    expect(estimateRetroQualityScore(row)).toBeGreaterThanOrEqual(70);
  });

  it('scores a degenerate/thin payload < 70 (writer keeps it DRAFT, never dropped)', () => {
    // No dimensions and no gaps -> empty key_learnings, 2-item what_went_well, 0 improvements.
    const thin = buildHealLearningRetro(
      { sdKey: 'SD-TEST-HEAL-002', scoreId: 'score-thin', score: 40, action: 'corrective' },
      { dimensions: [], gaps: [] },
      { delta: null, sdUuid: '00000000-0000-0000-0000-0000000000ee' },
    );
    expect(estimateRetroQualityScore(thin)).toBeLessThan(70);
  });

  it('credits key_learnings>=5 + action_items>=3 + what_needs_improvement>=3 + specificity', () => {
    const row = buildHealLearningRetro(richFailing, richSdScore, ctx);
    // 0 (wpw 3-4 -> +10) ... at minimum 30 (kl) + 20 (ai) + 20 (wni) + 10 (spec) = 80 worst-case wpw=+0
    expect(estimateRetroQualityScore(row)).toBeGreaterThanOrEqual(80);
  });

  it('is deterministic and bounded to [0,100]', () => {
    const s = estimateRetroQualityScore(buildHealLearningRetro(richFailing, richSdScore, ctx));
    expect(s).toBe(estimateRetroQualityScore(buildHealLearningRetro(richFailing, richSdScore, ctx)));
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});
