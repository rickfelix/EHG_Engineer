/**
 * Unit Tests: AI Image Generation Pipeline
 * SD-EVA-FEAT-MARKETING-AI-001 (US-003)
 */

import { describe, test, expect, vi } from 'vitest';
import { createImageGenerator, DEFAULT_WIDTH, DEFAULT_HEIGHT, GENERATION_TIMEOUT_MS } from '../../lib/marketing/ai/image-generator.js';

function mockSharp(returnBuffer = Buffer.from('mock-image')) {
  const instance = {
    png: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    composite: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(returnBuffer)
  };
  return vi.fn().mockReturnValue(instance);
}

describe('ImageGenerator', () => {
  describe('generate', () => {
    test('uses gemini client when available', async () => {
      const geminiBuffer = Buffer.from('gemini-image');
      const geminiClient = {
        generateImage: vi.fn().mockResolvedValue(geminiBuffer)
      };
      const gen = createImageGenerator({ geminiClient, sharp: mockSharp() });
      const result = await gen.generate({ prompt: 'test product', brand: {} });

      expect(geminiClient.generateImage).toHaveBeenCalledWith({
        prompt: 'test product',
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT
      });
      expect(result.buffer).toBe(geminiBuffer);
      expect(result.metadata.providerName).toBe('gemini');
    });

    test('falls back to placeholder when gemini fails', async () => {
      const placeholderBuf = Buffer.from('placeholder');
      const geminiClient = {
        generateImage: vi.fn().mockRejectedValue(new Error('API down'))
      };
      const sharp = mockSharp(placeholderBuf);
      const logger = { warn: vi.fn(), error: vi.fn() };
      const gen = createImageGenerator({ geminiClient, sharp, logger });
      const result = await gen.generate({ prompt: 'test', brand: { primaryColor: '#FF0000' } });

      expect(result.metadata.providerName).toBe('placeholder');
      expect(logger.warn).toHaveBeenCalled();
    });

    test('applies brand overlay when gemini succeeds and brand config provided', async () => {
      const geminiBuffer = Buffer.from('gemini-image');
      const compositeBuffer = Buffer.from('composite-image');
      const geminiClient = {
        generateImage: vi.fn().mockResolvedValue(geminiBuffer)
      };
      const sharpInstance = {
        png: vi.fn().mockReturnThis(),
        resize: vi.fn().mockReturnThis(),
        composite: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(compositeBuffer)
      };
      const sharp = vi.fn().mockReturnValue(sharpInstance);
      const gen = createImageGenerator({ geminiClient, sharp });
      const result = await gen.generate({
        prompt: 'product',
        brand: { primaryColor: '#0066FF', tagline: 'Test Brand' }
      });

      expect(sharp).toHaveBeenCalled();
      expect(sharpInstance.composite).toHaveBeenCalled();
      expect(result.buffer).toBe(compositeBuffer);
    });

    test('returns correct metadata fields', async () => {
      const geminiClient = {
        generateImage: vi.fn().mockResolvedValue(Buffer.from('img'))
      };
      const gen = createImageGenerator({ geminiClient, sharp: mockSharp() });
      const result = await gen.generate({ prompt: 'hero image', brand: {}, width: 800, height: 600 });

      expect(result.metadata.generationPrompt).toBe('hero image');
      expect(result.metadata.dimensionsPx).toBe('800x600');
      expect(result.metadata.fileSizeBytes).toBeTypeOf('number');
      expect(result.metadata.generationTimeMs).toBeTypeOf('number');
      expect(result.metadata.createdAt).toBeTruthy();
    });

    test('uses custom dimensions when provided', async () => {
      const geminiClient = {
        generateImage: vi.fn().mockResolvedValue(Buffer.from('img'))
      };
      const gen = createImageGenerator({ geminiClient, sharp: mockSharp() });
      await gen.generate({ prompt: 'test', brand: {}, width: 800, height: 400 });

      expect(geminiClient.generateImage).toHaveBeenCalledWith(
        expect.objectContaining({ width: 800, height: 400 })
      );
    });
  });

  describe('constants', () => {
    test('DEFAULT_WIDTH is 1200', () => {
      expect(DEFAULT_WIDTH).toBe(1200);
    });

    test('DEFAULT_HEIGHT is 628', () => {
      expect(DEFAULT_HEIGHT).toBe(628);
    });

    test('GENERATION_TIMEOUT_MS is 30000', () => {
      expect(GENERATION_TIMEOUT_MS).toBe(30_000);
    });
  });
});
