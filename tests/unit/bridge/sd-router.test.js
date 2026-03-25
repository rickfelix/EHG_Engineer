import { describe, it, expect, vi } from 'vitest';
import { resolveTargetApplication } from '../../../lib/eva/bridge/sd-router.js';

// Mock venture-resolver to avoid filesystem dependency
vi.mock('../../../lib/venture-resolver.js', () => ({
  getVentureConfig: vi.fn((name) => {
    const registry = {
      ehg: { name: 'ehg', github_repo: 'rickfelix/ehg.git', local_path: 'C:/Projects/ehg', supabase_schema: null },
      'test-leo-project': { name: 'test-leo-project', github_repo: 'rickf-test/leo-test-repo', local_path: 'C:/Projects/test-leo-project', supabase_schema: 'venture_test_leo' },
    };
    return name ? registry[name.toLowerCase()] || null : null;
  }),
}));

const silentLogger = { log: vi.fn(), warn: vi.fn() };

describe('sd-router', () => {
  describe('resolveTargetApplication', () => {
    it('resolves known venture from registry', () => {
      const result = resolveTargetApplication('ehg', { logger: silentLogger });
      expect(result.targetApp).toBe('ehg');
      expect(result.githubRepo).toBe('rickfelix/ehg.git');
      expect(result.fallback).toBe(false);
    });

    it('resolves second registered venture', () => {
      const result = resolveTargetApplication('test-leo-project', { logger: silentLogger });
      expect(result.targetApp).toBe('test-leo-project');
      expect(result.githubRepo).toBe('rickf-test/leo-test-repo');
      expect(result.supabaseSchema).toBe('venture_test_leo');
      expect(result.fallback).toBe(false);
    });

    it('falls back to ehg for unknown venture', () => {
      const result = resolveTargetApplication('unknown-venture', { logger: silentLogger });
      expect(result.targetApp).toBe('ehg');
      expect(result.fallback).toBe(true);
      expect(silentLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('unknown-venture')
      );
    });

    it('falls back to ehg for null input', () => {
      const result = resolveTargetApplication(null, { logger: silentLogger });
      expect(result.targetApp).toBe('ehg');
      expect(result.fallback).toBe(true);
    });

    it('falls back to ehg for undefined input', () => {
      const result = resolveTargetApplication(undefined, { logger: silentLogger });
      expect(result.targetApp).toBe('ehg');
      expect(result.fallback).toBe(true);
    });

    it('falls back to ehg for empty string', () => {
      const result = resolveTargetApplication('', { logger: silentLogger });
      expect(result.targetApp).toBe('ehg');
      expect(result.fallback).toBe(true);
    });

    it('uses console as default logger', () => {
      // Should not throw when no logger provided
      const result = resolveTargetApplication('ehg');
      expect(result.targetApp).toBe('ehg');
    });
  });
});
