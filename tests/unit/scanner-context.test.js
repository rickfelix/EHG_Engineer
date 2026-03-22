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

const SAMPLE_CAPABILITIES = [
  { capability_key: 'ai_image_classification', name: 'AI Image Classification', capability_type: 'ai_automation', plane1_score: 18.5, maturity_score: 4, reuse_count: 3, registered_by_sd: 'SD-IMG-001', first_registered_at: '2026-03-01T00:00:00Z' },
  { capability_key: 'natural_language_processing', name: 'Natural Language Processing', capability_type: 'ai_automation', plane1_score: 16.2, maturity_score: 3, reuse_count: 5, registered_by_sd: 'SD-NLP-001', first_registered_at: '2026-03-02T00:00:00Z' },
  { capability_key: 'supabase_integration', name: 'Supabase Integration', capability_type: 'infrastructure', plane1_score: 14.0, maturity_score: 5, reuse_count: 10, registered_by_sd: 'SD-INFRA-001', first_registered_at: '2026-02-15T00:00:00Z' },
  { capability_key: 'payment_processing', name: 'Payment Processing', capability_type: 'integration', plane1_score: 12.0, maturity_score: 3, reuse_count: 2, registered_by_sd: 'SD-PAY-001', first_registered_at: '2026-02-20T00:00:00Z' },
  { capability_key: 'automated_reporting', name: 'Automated Reporting', capability_type: 'application', plane1_score: 10.5, maturity_score: 2, reuse_count: 1, registered_by_sd: 'SD-RPT-001', first_registered_at: '2026-03-03T00:00:00Z' },
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

  it('formats democratization_finder with reuse focus', async () => {
    const supabase = mockSupabase(SAMPLE_CAPABILITIES);
    const result = await getCapabilityContextBlock(supabase, 'democratization_finder');

    expect(result).toContain('Reusable Capabilities');
    expect(result).toContain('reused');
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

  it('formats nursery_reeval with recent capabilities', async () => {
    const supabase = mockSupabase(SAMPLE_CAPABILITIES);
    const result = await getCapabilityContextBlock(supabase, 'nursery_reeval');

    expect(result).toContain('Recently Added');
    expect(result).toContain('added');
    // Most recent should be first (2026-03-03)
    const reportIdx = result.indexOf('Automated Reporting');
    const nlpIdx = result.indexOf('Natural Language Processing');
    expect(reportIdx).toBeLessThan(nlpIdx);
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

  it('uses overhang format as default for unknown scanner type', async () => {
    const supabase = mockSupabase(SAMPLE_CAPABILITIES);
    const result = await getCapabilityContextBlock(supabase, 'unknown_scanner');

    expect(result).toContain('Capability Ledger');
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
