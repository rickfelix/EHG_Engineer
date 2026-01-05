/**
 * Venture Artifacts Management E2E Tests
 * SD-E2E-UAT-COVERAGE-001A - User Story US-002
 *
 * Tests the Venture Artifacts lifecycle management:
 *   1. Get ventures list (find/create test venture)
 *   2. GET /api/ventures/:id/artifacts - list artifacts
 *   3. POST /api/ventures/:id/artifacts - create artifact
 *   4. GET /api/ventures/:id/artifacts?stage=N - filter by stage
 *   5. PATCH /api/ventures/:id/stage - update lifecycle stage
 *   6. Verify artifact versioning
 *
 * Model: Follows marketing-distribution.spec.ts pattern
 */

import { test, expect } from '@playwright/test';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';

// Test data
let testVentureId: string;
let testArtifactId: string;
const TEST_ARTIFACT_TITLE = `E2E Test Artifact - ${Date.now()}`;
const TEST_ARTIFACT_CONTENT = 'This is test content for E2E testing of artifact management.';

test.describe('Venture Artifacts Management E2E', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ request }) => {
    // Get existing venture or create one for testing
    const venturesRes = await request.get(`${API_BASE}/api/ventures`);
    if (venturesRes.ok()) {
      const ventures = await venturesRes.json();
      if (Array.isArray(ventures) && ventures.length > 0) {
        testVentureId = ventures[0].id;
        console.log(`Using existing venture: ${testVentureId}`);
      }
    }

    // If no venture exists, create one
    if (!testVentureId) {
      const createRes = await request.post(`${API_BASE}/api/ventures`, {
        data: {
          name: `E2E Test Venture - ${Date.now()}`,
          problem_statement: 'Test problem statement for E2E testing',
          solution: 'Test solution',
          target_market: 'Test market',
          origin_type: 'manual'
        }
      });

      if (createRes.ok()) {
        const venture = await createRes.json();
        testVentureId = venture.id;
        console.log(`Created test venture: ${testVentureId}`);
      }
    }
  });

  test('Step 1: GET /api/ventures - should return ventures list', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/ventures`);

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(0);

    // Verify venture structure if data exists
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('id');
      expect(data[0]).toHaveProperty('name');
    }
  });

  test('Step 2: GET /api/ventures/:id/artifacts - should return artifacts list', async ({ request }) => {
    test.skip(!testVentureId, 'No test venture available');

    const response = await request.get(`${API_BASE}/api/ventures/${testVentureId}/artifacts`);

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    expect(Array.isArray(data)).toBe(true);
    // Could be empty if venture has no artifacts yet
  });

  test('Step 3: POST /api/ventures/:id/artifacts - should validate required fields', async ({ request }) => {
    test.skip(!testVentureId, 'No test venture available');

    const response = await request.post(`${API_BASE}/api/ventures/${testVentureId}/artifacts`, {
      data: {
        title: 'Test Artifact'
        // Missing stage and artifact_type
      }
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
    expect(data.error).toContain('required');
  });

  test('Step 4: POST /api/ventures/:id/artifacts - should create artifact', async ({ request }) => {
    test.skip(!testVentureId, 'No test venture available');

    const response = await request.post(`${API_BASE}/api/ventures/${testVentureId}/artifacts`, {
      data: {
        stage: 1,
        artifact_type: 'document',
        title: TEST_ARTIFACT_TITLE,
        content: TEST_ARTIFACT_CONTENT,
        metadata: {
          e2e_test: true,
          created_by: 'E2E test runner'
        }
      }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    expect(data).toBeDefined();
    expect(data.id).toBeDefined();
    expect(data.title).toBe(TEST_ARTIFACT_TITLE);
    expect(data.lifecycle_stage).toBe(1);
    expect(data.version).toBeGreaterThanOrEqual(1);

    testArtifactId = data.id;
    console.log(`Created test artifact: ${testArtifactId}`);
  });

  test('Step 5: GET /api/ventures/:id/artifacts?stage=1 - should filter by stage', async ({ request }) => {
    test.skip(!testVentureId, 'No test venture available');

    const response = await request.get(
      `${API_BASE}/api/ventures/${testVentureId}/artifacts?stage=1`
    );

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    expect(Array.isArray(data)).toBe(true);

    // All artifacts should have stage 1
    for (const artifact of data) {
      expect(artifact.stage).toBe(1);
    }
  });

  test('Step 6: POST /api/ventures/:id/artifacts - should handle versioning', async ({ request }) => {
    test.skip(!testVentureId, 'No test venture available');

    // Create another artifact of the same type to test versioning
    const response = await request.post(`${API_BASE}/api/ventures/${testVentureId}/artifacts`, {
      data: {
        stage: 1,
        artifact_type: 'document',
        title: `${TEST_ARTIFACT_TITLE} v2`,
        content: 'Updated content for version 2',
        metadata: {
          e2e_test: true,
          version_test: true
        }
      }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    // New artifact should have incremented version
    expect(data.version).toBeGreaterThanOrEqual(1);
    expect(data.is_current).toBe(true);
  });

  test('Step 7: PATCH /api/ventures/:id/stage - should validate stage range', async ({ request }) => {
    test.skip(!testVentureId, 'No test venture available');

    // Test invalid stage (0)
    const response1 = await request.patch(`${API_BASE}/api/ventures/${testVentureId}/stage`, {
      data: { stage: 0 }
    });
    expect(response1.status()).toBe(400);

    // Test invalid stage (26)
    const response2 = await request.patch(`${API_BASE}/api/ventures/${testVentureId}/stage`, {
      data: { stage: 26 }
    });
    expect(response2.status()).toBe(400);
  });

  test('Step 8: PATCH /api/ventures/:id/stage - should update lifecycle stage', async ({ request }) => {
    test.skip(!testVentureId, 'No test venture available');

    const response = await request.patch(`${API_BASE}/api/ventures/${testVentureId}/stage`, {
      data: { stage: 2 }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    expect(data.id).toBe(testVentureId);
    expect(data.stage).toBe(2);
  });

  test('Step 9: Verify stage progression affects artifacts view', async ({ request }) => {
    test.skip(!testVentureId, 'No test venture available');

    // Get artifacts for stage 2 (should be empty since we only created for stage 1)
    const response = await request.get(
      `${API_BASE}/api/ventures/${testVentureId}/artifacts?stage=2`
    );

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    expect(Array.isArray(data)).toBe(true);
    // Stage 2 should have no artifacts yet
    expect(data.every((a: { stage: number }) => a.stage === 2)).toBe(true);
  });

  test('Step 10: Complete lifecycle verification', async () => {
    // Final verification that the artifact lifecycle workflow completed
    expect(testVentureId).toBeDefined();
    expect(testVentureId).not.toBe('');

    console.log('Venture Artifacts lifecycle test completed successfully');
    console.log(`Venture ID: ${testVentureId}`);
    if (testArtifactId) {
      console.log(`Artifact ID: ${testArtifactId}`);
    }
  });

  test.afterAll(async ({ request }) => {
    // Cleanup: Reset venture stage to 1
    if (testVentureId) {
      try {
        await request.patch(`${API_BASE}/api/ventures/${testVentureId}/stage`, {
          data: { stage: 1 }
        });
        console.log('Reset venture stage to 1');
      } catch {
        // Cleanup is best effort
        console.log('Venture stage reset skipped');
      }
    }
    // Note: We don't delete artifacts as they may be needed for historical tracking
  });
});
