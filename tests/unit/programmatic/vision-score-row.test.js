/**
 * Tests for the programmatic vision-scorer persist helpers.
 * QF-20260609-493 — the persist path must write a complete, constraint-valid row OR fail
 * explicitly; it must never silently emit empty / drop the score.
 */

import { describe, it, expect } from 'vitest';
import {
  THRESHOLD_ACTIONS,
  mapThresholdAction,
  extractScoreJson,
  buildVisionScoreRow,
} from '../../../lib/programmatic/vision-score-row.js';

describe('mapThresholdAction', () => {
  it('maps the programmatic rubric vocab onto the DB CHECK vocab', () => {
    expect(mapThresholdAction('proceed')).toBe('accept');
    expect(mapThresholdAction('minor_sd')).toBe('minor_sd');
    expect(mapThresholdAction('corrective_sd')).toBe('gap_closure_sd');
    expect(mapThresholdAction('block')).toBe('escalate');
  });

  it('passes through already-canonical values', () => {
    for (const a of THRESHOLD_ACTIONS) expect(mapThresholdAction(a)).toBe(a);
  });

  it('fails safe to escalate for unknown/undefined actions (never a constraint violation)', () => {
    expect(mapThresholdAction('nonsense')).toBe('escalate');
    expect(mapThresholdAction(undefined)).toBe('escalate');
    expect(THRESHOLD_ACTIONS).toContain(mapThresholdAction('whatever'));
  });
});

describe('extractScoreJson', () => {
  it('parses the JSON object embedded in a model message', () => {
    const text = 'Here is the score:\n```json\n{"total_score": 86, "action": "proceed"}\n```\nDone.';
    expect(extractScoreJson(text)).toEqual({ total_score: 86, action: 'proceed' });
  });

  it('returns null when no JSON object is present (the empty-fallback case)', () => {
    expect(extractScoreJson('Score persisted successfully. Nothing else to add.')).toBeNull();
    expect(extractScoreJson('')).toBeNull();
    expect(extractScoreJson(null)).toBeNull();
  });

  it('returns null on malformed JSON rather than throwing', () => {
    expect(extractScoreJson('{ total_score: 86, ')).toBeNull();
  });
});

describe('buildVisionScoreRow', () => {
  const base = {
    scoreData: { total_score: 86, action: 'proceed', dimension_scores: { innovation: 15 } },
    visionId: 'vision-uuid',
    archPlanId: 'arch-uuid',
    sdId: 'SD-LEO-INFRA-SIZE-TIER-AWARE-001',
  };

  it('supplies every NOT-NULL column that has no DB default', () => {
    const row = buildVisionScoreRow(base);
    // vision_id + rubric_snapshot were the columns the old model upsert omitted.
    for (const col of ['vision_id', 'total_score', 'dimension_scores', 'threshold_action', 'rubric_snapshot']) {
      expect(row[col]).toBeDefined();
      expect(row[col]).not.toBeNull();
    }
    expect(row.vision_id).toBe('vision-uuid');
    expect(row.sd_id).toBe(base.sdId);
    expect(row.total_score).toBe(86);
  });

  it('maps the action to a constraint-valid threshold_action', () => {
    expect(buildVisionScoreRow(base).threshold_action).toBe('accept');
    expect(THRESHOLD_ACTIONS).toContain(buildVisionScoreRow(base).threshold_action);
  });

  it('defaults arch_plan_id to null and dimension_scores to {} when absent', () => {
    const row = buildVisionScoreRow({ ...base, archPlanId: undefined, scoreData: { total_score: 50, action: 'block' } });
    expect(row.arch_plan_id).toBeNull();
    expect(row.dimension_scores).toEqual({});
    expect(row.threshold_action).toBe('escalate');
  });
});
