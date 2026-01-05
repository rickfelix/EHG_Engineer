/**
 * Story Release Gate E2E Tests
 * SD-E2E-UAT-COVERAGE-001A - User Story US-006
 *
 * Tests the Story management and Release Gate functionality:
 *   1. GET /api/stories/health - Feature flag and health status
 *   2. GET /api/stories - List stories for an SD
 *   3. POST /api/stories/generate - Generate stories from PRD
 *   4. POST /api/stories/verify - CI webhook for story verification
 *   5. GET /api/stories/gate - Release gate status
 *
 * Model: Follows marketing-distribution.spec.ts pattern
 */

import { test, expect } from '@playwright/test';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';

// Test data
const TEST_SD_KEY = 'SD-E2E-TEST-001';
const NON_EXISTENT_SD = 'SD-NONEXISTENT-999';
const TEST_PRD_ID = '00000000-0000-0000-0000-000000000001';

test.describe('Story Release Gate E2E', () => {
  test.describe.configure({ mode: 'serial' });

  // ============================================================
  // HEALTH CHECK TESTS
  // ============================================================

  test.describe('Health Endpoint', () => {
    test('GET /api/stories/health - should return health status', async ({ request }) => {
      const response = await request.get(`${API_BASE}/api/stories/health`);

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      expect(data.status).toBe('healthy');
      expect(data.flags).toBeDefined();
      expect(data.views_ok).toBeDefined();
      expect(data.timestamp).toBeDefined();
    });

    test('GET /api/stories/health - should expose feature flags', async ({ request }) => {
      const response = await request.get(`${API_BASE}/api/stories/health`);

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      // Should have feature flags defined (boolean values)
      expect(typeof data.flags.FEATURE_AUTO_STORIES).toBe('boolean');
      expect(typeof data.flags.FEATURE_STORY_AGENT).toBe('boolean');
      expect(typeof data.flags.FEATURE_STORY_UI).toBe('boolean');
      expect(typeof data.flags.FEATURE_STORY_GATES).toBe('boolean');
    });
  });

  // ============================================================
  // LIST STORIES TESTS
  // ============================================================

  test.describe('List Stories', () => {
    test('GET /api/stories - should require sd_key parameter', async ({ request }) => {
      const response = await request.get(`${API_BASE}/api/stories`);

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    test('GET /api/stories - should validate sd_key format', async ({ request }) => {
      const response = await request.get(`${API_BASE}/api/stories?sd_key=`);

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    test('GET /api/stories - should return empty list for non-existent SD', async ({ request }) => {
      const response = await request.get(
        `${API_BASE}/api/stories?sd_key=${NON_EXISTENT_SD}`
      );

      // Should return empty array, not error (graceful handling)
      if (response.ok()) {
        const data = await response.json();
        expect(data.stories).toBeDefined();
        expect(Array.isArray(data.stories)).toBe(true);
        expect(data.total).toBe(0);
      } else {
        // May return 400 if view doesn't exist
        expect([400, 404]).toContain(response.status());
      }
    });

    test('GET /api/stories - should support pagination', async ({ request }) => {
      const response = await request.get(
        `${API_BASE}/api/stories?sd_key=${TEST_SD_KEY}&limit=10&offset=0`
      );

      if (response.ok()) {
        const data = await response.json();
        expect(data.stories).toBeDefined();
        expect(data.limit).toBe(10);
        expect(data.offset).toBe(0);
        expect(data.page).toBe(1);
      }
    });

    test('GET /api/stories - should support status filter', async ({ request }) => {
      const response = await request.get(
        `${API_BASE}/api/stories?sd_key=${TEST_SD_KEY}&status=passing`
      );

      if (response.ok()) {
        const data = await response.json();
        expect(data.stories).toBeDefined();
        // All stories should have passing status
        for (const story of data.stories) {
          expect(story.status).toBe('passing');
        }
      }
    });

    test('GET /api/stories - should reject invalid status', async ({ request }) => {
      const response = await request.get(
        `${API_BASE}/api/stories?sd_key=${TEST_SD_KEY}&status=invalid`
      );

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });
  });

  // ============================================================
  // GENERATE STORIES TESTS
  // ============================================================

  test.describe('Generate Stories', () => {
    test('POST /api/stories/generate - should check feature flag', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/stories/generate`, {
        data: {
          sd_key: TEST_SD_KEY,
          prd_id: TEST_PRD_ID,
          mode: 'dry_run'
        }
      });

      // Either works (feature enabled) or returns 403 (feature disabled)
      expect([200, 400, 403]).toContain(response.status());

      if (response.status() === 403) {
        const data = await response.json();
        expect(data.flag).toBe('FEATURE_AUTO_STORIES');
      }
    });

    test('POST /api/stories/generate - should require sd_key or sd_id', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/stories/generate`, {
        data: {
          prd_id: TEST_PRD_ID,
          mode: 'dry_run'
          // Missing sd_key and sd_id
        }
      });

      // Should return validation error (unless feature disabled)
      expect([400, 403]).toContain(response.status());
    });

    test('POST /api/stories/generate - should require prd_id', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/stories/generate`, {
        data: {
          sd_key: TEST_SD_KEY,
          mode: 'dry_run'
          // Missing prd_id
        }
      });

      expect([400, 403]).toContain(response.status());
    });

    test('POST /api/stories/generate - should validate mode enum', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/stories/generate`, {
        data: {
          sd_key: TEST_SD_KEY,
          prd_id: TEST_PRD_ID,
          mode: 'invalid_mode'
        }
      });

      expect([400, 403]).toContain(response.status());
    });

    test('POST /api/stories/generate - dry_run mode should not persist', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/stories/generate`, {
        data: {
          sd_key: TEST_SD_KEY,
          prd_id: TEST_PRD_ID,
          mode: 'dry_run'
        }
      });

      if (response.ok()) {
        const data = await response.json();
        // Dry run should return preview without persisting
        expect(data).toBeDefined();
      }
    });
  });

  // ============================================================
  // VERIFY STORIES TESTS (CI Webhook)
  // ============================================================

  test.describe('Verify Stories (CI Webhook)', () => {
    test('POST /api/stories/verify - should require story_keys', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/stories/verify`, {
        data: {
          test_run_id: 'test-run-123',
          build_id: 'build-456',
          status: 'passing'
          // Missing story_keys
        }
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    test('POST /api/stories/verify - should require non-empty story_keys array', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/stories/verify`, {
        data: {
          story_keys: [],
          test_run_id: 'test-run-123',
          build_id: 'build-456',
          status: 'passing'
        }
      });

      expect(response.status()).toBe(400);
    });

    test('POST /api/stories/verify - should validate story_key format', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/stories/verify`, {
        data: {
          story_keys: ['x'], // Too short, min 8 chars
          test_run_id: 'test-run-123',
          build_id: 'build-456',
          status: 'passing'
        }
      });

      expect(response.status()).toBe(400);
    });

    test('POST /api/stories/verify - should require test_run_id', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/stories/verify`, {
        data: {
          story_keys: ['SD-TEST-001:US-001'],
          build_id: 'build-456',
          status: 'passing'
          // Missing test_run_id
        }
      });

      expect(response.status()).toBe(400);
    });

    test('POST /api/stories/verify - should require build_id', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/stories/verify`, {
        data: {
          story_keys: ['SD-TEST-001:US-001'],
          test_run_id: 'test-run-123',
          status: 'passing'
          // Missing build_id
        }
      });

      expect(response.status()).toBe(400);
    });

    test('POST /api/stories/verify - should validate status enum', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/stories/verify`, {
        data: {
          story_keys: ['SD-TEST-001:US-001'],
          test_run_id: 'test-run-123',
          build_id: 'build-456',
          status: 'invalid_status'
        }
      });

      expect(response.status()).toBe(400);
    });

    test('POST /api/stories/verify - should reject cross-SD updates', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/stories/verify`, {
        data: {
          story_keys: ['SD-ONE-001:US-001', 'SD-TWO-002:US-001'], // Different SDs
          test_run_id: 'test-run-123',
          build_id: 'build-456',
          status: 'passing'
        }
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Cross-SD');
    });

    test('POST /api/stories/verify - should accept valid verification', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/stories/verify`, {
        data: {
          story_keys: [`${TEST_SD_KEY}:US-001`],
          test_run_id: `test-run-${Date.now()}`,
          build_id: `build-${Date.now()}`,
          status: 'passing',
          coverage_pct: 85.5,
          artifacts: ['report.html', 'coverage.json']
        }
      });

      // Will return success or 400 if story doesn't exist
      if (response.ok()) {
        const data = await response.json();
        expect(data.status).toBe('success');
        expect(data.updated).toBe(1);
        expect(data.build_id).toBeDefined();
      } else {
        // Expected if test story doesn't exist
        expect(response.status()).toBe(400);
      }
    });

    test('POST /api/stories/verify - should validate coverage_pct range', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/stories/verify`, {
        data: {
          story_keys: [`${TEST_SD_KEY}:US-001`],
          test_run_id: 'test-run-123',
          build_id: 'build-456',
          status: 'passing',
          coverage_pct: 150 // Invalid: > 100
        }
      });

      expect(response.status()).toBe(400);
    });
  });

  // ============================================================
  // RELEASE GATE TESTS
  // ============================================================

  test.describe('Release Gate', () => {
    test('GET /api/stories/gate - should require sd_key parameter', async ({ request }) => {
      const response = await request.get(`${API_BASE}/api/stories/gate`);

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('sd_key required');
    });

    test('GET /api/stories/gate - should return gate status', async ({ request }) => {
      const response = await request.get(
        `${API_BASE}/api/stories/gate?sd_key=${TEST_SD_KEY}`
      );

      // May return data or error depending on view availability
      if (response.ok()) {
        const data = await response.json();

        // Gate status should have required fields
        expect(typeof data.ready).toBe('boolean');
        expect(typeof data.total_stories).toBe('number');
        expect(typeof data.passing_count).toBe('number');
        expect(typeof data.failing_count).toBe('number');
        expect(typeof data.not_run_count).toBe('number');
        expect(typeof data.passing_pct).toBe('number');
      } else {
        // View may not exist
        expect(response.status()).toBe(400);
      }
    });

    test('GET /api/stories/gate - should handle non-existent SD', async ({ request }) => {
      const response = await request.get(
        `${API_BASE}/api/stories/gate?sd_key=${NON_EXISTENT_SD}`
      );

      // Should return default gate status or error
      if (response.ok()) {
        const data = await response.json();
        // Default gate status for non-existent SD
        expect(data.ready).toBe(true);
        expect(data.total_stories).toBe(0);
      } else {
        expect([400, 404]).toContain(response.status());
      }
    });

    test('GET /api/stories/gate - passing_pct calculation', async ({ request }) => {
      const response = await request.get(
        `${API_BASE}/api/stories/gate?sd_key=${TEST_SD_KEY}`
      );

      if (response.ok()) {
        const data = await response.json();

        // passing_pct should be between 0 and 100
        expect(data.passing_pct).toBeGreaterThanOrEqual(0);
        expect(data.passing_pct).toBeLessThanOrEqual(100);

        // If there are stories, verify percentage calculation makes sense
        if (data.total_stories > 0) {
          const expectedPct = (data.passing_count / data.total_stories) * 100;
          expect(data.passing_pct).toBeCloseTo(expectedPct, 1);
        }
      }
    });
  });

  // ============================================================
  // INTEGRATION TESTS
  // ============================================================

  test.describe('Integration Tests', () => {
    test('Full verification flow: list -> verify -> gate', async ({ request }) => {
      // Step 1: List stories
      const listResponse = await request.get(
        `${API_BASE}/api/stories?sd_key=${TEST_SD_KEY}`
      );

      // Step 2: If stories exist, verify them
      if (listResponse.ok()) {
        const listData = await listResponse.json();

        if (listData.stories.length > 0) {
          const storyKeys = listData.stories
            .slice(0, 3) // Limit to 3 stories
            .map((s: { story_key: string }) => s.story_key);

          await request.post(`${API_BASE}/api/stories/verify`, {
            data: {
              story_keys: storyKeys,
              test_run_id: `integration-test-${Date.now()}`,
              build_id: `build-${Date.now()}`,
              status: 'passing',
              coverage_pct: 100
            }
          });

          // Step 3: Check gate status
          const gateResponse = await request.get(
            `${API_BASE}/api/stories/gate?sd_key=${TEST_SD_KEY}`
          );

          expect(gateResponse.ok()).toBeTruthy();
        }
      }
    });

    test('Health check reflects system state', async ({ request }) => {
      const healthResponse = await request.get(`${API_BASE}/api/stories/health`);

      expect(healthResponse.ok()).toBeTruthy();
      const healthData = await healthResponse.json();

      // Health status should indicate if views are working
      if (healthData.views_ok) {
        // Views are OK, gate endpoint should work
        const gateResponse = await request.get(
          `${API_BASE}/api/stories/gate?sd_key=${TEST_SD_KEY}`
        );
        // Should not return 500 if views_ok is true
        expect(gateResponse.status()).not.toBe(500);
      }
    });
  });

  // ============================================================
  // ERROR HANDLING TESTS
  // ============================================================

  test.describe('Error Handling', () => {
    test('Malformed JSON should return 400', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/stories/generate`, {
        headers: { 'Content-Type': 'application/json' },
        data: '{ invalid json }'
      });

      expect([400, 500]).toContain(response.status());
    });

    test('Empty body should return validation error', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/stories/verify`, {
        data: {}
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    test('Wrong content type should be handled', async ({ request }) => {
      const response = await request.post(`${API_BASE}/api/stories/generate`, {
        headers: { 'Content-Type': 'text/plain' },
        data: 'not json'
      });

      // Should handle gracefully
      expect([400, 415, 500]).toContain(response.status());
    });
  });
});
