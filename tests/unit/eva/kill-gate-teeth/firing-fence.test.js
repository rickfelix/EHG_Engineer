/**
 * Unit tests for lib/eva/kill-gate-teeth/firing-fence.js.
 *
 * SD-LEO-INFRA-KILL-GATE-TEETH-001 (ALPHA leg)
 *
 * Covers:
 *   - fail-closed by absence: no attestation row -> refused
 *   - venture-1 (ApexNiche) hard exclusion -> refused even with a valid attestation
 *   - a valid non-fleet attestation for a non-venture-1 venture -> armed
 *   - a read failure on either lookup -> refused, never armed
 */
import { describe, it, expect, vi } from 'vitest';
import { evaluateFiringFence, FENCE_REASON } from '../../../../lib/eva/kill-gate-teeth/firing-fence.js';

const VENTURE_ID = 'aaaa1111-2222-3333-4444-555555555555';

function buildSupabaseMock({ ventureName = 'ProbeAlphaVentureX', ventureReadError = null, attestationRows = [], eventsReadError = null } = {}) {
  return {
    from: vi.fn((table) => {
      if (table === 'ventures') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue(
                ventureReadError ? { data: null, error: ventureReadError } : { data: { name: ventureName }, error: null }
              ),
            })),
          })),
        };
      }
      if (table === 'system_events') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue(
                  eventsReadError ? { data: null, error: eventsReadError } : { data: attestationRows, error: null }
                ),
              })),
            })),
          })),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  };
}

describe('evaluateFiringFence', () => {
  it('refuses (fail-closed) when no unattended attestation exists', async () => {
    const supabase = buildSupabaseMock({ attestationRows: [] });
    const result = await evaluateFiringFence(supabase, { ventureId: VENTURE_ID });
    expect(result.armed).toBe(false);
    expect(result.reason).toBe(FENCE_REASON.NO_UNATTENDED_PROOF);
  });

  it('arms when a valid non-fleet unattended attestation exists for a non-venture-1 venture', async () => {
    const supabase = buildSupabaseMock({
      ventureName: 'SomeOtherVenture',
      attestationRows: [{ id: 'evt-1', payload: { sealed_by: 'solomon', attested_unattended: true } }],
    });
    const result = await evaluateFiringFence(supabase, { ventureId: VENTURE_ID });
    expect(result.armed).toBe(true);
    expect(result.reason).toBe(FENCE_REASON.ARMED);
  });

  it('refuses unconditionally for venture-1 (ApexNiche), even with a valid attestation', async () => {
    const supabase = buildSupabaseMock({
      ventureName: 'ApexNiche',
      attestationRows: [{ id: 'evt-1', payload: { sealed_by: 'chairman', attested_unattended: true } }],
    });
    const result = await evaluateFiringFence(supabase, { ventureId: VENTURE_ID });
    expect(result.armed).toBe(false);
    expect(result.reason).toBe(FENCE_REASON.VENTURE_ONE_EXCLUSION);
  });

  it('is case-insensitive on the venture-1 name match', async () => {
    const supabase = buildSupabaseMock({
      ventureName: 'apexniche',
      attestationRows: [{ id: 'evt-1', payload: { sealed_by: 'solomon' } }],
    });
    const result = await evaluateFiringFence(supabase, { ventureId: VENTURE_ID });
    expect(result.armed).toBe(false);
    expect(result.reason).toBe(FENCE_REASON.VENTURE_ONE_EXCLUSION);
  });

  it('rejects an attestation not sealed by a recognized non-fleet party', async () => {
    const supabase = buildSupabaseMock({
      attestationRows: [{ id: 'evt-1', payload: { sealed_by: 'fleet_agent' } }],
    });
    const result = await evaluateFiringFence(supabase, { ventureId: VENTURE_ID });
    expect(result.armed).toBe(false);
    expect(result.reason).toBe(FENCE_REASON.NO_UNATTENDED_PROOF);
  });

  it('fails closed when the venture read errors', async () => {
    const supabase = buildSupabaseMock({ ventureReadError: new Error('boom') });
    const result = await evaluateFiringFence(supabase, { ventureId: VENTURE_ID });
    expect(result.armed).toBe(false);
    expect(result.reason).toBe(FENCE_REASON.VENTURE_READ_FAILED);
  });

  it('fails closed when the attestation read errors', async () => {
    const supabase = buildSupabaseMock({ eventsReadError: new Error('boom') });
    const result = await evaluateFiringFence(supabase, { ventureId: VENTURE_ID });
    expect(result.armed).toBe(false);
    expect(result.reason).toBe(FENCE_REASON.NO_UNATTENDED_PROOF);
  });
});
