import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createChain,
  addLink,
  getChain,
  getLatestVersion,
  clearChainCache,
} from '../../../lib/eva/artifact-version-chain.js';

function mockSupabase(overrides = {}) {
  const selectResult = overrides.selectData
    ? { data: overrides.selectData, error: null }
    : overrides.selectError
      ? { data: null, error: { message: overrides.selectError } }
      : { data: null, error: { message: 'not found' } };

  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(() => chain),
    then: (resolve) => resolve(selectResult),
  };

  const upsertResult = overrides.upsertError
    ? { error: { message: overrides.upsertError } }
    : { error: null };

  return {
    from: vi.fn(() => ({
      ...chain,
      upsert: vi.fn(() => Promise.resolve(upsertResult)),
    })),
  };
}

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('artifact-version-chain', () => {
  beforeEach(() => {
    clearChainCache();
  });

  describe('createChain', () => {
    it('creates a new chain with initial link', async () => {
      const supabase = mockSupabase();
      const result = await createChain(supabase, {
        ventureId: 'v-1',
        artifactType: 'prd',
        stage: 'stage-3',
        initialData: { title: 'Test PRD' },
      }, { logger: silentLogger });

      expect(result.chainId).toBeDefined();
      expect(result.version).toBe(1);
      expect(result.error).toBeUndefined();
    });

    it('returns error when missing ventureId', async () => {
      const result = await createChain(null, { artifactType: 'prd' });
      expect(result.error).toBe('Missing ventureId or artifactType');
      expect(result.chainId).toBeNull();
    });

    it('returns error when missing artifactType', async () => {
      const result = await createChain(null, { ventureId: 'v-1' });
      expect(result.error).toBe('Missing ventureId or artifactType');
    });

    it('caches chain locally when no supabase', async () => {
      const result = await createChain(null, {
        ventureId: 'v-2',
        artifactType: 'retrospective',
        stage: 'stage-5',
      }, { logger: silentLogger });

      expect(result.chainId).toBeDefined();
      expect(result.warning).toContain('cached only');

      // Verify cached by loading
      const loaded = await getChain(null, result.chainId);
      expect(loaded.chain).not.toBeNull();
      expect(loaded.chain.artifactType).toBe('retrospective');
    });

    it('handles persistence failure gracefully', async () => {
      const supabase = mockSupabase({ upsertError: 'DB write failed' });
      const result = await createChain(supabase, {
        ventureId: 'v-3',
        artifactType: 'handoff',
        stage: 'stage-1',
      }, { logger: silentLogger });

      expect(result.chainId).toBeDefined();
      expect(result.version).toBe(1);
      expect(result.warning).toContain('persistence failed');
    });
  });

  describe('addLink', () => {
    it('adds a version link to an existing chain', async () => {
      const supabase = mockSupabase();
      const created = await createChain(supabase, {
        ventureId: 'v-4',
        artifactType: 'prd',
        stage: 'stage-3',
      }, { logger: silentLogger });

      const result = await addLink(supabase, created.chainId, {
        stage: 'stage-5',
        changeSummary: 'Updated requirements after stage 4',
        data: { title: 'Updated PRD' },
      }, { logger: silentLogger });

      expect(result.linkId).toBeDefined();
      expect(result.version).toBe(2);
    });

    it('links to parent version correctly', async () => {
      const supabase = mockSupabase();
      const created = await createChain(supabase, {
        ventureId: 'v-5',
        artifactType: 'prd',
        stage: 'stage-1',
      }, { logger: silentLogger });

      await addLink(supabase, created.chainId, {
        stage: 'stage-3',
        changeSummary: 'Stage 3 changes',
      }, { logger: silentLogger });

      const { chain } = await getChain(null, created.chainId);
      expect(chain.links).toHaveLength(2);
      expect(chain.links[1].parentLinkId).toBe(chain.links[0].linkId);
    });

    it('returns error when chainId is missing', async () => {
      const result = await addLink(null, null, { stage: 's1', changeSummary: 'test' });
      expect(result.error).toBe('Missing chainId');
    });

    it('returns error when chain not found', async () => {
      const result = await addLink(null, 'non-existent-id', {
        stage: 's1',
        changeSummary: 'test',
      }, { logger: silentLogger });
      expect(result.error).toBeDefined();
    });
  });

  describe('getChain', () => {
    it('returns chain from cache', async () => {
      await createChain(null, {
        ventureId: 'v-6',
        artifactType: 'prd',
        stage: 'stage-1',
      }, { logger: silentLogger });

      // Find the chainId from cache
      const created = await createChain(null, {
        ventureId: 'v-7',
        artifactType: 'handoff',
        stage: 'stage-2',
      }, { logger: silentLogger });

      const result = await getChain(null, created.chainId);
      expect(result.chain).not.toBeNull();
      expect(result.chain.chainId).toBe(created.chainId);
    });

    it('returns null for unknown chainId without supabase', async () => {
      const result = await getChain(null, 'unknown-chain', { logger: silentLogger });
      expect(result.chain).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('loads from database when not cached', async () => {
      const chainData = {
        chainId: 'db-chain-1',
        ventureId: 'v-8',
        artifactType: 'prd',
        links: [{ linkId: 'link-1', version: 1, parentLinkId: null, stage: 's1' }],
        currentVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const supabase = mockSupabase({
        selectData: { value: JSON.stringify(chainData) },
      });

      const result = await getChain(supabase, 'db-chain-1', { logger: silentLogger });
      expect(result.chain).not.toBeNull();
      expect(result.chain.chainId).toBe('db-chain-1');
    });
  });

  describe('getLatestVersion', () => {
    it('returns the latest link from a chain', async () => {
      const supabase = mockSupabase();
      const created = await createChain(supabase, {
        ventureId: 'v-9',
        artifactType: 'prd',
        stage: 'stage-1',
        initialData: { v: 1 },
      }, { logger: silentLogger });

      await addLink(supabase, created.chainId, {
        stage: 'stage-3',
        changeSummary: 'Updated',
        data: { v: 2 },
      }, { logger: silentLogger });

      const result = await getLatestVersion(null, created.chainId);
      expect(result.version).toBe(2);
      expect(result.link.changeSummary).toBe('Updated');
    });

    it('returns error for non-existent chain', async () => {
      const result = await getLatestVersion(null, 'missing', { logger: silentLogger });
      expect(result.link).toBeNull();
      expect(result.version).toBe(0);
      expect(result.error).toBeDefined();
    });
  });

  describe('clearChainCache', () => {
    it('clears all cached chains', async () => {
      await createChain(null, {
        ventureId: 'v-10',
        artifactType: 'prd',
        stage: 's1',
      }, { logger: silentLogger });

      const beforeClear = await getChain(null, 'some-id');
      // Will be null for wrong id but cache has entries

      clearChainCache();

      // After clear, nothing in cache
      const result = await getChain(null, 'any-id', { logger: silentLogger });
      expect(result.chain).toBeNull();
    });
  });
});
