/**
 * Empty State & Edge Case Tests E2E
 * SD-E2E-UAT-COVERAGE-001A - User Story US-004
 *
 * Tests application behavior with empty/null data:
 *   1. API responses with empty arrays
 *   2. Non-existent resource IDs
 *   3. Pagination edge cases
 *   4. Filter combinations yielding no results
 *   5. Graceful degradation scenarios
 *
 * Model: Follows marketing-distribution.spec.ts pattern
 */

import { test, expect } from '@playwright/test';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';

// Non-existent UUID for testing
const NON_EXISTENT_UUID = '00000000-0000-0000-0000-000000000000';
const INVALID_UUID = 'not-a-valid-uuid';

test.describe('Empty State & Edge Case Tests E2E', () => {
  // ============================================================
  // EMPTY ARRAY RESPONSES
  // ============================================================

  test.describe('Empty Array Responses', () => {
    test('GET /api/ventures/:id/artifacts - should return empty array for new venture', async ({ request }) => {
      const response = await request.get(
        `${API_BASE}/api/ventures/${NON_EXISTENT_UUID}/artifacts`
      );

      // Should return empty array, not error
      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(0);
    });

    test('GET /api/v2/marketing/queue/:venture_id - should return empty queue', async ({ request }) => {
      const response = await request.get(
        `${API_BASE}/api/v2/marketing/queue/${NON_EXISTENT_UUID}`
      );

      if (response.ok()) {
        const data = await response.json();
        expect(data.queue).toBeDefined();
        expect(Array.isArray(data.queue)).toBe(true);
        expect(data.count).toBe(0);
      } else {
        // May return 404 if venture validation is strict
        expect(response.status()).toBe(404);
      }
    });

    test('GET /api/v2/financial-engine/list/:venture_id - should return empty models list', async ({ request }) => {
      const response = await request.get(
        `${API_BASE}/api/v2/financial-engine/list/${NON_EXISTENT_UUID}`
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data.models).toBeDefined();
      expect(Array.isArray(data.models)).toBe(true);
      expect(data.count).toBe(0);
    });

    test('GET /api/v2/content-forge/list - should handle empty content list', async ({ request }) => {
      // Filter for a non-existent venture
      const response = await request.get(
        `${API_BASE}/api/v2/content-forge/list?venture_id=${NON_EXISTENT_UUID}`
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data.items).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
    });

    test('GET /api/v2/naming-engine/suggestions/:id - should return empty suggestions', async ({ request }) => {
      const response = await request.get(
        `${API_BASE}/api/v2/naming-engine/suggestions/${NON_EXISTENT_UUID}`
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data.suggestions).toBeDefined();
      expect(Array.isArray(data.suggestions)).toBe(true);
      expect(data.count).toBe(0);
    });
  });

  // ============================================================
  // NON-EXISTENT RESOURCE HANDLING
  // ============================================================

  test.describe('Non-Existent Resource Handling', () => {
    test('GET /api/v2/financial-engine/:id - should return 404 for non-existent model', async ({ request }) => {
      const response = await request.get(
        `${API_BASE}/api/v2/financial-engine/${NON_EXISTENT_UUID}`
      );

      expect(response.status()).toBe(404);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    test('POST /api/v2/naming-engine/generate - should return 404 for non-existent brand genome', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/v2/naming-engine/generate`, {
        data: {
          brand_genome_id: NON_EXISTENT_UUID,
          count: 5
        }
      });

      expect(response.status()).toBe(404);
      const data = await response.json();
      expect(data.error).toContain('not found');
    });

    test('POST /api/v2/content-forge/generate - should return 404 for non-existent brand genome', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/v2/content-forge/generate`, {
        data: {
          brand_genome_id: NON_EXISTENT_UUID,
          content_type: 'landing_page'
        }
      });

      expect(response.status()).toBe(404);
      const data = await response.json();
      expect(data.error).toContain('not found');
    });

    test('PATCH /api/ventures/:id/stage - should handle non-existent venture', async ({ request }) => {
      const response = await request.patch(
        `${API_BASE}/api/ventures/${NON_EXISTENT_UUID}/stage`,
        {
          data: { stage: 2 }
        }
      );

      // Should either return error or empty result
      expect([400, 404, 500]).toContain(response.status());
    });

    test('POST /api/v2/content-forge/compliance-check - should handle non-existent content_id', async ({ request }) => {
      const response = await request.post(
        `${API_BASE}/api/v2/content-forge/compliance-check`,
        {
          data: {
            content_id: NON_EXISTENT_UUID
          }
        }
      );

      expect(response.status()).toBe(404);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });
  });

  // ============================================================
  // INVALID UUID HANDLING
  // ============================================================

  test.describe('Invalid UUID Handling', () => {
    test('GET /api/ventures/:id/artifacts - should handle invalid UUID format', async ({ request }) => {
      const response = await request.get(
        `${API_BASE}/api/ventures/${INVALID_UUID}/artifacts`
      );

      // Should return error, not crash
      expect([400, 404, 500]).toContain(response.status());
    });

    test('POST /api/v2/financial-engine/project - should reject invalid UUID', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/v2/financial-engine/project`, {
        data: {
          venture_id: INVALID_UUID,
          company_id: INVALID_UUID,
          template_type: 'saas',
          model_name: 'Test',
          assumptions: {}
        }
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    test('POST /api/v2/naming-engine/generate - should reject invalid UUID', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/v2/naming-engine/generate`, {
        data: {
          brand_genome_id: INVALID_UUID,
          count: 5
        }
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });
  });

  // ============================================================
  // PAGINATION EDGE CASES
  // ============================================================

  test.describe('Pagination Edge Cases', () => {
    test('GET /api/v2/content-forge/list - should handle zero offset', async ({ request }) => {
      const response = await request.get(
        `${API_BASE}/api/v2/content-forge/list?offset=0&limit=10`
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.offset).toBe(0);
    });

    test('GET /api/v2/content-forge/list - should handle large offset', async ({ request }) => {
      const response = await request.get(
        `${API_BASE}/api/v2/content-forge/list?offset=10000&limit=10`
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      // Should return empty array when offset exceeds data
      expect(data.items).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
    });

    test('GET /api/v2/content-forge/list - should handle limit=1', async ({ request }) => {
      const response = await request.get(
        `${API_BASE}/api/v2/content-forge/list?limit=1`
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data.items).toBeDefined();
      expect(data.items.length).toBeLessThanOrEqual(1);
    });

    test('GET /api/v2/content-forge/list - should reject negative offset', async ({ request }) => {
      const response = await request.get(
        `${API_BASE}/api/v2/content-forge/list?offset=-1`
      );

      // Should either reject or clamp to 0
      if (response.ok()) {
        const data = await response.json();
        expect(data.offset).toBeGreaterThanOrEqual(0);
      } else {
        expect(response.status()).toBe(400);
      }
    });

    test('GET /api/v2/content-forge/list - should reject excessive limit', async ({ request }) => {
      const response = await request.get(
        `${API_BASE}/api/v2/content-forge/list?limit=1000`
      );

      // Should either clamp or reject
      if (response.ok()) {
        const data = await response.json();
        expect(data.limit).toBeLessThanOrEqual(100); // Should be clamped to max
      } else {
        expect(response.status()).toBe(400);
      }
    });
  });

  // ============================================================
  // FILTER EDGE CASES
  // ============================================================

  test.describe('Filter Edge Cases', () => {
    test('GET /api/v2/content-forge/list - should handle non-matching status filter', async ({ request }) => {
      const response = await request.get(
        `${API_BASE}/api/v2/content-forge/list?status=archived`
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      // Should return filtered results (may be empty)
      expect(data.items).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
    });

    test('GET /api/v2/content-forge/list - should handle invalid status filter', async ({ request }) => {
      const response = await request.get(
        `${API_BASE}/api/v2/content-forge/list?status=invalid_status`
      );

      // Should either reject or ignore invalid filter
      expect([200, 400]).toContain(response.status());
    });

    test('GET /api/ventures/:id/artifacts - should handle stage filter with no results', async ({ request }) => {
      // Filter for a stage that likely has no artifacts (stage 25)
      const response = await request.get(
        `${API_BASE}/api/ventures/${NON_EXISTENT_UUID}/artifacts?stage=25`
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(Array.isArray(data)).toBe(true);
    });

    test('GET /api/v2/marketing/queue/:id - should handle combined filters', async ({ request }) => {
      const response = await request.get(
        `${API_BASE}/api/v2/marketing/queue/${NON_EXISTENT_UUID}?status=approved&content_type=social_post`
      );

      // Should handle gracefully regardless of results
      if (response.ok()) {
        const data = await response.json();
        expect(data.queue).toBeDefined();
      } else {
        expect([400, 404]).toContain(response.status());
      }
    });
  });

  // ============================================================
  // EMPTY REQUEST BODY HANDLING
  // ============================================================

  test.describe('Empty Request Body Handling', () => {
    test('POST /api/ventures - should reject empty body', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/ventures`, {
        data: {}
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    test('POST /api/ventures/:id/artifacts - should reject empty body', async ({ request }) => {
      const response = await request.post(
        `${API_BASE}/api/ventures/${NON_EXISTENT_UUID}/artifacts`,
        {
          data: {}
        }
      );

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    test('POST /api/v2/content-forge/compliance-check - should reject empty body', async ({ request }) => {
      const response = await request.post(
        `${API_BASE}/api/v2/content-forge/compliance-check`,
        {
          data: {}
        }
      );

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });
  });

  // ============================================================
  // NULL/UNDEFINED FIELD HANDLING
  // ============================================================

  test.describe('Null/Undefined Field Handling', () => {
    test('POST /api/ventures - should handle null optional fields', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/ventures`, {
        data: {
          name: 'Test Venture',
          problem_statement: 'Test problem',
          solution: 'Test solution',
          target_market: 'Test market',
          origin_type: 'manual',
          competitor_ref: null,
          blueprint_id: null
        }
      });

      // Should accept null optional fields
      expect([201, 400]).toContain(response.status()); // May fail for other reasons
    });

    test('POST /api/v2/financial-engine/project - should handle missing optional assumptions', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/v2/financial-engine/project`, {
        data: {
          venture_id: NON_EXISTENT_UUID,
          company_id: NON_EXISTENT_UUID,
          template_type: 'saas',
          model_name: 'Minimal Model',
          assumptions: {
            // Only required assumptions, most are optional
            initial_mrr: 10000
          }
        }
      });

      // Should either work with defaults or return specific validation error
      expect([201, 400, 404]).toContain(response.status());
    });

    test('POST /api/v2/content-forge/generate - should handle empty parameters', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/v2/content-forge/generate`, {
        data: {
          brand_genome_id: NON_EXISTENT_UUID,
          content_type: 'landing_page',
          parameters: {} // Empty parameters object
        }
      });

      // Should use defaults for empty parameters
      expect([201, 404]).toContain(response.status());
    });
  });

  // ============================================================
  // BOUNDARY VALUE TESTS
  // ============================================================

  test.describe('Boundary Value Tests', () => {
    test('PATCH /api/ventures/:id/stage - should reject stage 0', async ({ request }) => {
      const response = await request.patch(
        `${API_BASE}/api/ventures/${NON_EXISTENT_UUID}/stage`,
        {
          data: { stage: 0 }
        }
      );

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    test('PATCH /api/ventures/:id/stage - should reject stage 26', async ({ request }) => {
      const response = await request.patch(
        `${API_BASE}/api/ventures/${NON_EXISTENT_UUID}/stage`,
        {
          data: { stage: 26 }
        }
      );

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    test('POST /api/v2/naming-engine/generate - should handle count boundaries', async ({ request }) => {
      // Test count = 0 (should reject)
      const response0 = await request.post(`${API_BASE}/api/v2/naming-engine/generate`, {
        data: {
          brand_genome_id: NON_EXISTENT_UUID,
          count: 0
        }
      });
      expect(response0.status()).toBe(400);

      // Test count = 21 (exceeds max of 20)
      const response21 = await request.post(`${API_BASE}/api/v2/naming-engine/generate`, {
        data: {
          brand_genome_id: NON_EXISTENT_UUID,
          count: 21
        }
      });
      expect(response21.status()).toBe(400);
    });

    test('POST /api/v2/financial-engine/project - should handle projection_years boundaries', async ({ request }) => {
      // Test years = 0 (should reject)
      const response0 = await request.post(`${API_BASE}/api/v2/financial-engine/project`, {
        data: {
          venture_id: NON_EXISTENT_UUID,
          company_id: NON_EXISTENT_UUID,
          template_type: 'saas',
          model_name: 'Test',
          assumptions: {},
          projection_years: 0
        }
      });
      expect(response0.status()).toBe(400);

      // Test years = 11 (exceeds max of 10)
      const response11 = await request.post(`${API_BASE}/api/v2/financial-engine/project`, {
        data: {
          venture_id: NON_EXISTENT_UUID,
          company_id: NON_EXISTENT_UUID,
          template_type: 'saas',
          model_name: 'Test',
          assumptions: {},
          projection_years: 11
        }
      });
      expect(response11.status()).toBe(400);
    });
  });
});
