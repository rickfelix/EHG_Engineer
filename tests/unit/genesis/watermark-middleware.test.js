/**
 * Tests for Watermark Middleware
 * SD-GENESIS-V31-MASON-P3
 */

import { describe, it, expect } from 'vitest';
import {
  WATERMARK_CSS,
  WATERMARK_HTML,
  WATERMARK_SCRIPT,
  generateWatermarkCode,
  verifyWatermarkPresence,
} from '../../../lib/genesis/watermark-middleware.js';

describe('Watermark Middleware', () => {
  describe('WATERMARK_CSS', () => {
    it('should include genesis-simulation-watermark class', () => {
      expect(WATERMARK_CSS).toContain('.genesis-simulation-watermark');
    });

    it('should use !important for all styles', () => {
      expect(WATERMARK_CSS).toContain('!important');
    });

    it('should set z-index to maximum', () => {
      expect(WATERMARK_CSS).toContain('2147483647');
    });

    it('should include SIMULATION text', () => {
      expect(WATERMARK_CSS).toContain("'SIMULATION'");
    });

    it('should disable pointer events', () => {
      expect(WATERMARK_CSS).toContain('pointer-events: none');
    });

    it('should include banner styles', () => {
      expect(WATERMARK_CSS).toContain('.genesis-simulation-banner');
    });
  });

  describe('WATERMARK_HTML', () => {
    it('should include watermark div', () => {
      expect(WATERMARK_HTML).toContain('genesis-simulation-watermark');
    });

    it('should include banner div', () => {
      expect(WATERMARK_HTML).toContain('genesis-simulation-banner');
    });

    it('should include data attributes for detection', () => {
      expect(WATERMARK_HTML).toContain('data-genesis-watermark');
      expect(WATERMARK_HTML).toContain('data-genesis-banner');
    });

    it('should include clear warning text', () => {
      expect(WATERMARK_HTML).toContain('GENESIS SIMULATION MODE');
    });
  });

  describe('WATERMARK_SCRIPT', () => {
    it('should create watermark function', () => {
      expect(WATERMARK_SCRIPT).toContain('createWatermark');
    });

    it('should include MutationObserver for persistence', () => {
      expect(WATERMARK_SCRIPT).toContain('MutationObserver');
    });

    it('should use strict mode', () => {
      expect(WATERMARK_SCRIPT).toContain("'use strict'");
    });
  });

  describe('generateWatermarkCode', () => {
    it('should generate Next.js code', () => {
      const code = generateWatermarkCode('next');
      expect(code).toContain('Script');
      expect(code).toContain('next/script');
    });

    it('should generate React code', () => {
      const code = generateWatermarkCode('react');
      expect(code).toContain('useEffect');
    });

    it('should generate Express code', () => {
      const code = generateWatermarkCode('express');
      expect(code).toContain('watermarkMiddleware');
      expect(code).toContain('app.use');
    });

    it('should generate HTML code by default', () => {
      const code = generateWatermarkCode('html');
      expect(code).toContain('<style>');
      expect(code).toContain('<script>');
    });
  });

  describe('verifyWatermarkPresence', () => {
    it('should detect all watermark elements', () => {
      const html = `
        <div class="genesis-simulation-watermark" data-genesis-watermark="true"></div>
        <div class="genesis-simulation-banner"></div>
      `;
      const result = verifyWatermarkPresence(html);
      expect(result.hasWatermark).toBe(true);
      expect(result.hasBanner).toBe(true);
      expect(result.hasScript).toBe(true);
    });

    it('should return false for clean HTML', () => {
      const html = '<html><body><h1>Hello</h1></body></html>';
      const result = verifyWatermarkPresence(html);
      expect(result.hasWatermark).toBe(false);
      expect(result.hasBanner).toBe(false);
      expect(result.hasScript).toBe(false);
    });

    it('should detect partial watermark presence', () => {
      const html = '<div class="genesis-simulation-banner">Warning</div>';
      const result = verifyWatermarkPresence(html);
      expect(result.hasWatermark).toBe(false);
      expect(result.hasBanner).toBe(true);
    });
  });
});
