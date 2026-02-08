/**
 * Tests for Brand Genome Service (CLI Port)
 * SD-LEO-FEAT-SERVICE-PORTS-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getBrandGenomesByVenture,
  getBrandGenomeList,
  getBrandGenome,
  getActiveBrandGenomes,
  getLatestBrandGenome,
  createBrandGenome,
  updateBrandGenome,
  updateBrandData,
  submitBrandGenome,
  approveBrandGenome,
  archiveBrandGenome,
  deleteBrandGenome,
  getBrandGenomesByStatus,
  getBrandCompletenessStats,
  getCompletenessScore,
  meetsCompletenessThreshold,
  getRequiredFieldsMissing,
} from '../../../lib/eva/services/brand-genome.js';

/**
 * Build a mock Supabase client with chainable query methods.
 */
function createMockSupabase({ data = [], error = null, singleData = null } = {}) {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: singleData, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data: singleData, error }),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    // Default terminal resolution (for queries without single/maybeSingle)
    then: vi.fn((resolve) => resolve({ data, error })),
  };

  // Make terminal methods resolve the data by default
  // Override: when .order() is the last call (list queries), resolve data
  const orderFn = vi.fn().mockImplementation(() => {
    return {
      ...chainable,
      then: vi.fn((resolve) => resolve({ data, error })),
      // Allow further chaining for limit().maybeSingle()
      limit: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: singleData, error }),
      }),
    };
  });

  // Build the mock from builder
  const fromMock = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            order: orderFn,
          }),
          order: orderFn,
          single: vi.fn().mockResolvedValue({ data: singleData, error }),
        }),
        is: vi.fn().mockReturnValue({
          order: orderFn,
        }),
        single: vi.fn().mockResolvedValue({ data: singleData, error }),
      }),
      is: vi.fn().mockReturnValue({
        order: orderFn,
      }),
      order: orderFn,
      maybeSingle: vi.fn().mockResolvedValue({ data: singleData, error }),
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: singleData, error }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: singleData, error }),
        }),
        // For archive/update without select
        then: vi.fn((resolve) => resolve({ error })),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error }),
      }),
    }),
  });

  return { from: fromMock };
}

describe('getBrandGenomesByVenture', () => {
  it('returns brand genomes for a venture', async () => {
    const genomes = [{ id: 'bg-1', venture_id: 'v-1' }];
    const supabase = createMockSupabase({ data: genomes });

    const result = await getBrandGenomesByVenture(supabase, 'v-1');
    expect(result).toEqual(genomes);
    expect(supabase.from).toHaveBeenCalledWith('brand_genome_submissions');
  });
});

describe('getBrandGenome', () => {
  it('returns a single brand genome', async () => {
    const genome = { id: 'bg-1', brand_data: { name: 'Test' } };
    const supabase = createMockSupabase({ singleData: genome });

    const result = await getBrandGenome(supabase, 'bg-1');
    expect(result).toEqual(genome);
  });

  it('returns null when not found (PGRST116)', async () => {
    const supabase = createMockSupabase({ error: { code: 'PGRST116', message: 'Not found' } });

    const result = await getBrandGenome(supabase, 'nonexistent');
    expect(result).toBeNull();
  });
});

describe('createBrandGenome', () => {
  it('creates a draft brand genome with explicit createdBy', async () => {
    const created = { id: 'bg-new', venture_id: 'v-1', submission_status: 'draft' };
    const supabase = createMockSupabase({ singleData: created });

    const result = await createBrandGenome(supabase, {
      venture_id: 'v-1',
      created_by: 'user-123',
      brand_data: { name: 'My Brand' },
    });

    expect(result).toEqual(created);
  });

  it('throws when created_by is missing', async () => {
    const supabase = createMockSupabase();

    await expect(
      createBrandGenome(supabase, { venture_id: 'v-1' }),
    ).rejects.toThrow('created_by is required');
  });
});

describe('updateBrandGenome', () => {
  it('updates brand genome fields', async () => {
    const updated = { id: 'bg-1', submission_status: 'published' };
    const supabase = createMockSupabase({ singleData: updated });

    const result = await updateBrandGenome(supabase, 'bg-1', { submission_status: 'published' });
    expect(result).toEqual(updated);
  });
});

describe('submitBrandGenome / approveBrandGenome', () => {
  it('submitBrandGenome sets status to published', async () => {
    const updated = { id: 'bg-1', submission_status: 'published' };
    const supabase = createMockSupabase({ singleData: updated });

    const result = await submitBrandGenome(supabase, 'bg-1');
    expect(result.submission_status).toBe('published');
  });

  it('approveBrandGenome delegates to submitBrandGenome', async () => {
    const updated = { id: 'bg-1', submission_status: 'published' };
    const supabase = createMockSupabase({ singleData: updated });

    const result = await approveBrandGenome(supabase, 'bg-1');
    expect(result.submission_status).toBe('published');
  });
});

describe('archiveBrandGenome', () => {
  it('returns true on success', async () => {
    const supabase = createMockSupabase();
    const result = await archiveBrandGenome(supabase, 'bg-1');
    expect(result).toBe(true);
  });
});

describe('deleteBrandGenome', () => {
  it('returns true on success', async () => {
    const supabase = createMockSupabase();
    const result = await deleteBrandGenome(supabase, 'bg-1');
    expect(result).toBe(true);
  });
});

describe('meetsCompletenessThreshold', () => {
  it('returns false for null score', () => {
    expect(meetsCompletenessThreshold(null)).toBe(false);
  });

  it('returns false for undefined score', () => {
    expect(meetsCompletenessThreshold(undefined)).toBe(false);
  });

  it('returns false below threshold', () => {
    expect(meetsCompletenessThreshold(50)).toBe(false);
  });

  it('returns true at threshold', () => {
    expect(meetsCompletenessThreshold(70)).toBe(true);
  });

  it('returns true above threshold', () => {
    expect(meetsCompletenessThreshold(95)).toBe(true);
  });

  it('uses custom threshold', () => {
    expect(meetsCompletenessThreshold(50, 50)).toBe(true);
    expect(meetsCompletenessThreshold(49, 50)).toBe(false);
  });
});
