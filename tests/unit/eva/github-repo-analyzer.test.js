/**
 * Tests for github-repo-analyzer.js
 * SD-REPLIT-PIPELINE-S20S26-REDESIGN-ORCH-001-B-A
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock execSync before importing the module
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

const { execSync } = await import('child_process');
const mod = await import('../../../lib/eva/bridge/github-repo-analyzer.js');
const analyzeRepo = mod.analyzeRepo;
const parseOwnerRepo = mod.parseOwnerRepo || mod.default?.parseOwnerRepo;
const isAllowedUrl = mod.isAllowedUrl || mod.default?.isAllowedUrl;

describe('github-repo-analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseOwnerRepo', () => {
    it('extracts owner/repo from HTTPS URL', () => {
      expect(parseOwnerRepo('https://github.com/rickfelix/ehg')).toBe('rickfelix/ehg');
    });

    it('extracts owner/repo from URL with .git suffix', () => {
      expect(parseOwnerRepo('https://github.com/rickfelix/ehg.git')).toBe('rickfelix/ehg');
    });

    it('returns null for non-GitHub URLs', () => {
      expect(parseOwnerRepo('https://gitlab.com/user/repo')).toBeNull();
    });

    it('returns null for null/undefined', () => {
      expect(parseOwnerRepo(null)).toBeNull();
      expect(parseOwnerRepo(undefined)).toBeNull();
    });
  });

  describe('isAllowedUrl', () => {
    it('allows github.com URLs', () => {
      expect(isAllowedUrl('https://github.com/owner/repo')).toBe(true);
    });

    it('allows www.github.com URLs', () => {
      expect(isAllowedUrl('https://www.github.com/owner/repo')).toBe(true);
    });

    it('rejects non-GitHub URLs', () => {
      expect(isAllowedUrl('https://evil.com/github.com/owner/repo')).toBe(false);
    });

    it('rejects non-string inputs', () => {
      expect(isAllowedUrl(null)).toBe(false);
      expect(isAllowedUrl(42)).toBe(false);
    });
  });

  describe('analyzeRepo', () => {
    it('returns error for non-GitHub URL', async () => {
      const result = await analyzeRepo('https://gitlab.com/user/repo');
      expect(result.error).toContain('URL not allowed');
      expect(result.files).toEqual([]);
    });

    it('returns error for unparseable URL', async () => {
      const result = await analyzeRepo('https://github.com/');
      expect(result.error).toContain('Cannot parse');
    });

    it('returns file listing from gh CLI', async () => {
      execSync
        .mockReturnValueOnce('src/index.js\nsrc/app.js\npackage.json\nREADME.md\n')  // tree
        .mockReturnValueOnce(null);  // package.json (not found)

      const result = await analyzeRepo('https://github.com/test/repo');

      expect(result.files).toEqual(['src/index.js', 'src/app.js', 'package.json', 'README.md']);
      expect(result.structure.totalFiles).toBe(4);
      expect(result.structure.hasSrc).toBe(true);
      expect(result.structure.hasReadme).toBe(true);
      expect(result.error).toBeNull();
    });

    it('parses package.json dependencies', async () => {
      const pkg = JSON.stringify({ name: 'test', version: '1.0.0', dependencies: { react: '^18.0.0' } });
      const encoded = Buffer.from(pkg).toString('base64');

      execSync
        .mockReturnValueOnce('package.json\nsrc/index.js')  // tree
        .mockReturnValueOnce(encoded);  // package.json content

      const result = await analyzeRepo('https://github.com/test/repo');

      expect(result.dependencies.name).toBe('test');
      expect(result.dependencies.dependencies.react).toBe('^18.0.0');
    });

    it('detects sensitive files', async () => {
      execSync
        .mockReturnValueOnce('.env\n.env.local\nsrc/index.js\ncredentials.json')
        .mockReturnValueOnce(null);

      const result = await analyzeRepo('https://github.com/test/repo');

      expect(result.secrets).toHaveLength(3);
      expect(result.secrets[0].file).toBe('.env');
      expect(result.secrets[0].type).toBe('sensitive_file');
    });

    it('gracefully handles gh CLI failure', async () => {
      execSync.mockImplementation(() => { throw new Error('gh not found'); });

      const result = await analyzeRepo('https://github.com/test/repo');

      expect(result.files).toEqual([]);
      expect(result.dependencies).toEqual({});
      expect(result.error).toBeNull();
    });

    it('counts file types correctly', async () => {
      execSync
        .mockReturnValueOnce('a.js\nb.js\nc.ts\nd.css\nMakefile')
        .mockReturnValueOnce(null);

      const result = await analyzeRepo('https://github.com/test/repo');

      expect(result.structure.fileTypes['.js']).toBe(2);
      expect(result.structure.fileTypes['.ts']).toBe(1);
      expect(result.structure.fileTypes['.css']).toBe(1);
    });
  });
});
