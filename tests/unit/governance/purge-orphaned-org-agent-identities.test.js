/**
 * SD-LEO-INFRA-ORG-TEST-TEARDOWN-001 FR-3 — purgeOrphanedOrgAgentIdentities bounds a crashed
 * real-DB org test run's org_agent_identities residue, mirroring purgeStaleRealDbResidue's
 * established pattern for the sibling ventures-residue problem.
 */
import { describe, it, expect, vi } from 'vitest';
import { purgeOrphanedOrgAgentIdentities } from '../../../lib/governance/fixture-producer-guard.mjs';

function makeFakeSupabase({ candidates = [], liveVentures = [] } = {}) {
  const deletedFrom = {};
  const client = {
    from(table) {
      if (table === 'org_agent_identities') {
        return {
          select() { return this; },
          ilike() { return this; },
          not() { return this; },
          limit() { return Promise.resolve({ data: candidates, error: null }); },
          delete() { return this; },
          in(col, ids) {
            deletedFrom[table] = ids;
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      if (table === 'ventures') {
        return {
          select() { return this; },
          in() { return Promise.resolve({ data: liveVentures, error: null }); },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
  return { client, deletedFrom };
}

describe('purgeOrphanedOrgAgentIdentities', () => {
  it('purges rows whose venture_id no longer resolves in ventures', async () => {
    const { client, deletedFrom } = makeFakeSupabase({
      candidates: [
        { id: 'oa1', venture_id: 'v-dead-1', display_name: 'TEST-abc-SD-A CEO' },
        { id: 'oa2', venture_id: 'v-dead-2', display_name: 'TEST-abc-SD-A VP Eng' },
      ],
      liveVentures: [],
    });
    const result = await purgeOrphanedOrgAgentIdentities(client, { namePrefix: 'TEST-' });
    expect(result).toEqual({ purged: 2 });
    expect(deletedFrom.org_agent_identities).toEqual(['oa1', 'oa2']);
  });

  it('[TWO-SIDED] a row whose venture is still live is never deleted', async () => {
    const { client, deletedFrom } = makeFakeSupabase({
      candidates: [{ id: 'oa1', venture_id: 'v-live', display_name: 'TEST-abc-SD-A CEO' }],
      liveVentures: [{ id: 'v-live' }],
    });
    const result = await purgeOrphanedOrgAgentIdentities(client, { namePrefix: 'TEST-' });
    expect(result).toEqual({ purged: 0 });
    expect(deletedFrom).toEqual({});
  });

  it('a mix of orphaned and live rows deletes only the orphaned ones', async () => {
    const { client, deletedFrom } = makeFakeSupabase({
      candidates: [
        { id: 'oa1', venture_id: 'v-live', display_name: 'TEST-abc-SD-A CEO' },
        { id: 'oa2', venture_id: 'v-dead', display_name: 'TEST-abc-SD-A VP' },
      ],
      liveVentures: [{ id: 'v-live' }],
    });
    const result = await purgeOrphanedOrgAgentIdentities(client, { namePrefix: 'TEST-' });
    expect(result).toEqual({ purged: 1 });
    expect(deletedFrom.org_agent_identities).toEqual(['oa2']);
  });

  it('no candidates -> no deletes and no ventures lookup fired', async () => {
    const { client, deletedFrom } = makeFakeSupabase({ candidates: [] });
    const result = await purgeOrphanedOrgAgentIdentities(client, { namePrefix: 'TEST-' });
    expect(result).toEqual({ purged: 0 });
    expect(deletedFrom).toEqual({});
  });

  it('fails soft (never throws) on a candidate-lookup error', async () => {
    const client = {
      from: () => ({
        select() { return this; },
        ilike() { return this; },
        not() { return this; },
        limit: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
      }),
    };
    const warn = vi.fn();
    const result = await purgeOrphanedOrgAgentIdentities(client, { namePrefix: 'TEST-', logger: { warn } });
    expect(result).toEqual({ purged: 0 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('fails soft (never throws) on a ventures-lookup error', async () => {
    const client = {
      from(table) {
        if (table === 'org_agent_identities') {
          return {
            select() { return this; }, ilike() { return this; }, not() { return this; },
            limit: () => Promise.resolve({ data: [{ id: 'oa1', venture_id: 'v1', display_name: 'TEST-x' }], error: null }),
          };
        }
        return { select() { return this; }, in: () => Promise.resolve({ data: null, error: { message: 'ventures boom' } }) };
      },
    };
    const warn = vi.fn();
    const result = await purgeOrphanedOrgAgentIdentities(client, { namePrefix: 'TEST-', logger: { warn } });
    expect(result).toEqual({ purged: 0 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ventures boom'));
  });

  it('requires a namePrefix', async () => {
    await expect(purgeOrphanedOrgAgentIdentities({}, {})).rejects.toThrow('namePrefix');
  });
});
