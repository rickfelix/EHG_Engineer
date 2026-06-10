/**
 * Unit tests for the self-describing artifact-gap helper.
 * SD-LEO-INFRA-STAGE-CONTRACT-REGISTRY-001 FR-5.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  levenshtein,
  nearestMatch,
  describeArtifactGap,
} from '../../../lib/eva/contracts/describe-artifact-gap.js';

function mockSupabaseRows(rows, error = null) {
  const result = Promise.resolve({ data: rows, error });
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    then: (...args) => result.then(...args),
  };
  return { from: vi.fn(() => builder) };
}

const silentLogger = { warn: vi.fn(), log: vi.fn(), error: vi.fn() };

describe('nearestMatch', () => {
  it('resolves a deprecated alias to its canonical replacement FIRST (alias hit beats string distance)', () => {
    const m = nearestMatch('launch_marketing_checklist', ['launch_readiness_checklist', 'launch_test_plan']);
    expect(m).toEqual({ match: 'launch_readiness_checklist', kind: 'renamed_to', distance: 0 });
  });

  it('resolves OLD_TO_NEW_MAP legacy keys', () => {
    const m = nearestMatch('uat_report', ['launch_uat_report']);
    expect(m).toEqual({ match: 'launch_uat_report', kind: 'renamed_to', distance: 0 });
  });

  it('detects renamed_from: a candidate that is the legacy name of the required type', () => {
    const m = nearestMatch('launch_readiness_checklist', ['launch_marketing_checklist']);
    expect(m).toEqual({ match: 'launch_marketing_checklist', kind: 'renamed_from', distance: 0 });
  });

  it('falls back to Levenshtein nearest', () => {
    const m = nearestMatch('marketing_taglin', ['marketing_tagline', 'marketing_seo_meta']);
    expect(m.kind).toBe('levenshtein');
    expect(m.match).toBe('marketing_tagline');
    expect(m.distance).toBe(1);
  });

  it('returns null for empty inputs', () => {
    expect(nearestMatch('x', [])).toBeNull();
    expect(nearestMatch('', ['a'])).toBeNull();
  });

  it('levenshtein basics', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('abc', 'axc')).toBe(1);
  });
});

describe('describeArtifactGap', () => {
  it('reports the venture actual types at the failing stage + rename-aware nearest match', async () => {
    const supabase = mockSupabaseRows([
      { artifact_type: 'launch_readiness_checklist', lifecycle_stage: 23 },
      { artifact_type: 'system_devils_advocate_review', lifecycle_stage: 23 },
      { artifact_type: 'marketing_tagline', lifecycle_stage: 18 },
    ]);

    const gap = await describeArtifactGap({
      supabase, ventureId: 'v-1', stage: 23,
      requiredTypes: ['launch_uat_report'],
      logger: silentLogger,
    });

    expect(gap.degraded).toBe(false);
    expect(gap.required).toEqual(['launch_uat_report']);
    expect(gap.actual_at_stage).toEqual(['launch_readiness_checklist', 'system_devils_advocate_review']);
    expect(gap.actual_by_stage['18']).toEqual(['marketing_tagline']);
    expect(gap.matches[0].required).toBe('launch_uat_report');
    expect(gap.matches[0].match).toBeTruthy();
    expect(gap.rendered).toContain('required at stage 23: launch_uat_report');
    expect(gap.rendered).toContain('venture has at stage 23: launch_readiness_checklist');
    expect(gap.rendered).toContain('artifact stages present: 18(1), 23(2)');
  });

  it('reports an alias hit as a RENAME, naming the stale requirement source', async () => {
    const supabase = mockSupabaseRows([
      { artifact_type: 'launch_readiness_checklist', lifecycle_stage: 23 },
    ]);

    const gap = await describeArtifactGap({
      supabase, ventureId: 'v-1', stage: 25,
      requiredTypes: ['launch_marketing_checklist'],
      logger: silentLogger,
    });

    expect(gap.matches[0]).toMatchObject({
      required: 'launch_marketing_checklist',
      match: 'launch_readiness_checklist',
      kind: 'renamed_to',
    });
    expect(gap.rendered).toContain("RENAMED to 'launch_readiness_checklist'");
    expect(gap.rendered).toContain('venture has NO current artifacts at stage 25');
  });

  it('handles an empty venture (no artifacts at all)', async () => {
    const supabase = mockSupabaseRows([]);
    const gap = await describeArtifactGap({
      supabase, ventureId: 'v-1', stage: 21,
      requiredTypes: ['distribution_channel_config'],
      logger: silentLogger,
    });
    expect(gap.actual_at_stage).toEqual([]);
    expect(gap.actual_by_stage).toEqual({});
    // Canonical registry still feeds nearest-match even with zero venture rows.
    expect(gap.matches[0].match).toBeTruthy();
    expect(gap.rendered).toContain('venture has NO current artifacts at stage 21');
  });

  it('filters resource-style requirements (venture_resources.deployment_url) out of artifact diffs', async () => {
    const supabase = mockSupabaseRows([]);
    const gap = await describeArtifactGap({
      supabase, ventureId: 'v-1', stage: 22,
      requiredTypes: ['venture_resources.deployment_url', 'visual_device_screenshots'],
      logger: silentLogger,
    });
    expect(gap.required).toEqual(['visual_device_screenshots']);
  });

  it('degrades gracefully (no throw) on DB error', async () => {
    const supabase = mockSupabaseRows(null, new Error('boom'));
    const gap = await describeArtifactGap({
      supabase, ventureId: 'v-1', stage: 22,
      requiredTypes: ['visual_device_screenshots'],
      logger: silentLogger,
    });
    expect(gap.degraded).toBe(true);
    expect(gap.rendered).toContain('lookup degraded');
    expect(silentLogger.warn).toHaveBeenCalled();
  });

  it('degrades gracefully when supabase/ventureId missing', async () => {
    const gap = await describeArtifactGap({
      supabase: null, ventureId: null, stage: 1,
      requiredTypes: ['truth_idea_brief'],
      logger: silentLogger,
    });
    expect(gap.degraded).toBe(true);
    expect(gap.rendered).toContain('required at stage 1: truth_idea_brief');
  });
});
