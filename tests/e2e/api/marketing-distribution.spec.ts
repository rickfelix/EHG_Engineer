/**
 * Marketing Distribution API E2E Tests
 * SD-QA-E2E-COVERAGE-001
 *
 * Tests the Marketing Distribution API endpoints:
 *   - GET  /api/v2/marketing/channels
 *   - POST /api/v2/marketing/queue
 *   - GET  /api/v2/marketing/queue/:venture_id
 *   - PUT  /api/v2/marketing/queue/:id/review
 *   - POST /api/v2/marketing/distribute/:id
 *   - GET  /api/v2/marketing/history/:venture_id
 */

import { test, expect } from '@playwright/test';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';

// Test data
let testVentureId: string;
let testQueueItemId: string;
let testChannelId: string;

test.describe('Marketing Distribution API E2E', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ request }) => {
    // Get test venture from existing data
    const venturesRes = await request.get(`${API_BASE}/api/v2/ventures?limit=1`);
    if (venturesRes.ok()) {
      const ventures = await venturesRes.json();
      if (ventures.data?.length > 0) {
        testVentureId = ventures.data[0].id;
      }
    }

    // Fallback: use a known test venture ID
    if (!testVentureId) {
      testVentureId = '00000000-0000-0000-0000-000000000001';
    }
  });

  test('GET /channels - should return available distribution channels', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v2/marketing/channels`);

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    expect(data.channels).toBeDefined();
    expect(Array.isArray(data.channels)).toBe(true);
    expect(data.count).toBeGreaterThanOrEqual(4);

    // Verify default channels exist
    const platforms = data.channels.map((c: { platform: string }) => c.platform);
    expect(platforms).toContain('linkedin');
    expect(platforms).toContain('twitter');

    // Store a channel for later tests
    if (data.channels.length > 0) {
      testChannelId = data.channels[0].id;
    }
  });

  test('POST /queue - should validate required fields', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/v2/marketing/queue`, {
      data: {
        title: 'Test Content',
        content_body: 'Test body'
        // Missing venture_id
      }
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Validation error');
  });

  test('POST /queue - should add content to queue', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/v2/marketing/queue`, {
      data: {
        venture_id: testVentureId,
        title: 'E2E Test Marketing Content',
        content_body: 'This is test content for E2E testing of marketing distribution.',
        content_type: 'social_post',
        utm_campaign: 'e2e-test-campaign'
      }
    });

    expect(response.status()).toBe(201);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.queue_item).toBeDefined();
    expect(data.queue_item.status).toBe('pending_review');
    expect(data.queue_item.title).toBe('E2E Test Marketing Content');

    testQueueItemId = data.queue_item.id;
  });

  test('GET /queue/:venture_id - should return queue items', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/v2/marketing/queue/${testVentureId}`
    );

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    expect(data.queue).toBeDefined();
    expect(Array.isArray(data.queue)).toBe(true);
    expect(data.count).toBeGreaterThanOrEqual(1);
  });

  test('GET /queue/:venture_id - should filter by status', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/v2/marketing/queue/${testVentureId}?status=pending_review`
    );

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    // All items should have pending_review status
    for (const item of data.queue) {
      expect(item.status).toBe('pending_review');
    }
  });

  test('PUT /queue/:id/review - should require action', async ({ request }) => {
    const response = await request.put(
      `${API_BASE}/api/v2/marketing/queue/${testQueueItemId}/review`,
      {
        data: {
          notes: 'Missing action'
          // Missing action field
        }
      }
    );

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Validation error');
  });

  test('PUT /queue/:id/review - should approve content', async ({ request }) => {
    const response = await request.put(
      `${API_BASE}/api/v2/marketing/queue/${testQueueItemId}/review`,
      {
        data: {
          action: 'approve',
          notes: 'Approved via E2E test'
        }
      }
    );

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.action).toBe('approve');
    expect(data.queue_item.status).toBe('approved');
  });

  test('POST /distribute/:id - should require channel_id and platform', async ({ request }) => {
    const response = await request.post(
      `${API_BASE}/api/v2/marketing/distribute/${testQueueItemId}`,
      {
        data: {
          // Missing required fields
        }
      }
    );

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Validation error');
  });

  test('POST /distribute/:id - should distribute content', async ({ request }) => {
    test.skip(!testChannelId, 'No channel available for testing');

    const response = await request.post(
      `${API_BASE}/api/v2/marketing/distribute/${testQueueItemId}`,
      {
        data: {
          channel_id: testChannelId,
          platform: 'linkedin'
        }
      }
    );

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.distribution).toBeDefined();
    expect(data.distribution.platform).toBe('linkedin');
    expect(data.utm_params).toBeDefined();
  });

  test('GET /history/:venture_id - should return distribution history', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/v2/marketing/history/${testVentureId}`
    );

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    expect(data.history).toBeDefined();
    expect(Array.isArray(data.history)).toBe(true);
    expect(data.stats).toBeDefined();
  });

  test('GET /history/:venture_id - should filter by platform', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/v2/marketing/history/${testVentureId}?platform=linkedin`
    );

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    // All items should have linkedin platform
    for (const item of data.history) {
      expect(item.platform).toBe('linkedin');
    }
  });

  test.afterAll(async ({ request }) => {
    // Cleanup: Delete test queue item
    if (testQueueItemId) {
      await request.delete(
        `${API_BASE}/api/v2/marketing/queue/${testQueueItemId}`
      );
    }
  });
});
