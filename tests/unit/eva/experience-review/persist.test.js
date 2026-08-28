/**
 * SD-LEO-FEAT-STAGE-EXPERIENCE-DESIGN-001 (Unit B, FR-3/FR-4/FR-5).
 * Mock-supabase coverage for lib/eva/experience-review/persist.js.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildExperienceFindings,
  persistExperienceReview,
  RUN_MODES,
} from '../../../../lib/eva/experience-review/persist.js';

const VENTURE_ID = '00000000-0000-0000-0000-0000000000aa';

function makeMockSupabase() {
  const findings = new Map(); // venture_id|finding_hash -> row
  const runs = new Map(); // venture_id|run_id -> row
  const calls = [];

  return {
    _calls: calls,
    _findings: findings,
    _runs: runs,
    from(table) {
      if (table === 'venture_quality_findings') {
        return {
          upsert(payload) {
            calls.push({ table, payload });
            const key = `${payload.venture_id}|${payload.finding_hash}`;
            const id = findings.has(key) ? findings.get(key).id : `finding-${findings.size + 1}`;
            findings.set(key, { ...payload, id });
            return { select: () => ({ single: async () => ({ data: { id }, error: null }) }) };
          },
        };
      }
      if (table === 'venture_experience_review_runs') {
        return {
          upsert(payload) {
            calls.push({ table, payload });
            const key = `${payload.venture_id}|${payload.run_id}`;
            const id = runs.has(key) ? runs.get(key).id : `run-${runs.size + 1}`;
            runs.set(key, { ...payload, id });
            return { select: () => ({ single: async () => ({ data: { id }, error: null }) }) };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

const rawFinding = (over = {}) => ({
  category: 'usability', severity: 'medium', title: 'Confusing signup flow', detail: 'Step order not obvious to a first-time user',
  ...over,
});

describe('buildExperienceFindings', () => {
  it('maps raw findings to canonical FindingShape rows', () => {
    const rows = buildExperienceFindings([rawFinding()], { ventureId: VENTURE_ID });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      venture_id: VENTURE_ID, stage_number: 20, finding_category: 'usability', severity: 'medium',
    });
    expect(rows[0].finding_hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('rejects a category outside the experience-review set (scoped writer)', () => {
    expect(() => buildExperienceFindings([rawFinding({ category: 'lint' })], { ventureId: VENTURE_ID }))
      .toThrow(/is not one of the experience-review categories/);
  });

  it('rejects a missing ventureId', () => {
    expect(() => buildExperienceFindings([rawFinding()], {})).toThrow(/ventureId required/);
  });

  it('accepts all three experience categories', () => {
    const rows = buildExperienceFindings(
      ['usability', 'accessibility', 'journey_coherence'].map((category) => rawFinding({ category })),
      { ventureId: VENTURE_ID }
    );
    expect(rows.map((r) => r.finding_category)).toEqual(['usability', 'accessibility', 'journey_coherence']);
  });
});

describe('persistExperienceReview', () => {
  beforeEach(() => { process.env.LEO_FR_C_SYNC_GENERATION_ENABLED = 'off'; });
  afterEach(() => { delete process.env.LEO_FR_C_SYNC_GENERATION_ENABLED; });

  it('writes findings + a telemetry row for run_mode=in_traversal', async () => {
    const supabase = makeMockSupabase();
    const result = await persistExperienceReview({
      supabase, ventureId: VENTURE_ID, runId: 'run-1', runMode: 'in_traversal',
      rawFindings: [rawFinding({ category: 'usability' }), rawFinding({ category: 'accessibility', severity: 'critical' })],
      telemetry: { durationMs: 1200, costUsd: 0.04, deploymentUrl: 'https://altifyai.example' },
    });
    expect(result.findingsWritten).toBe(2);
    expect(result.findingsErrors).toEqual([]);

    const run = [...supabase._runs.values()][0];
    expect(run.run_mode).toBe('in_traversal');
    expect(run.findings_count_by_category).toEqual({ usability: 1, accessibility: 1 });
    expect(run.severity_breakdown).toEqual({ medium: 1, critical: 1 });
    expect(run.duration_ms).toBe(1200);
    expect(run.deployment_url).toBe('https://altifyai.example');
  });

  it('writes findings tagged run_mode=out_of_band_annex without touching in_traversal semantics', async () => {
    const supabase = makeMockSupabase();
    const result = await persistExperienceReview({
      supabase, ventureId: VENTURE_ID, runId: 'run-annex-1', runMode: 'out_of_band_annex',
      rawFindings: [rawFinding()],
    });
    expect(result.findingsErrors).toEqual([]);
    const run = [...supabase._runs.values()][0];
    expect(run.run_mode).toBe('out_of_band_annex');
  });

  it('rejects an invalid run_mode', async () => {
    const supabase = makeMockSupabase();
    await expect(persistExperienceReview({
      supabase, ventureId: VENTURE_ID, runId: 'run-x', runMode: 'live', rawFindings: [rawFinding()],
    })).rejects.toThrow(/runMode must be one of/);
  });

  it('is idempotent: re-running with the same run_id upserts, not duplicates', async () => {
    const supabase = makeMockSupabase();
    await persistExperienceReview({ supabase, ventureId: VENTURE_ID, runId: 'run-dup', runMode: 'in_traversal', rawFindings: [rawFinding()] });
    await persistExperienceReview({ supabase, ventureId: VENTURE_ID, runId: 'run-dup', runMode: 'in_traversal', rawFindings: [rawFinding()] });
    expect(supabase._runs.size).toBe(1);
  });

  it('RUN_MODES is exactly the two documented modes', () => {
    expect(RUN_MODES).toEqual(['in_traversal', 'out_of_band_annex']);
  });
});
