/**
 * Tests for Venture Template Applier
 * SD-EVA-FEAT-VENTURE-TEMPLATES-001
 */

import { describe, it, expect, vi } from 'vitest';
import {
  recommendTemplates,
  applyTemplate,
  computeDomainOverlap,
  MODULE_VERSION,
} from '../../../lib/eva/template-applier.js';

// ── Mock helpers ──────────────────────────────────

/**
 * Mock searchSimilar to avoid importing the full module chain.
 * We mock it at the module level.
 */
vi.mock('../../../lib/eva/cross-venture-learning.js', () => ({
  round2: (v) => Math.round(v * 100) / 100,
  MIN_VENTURES: 5,
  searchSimilar: vi.fn().mockResolvedValue([]),
}));

function createMockDb(config = {}) {
  const updateCalls = [];

  return {
    updateCalls,
    from: vi.fn((table) => {
      const chainable = {};

      // Self-referencing chain methods
      chainable.select = vi.fn().mockReturnValue(chainable);
      chainable.eq = vi.fn().mockReturnValue(chainable);
      chainable.in = vi.fn().mockReturnValue(chainable);
      chainable.gte = vi.fn().mockReturnValue(chainable);
      chainable.order = vi.fn().mockReturnValue(chainable);
      chainable.not = vi.fn().mockReturnValue(chainable);
      chainable.single = vi.fn(() => {
        const key = `${table}:single`;
        return Promise.resolve(config[key] || { data: null, error: null });
      });
      chainable.then = (resolve) => {
        const key = `${table}:list`;
        return Promise.resolve(config[key] || { data: [], error: null }).then(resolve);
      };
      chainable.update = vi.fn((data) => {
        updateCalls.push({ table, data });
        return chainable;
      });

      return chainable;
    }),
  };
}

// ── computeDomainOverlap (pure function) ──────────────────

describe('computeDomainOverlap', () => {
  it('returns 1 for identical tags', () => {
    expect(computeDomainOverlap(['saas', 'b2b'], ['saas', 'b2b'])).toBe(1);
  });

  it('returns 0 for no overlap', () => {
    expect(computeDomainOverlap(['saas'], ['fintech'])).toBe(0);
  });

  it('returns 0 for empty arrays', () => {
    expect(computeDomainOverlap([], [])).toBe(0);
    expect(computeDomainOverlap(['saas'], [])).toBe(0);
    expect(computeDomainOverlap([], ['saas'])).toBe(0);
  });

  it('computes Jaccard similarity correctly', () => {
    // Jaccard: intersection/union = 1/3 = 0.33
    expect(computeDomainOverlap(['saas', 'b2b'], ['saas', 'fintech'])).toBe(0.33);
  });

  it('is case-insensitive', () => {
    expect(computeDomainOverlap(['SaaS'], ['saas'])).toBe(1);
  });
});

// ── recommendTemplates ──────────────────

describe('recommendTemplates', () => {
  it('returns insufficient_data when fewer than MIN_VENTURES', async () => {
    const db = createMockDb({
      'ventures:single': { data: { id: 'v1', name: 'New', domain_tags: ['saas'], elevator_pitch: 'test' }, error: null },
    });
    // Mock count query
    db.from = vi.fn((table) => {
      if (table === 'ventures') {
        return {
          select: vi.fn().mockReturnValue({
            not: vi.fn(() => Promise.resolve({ count: 3, error: null })),
          }),
        };
      }
      return createMockDb().from(table);
    });

    const result = await recommendTemplates(db, 'v1');
    expect(result.status).toBe('insufficient_data');
    expect(result.recommendations).toEqual([]);
  });

  it('returns no_templates when no templates exist', async () => {
    let callCount = 0;
    const db = {
      from: vi.fn((table) => {
        if (table === 'ventures' && callCount === 0) {
          callCount++;
          return {
            select: vi.fn().mockReturnValue({
              not: vi.fn(() => Promise.resolve({ count: 10, error: null })),
            }),
          };
        }
        if (table === 'ventures') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn(() => Promise.resolve({ data: { id: 'v1', name: 'New', domain_tags: ['saas'], elevator_pitch: null }, error: null })),
              }),
            }),
          };
        }
        if (table === 'venture_templates') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  order: vi.fn(() => Promise.resolve({ data: [], error: null })),
                }),
              }),
            }),
          };
        }
        return createMockDb().from(table);
      }),
    };

    const result = await recommendTemplates(db, 'v1');
    expect(result.status).toBe('no_templates');
  });
});

// ── applyTemplate ──────────────────

describe('applyTemplate', () => {
  it('returns applied=false for missing template', async () => {
    const db = createMockDb({
      'venture_templates:single': { data: null, error: null },
    });

    const result = await applyTemplate(db, 'v1', 'missing-id');
    expect(result.applied).toBe(false);
    expect(result.templateContext).toEqual({});
  });

  it('returns template context and increments usage_count', async () => {
    const db = createMockDb({
      'venture_templates:single': {
        data: {
          id: 't1',
          template_name: 'Test Template v1',
          template_version: 1,
          effectiveness_score: 75,
          usage_count: 3,
          template_data: {
            scoring_thresholds: { _summary: { avg_health: 82, min_health: 60, max_health: 95 } },
            dfe_calibrations: { validation_rate: 0.8, calibration_reports: [] },
            pricing_params: { model_type: 'subscription' },
            gtm_effectiveness: { channels: {} },
          },
        },
        error: null,
      },
    });

    const result = await applyTemplate(db, 'v1', 't1');
    expect(result.applied).toBe(true);
    expect(result.templateContext.template_applied).toBe(true);
    expect(result.templateContext.template_name).toBe('Test Template v1');
    expect(result.templateContext.effectiveness_score).toBe(75);
    expect(result.templateContext.suggested_thresholds.avg_health).toBe(82);
    expect(result.templateContext.pricing_reference.model_type).toBe('subscription');

    // Verify usage_count was incremented
    expect(db.updateCalls.length).toBe(1);
    expect(db.updateCalls[0].data.usage_count).toBe(4);
  });

  it('throws on query error', async () => {
    const db = createMockDb({
      'venture_templates:single': { data: null, error: { message: 'timeout' } },
    });

    await expect(applyTemplate(db, 'v1', 't1')).rejects.toThrow('Failed to query template');
  });
});

describe('MODULE_VERSION', () => {
  it('is a valid semver string', () => {
    expect(MODULE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
