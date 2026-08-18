/**
 * SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-A — health-status correction script coverage.
 * See scripts/venture-provisioning/correct-altifyai-health-status.mjs.
 */
import { describe, it, expect } from 'vitest';
import { correctHealthStatus } from '../../../scripts/venture-provisioning/correct-altifyai-health-status.mjs';

function fakeSupabase({
  ventureUpdateRows = [{ id: 'v1', health_status: 'warning' }],
  ventureUpdateError = null,
  artifact = { id: 'artifact-1', artifact_data: { some: 'prior-field' } },
  artifactReadError = null,
  artifactUpdateRows = [{ id: 'artifact-1' }],
  artifactUpdateError = null,
} = {}) {
  const calls = [];
  const supabase = {
    from: (table) => {
      if (table === 'ventures') {
        return {
          update: (payload) => {
            calls.push({ table, op: 'update', payload });
            return { eq: () => ({ select: () => Promise.resolve({ data: ventureUpdateError ? null : ventureUpdateRows, error: ventureUpdateError }) }) };
          },
        };
      }
      if (table === 'venture_artifacts') {
        return {
          select: () => {
            const chain = {
              eq: (col, val) => { calls.push({ table, op: 'select-eq', col, val }); return chain; },
              single: () => Promise.resolve({ data: artifact, error: artifactReadError }),
            };
            return chain;
          },
          update: (payload) => {
            calls.push({ table, op: 'update', payload });
            return { eq: () => ({ select: () => Promise.resolve({ data: artifactUpdateError ? null : artifactUpdateRows, error: artifactUpdateError }) }) };
          },
        };
      }
      throw new Error('unexpected table ' + table);
    },
  };
  return { supabase, calls };
}

describe('correctHealthStatus', () => {
  it('corrects ventures.health_status to warning and annotates the current artifact on success', async () => {
    const { supabase, calls } = fakeSupabase();
    const result = await correctHealthStatus({ supabase, now: () => '2026-08-17T20:00:00Z' });

    expect(result).toEqual({ ok: true, artifactId: 'artifact-1' });
    const ventureUpdate = calls.find((c) => c.table === 'ventures' && c.op === 'update');
    expect(ventureUpdate.payload).toEqual({ health_status: 'warning' });
  });

  it('preserves prior artifact_data fields and adds health_status_correction with the from/to values', async () => {
    const { supabase, calls } = fakeSupabase({ artifact: { id: 'artifact-1', artifact_data: { decisionPoints: ['x'] } } });
    await correctHealthStatus({ supabase, now: () => '2026-08-17T20:00:00Z' });

    const artifactUpdate = calls.find((c) => c.table === 'venture_artifacts' && c.op === 'update');
    expect(artifactUpdate.payload.artifact_data.decisionPoints).toEqual(['x']);
    expect(artifactUpdate.payload.artifact_data.health_status_correction).toMatchObject({
      from: 'healthy',
      to: 'warning',
      corrected_at: '2026-08-17T20:00:00Z',
      known_defect_ref: 'SD-LEO-FIX-ALTIFYAI-LIVE-SITE-001',
    });
  });

  it('returns ok:false when the ventures UPDATE matches zero rows, without attempting the artifact annotation', async () => {
    const { supabase, calls } = fakeSupabase({ ventureUpdateRows: [] });
    const result = await correctHealthStatus({ supabase });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('ventures correction failed');
    expect(calls.find((c) => c.table === 'venture_artifacts' && c.op === 'update')).toBeUndefined();
  });

  it('returns ok:false when the ventures UPDATE errors', async () => {
    const { supabase } = fakeSupabase({ ventureUpdateError: { message: 'connection reset' } });
    const result = await correctHealthStatus({ supabase });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('connection reset');
  });

  it('returns ok:false when no current artifact row is found to annotate', async () => {
    const { supabase } = fakeSupabase({ artifactReadError: { message: 'no rows' } });
    const result = await correctHealthStatus({ supabase });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('artifact read failed');
  });

  it('returns ok:false when the artifact annotation UPDATE matches zero rows', async () => {
    const { supabase } = fakeSupabase({ artifactUpdateRows: [] });
    const result = await correctHealthStatus({ supabase });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('artifact annotation failed');
  });

  it('scopes the artifact lookup by an injectable ventureId/artifactType — not hardcoded to AltifyAI', async () => {
    const { supabase, calls } = fakeSupabase();
    await correctHealthStatus({ supabase, ventureId: 'v-other', artifactType: 'other_type' });

    const selectFilters = calls.filter((c) => c.table === 'venture_artifacts' && c.op === 'select-eq').map((c) => c.val);
    expect(selectFilters).toContain('v-other');
    expect(selectFilters).toContain('other_type');
  });
});
