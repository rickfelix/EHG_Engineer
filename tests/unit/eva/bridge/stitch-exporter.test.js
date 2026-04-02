/**
 * Unit tests for Stitch Exporter
 * SD-LEO-INFRA-GOOGLE-STITCH-DESIGN-001-C
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'path';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// Mock stitch client
const mockStitchClient = {
  listScreens: vi.fn(),
  exportScreenHtml: vi.fn(),
  exportScreenImage: vi.fn(),
};

const {
  exportStitchArtifacts,
  injectSRIHashes,
  generateDesignMd,
  setStitchClientLoader,
} = await import('../../../../lib/eva/bridge/stitch-exporter.js');

const { writeFile, mkdir } = await import('fs/promises');

describe('stitch-exporter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStitchClientLoader(async () => mockStitchClient);
  });

  // -----------------------------------------------------------------------
  // SRI Hash Injection
  // -----------------------------------------------------------------------
  describe('injectSRIHashes', () => {
    it('adds integrity attribute to CDN script tags', () => {
      const html = '<script src="https://cdn.jsdelivr.net/npm/tailwind@3.0"></script>';
      const result = injectSRIHashes(html);

      expect(result).toContain('integrity="sha384-');
      expect(result).toContain('crossorigin="anonymous"');
    });

    it('adds integrity to Google Fonts link tags', () => {
      const html = '<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">';
      const result = injectSRIHashes(html);

      expect(result).toContain('integrity="sha384-');
    });

    it('does not double-add integrity to tags that already have it', () => {
      const html = '<script src="https://cdn.jsdelivr.net/lib.js" integrity="sha384-existing"></script>';
      const result = injectSRIHashes(html);

      expect(result).toBe(html);
    });

    it('returns non-CDN HTML unchanged', () => {
      const html = '<script src="/local/script.js"></script>';
      const result = injectSRIHashes(html);

      expect(result).toBe(html);
    });

    it('handles null/undefined input', () => {
      expect(injectSRIHashes(null)).toBeNull();
      expect(injectSRIHashes(undefined)).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // DESIGN.md Generation
  // -----------------------------------------------------------------------
  describe('generateDesignMd', () => {
    it('includes brand tokens and screen list', () => {
      const md = generateDesignMd(
        [{ screen_id: 's1', name: 'Home', dimensions: { w: 1920, h: 1080 } }],
        { colors: ['#FF0000'], fonts: ['Inter'], personality: 'Modern' }
      );

      expect(md).toContain('# DESIGN.md');
      expect(md).toContain('#FF0000');
      expect(md).toContain('Inter');
      expect(md).toContain('Modern');
      expect(md).toContain('Home');
      expect(md).toContain('1920x1080');
    });

    it('handles empty brand tokens', () => {
      const md = generateDesignMd([{ screen_id: 's1', name: 'Test' }], {});

      expect(md).toContain('# DESIGN.md');
      expect(md).toContain('Test');
    });
  });

  // -----------------------------------------------------------------------
  // exportStitchArtifacts
  // -----------------------------------------------------------------------
  describe('exportStitchArtifacts', () => {
    it('exports all screens as HTML and PNG with manifest', async () => {
      mockStitchClient.listScreens.mockResolvedValue([
        { screen_id: 's1', name: 'Home', dimensions: { w: 1920, h: 1080 } },
        { screen_id: 's2', name: 'About', dimensions: { w: 1920, h: 1080 } },
      ]);
      mockStitchClient.exportScreenHtml
        .mockResolvedValueOnce('<html><body>Home</body></html>')
        .mockResolvedValueOnce('<html><body>About</body></html>');
      mockStitchClient.exportScreenImage
        .mockResolvedValueOnce(Buffer.from('png-home'))
        .mockResolvedValueOnce(Buffer.from('png-about'));

      const result = await exportStitchArtifacts('v1', 'proj-1', '/tmp/out');

      expect(result.html_files).toHaveLength(2);
      expect(result.png_files).toHaveLength(2);
      expect(result.design_md_path).toContain('DESIGN.md');
      expect(result.manifest.screen_count).toBe(2);
      expect(result.manifest.total_files).toBe(5); // 2 HTML + 2 PNG + 1 DESIGN.md
      expect(mkdir).toHaveBeenCalledTimes(2);
      expect(writeFile).toHaveBeenCalledTimes(5);
    });

    it('returns empty manifest for project with no screens', async () => {
      mockStitchClient.listScreens.mockResolvedValue([]);

      const result = await exportStitchArtifacts('v1', 'proj-1', '/tmp/out');

      expect(result.manifest.screen_count).toBe(0);
      expect(result.html_files).toHaveLength(0);
      expect(result.png_files).toHaveLength(0);
      expect(result.design_md_path).toBeNull();
    });

    it('handles partial export failures gracefully', async () => {
      mockStitchClient.listScreens.mockResolvedValue([
        { screen_id: 's1', name: 'Home' },
      ]);
      mockStitchClient.exportScreenHtml.mockRejectedValue(new Error('HTML export failed'));
      mockStitchClient.exportScreenImage.mockResolvedValue(Buffer.from('png'));

      const result = await exportStitchArtifacts('v1', 'proj-1', '/tmp/out');

      expect(result.html_files).toHaveLength(0); // HTML failed
      expect(result.png_files).toHaveLength(1); // PNG succeeded
      expect(result.design_md_path).toContain('DESIGN.md'); // Still generated
    });

    it('injects SRI hashes into exported HTML', async () => {
      mockStitchClient.listScreens.mockResolvedValue([
        { screen_id: 's1', name: 'Home' },
      ]);
      mockStitchClient.exportScreenHtml.mockResolvedValue(
        '<html><script src="https://cdn.jsdelivr.net/lib.js"></script></html>'
      );
      mockStitchClient.exportScreenImage.mockResolvedValue(Buffer.from('png'));

      await exportStitchArtifacts('v1', 'proj-1', '/tmp/out');

      const writtenHtml = writeFile.mock.calls.find(c => c[0].includes('.html'))?.[1];
      expect(writtenHtml).toContain('integrity="sha384-');
    });
  });
});
