/**
 * Unit Tests: Stage 0 Path Router
 *
 * Test Coverage:
 * - ENTRY_PATHS has 3 keys, PATH_OPTIONS has 3 entries
 * - Dispatches to each of 3 paths
 * - Throws on invalid pathKey
 * - Passes params/deps through
 * - Validates PathOutput from handler
 * - Returns null when handler returns null
 */

import { describe, test, expect, vi } from 'vitest';

// Mock path modules before importing the router
vi.mock('../../../../lib/eva/stage-zero/paths/competitor-teardown.js', () => ({
  executeCompetitorTeardown: vi.fn(),
}));
vi.mock('../../../../lib/eva/stage-zero/paths/blueprint-browse.js', () => ({
  executeBlueprintBrowse: vi.fn(),
}));
vi.mock('../../../../lib/eva/stage-zero/paths/discovery-mode.js', () => ({
  executeDiscoveryMode: vi.fn(),
  listDiscoveryStrategies: vi.fn(),
}));
vi.mock('../../../../lib/eva/stage-zero/paths/venture-reseeding.js', () => ({
  executeVentureReseeding: vi.fn(),
}));

import { ENTRY_PATHS, PATH_OPTIONS, routePath } from '../../../../lib/eva/stage-zero/path-router.js';
import { executeCompetitorTeardown } from '../../../../lib/eva/stage-zero/paths/competitor-teardown.js';
import { executeBlueprintBrowse } from '../../../../lib/eva/stage-zero/paths/blueprint-browse.js';
import { executeDiscoveryMode } from '../../../../lib/eva/stage-zero/paths/discovery-mode.js';
import { executeVentureReseeding } from '../../../../lib/eva/stage-zero/paths/venture-reseeding.js';

const silentLogger = { log: vi.fn(), warn: vi.fn() };

const validPathOutput = {
  origin_type: 'discovery',
  raw_material: { data: true },
  suggested_name: 'Test Venture',
  suggested_problem: 'A problem',
  suggested_solution: 'A solution',
  target_market: 'SMBs',
};

describe('ENTRY_PATHS and PATH_OPTIONS', () => {
  test('ENTRY_PATHS has exactly 4 keys', () => {
    expect(Object.keys(ENTRY_PATHS)).toHaveLength(4);
    expect(ENTRY_PATHS.COMPETITOR_TEARDOWN).toBe('competitor_teardown');
    expect(ENTRY_PATHS.BLUEPRINT_BROWSE).toBe('blueprint_browse');
    expect(ENTRY_PATHS.DISCOVERY_MODE).toBe('discovery_mode');
    expect(ENTRY_PATHS.SEEDED_FROM_VENTURE).toBe('seeded_from_venture');
  });

  test('PATH_OPTIONS has 4 entries matching ENTRY_PATHS', () => {
    expect(PATH_OPTIONS).toHaveLength(4);
    const keys = PATH_OPTIONS.map(o => o.key);
    expect(keys).toContain(ENTRY_PATHS.COMPETITOR_TEARDOWN);
    expect(keys).toContain(ENTRY_PATHS.BLUEPRINT_BROWSE);
    expect(keys).toContain(ENTRY_PATHS.DISCOVERY_MODE);
    expect(keys).toContain(ENTRY_PATHS.SEEDED_FROM_VENTURE);
  });

  test('ENTRY_PATHS is frozen', () => {
    expect(Object.isFrozen(ENTRY_PATHS)).toBe(true);
  });
});

describe('routePath', () => {
  test('dispatches to competitor teardown handler', async () => {
    executeCompetitorTeardown.mockResolvedValueOnce({ ...validPathOutput, origin_type: 'competitor_teardown' });
    const result = await routePath('competitor_teardown', { urls: ['http://x.com'] }, { logger: silentLogger });
    expect(executeCompetitorTeardown).toHaveBeenCalledWith({ urls: ['http://x.com'] }, { logger: silentLogger });
    expect(result.origin_type).toBe('competitor_teardown');
  });

  test('dispatches to blueprint browse handler', async () => {
    executeBlueprintBrowse.mockResolvedValueOnce({ ...validPathOutput, origin_type: 'blueprint' });
    const result = await routePath('blueprint_browse', { category: 'saas' }, { logger: silentLogger });
    expect(executeBlueprintBrowse).toHaveBeenCalledWith({ category: 'saas' }, { logger: silentLogger });
    expect(result.origin_type).toBe('blueprint');
  });

  test('dispatches to discovery mode handler', async () => {
    executeDiscoveryMode.mockResolvedValueOnce({ ...validPathOutput, origin_type: 'discovery' });
    const result = await routePath('discovery_mode', { strategy: 'trend_scanner' }, { logger: silentLogger });
    expect(executeDiscoveryMode).toHaveBeenCalledWith({ strategy: 'trend_scanner' }, { logger: silentLogger });
    expect(result.origin_type).toBe('discovery');
  });

  test('dispatches to venture reseeding handler', async () => {
    executeVentureReseeding.mockResolvedValueOnce({ ...validPathOutput, origin_type: 'seeded_from_venture' });
    const result = await routePath('seeded_from_venture', { source_venture_id: 'v-1' }, { logger: silentLogger });
    expect(executeVentureReseeding).toHaveBeenCalledWith({ source_venture_id: 'v-1' }, { logger: silentLogger });
    expect(result.origin_type).toBe('seeded_from_venture');
  });

  test('throws on invalid pathKey', async () => {
    await expect(routePath('invalid_path', {}, { logger: silentLogger }))
      .rejects.toThrow('Unknown entry path: invalid_path');
  });

  test('passes params and deps through to handler', async () => {
    const params = { urls: ['http://test.com'], extra: 'data' };
    const deps = { logger: silentLogger, supabase: {} };
    executeCompetitorTeardown.mockResolvedValueOnce(validPathOutput);
    await routePath('competitor_teardown', params, deps);
    expect(executeCompetitorTeardown).toHaveBeenCalledWith(params, deps);
  });

  test('returns null when handler returns null', async () => {
    executeBlueprintBrowse.mockResolvedValueOnce(null);
    const result = await routePath('blueprint_browse', {}, { logger: silentLogger });
    expect(result).toBeNull();
  });

  test('logs validation warnings for incomplete PathOutput but still returns it', async () => {
    const incomplete = { origin_type: 'discovery' }; // missing fields
    executeDiscoveryMode.mockResolvedValueOnce(incomplete);
    const logger = { log: vi.fn(), warn: vi.fn() };
    const result = await routePath('discovery_mode', {}, { logger });
    expect(logger.warn).toHaveBeenCalled();
    expect(result).toEqual(incomplete);
  });
});
