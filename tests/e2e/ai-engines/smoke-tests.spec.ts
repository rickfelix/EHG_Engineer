/**
 * AI Engines Smoke Tests E2E
 * SD-E2E-UAT-COVERAGE-001A - User Story US-003
 *
 * Tests the three LLM-powered AI engines:
 *   1. Naming Engine - LLM-powered venture name generation
 *   2. Financial Engine - Financial projection calculations
 *   3. Content Forge - Marketing content generation
 *
 * Note: These are smoke tests to verify API responsiveness.
 * Full LLM generation tests may require API keys and take longer.
 *
 * Model: Follows marketing-distribution.spec.ts pattern
 */

import { test, expect } from '@playwright/test';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';

// Test data storage
let testVentureId: string;
let testCompanyId: string;
let testBrandGenomeId: string;
let testFinancialModelId: string;

test.describe('AI Engines Smoke Tests E2E', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ request }) => {
    // Get or create test venture
    const venturesRes = await request.get(`${API_BASE}/api/ventures`);
    if (venturesRes.ok()) {
      const ventures = await venturesRes.json();
      if (Array.isArray(ventures) && ventures.length > 0) {
        testVentureId = ventures[0].id;
        testCompanyId = ventures[0].company_id || testVentureId; // Use same as fallback
      }
    }

    // Fallback IDs
    if (!testVentureId) testVentureId = '00000000-0000-0000-0000-000000000001';
    if (!testCompanyId) testCompanyId = testVentureId;

    // Try to get a brand genome for testing
    const brandGenomeRes = await request.get(`${API_BASE}/api/v2/brand-genome/list?venture_id=${testVentureId}`);
    if (brandGenomeRes.ok()) {
      const data = await brandGenomeRes.json();
      if (data.genomes?.length > 0 || data.data?.length > 0) {
        testBrandGenomeId = (data.genomes || data.data)[0].id;
      }
    }
  });

  // ============================================================
  // NAMING ENGINE TESTS
  // ============================================================

  test.describe('Naming Engine', () => {
    test('GET /suggestions/:brand_genome_id - should handle missing ID', async ({ request }) => {
      const response = await request.get(
        `${API_BASE}/api/v2/naming-engine/suggestions/00000000-0000-0000-0000-000000000000`
      );

      // Should return empty suggestions or 404, not error
      expect([200, 404]).toContain(response.status());

      if (response.ok()) {
        const data = await response.json();
        expect(data.suggestions).toBeDefined();
        expect(Array.isArray(data.suggestions)).toBe(true);
      }
    });

    test('POST /generate - should validate required fields', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/v2/naming-engine/generate`, {
        data: {
          count: 5
          // Missing brand_genome_id
        }
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    test('POST /generate - should validate brand_genome_id format', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/v2/naming-engine/generate`, {
        data: {
          brand_genome_id: 'invalid-uuid-format',
          count: 5
        }
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    test('POST /generate - should handle non-existent brand genome', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/v2/naming-engine/generate`, {
        data: {
          brand_genome_id: '00000000-0000-0000-0000-000000000000',
          count: 5
        }
      });

      // Should return 404 for non-existent brand genome
      expect(response.status()).toBe(404);
      const data = await response.json();
      expect(data.error).toContain('not found');
    });

    test('GET /suggestions/:id - should return suggestions list', async ({ request }) => {
      test.skip(!testBrandGenomeId, 'No test brand genome available');

      const response = await request.get(
        `${API_BASE}/api/v2/naming-engine/suggestions/${testBrandGenomeId}`
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data.suggestions).toBeDefined();
      expect(Array.isArray(data.suggestions)).toBe(true);
      expect(data.count).toBeDefined();
    });
  });

  // ============================================================
  // FINANCIAL ENGINE TESTS
  // ============================================================

  test.describe('Financial Engine', () => {
    test('POST /project - should validate required fields', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/v2/financial-engine/project`, {
        data: {
          model_name: 'Test Model'
          // Missing venture_id, company_id, template_type, assumptions
        }
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    test('POST /project - should validate template_type enum', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/v2/financial-engine/project`, {
        data: {
          venture_id: testVentureId,
          company_id: testCompanyId,
          template_type: 'invalid_template',
          model_name: 'Test Model',
          assumptions: {}
        }
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    test('POST /project - should create financial projection (SaaS)', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/v2/financial-engine/project`, {
        data: {
          venture_id: testVentureId,
          company_id: testCompanyId,
          template_type: 'saas',
          model_name: `E2E Test Model - ${Date.now()}`,
          assumptions: {
            initial_mrr: 10000,
            monthly_growth_rate: 5,
            monthly_churn_rate: 2,
            cogs_percentage: 20,
            fixed_costs_monthly: 50000,
            initial_funding: 500000
          },
          projection_years: 3,
          period_type: 'yearly'
        }
      });

      // May fail if venture doesn't exist in DB
      if (response.ok()) {
        const data = await response.json();

        expect(data.success).toBe(true);
        expect(data.model_id).toBeDefined();
        expect(data.projection_id).toBeDefined();
        expect(data.projection.periods).toBeDefined();
        expect(Array.isArray(data.projection.periods)).toBe(true);
        expect(data.projection.periods.length).toBe(3); // 3 years

        testFinancialModelId = data.model_id;
        console.log(`Created financial model: ${testFinancialModelId}`);
      } else {
        // If venture doesn't exist, skip gracefully
        const data = await response.json();
        if (data.error?.includes('not found')) {
          console.log('Financial model creation skipped (venture not found)');
        } else {
          expect(response.ok()).toBeTruthy(); // Fail on unexpected error
        }
      }
    });

    test('GET /:id - should retrieve financial model', async ({ request }) => {
      test.skip(!testFinancialModelId, 'No financial model created');

      const response = await request.get(
        `${API_BASE}/api/v2/financial-engine/${testFinancialModelId}`
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.model).toBeDefined();
      expect(data.projections).toBeDefined();
      expect(Array.isArray(data.projections)).toBe(true);
    });

    test('POST /:id/scenario - should create scenario', async ({ request }) => {
      test.skip(!testFinancialModelId, 'No financial model created');

      const response = await request.post(
        `${API_BASE}/api/v2/financial-engine/${testFinancialModelId}/scenario`,
        {
          data: {
            scenario_type: 'best_case',
            name: 'Optimistic Growth Scenario'
          }
        }
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.scenario_id).toBeDefined();
      expect(data.scenario.periods).toBeDefined();
      expect(data.scenario.metrics).toBeDefined();
    });

    test('GET /:id/export - should export model data', async ({ request }) => {
      test.skip(!testFinancialModelId, 'No financial model created');

      const response = await request.get(
        `${API_BASE}/api/v2/financial-engine/${testFinancialModelId}/export`
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.export_format).toBe('json');
      expect(data.data).toBeDefined();
      expect(data.data.model).toBeDefined();
    });

    test('GET /list/:venture_id - should list models for venture', async ({ request }) => {
      const response = await request.get(
        `${API_BASE}/api/v2/financial-engine/list/${testVentureId}`
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.models).toBeDefined();
      expect(Array.isArray(data.models)).toBe(true);
    });
  });

  // ============================================================
  // CONTENT FORGE TESTS
  // ============================================================

  test.describe('Content Forge', () => {
    test('POST /generate - should validate required fields', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/v2/content-forge/generate`, {
        data: {
          content_type: 'landing_page'
          // Missing brand_genome_id
        }
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    test('POST /generate - should validate content_type enum', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/v2/content-forge/generate`, {
        data: {
          brand_genome_id: '00000000-0000-0000-0000-000000000000',
          content_type: 'invalid_type'
        }
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    test('POST /generate - should handle non-existent brand genome', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/v2/content-forge/generate`, {
        data: {
          brand_genome_id: '00000000-0000-0000-0000-000000000000',
          content_type: 'landing_page'
        }
      });

      expect(response.status()).toBe(404);
      const data = await response.json();
      expect(data.error).toContain('not found');
    });

    test('GET /list - should return content list', async ({ request }) => {
      const response = await request.get(`${API_BASE}/api/v2/content-forge/list`);

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.items).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
      expect(data.total).toBeDefined();
    });

    test('GET /list - should filter by content_type', async ({ request }) => {
      const response = await request.get(
        `${API_BASE}/api/v2/content-forge/list?content_type=landing_page`
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data.items).toBeDefined();
      // All items should have landing_page type
      for (const item of data.items) {
        expect(item.content_type).toBe('landing_page');
      }
    });

    test('POST /compliance-check - should validate request', async ({ request }) => {
      const response = await request.post(
        `${API_BASE}/api/v2/content-forge/compliance-check`,
        {
          data: {}
          // Missing both content_id and content
        }
      );

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    test('POST /compliance-check - should check inline content', async ({ request }) => {
      const response = await request.post(
        `${API_BASE}/api/v2/content-forge/compliance-check`,
        {
          data: {
            content: 'This is a great product that helps customers succeed. Our innovative solution provides value.'
          }
        }
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.score).toBeDefined();
      expect(data.score).toBeGreaterThanOrEqual(0);
      expect(data.score).toBeLessThanOrEqual(100);
      expect(data.issues).toBeDefined();
      expect(Array.isArray(data.issues)).toBe(true);
    });

    test('POST /compliance-check - should detect forbidden terms', async ({ request }) => {
      const response = await request.post(
        `${API_BASE}/api/v2/content-forge/compliance-check`,
        {
          data: {
            content: 'We guarantee the best results! Our world\'s best solution is #1 in the industry with unlimited features.'
          }
        }
      );

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.score).toBeLessThan(100); // Should have deductions
      expect(data.issues.length).toBeGreaterThan(0); // Should flag forbidden terms
    });
  });

  // ============================================================
  // CROSS-ENGINE TESTS
  // ============================================================

  test.describe('Cross-Engine Validation', () => {
    test('All AI engine endpoints should be accessible', async ({ request }) => {
      const endpoints = [
        { method: 'GET', path: '/api/v2/content-forge/list' },
        { method: 'GET', path: `/api/v2/financial-engine/list/${testVentureId}` },
        { method: 'GET', path: '/api/v2/naming-engine/suggestions/00000000-0000-0000-0000-000000000000' }
      ];

      for (const endpoint of endpoints) {
        const response = await request.get(`${API_BASE}${endpoint.path}`);
        // Should return 200 or 404, not 500
        expect([200, 404]).toContain(response.status());
      }
    });

    test('Validation errors should return consistent format', async ({ request }) => {
      const invalidRequests = [
        {
          path: '/api/v2/naming-engine/generate',
          data: { count: 5 }
        },
        {
          path: '/api/v2/financial-engine/project',
          data: { model_name: 'Test' }
        },
        {
          path: '/api/v2/content-forge/generate',
          data: { content_type: 'landing_page' }
        }
      ];

      for (const req of invalidRequests) {
        const response = await request.post(`${API_BASE}${req.path}`, {
          data: req.data
        });

        expect(response.status()).toBe(400);
        const data = await response.json();
        expect(data.error).toBeDefined();
      }
    });
  });

  test.afterAll(async ({ request }) => {
    // Cleanup: Delete test financial model if created
    if (testFinancialModelId) {
      try {
        await request.delete(
          `${API_BASE}/api/v2/financial-engine/${testFinancialModelId}`
        );
        console.log(`Cleaned up financial model: ${testFinancialModelId}`);
      } catch {
        console.log('Financial model cleanup skipped');
      }
    }
  });
});
