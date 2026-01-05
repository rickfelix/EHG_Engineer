import { jest } from '@jest/globals';
import StorySubAgent from '../../../../agents/story/index.js';
import axios from 'axios';

jest.mock('axios');

describe('STORY Sub-Agent', () => {
  let agent;

  beforeEach(() => {
    process.env.FEATURE_STORY_AGENT = 'true';
    agent = new StorySubAgent({
      apiUrl: 'http://test-api',
      retryMax: 1,
      timeoutMs: 100
    });
  });

  afterEach(() => {
    agent.shutdown();
    jest.clearAllMocks();
  });

  describe('story.create handler', () => {
    it('should generate stories successfully', async () => {
      const mockResponse = {
        data: {
          status: 'success',
          story_count: 3,
          stories: []
        }
      };
      axios.post.mockResolvedValue(mockResponse);

      const event = {
        id: 'test-001',
        payload: {
          sd_key: 'SD-2025-001',
          prd_id: 'PRD-001',
          mode: 'dry_run'
        }
      };

      await agent.handleStoryCreate(event);

      expect(axios.post).toHaveBeenCalledWith(
        'http://test-api/api/stories/generate',
        expect.objectContaining({
          sd_key: 'SD-2025-001',
          prd_id: 'PRD-001',
          mode: 'dry_run'
        }),
        expect.any(Object)
      );
    });

    it('should handle idempotency', async () => {
      const event = {
        id: 'test-duplicate',
        payload: { sd_key: 'SD-001', prd_id: 'PRD-001' }
      };

      agent.processedEvents.add('test-duplicate');
      await agent.handleStoryCreate(event);

      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should retry on failure', async () => {
      axios.post
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: { status: 'success' } });

      const event = {
        id: 'test-retry',
        payload: { sd_key: 'SD-001', prd_id: 'PRD-001' }
      };

      await agent.handleStoryCreate(event);

      expect(axios.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('story.verify handler', () => {
    it('should verify stories and check gate', async () => {
      axios.post.mockResolvedValue({
        data: { status: 'success', updated: 1 }
      });
      axios.get.mockResolvedValue({
        data: {
          ready: true,
          total_stories: 3,
          passing_count: 3
        }
      });

      const event = {
        id: 'verify-001',
        payload: {
          story_keys: ['SD-2025-001:US-001'],
          test_run_id: 'tr-001',
          build_id: 'build-001',
          status: 'passing'
        }
      };

      const gateEmitted = new Promise(resolve => {
        agent.once('gate.story.release', resolve);
      });

      await agent.handleStoryVerify(event);
      const gateEvent = await gateEmitted;

      expect(gateEvent.ready).toBe(true);
      expect(gateEvent.sd_key).toBe('SD-2025-001');
    });

    it('should handle verification failure', async () => {
      axios.post.mockRejectedValue(new Error('API error'));

      const event = {
        id: 'verify-fail',
        payload: {
          story_keys: ['SD-001:US-001'],
          test_run_id: 'tr-fail',
          status: 'failing'
        }
      };

      const failEmitted = new Promise(resolve => {
        agent.once('story.verify.failed', resolve);
      });

      await agent.handleStoryVerify(event);
      const failEvent = await failEmitted;

      expect(failEvent.error).toBe('API error');
    });
  });

  describe('initialization', () => {
    it('should not initialize when disabled', async () => {
      process.env.FEATURE_STORY_AGENT = 'false';
      const disabledAgent = new StorySubAgent();

      const spy = jest.spyOn(console, 'log');
      await disabledAgent.initialize();

      expect(spy).toHaveBeenCalledWith('STORY sub-agent disabled by feature flag');
    });

    it('should initialize when enabled', async () => {
      const spy = jest.spyOn(console, 'log');
      await agent.initialize();

      expect(spy).toHaveBeenCalledWith('STORY sub-agent initialized');
    });
  });

  describe('cleanup', () => {
    it('should clean up on shutdown', async () => {
      agent.processedEvents.add('test-1');
      agent.processedEvents.add('test-2');

      await agent.shutdown();

      expect(agent.processedEvents.size).toBe(0);
      expect(agent.listenerCount('story.create')).toBe(0);
    });
  });
});