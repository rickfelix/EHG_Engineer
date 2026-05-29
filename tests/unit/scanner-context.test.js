/**
 * Tests for lib/capabilities/scanner-context.js
 * SD: SD-CAPABILITYAWARE-SCANNERS-AND-ANTHROPIC-ORCH-001-B
 */
import { describe, it, expect, vi } from 'vitest';
import { getCapabilityContextBlock } from '../../lib/capabilities/scanner-context.js';

function mockSupabase(data = [], error = null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data, error }),
        }),
      }),
    }),
  };
}

// SD-LEO-INFRA-MATURITY-WEIGHTED-PORTFOLIO-001: getCapabilityContextBlock now sources the
// portfolio-wide v_unified_capabilities view (scope-aware), not v_capability_ledger. That view
// exposes name/capability_type/plane1_score/maturity_level/scope/source_key but NOT the ledger's
// per-capability reuse_count or first_registered_at — so the democratization "reused Nx" annotation
// and the nursery recency ordering degrade gracefully (the remap sets reuse_count=0, ts=null).
const SAMPLE_CAPABILITIES = [
  { name: 'AI Image Classification', capability_type: 'ai_automation', plane1_score: 18.5, maturity_level: 'stable', scope: 'platform', source_key: 'SD-IMG-001' },
  { name: 'Natural Language Processing', capability_type: 'ai_automation', plane1_score: 16.2, maturity_level: 'beta', scope: 'platform', source_key: 'SD-NLP-001' },
  { name: 'Supabase Integration', capability_type: 'infrastructure', plane1_score: 14.0, maturity_level: 'production', scope: 'platform', source_key: 'SD-INFRA-001' },
  { name: 'Payment Processing', capability_type: 'integration', plane1_score: 12.0, maturity_level: 'beta', scope: 'application', source_key: 'SD-PAY-001' },
  { name: 'Automated Reporting', capability_type: 'application', plane1_score: 10.5, maturity_level: 'experimental', scope: 'application', source_key: 'SD-RPT-001' },
];

describe('getCapabilityContextBlock', () => {
  it('returns empty string when supabase is null', async () => {
    const result = await getCapabilityContextBlock(null, 'trend_scanner');
    expect(result).toBe('');
  });

  it('returns empty string when no capabilities exist', async () => {
    const supabase = mockSupabase([]);
    const result = await getCapabilityContextBlock(supabase, 'trend_scanner');
    expect(result).toBe('');
  });

  it('returns empty string on query error', async () => {
    const supabase = mockSupabase(null, { message: 'connection failed' });
    const result = await getCapabilityContextBlock(supabase, 'trend_scanner');
    expect(result).toBe('');
  });

  it('formats trend_scanner with category grouping', async () => {
    const supabase = mockSupabase(SAMPLE_CAPABILITIES);
    const result = await getCapabilityContextBlock(supabase, 'trend_scanner');

    expect(result).toContain('EHG Internal Capabilities');
    expect(result).toContain('ai_automation');
    expect(result).toContain('AI Image Classification');
    expect(result).toContain('infrastructure');
  });

  it('formats democratization_finder listing reusable capabilities', async () => {
    const supabase = mockSupabase(SAMPLE_CAPABILITIES);
    const result = await getCapabilityContextBlock(supabase, 'democratization_finder');

    expect(result).toContain('Reusable Capabilities');
    // Portfolio view does not surface per-capability reuse_count, so the "reused Nx" annotation
    // is absent; the block still lists the capabilities by name.
    expect(result).toContain('AI Image Classification');
    expect(result).not.toContain('undefined');
  });

  it('formats capability_overhang with full detail table', async () => {
    const supabase = mockSupabase(SAMPLE_CAPABILITIES);
    const result = await getCapabilityContextBlock(supabase, 'capability_overhang');

    expect(result).toContain('Capability Ledger');
    expect(result).toContain('Score');
    expect(result).toContain('Maturity');
    expect(result).toContain('18.5');
    expect(result).toContain('AI Image Classification');
  });

  it('formats nursery_reeval listing capabilities', async () => {
    const supabase = mockSupabase(SAMPLE_CAPABILITIES);
    const result = await getCapabilityContextBlock(supabase, 'nursery_reeval');

    expect(result).toContain('Recently Added');
    expect(result).toContain('added');
    // Portfolio view has no per-capability registration timestamp, so recency ordering is not
    // available (dates render as 'unknown'); the block still lists the capabilities.
    expect(result).toContain('Natural Language Processing');
    expect(result).not.toContain('undefined');
  });

  it('enforces 2000 character cap', async () => {
    // Create a large capability set
    const largeSet = Array.from({ length: 20 }, (_, i) => ({
      capability_key: `very_long_capability_${i + 1}`,
      name: `Very Long Capability Name That Takes Up Space Number ${i + 1} With Extra Description`,
      capability_type: 'ai_automation',
      plane1_score: 20 - i,
      maturity_score: 5,
      reuse_count: i,
      registered_by_sd: `SD-LONG-${i}`,
      first_registered_at: '2026-03-01T00:00:00Z',
    }));

    const supabase = mockSupabase(largeSet);
    const result = await getCapabilityContextBlock(supabase, 'capability_overhang');

    expect(result.length).toBeLessThanOrEqual(2000);
  });

  it('returns empty string for unmapped scanner type', async () => {
    // SD-LEO-INFRA-ANCHOR-SIMPLE-VENTURE-001: unmapped scanner types no longer fall
    // through to the formatForOverhang ledger. Capability anchoring is opt-in — only
    // explicitly mapped types receive a block; everything else returns ''.
    const supabase = mockSupabase(SAMPLE_CAPABILITIES);
    const result = await getCapabilityContextBlock(supabase, 'unknown_scanner');

    expect(result).toBe('');
  });

  it('returns empty string for simple_venture (not capability-anchored)', async () => {
    // SD-LEO-INFRA-ANCHOR-SIMPLE-VENTURE-001: Simple Venture Finder must NOT receive the
    // internal-strengths ledger; injecting it biased candidates toward cron/scheduling
    // tooling (EHG's internal infra dominates the ledger). simple_venture is not a mapped
    // scanner type, so getCapabilityContextBlock returns an empty block for it.
    const supabase = mockSupabase(SAMPLE_CAPABILITIES);
    const result = await getCapabilityContextBlock(supabase, 'simple_venture');

    expect(result).toBe('');
  });

  it('produces different output for different scanner types', async () => {
    const supabase = mockSupabase(SAMPLE_CAPABILITIES);

    const trend = await getCapabilityContextBlock(supabase, 'trend_scanner');
    const demo = await getCapabilityContextBlock(supabase, 'democratization_finder');
    const overhang = await getCapabilityContextBlock(supabase, 'capability_overhang');
    const nursery = await getCapabilityContextBlock(supabase, 'nursery_reeval');

    // All should be non-empty
    expect(trend.length).toBeGreaterThan(0);
    expect(demo.length).toBeGreaterThan(0);
    expect(overhang.length).toBeGreaterThan(0);
    expect(nursery.length).toBeGreaterThan(0);

    // All should be different
    expect(trend).not.toBe(demo);
    expect(demo).not.toBe(overhang);
    expect(overhang).not.toBe(nursery);
  });
});
