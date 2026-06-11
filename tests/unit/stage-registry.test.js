/**
 * StageRegistry Unit Tests
 * SD-MAN-ORCH-VISION-ARCHITECTURE-HARDENING-001-D
 *
 * Tests for the registry-based stage template discovery system.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StageRegistry } from '../../lib/eva/stage-registry.js';

describe('StageRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new StageRegistry();
  });

  describe('register/get/has', () => {
    it('should register and retrieve a stage template', () => {
      const template = { id: 'stage-01', title: 'Test Stage', validate: () => ({ valid: true }) };
      registry.register(1, template);

      expect(registry.has(1)).toBe(true);
      expect(registry.get(1)).toBe(template);
    });

    it('should return null for unregistered stage', () => {
      expect(registry.has(99)).toBe(false);
      expect(registry.get(99)).toBeNull();
    });

    it('should allow overwriting a registered stage', () => {
      const template1 = { id: 'v1', title: 'Version 1' };
      const template2 = { id: 'v2', title: 'Version 2' };

      registry.register(1, template1);
      registry.register(1, template2);

      expect(registry.get(1)).toBe(template2);
    });

    it('should store source and version metadata', () => {
      const template = { id: 'stage-05', title: 'Test' };
      registry.register(5, template, { source: 'db', version: '2.1.0' });

      const entry = registry.stages.get(5);
      expect(entry.source).toBe('db');
      expect(entry.version).toBe('2.1.0');
    });
  });

  describe('getStats', () => {
    it('should return correct stats for empty registry', () => {
      const stats = registry.getStats();
      expect(stats.total).toBe(0);
      expect(stats.fromFile).toBe(0);
      expect(stats.fromDB).toBe(0);
      expect(stats.cacheHits).toBe(0);
      expect(stats.cacheMisses).toBe(0);
    });

    it('should count file-based registrations', () => {
      registry.register(1, { id: '01' }, { source: 'file' });
      registry.register(2, { id: '02' }, { source: 'file' });
      registry.register(3, { id: '03' }, { source: 'db' });

      const stats = registry.getStats();
      expect(stats.fromFile).toBe(2);
    });

    it('should track cache hits', () => {
      registry.register(1, { id: '01' });
      registry.get(1); // File hit, not cache hit

      // Simulate DB cache entry
      registry.dbCache.set(2, { template: { id: '02' }, cachedAt: Date.now() });
      registry.get(2); // Cache hit

      const stats = registry.getStats();
      expect(stats.cacheHits).toBe(1);
    });
  });

  describe('DB cache with TTL', () => {
    it('should return DB-cached template within TTL', () => {
      const template = { id: 'db-stage', title: 'From DB' };
      registry.dbCache.set(10, { template, cachedAt: Date.now() });

      expect(registry.get(10)).toBe(template);
      expect(registry.has(10)).toBe(true);
    });

    it('should ignore expired DB cache entries', () => {
      const template = { id: 'expired', title: 'Old' };
      // Set cachedAt to 6 minutes ago (past 5-min TTL)
      registry.dbCache.set(10, { template, cachedAt: Date.now() - 6 * 60 * 1000 });

      // No file-based fallback registered
      expect(registry.get(10)).toBeNull();
      expect(registry.has(10)).toBe(false);
    });

    it('should fall back to file-based template when DB cache expired', () => {
      const fileTemplate = { id: 'file-stage', title: 'From File' };
      const dbTemplate = { id: 'db-stage', title: 'From DB' };

      registry.register(10, fileTemplate, { source: 'file' });
      // Expired DB cache
      registry.dbCache.set(10, { template: dbTemplate, cachedAt: Date.now() - 6 * 60 * 1000 });

      expect(registry.get(10)).toBe(fileTemplate);
    });

    it('should prefer DB cache over file-based when cache is fresh', () => {
      const fileTemplate = { id: 'file-stage', title: 'From File' };
      const dbTemplate = { id: 'db-stage', title: 'From DB' };

      registry.register(10, fileTemplate, { source: 'file' });
      registry.dbCache.set(10, { template: dbTemplate, cachedAt: Date.now() });

      expect(registry.get(10)).toBe(dbTemplate);
    });
  });

  describe('refreshCache', () => {
    it('should clear DB cache', () => {
      registry.dbCache.set(1, { template: { id: '01' }, cachedAt: Date.now() });
      registry.dbCache.set(2, { template: { id: '02' }, cachedAt: Date.now() });
      registry.stats.cacheHits = 10;

      registry.refreshCache();

      expect(registry.dbCache.size).toBe(0);
      expect(registry.stats.cacheHits).toBe(0);
    });

    it('should not clear file-based registrations', () => {
      registry.register(1, { id: '01' }, { source: 'file' });
      registry.refreshCache();

      expect(registry.has(1)).toBe(true);
      expect(registry.get(1).id).toBe('01');
    });
  });

  describe('getRegisteredStages', () => {
    it('should return sorted stage numbers', () => {
      registry.register(5, { id: '05' });
      registry.register(1, { id: '01' });
      registry.register(25, { id: '25' });

      expect(registry.getRegisteredStages()).toEqual([1, 5, 25]);
    });

    it('should include DB-cached stages within TTL', () => {
      registry.register(1, { id: '01' });
      registry.dbCache.set(10, { template: { id: '10' }, cachedAt: Date.now() });

      const stages = registry.getRegisteredStages();
      expect(stages).toContain(1);
      expect(stages).toContain(10);
    });
  });

  describe('registerBuiltinStages', () => {
    it('should register stages from file system', async () => {
      const count = await registry.registerBuiltinStages();

      expect(count).toBeGreaterThanOrEqual(25);
      expect(registry.has(1)).toBe(true);
      expect(registry.has(25)).toBe(true);
      expect(registry._initialized).toBe(true);

      const stats = registry.getStats();
      expect(stats.fromFile).toBeGreaterThanOrEqual(25);
    });
  });

  describe('loadFromDB', () => {
    it('should handle DB errors gracefully', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            order: () => Promise.resolve({ data: null, error: { message: 'Connection refused' } }),
          }),
        }),
      };

      const loaded = await registry.loadFromDB(mockSupabase);
      expect(loaded).toBe(0);
      expect(registry.stats.dbErrors).toBe(1);
    });

    it('should cache DB-loaded configs', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            order: () => Promise.resolve({
              data: [
                { stage_number: 1, stage_name: 'DB Stage 1', phase_name: 'Phase 1', metadata: { version: '2.0.0' }, description: 'From DB' },
              ],
              error: null,
            }),
          }),
        }),
      };

      // Register file-based first
      registry.register(1, { id: 'stage-01', title: 'File Stage 1' }, { source: 'file' });

      const loaded = await registry.loadFromDB(mockSupabase);
      expect(loaded).toBe(1);

      // DB cache should override
      const template = registry.get(1);
      expect(template.title).toBe('DB Stage 1');
      expect(template.version).toBe('2.0.0');
    });

    it('should handle empty DB result', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      };

      const loaded = await registry.loadFromDB(mockSupabase);
      expect(loaded).toBe(0);
    });
  });
});
