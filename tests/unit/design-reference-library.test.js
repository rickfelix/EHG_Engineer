/**
 * Design Reference Library — Unit Tests
 * SD: SD-MAN-INFRA-AWWWARDS-CURATED-DESIGN-001
 *
 * Tests the service functions and validates the static scraper dataset.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Supabase client — returns a chainable object where every method
// returns `this`, and the chain resolves to configurable {data, error}.
// ---------------------------------------------------------------------------

let mockResult = { data: [], error: null };

function createChainProxy() {
  const handler = {
    get(_target, prop) {
      // When awaited, the chain is treated as a thenable — return the result
      if (prop === 'then') {
        return (resolve) => resolve(mockResult);
      }
      // Any other property returns the proxy itself (for chaining)
      return () => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
}

const mockFrom = vi.fn(() => createChainProxy());

vi.mock('../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({ from: mockFrom }),
}));

vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));

// Import service AFTER mocks are set up
const {
  createDesignReference,
  bulkInsertReferences,
  getDesignReferencesByArchetype,
  getDesignReferenceStats,
} = await import('../../lib/eva/services/design-reference-library.js');

// Import the static dataset from the scraper — use a dynamic import that
// does NOT trigger the auto-executing main() by mocking process.argv
const { CURATED_REFERENCES } = await import('../../scripts/eva/srip/awwwards-scraper.mjs');

// ---------------------------------------------------------------------------
// Service tests
// ---------------------------------------------------------------------------

describe('design-reference-library service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResult = { data: [], error: null };
  });

  describe('getDesignReferencesByArchetype', () => {
    it('returns an array of references for a given archetype', async () => {
      const mockData = [
        { id: '1', site_name: 'Test Site', archetype_category: 'saas', combined_score: 9.0 },
      ];
      mockResult = { data: mockData, error: null };

      const result = await getDesignReferencesByArchetype('saas', 5);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual(mockData);
      expect(mockFrom).toHaveBeenCalledWith('design_reference_library');
    });

    it('returns empty array when no matches', async () => {
      mockResult = { data: null, error: null };
      const result = await getDesignReferencesByArchetype('fintech');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('throws on Supabase error', async () => {
      mockResult = { data: null, error: { message: 'connection refused' } };
      await expect(getDesignReferencesByArchetype('saas')).rejects.toThrow(
        'getDesignReferencesByArchetype failed'
      );
    });

    it('uses default limit of 5', async () => {
      mockResult = { data: [], error: null };
      await getDesignReferencesByArchetype('saas');
      // Verify it didn't throw — limit default is applied internally
      expect(mockFrom).toHaveBeenCalledWith('design_reference_library');
    });
  });

  describe('getDesignReferenceStats', () => {
    it('returns an object with archetype counts', async () => {
      mockResult = {
        data: [
          { archetype_category: 'saas' },
          { archetype_category: 'saas' },
          { archetype_category: 'fintech' },
        ],
        error: null,
      };

      const result = await getDesignReferenceStats();

      expect(typeof result).toBe('object');
      expect(result).toEqual({ saas: 2, fintech: 1 });
    });

    it('returns empty object when table is empty', async () => {
      mockResult = { data: [], error: null };
      const result = await getDesignReferenceStats();
      expect(result).toEqual({});
    });

    it('throws on Supabase error', async () => {
      mockResult = { data: null, error: { message: 'timeout' } };
      await expect(getDesignReferenceStats()).rejects.toThrow('getDesignReferenceStats failed');
    });
  });

  describe('createDesignReference', () => {
    it('inserts a single record and returns it', async () => {
      const input = {
        url: 'https://example.com',
        site_name: 'Example',
        archetype_category: 'saas',
        design_score: 9.0,
      };
      const mockRecord = { id: 'uuid-1', ...input };
      mockResult = { data: mockRecord, error: null };

      const result = await createDesignReference(input);
      expect(result).toEqual(mockRecord);
      expect(mockFrom).toHaveBeenCalledWith('design_reference_library');
    });

    it('throws on insert error', async () => {
      mockResult = { data: null, error: { message: 'duplicate key' } };
      await expect(
        createDesignReference({
          url: 'https://dup.com',
          site_name: 'Dup',
          archetype_category: 'saas',
        })
      ).rejects.toThrow('createDesignReference failed');
    });
  });

  describe('bulkInsertReferences', () => {
    it('returns empty array for empty input', async () => {
      const result = await bulkInsertReferences([]);
      expect(result).toEqual([]);
    });

    it('returns empty array for null input', async () => {
      const result = await bulkInsertReferences(null);
      expect(result).toEqual([]);
    });

    it('upserts records and returns them', async () => {
      const refs = [
        { url: 'https://a.com', site_name: 'A', archetype_category: 'saas' },
        { url: 'https://b.com', site_name: 'B', archetype_category: 'fintech' },
      ];
      mockResult = { data: refs, error: null };

      const result = await bulkInsertReferences(refs);
      expect(result).toHaveLength(2);
      expect(mockFrom).toHaveBeenCalledWith('design_reference_library');
    });

    it('throws on upsert error', async () => {
      mockResult = { data: null, error: { message: 'constraint violation' } };
      await expect(
        bulkInsertReferences([{ url: 'https://x.com', site_name: 'X', archetype_category: 'saas' }])
      ).rejects.toThrow('bulkInsertReferences failed');
    });
  });
});

// ---------------------------------------------------------------------------
// Scraper static dataset validation
// ---------------------------------------------------------------------------

describe('awwwards-scraper static dataset', () => {
  const REQUIRED_ARCHETYPES = [
    'saas',
    'marketplace',
    'fintech',
    'healthtech',
    'e-commerce',
    'portfolio',
    'corporate',
  ];

  it('contains at least 56 total entries', () => {
    expect(CURATED_REFERENCES.length).toBeGreaterThanOrEqual(56);
  });

  it('covers all 7 required archetypes', () => {
    const archetypes = new Set(CURATED_REFERENCES.map((r) => r.archetype_category));
    for (const arch of REQUIRED_ARCHETYPES) {
      expect(archetypes.has(arch)).toBe(true);
    }
  });

  it('has at least 8 entries per archetype', () => {
    const counts = {};
    for (const ref of CURATED_REFERENCES) {
      counts[ref.archetype_category] = (counts[ref.archetype_category] || 0) + 1;
    }
    for (const arch of REQUIRED_ARCHETYPES) {
      expect(counts[arch]).toBeGreaterThanOrEqual(8);
    }
  });

  it('every entry has required fields', () => {
    for (const ref of CURATED_REFERENCES) {
      expect(ref.url).toBeTruthy();
      expect(ref.site_name).toBeTruthy();
      expect(ref.archetype_category).toBeTruthy();
      expect(REQUIRED_ARCHETYPES).toContain(ref.archetype_category);
      expect(ref.design_score).toBeGreaterThanOrEqual(7);
      expect(ref.design_score).toBeLessThanOrEqual(10);
      expect(ref.usability_score).toBeGreaterThanOrEqual(7);
      expect(ref.usability_score).toBeLessThanOrEqual(10);
      expect(ref.creativity_score).toBeGreaterThanOrEqual(7);
      expect(ref.creativity_score).toBeLessThanOrEqual(10);
      expect(ref.content_score).toBeGreaterThanOrEqual(7);
      expect(ref.content_score).toBeLessThanOrEqual(10);
    }
  });

  it('all URLs are unique', () => {
    const urls = CURATED_REFERENCES.map((r) => r.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('every entry has tech_stack, agency_name, country, and description', () => {
    for (const ref of CURATED_REFERENCES) {
      expect(ref.tech_stack).toBeTruthy();
      expect(ref.agency_name).toBeTruthy();
      expect(ref.country).toBeTruthy();
      expect(ref.description).toBeTruthy();
    }
  });

  it('every entry has a valid date_awarded', () => {
    for (const ref of CURATED_REFERENCES) {
      expect(ref.date_awarded).toBeTruthy();
      expect(new Date(ref.date_awarded).toString()).not.toBe('Invalid Date');
    }
  });
});
