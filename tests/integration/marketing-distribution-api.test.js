/**
 * Marketing Distribution API Integration Tests
 * SD-MARKETING-AUTOMATION-001
 *
 * Tests the Marketing Distribution API endpoints:
 *   - GET  /api/v2/marketing/queue/:venture_id
 *   - POST /api/v2/marketing/queue
 *   - PUT  /api/v2/marketing/queue/:id/review
 *   - POST /api/v2/marketing/distribute/:id
 *   - GET  /api/v2/marketing/history/:venture_id
 *   - GET  /api/v2/marketing/channels
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Test fixtures
let testVentureId;
let testCompanyId;
let testQueueItemId;
let testChannelId;

// Mock request/response
function createMockReq(body = {}, params = {}, query = {}) {
  return { body, params, query, user: { id: null } };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    jsonData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    }
  };
  return res;
}

describe('Marketing Distribution API', () => {
  beforeAll(async () => {
    // Create test company and venture
    testCompanyId = uuidv4();
    testVentureId = uuidv4();

    const { error: companyError } = await supabase.from('companies').insert({
      id: testCompanyId,
      name: 'Test Company for Marketing Distribution',
      created_at: new Date().toISOString()
    });
    if (companyError) console.error('Company insert error:', companyError.message);

    const { error: ventureError } = await supabase.from('ventures').insert({
      id: testVentureId,
      name: 'Test Venture for Marketing',
      company_id: testCompanyId,
      problem_statement: 'Test problem statement',
      current_lifecycle_stage: 1,
      status: 'active',
      created_at: new Date().toISOString()
    });
    if (ventureError) console.error('Venture insert error:', ventureError.message);

    // Get a channel for testing
    const { data: channels } = await supabase
      .from('distribution_channels')
      .select('id')
      .limit(1);
    if (channels?.length) {
      testChannelId = channels[0].id;
    }
  });

  afterAll(async () => {
    // Clean up test data
    if (testQueueItemId) {
      await supabase.from('distribution_history').delete().eq('queue_item_id', testQueueItemId);
      await supabase.from('marketing_content_queue').delete().eq('id', testQueueItemId);
    }
    if (testVentureId) {
      await supabase.from('marketing_content_queue').delete().eq('venture_id', testVentureId);
      await supabase.from('distribution_history').delete().eq('venture_id', testVentureId);
      await supabase.from('ventures').delete().eq('id', testVentureId);
    }
    if (testCompanyId) {
      await supabase.from('companies').delete().eq('id', testCompanyId);
    }
  });

  describe('GET /api/v2/marketing/channels', () => {
    it('should return list of distribution channels', async () => {
      const { getChannels } = await import('../../src/api/marketing-distribution/index.js');
      const req = createMockReq();
      const res = createMockRes();

      await getChannels(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.channels).toBeDefined();
      expect(Array.isArray(res.jsonData.channels)).toBe(true);
      // Should have at least the default channels
      expect(res.jsonData.count).toBeGreaterThanOrEqual(4);
    });
  });

  describe('POST /api/v2/marketing/queue', () => {
    it('should validate venture_id is required', async () => {
      const { addToQueue } = await import('../../src/api/marketing-distribution/index.js');
      const req = createMockReq({
        title: 'Test Content',
        content_body: 'Test body'
      });
      const res = createMockRes();

      await addToQueue(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toBe('Validation error');
    });

    it('should add content to queue successfully', async () => {
      const { addToQueue } = await import('../../src/api/marketing-distribution/index.js');
      const req = createMockReq({
        venture_id: testVentureId,
        title: 'Test Marketing Content',
        content_body: 'This is a test marketing post for our new product launch.',
        content_type: 'social_post',
        utm_campaign: 'test-campaign-2026'
      });
      const res = createMockRes();

      await addToQueue(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.queue_item).toBeDefined();
      expect(res.jsonData.queue_item.status).toBe('pending_review');
      testQueueItemId = res.jsonData.queue_item.id;
    });
  });

  describe('GET /api/v2/marketing/queue/:venture_id', () => {
    it('should require venture_id', async () => {
      const { getQueue } = await import('../../src/api/marketing-distribution/index.js');
      const req = createMockReq({}, {});
      const res = createMockRes();

      await getQueue(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toBe('venture_id required');
    });

    it('should return queue items for venture', async () => {
      const { getQueue } = await import('../../src/api/marketing-distribution/index.js');
      const req = createMockReq({}, { venture_id: testVentureId });
      const res = createMockRes();

      await getQueue(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.queue).toBeDefined();
      expect(Array.isArray(res.jsonData.queue)).toBe(true);
      expect(res.jsonData.count).toBeGreaterThanOrEqual(1);
    });

    it('should filter by status', async () => {
      const { getQueue } = await import('../../src/api/marketing-distribution/index.js');
      const req = createMockReq({}, { venture_id: testVentureId }, { status: 'pending_review' });
      const res = createMockRes();

      await getQueue(req, res);

      expect(res.statusCode).toBe(200);
      // All returned items should have pending_review status
      for (const item of res.jsonData.queue) {
        expect(item.status).toBe('pending_review');
      }
    });
  });

  describe('PUT /api/v2/marketing/queue/:id/review', () => {
    it('should require action (approve/reject)', async () => {
      const { reviewContent } = await import('../../src/api/marketing-distribution/index.js');
      const req = createMockReq({}, { id: testQueueItemId });
      const res = createMockRes();

      await reviewContent(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toBe('Validation error');
    });

    it('should approve content successfully', async () => {
      const { reviewContent } = await import('../../src/api/marketing-distribution/index.js');
      const req = createMockReq(
        { action: 'approve', notes: 'Looks good for posting' },
        { id: testQueueItemId }
      );
      const res = createMockRes();

      await reviewContent(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.action).toBe('approve');
      expect(res.jsonData.queue_item.status).toBe('approved');
    });
  });

  describe('POST /api/v2/marketing/distribute/:id', () => {
    it('should require channel_id and platform', async () => {
      const { distributeContent } = await import('../../src/api/marketing-distribution/index.js');
      const req = createMockReq({}, { id: testQueueItemId });
      const res = createMockRes();

      await distributeContent(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toBe('Validation error');
    });

    it('should distribute content and create history record', async () => {
      if (!testChannelId) {
        console.log('Skipping: No channel available');
        return;
      }

      const { distributeContent } = await import('../../src/api/marketing-distribution/index.js');
      const req = createMockReq(
        {
          channel_id: testChannelId,
          platform: 'linkedin'
        },
        { id: testQueueItemId }
      );
      const res = createMockRes();

      await distributeContent(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.distribution).toBeDefined();
      expect(res.jsonData.distribution.platform).toBe('linkedin');
      expect(res.jsonData.utm_params).toBeDefined();
    });
  });

  describe('GET /api/v2/marketing/history/:venture_id', () => {
    it('should require venture_id', async () => {
      const { getHistory } = await import('../../src/api/marketing-distribution/index.js');
      const req = createMockReq({}, {});
      const res = createMockRes();

      await getHistory(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toBe('venture_id required');
    });

    it('should return distribution history', async () => {
      const { getHistory } = await import('../../src/api/marketing-distribution/index.js');
      const req = createMockReq({}, { venture_id: testVentureId });
      const res = createMockRes();

      await getHistory(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.history).toBeDefined();
      expect(Array.isArray(res.jsonData.history)).toBe(true);
      expect(res.jsonData.stats).toBeDefined();
    });

    it('should filter by platform', async () => {
      const { getHistory } = await import('../../src/api/marketing-distribution/index.js');
      const req = createMockReq({}, { venture_id: testVentureId }, { platform: 'linkedin' });
      const res = createMockRes();

      await getHistory(req, res);

      expect(res.statusCode).toBe(200);
      // All returned items should have linkedin platform
      for (const item of res.jsonData.history) {
        expect(item.platform).toBe('linkedin');
      }
    });
  });

  describe('Database Schema', () => {
    it('should have marketing_content_queue table', async () => {
      const { data, error } = await supabase
        .from('marketing_content_queue')
        .select('*')
        .limit(1);

      expect(error).toBeNull();
    });

    it('should have distribution_history table', async () => {
      const { data, error } = await supabase
        .from('distribution_history')
        .select('*')
        .limit(1);

      expect(error).toBeNull();
    });

    it('should have distribution_channels table with defaults', async () => {
      const { data, error } = await supabase
        .from('distribution_channels')
        .select('*');

      expect(error).toBeNull();
      expect(data?.length).toBeGreaterThanOrEqual(4);

      // Check default channels exist
      const platforms = data?.map(c => c.platform);
      expect(platforms).toContain('linkedin');
      expect(platforms).toContain('twitter');
      expect(platforms).toContain('facebook');
      expect(platforms).toContain('instagram');
    });
  });

  describe('UTM Generation', () => {
    it('should generate UTM params via function', async () => {
      if (!testChannelId) {
        console.log('Skipping: No channel available');
        return;
      }

      const { data, error } = await supabase.rpc('generate_utm_params', {
        p_venture_id: testVentureId,
        p_channel_id: testChannelId,
        p_campaign: 'test-campaign'
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.utm_source).toBeDefined();
      expect(data.utm_medium).toBeDefined();
      expect(data.utm_campaign).toBe('test-campaign');
    });
  });
});
