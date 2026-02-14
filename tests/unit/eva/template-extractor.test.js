/**
 * Tests for Venture Template Extractor
 * SD-EVA-FEAT-VENTURE-TEMPLATES-001
 */

import { describe, it, expect, vi } from 'vitest';
import {
  extractTemplate,
  updateEffectivenessScore,
  extractScoringThresholds,
  extractArchitecturePatterns,
  extractDFECalibrations,
  MODULE_VERSION,
} from '../../../lib/eva/template-extractor.js';

// ── Mock Supabase builder ──────────────────────────────────

function createMockDb(config = {}) {
  const insertData = [];
  const updateCalls = [];

  return {
    insertData,
    updateCalls,
    from: vi.fn((table) => {
      const chainable = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn(() => {
          const key = `${table}:single`;
          return Promise.resolve(config[key] || { data: null, error: null });
        }),
        insert: vi.fn((data) => {
          insertData.push({ table, data });
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn(() => Promise.resolve(
                config[`${table}:insert`] || { data: { id: 'new-template-id', template_name: data.template_name, template_version: data.template_version }, error: null }
              )),
            }),
          };
        }),
        update: vi.fn((data) => {
          updateCalls.push({ table, data });
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn(() => Promise.resolve({ error: null })),
              single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            }),
          };
        }),
        then: (resolve) => {
          const key = `${table}:list`;
          return Promise.resolve(config[key] || { data: [], error: null }).then(resolve);
        },
      };

      // Make select/eq/in/order return chainable
      for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
        chainable[method] = vi.fn().mockReturnValue(chainable);
      }

      // Override single to return configured data
      chainable.single = vi.fn(() => {
        const key = `${table}:single`;
        return Promise.resolve(config[key] || { data: null, error: null });
      });

      // Keep insert/update
      chainable.insert = vi.fn((data) => {
        insertData.push({ table, data });
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn(() => Promise.resolve(
              config[`${table}:insert`] || { data: { id: 'new-template-id', template_name: data.template_name, template_version: data.template_version }, error: null }
            )),
          }),
        };
      });

      chainable.update = vi.fn((data) => {
        updateCalls.push({ table, data });
        return chainable;
      });

      return chainable;
    }),
  };
}

// ── Tests ──────────────────────────────────

describe('extractTemplate', () => {
  it('returns null for venture below Stage 25', async () => {
    const db = createMockDb({
      'ventures:single': { data: { id: 'v1', name: 'Test', status: 'active', current_lifecycle_stage: 20, domain_tags: ['saas'] }, error: null },
    });

    const result = await extractTemplate(db, 'v1');
    expect(result).toBeNull();
  });

  it('extracts template for venture at Stage 25', async () => {
    const db = createMockDb({
      'ventures:single': { data: { id: 'v1', name: 'SuccessVenture', status: 'archived', current_lifecycle_stage: 25, domain_tags: ['saas', 'b2b'] }, error: null },
      'venture_templates:single': { data: null, error: null }, // No existing template
      'chairman_decisions:list': { data: [], error: null },
      'venture_artifacts:list': { data: [], error: null },
      'assumption_sets:list': { data: [], error: null },
    });

    const result = await extractTemplate(db, 'v1');
    expect(result).toBeTruthy();
    expect(result.template_name).toBe('SuccessVenture Template v1');
    expect(result.template_version).toBe(1);
  });

  it('increments version when re-extracting', async () => {
    const db = createMockDb({
      'ventures:single': { data: { id: 'v1', name: 'Test', status: 'archived', current_lifecycle_stage: 25, domain_tags: [] }, error: null },
      'venture_templates:single': { data: { template_version: 2 }, error: null }, // Existing v2
      'chairman_decisions:list': { data: [], error: null },
      'venture_artifacts:list': { data: [], error: null },
      'assumption_sets:list': { data: [], error: null },
    });

    const result = await extractTemplate(db, 'v1');
    expect(result).toBeTruthy();
    expect(result.template_version).toBe(3);
  });

  it('throws on venture query error', async () => {
    const db = createMockDb({
      'ventures:single': { data: null, error: { message: 'DB error' } },
    });

    await expect(extractTemplate(db, 'v1')).rejects.toThrow('Failed to query venture');
  });
});

describe('extractScoringThresholds', () => {
  it('returns empty for no decisions', async () => {
    const db = createMockDb({
      'chairman_decisions:list': { data: [], error: null },
    });
    // Call via chain mock
    const chainable = db.from('chairman_decisions');
    chainable.then = (resolve) => Promise.resolve({ data: [], error: null }).then(resolve);

    const result = await extractScoringThresholds(db, 'v1');
    expect(result).toEqual({});
  });
});

describe('updateEffectivenessScore', () => {
  it('computes running average correctly', async () => {
    const db = createMockDb({
      'venture_templates:single': { data: { effectiveness_score: 80, usage_count: 4 }, error: null },
    });

    await updateEffectivenessScore(db, 'template-1', 60);

    // Running avg: (80*4 + 60) / 5 = 380/5 = 76
    expect(db.updateCalls.length).toBe(1);
    expect(db.updateCalls[0].data.effectiveness_score).toBe(76);
    expect(db.updateCalls[0].data.usage_count).toBe(5);
  });

  it('handles first usage (count was 0)', async () => {
    const db = createMockDb({
      'venture_templates:single': { data: { effectiveness_score: 0, usage_count: 0 }, error: null },
    });

    await updateEffectivenessScore(db, 'template-1', 85);

    expect(db.updateCalls[0].data.effectiveness_score).toBe(85);
    expect(db.updateCalls[0].data.usage_count).toBe(1);
  });
});

describe('MODULE_VERSION', () => {
  it('is a valid semver string', () => {
    expect(MODULE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
