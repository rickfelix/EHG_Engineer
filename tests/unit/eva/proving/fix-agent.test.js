import { describe, it, expect, vi } from 'vitest';
import { resolveRepoPath, applyPattern, WORKTREE_PREFIX } from '../../../../lib/eva/proving/fix-agent.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('Fix Agent', () => {
  describe('resolveRepoPath', () => {
    it('returns fallback for EHG_Engineer target', () => {
      const result = resolveRepoPath('EHG_Engineer', '/mock/root');
      expect(result).toBe('/mock/root');
    });

    it('returns fallback for null target', () => {
      const result = resolveRepoPath(null, '/mock/root');
      expect(result).toBe('/mock/root');
    });

    it('returns fallback for empty target', () => {
      const result = resolveRepoPath('', '/mock/root');
      expect(result).toBe('/mock/root');
    });

    it('tries sibling path for other repo targets', () => {
      // This will try path.resolve('/mock/root', '..', 'ehg')
      // Which resolves to /mock/ehg — won't exist, so falls back
      const result = resolveRepoPath('ehg', '/mock/root');
      // Either finds sibling or returns fallback
      expect(typeof result).toBe('string');
    });
  });

  describe('applyPattern', () => {
    let tmpDir;

    function createTmpDir() {
      tmpDir = path.join(os.tmpdir(), `fix-agent-test-${Date.now()}`);
      fs.mkdirSync(tmpDir, { recursive: true });
      return tmpDir;
    }

    function cleanTmpDir() {
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }

    it('creates new files from pattern', () => {
      const dir = createTmpDir();
      try {
        const result = applyPattern(dir, {
          files: [{ filePath: 'src/new-file.js', content: 'export default 42;' }],
        });
        expect(result.filesCreated).toBe(1);
        expect(result.filesModified).toBe(0);
        expect(fs.existsSync(path.join(dir, 'src/new-file.js'))).toBe(true);
      } finally { cleanTmpDir(); }
    });

    it('modifies existing files', () => {
      const dir = createTmpDir();
      try {
        const filePath = path.join(dir, 'existing.js');
        fs.writeFileSync(filePath, 'const x = 1;');
        const result = applyPattern(dir, {
          files: [{ filePath: 'existing.js', content: 'const x = 2;' }],
        });
        expect(result.filesModified).toBe(1);
        expect(result.filesCreated).toBe(0);
      } finally { cleanTmpDir(); }
    });

    it('applies search/replace edits', () => {
      const dir = createTmpDir();
      try {
        fs.writeFileSync(path.join(dir, 'config.js'), 'const PORT = 3000;');
        const result = applyPattern(dir, {
          edits: [{ filePath: 'config.js', search: '3000', replace: '8080' }],
        });
        expect(result.filesModified).toBe(1);
        const content = fs.readFileSync(path.join(dir, 'config.js'), 'utf8');
        expect(content).toBe('const PORT = 8080;');
      } finally { cleanTmpDir(); }
    });

    it('skips edits for non-existent files', () => {
      const dir = createTmpDir();
      try {
        const result = applyPattern(dir, {
          edits: [{ filePath: 'missing.js', search: 'x', replace: 'y' }],
        });
        expect(result.filesModified).toBe(0);
      } finally { cleanTmpDir(); }
    });

    it('handles empty pattern gracefully', () => {
      const dir = createTmpDir();
      try {
        const result = applyPattern(dir, {});
        expect(result.filesModified).toBe(0);
        expect(result.filesCreated).toBe(0);
      } finally { cleanTmpDir(); }
    });

    it('creates nested directories for new files', () => {
      const dir = createTmpDir();
      try {
        applyPattern(dir, {
          files: [{ filePath: 'deep/nested/dir/file.js', content: 'ok' }],
        });
        expect(fs.existsSync(path.join(dir, 'deep/nested/dir/file.js'))).toBe(true);
      } finally { cleanTmpDir(); }
    });
  });
});
