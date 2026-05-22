/**
 * Unit tests for Imagen Logo Renderer
 * SD: SD-EVA-FEAT-LOGO-IMAGEN-PIPELINE-001
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildPromptVariants, sanitizePrompt, renderLogo } from '../../../lib/eva/bridge/imagen-logo-renderer.js';

describe('imagen-logo-renderer', () => {
  describe('buildPromptVariants', () => {
    it('should return 3 prompts when svgPrompt is provided', () => {
      const spec = {
        textTreatment: 'ACME',
        primaryColor: '#2563EB',
        accentColor: '#10B981',
        typography: 'Inter',
        iconConcept: 'A mountain peak',
        svgPrompt: 'Create a minimal SVG logo with mountain icon',
      };
      const prompts = buildPromptVariants(spec, 'Acme Corp');
      expect(prompts).toHaveLength(3);
      expect(prompts[0]).toContain('mountain icon');
      expect(prompts[1]).toContain('ACME');
      expect(prompts[2]).toContain('ACME');
    });

    it('should return 2 prompts when svgPrompt is missing', () => {
      const spec = { textTreatment: 'TestCo', primaryColor: '#FF0000' };
      const prompts = buildPromptVariants(spec, 'TestCo');
      expect(prompts).toHaveLength(2);
    });

    it('should use ventureName as fallback for textTreatment', () => {
      const spec = { primaryColor: '#000000' };
      const prompts = buildPromptVariants(spec, 'FallbackName');
      expect(prompts[0]).toContain('FallbackName');
    });

    it('should use default colors when not provided', () => {
      const spec = {};
      const prompts = buildPromptVariants(spec, 'Test');
      expect(prompts[0]).toContain('#2563EB');
    });
  });

  describe('sanitizePrompt', () => {
    it('should remove angle brackets and braces', () => {
      expect(sanitizePrompt('a <b> {c}')).toBe('a b c');
    });

    it('should collapse whitespace', () => {
      expect(sanitizePrompt('a   b\n\nc')).toBe('a b c');
    });

    it('should cap length at 1000 chars', () => {
      const long = 'x'.repeat(2000);
      expect(sanitizePrompt(long).length).toBe(1000);
    });

    it('should handle non-string input', () => {
      expect(sanitizePrompt(123)).toBe('123');
      expect(sanitizePrompt(null)).toBe('null');
    });
  });

  // QF regression (Google retired Imagen 3 from v1beta): lock in the live
  // Imagen 4 model + :predict verb, and the no-longer-silent fallback failure.
  describe('renderLogo — Imagen 4 :predict contract', () => {
    const realFetch = global.fetch;
    const realKey = process.env.GEMINI_API_KEY;
    const realGoogle = process.env.GOOGLE_AI_API_KEY;
    const quietLogger = { log() {}, warn() {} };

    beforeEach(() => { process.env.GEMINI_API_KEY = 'test-key'; });
    afterEach(() => {
      global.fetch = realFetch;
      if (realKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = realKey;
      if (realGoogle === undefined) delete process.env.GOOGLE_AI_API_KEY; else process.env.GOOGLE_AI_API_KEY = realGoogle;
      vi.restoreAllMocks();
    });

    it('calls an Imagen 4 model via :predict (not retired Imagen 3 / :generateImages)', async () => {
      const urls = [];
      global.fetch = vi.fn(async (url) => {
        urls.push(url);
        return { ok: true, status: 200, json: async () => ({ predictions: [{ bytesBase64Encoded: 'aGVsbG8=', mimeType: 'image/png' }] }), text: async () => '' };
      });
      const result = await renderLogo({ svgPrompt: 'a logo' }, { ventureName: 'Test', logger: quietLogger });
      expect(result).not.toBeNull();
      expect(Buffer.isBuffer(result.buffer)).toBe(true);
      expect(result.mimeType).toBe('image/png');
      expect(urls[0]).toContain(':predict');
      expect(urls[0]).not.toContain(':generateImages');
      expect(urls[0]).toContain('imagen-4.0');
      expect(urls[0]).not.toContain('imagen-3.0');
    });

    it('returns null (no throw) when no API key is present', async () => {
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_AI_API_KEY;
      const result = await renderLogo({ svgPrompt: 'a logo' }, { logger: quietLogger });
      expect(result).toBeNull();
    });

    it('logs loudly (not silently) when the fallback model also fails', async () => {
      const warnings = [];
      const logger = { log() {}, warn: (m) => warnings.push(String(m)) };
      global.fetch = vi.fn(async () => ({ ok: false, status: 404, text: async () => 'NOT_FOUND' }));
      const result = await renderLogo({ svgPrompt: 'a logo' }, { ventureName: 'T', maxRetries: 0, logger });
      expect(result).toBeNull();
      expect(warnings.some((w) => w.includes('Fallback model') && w.includes('failed'))).toBe(true);
    });
  });
});
