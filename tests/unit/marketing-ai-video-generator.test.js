/**
 * Unit Tests: Image-to-Video Generation Pipeline
 * SD-EVA-FEAT-MARKETING-AI-001 (US-004)
 */

import { describe, test, expect, vi } from 'vitest';
import { createVideoGenerator, PROVIDERS, DEFAULT_DURATION_SECONDS, PROVIDER_TIMEOUT_MS } from '../../lib/marketing/ai/video-generator.js';

describe('VideoGenerator', () => {
  describe('generate', () => {
    test('succeeds with first provider', async () => {
      const videoBuffer = Buffer.from('video-data');
      const providerClients = {
        kling: { imageToVideo: vi.fn().mockResolvedValue({ buffer: videoBuffer, creditUsage: 1, estimatedCostUsd: 0.10 }) }
      };
      const gen = createVideoGenerator({ providerClients });
      const result = await gen.generate({
        imageBuffer: Buffer.from('img'),
        imageId: 'asset-001'
      });

      expect(result.success).toBe(true);
      expect(result.videoBuffer).toBe(videoBuffer);
      expect(result.metadata.providerName).toBe('kling');
      expect(result.metadata.sourceImageId).toBe('asset-001');
      expect(result.metadata.format).toBe('mp4');
    });

    test('falls through to second provider when first fails', async () => {
      const videoBuffer = Buffer.from('veo-video');
      const providerClients = {
        kling: { imageToVideo: vi.fn().mockRejectedValue(new Error('Kling down')) },
        veo: { imageToVideo: vi.fn().mockResolvedValue({ buffer: videoBuffer }) }
      };
      const logger = { warn: vi.fn(), error: vi.fn() };
      const gen = createVideoGenerator({ providerClients, logger });
      const result = await gen.generate({ imageBuffer: Buffer.from('img'), imageId: 'a1' });

      expect(result.success).toBe(true);
      expect(result.metadata.providerName).toBe('veo');
      expect(logger.warn).toHaveBeenCalled();
    });

    test('returns failure when all providers fail', async () => {
      const providerClients = {
        kling: { imageToVideo: vi.fn().mockRejectedValue(new Error('fail1')) },
        veo: { imageToVideo: vi.fn().mockRejectedValue(new Error('fail2')) },
        runway: { imageToVideo: vi.fn().mockRejectedValue(new Error('fail3')) }
      };
      const logger = { warn: vi.fn(), error: vi.fn() };
      const gen = createVideoGenerator({ providerClients, logger });
      const result = await gen.generate({ imageBuffer: Buffer.from('img'), imageId: 'a1' });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(logger.error).toHaveBeenCalled();
    });

    test('skips providers without clients', async () => {
      const videoBuffer = Buffer.from('runway-video');
      const providerClients = {
        runway: { imageToVideo: vi.fn().mockResolvedValue({ buffer: videoBuffer }) }
      };
      const gen = createVideoGenerator({ providerClients });
      const result = await gen.generate({ imageBuffer: Buffer.from('img'), imageId: 'a1' });

      expect(result.success).toBe(true);
      expect(result.metadata.providerName).toBe('runway');
      expect(result.errors).toBeUndefined();
    });

    test('clamps duration to 5-15 seconds', async () => {
      const providerClients = {
        kling: { imageToVideo: vi.fn().mockResolvedValue({ buffer: Buffer.from('v') }) }
      };
      const gen = createVideoGenerator({ providerClients });
      const result = await gen.generate({
        imageBuffer: Buffer.from('img'),
        imageId: 'a1',
        durationSeconds: 30
      });

      expect(result.metadata.durationSeconds).toBe(15);
    });

    test('clamps duration minimum to 5 seconds', async () => {
      const providerClients = {
        kling: { imageToVideo: vi.fn().mockResolvedValue({ buffer: Buffer.from('v') }) }
      };
      const gen = createVideoGenerator({ providerClients });
      const result = await gen.generate({
        imageBuffer: Buffer.from('img'),
        imageId: 'a1',
        durationSeconds: 2
      });

      expect(result.metadata.durationSeconds).toBe(5);
    });

    test('includes cost tracking metadata', async () => {
      const providerClients = {
        kling: {
          imageToVideo: vi.fn().mockResolvedValue({
            buffer: Buffer.from('v'),
            creditUsage: 5,
            estimatedCostUsd: 0.50
          })
        }
      };
      const gen = createVideoGenerator({ providerClients });
      const result = await gen.generate({ imageBuffer: Buffer.from('img'), imageId: 'a1' });

      expect(result.metadata.creditUsage).toBe(5);
      expect(result.metadata.estimatedCostUsd).toBe(0.50);
    });
  });

  describe('getProviders', () => {
    test('returns copy of provider chain', () => {
      const gen = createVideoGenerator();
      const providers = gen.getProviders();
      expect(providers).toHaveLength(3);
      expect(providers[0].name).toBe('kling');
      expect(providers[1].name).toBe('veo');
      expect(providers[2].name).toBe('runway');
    });

    test('returned array is a copy', () => {
      const gen = createVideoGenerator();
      const providers = gen.getProviders();
      providers.push({ name: 'test', priority: 99 });
      expect(gen.getProviders()).toHaveLength(3);
    });
  });

  describe('constants', () => {
    test('DEFAULT_DURATION_SECONDS is 10', () => {
      expect(DEFAULT_DURATION_SECONDS).toBe(10);
    });

    test('PROVIDER_TIMEOUT_MS is 60000', () => {
      expect(PROVIDER_TIMEOUT_MS).toBe(60_000);
    });

    test('PROVIDERS has 3 entries in priority order', () => {
      expect(PROVIDERS).toHaveLength(3);
      expect(PROVIDERS[0].priority).toBeLessThan(PROVIDERS[1].priority);
      expect(PROVIDERS[1].priority).toBeLessThan(PROVIDERS[2].priority);
    });
  });
});
