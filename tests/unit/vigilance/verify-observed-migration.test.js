/**
 * FR-1/TR-1 OBSERVED migration verification — pure unit tests (fake pg client, no live DB).
 * TS-1: pg_constraint query correctly reports applied vs apply-pending status.
 */
import { describe, it, expect } from 'vitest';
import { checkObservedMigrationApplied, CONSTRAINT_NAME } from '../../../lib/vigilance/verify-observed-migration.js';

function fakePgClient(constraintDef) {
  const queries = [];
  return {
    queries,
    query: async (sql, params) => {
      queries.push({ sql, params });
      return { rows: constraintDef == null ? [] : [{ def: constraintDef }] };
    },
  };
}

describe('OBSERVED migration verification (FR-1/TR-1)', () => {
  it('TS-1: reports applied=true when the live constraint definition includes OBSERVED', async () => {
    const client = fakePgClient("CHECK ((epistemic_tag = ANY (ARRAY['FACT'::text, 'ASSUMPTION'::text, 'SIMULATION'::text, 'UNKNOWN'::text, 'OBSERVED'::text])))");
    const result = await checkObservedMigrationApplied(client);
    expect(result.applied).toBe(true);
    expect(result.constraintDef).toContain('OBSERVED');
  });

  it('TS-1: reports applied=false (apply-pending) when the live constraint lacks OBSERVED', async () => {
    const client = fakePgClient("CHECK ((epistemic_tag = ANY (ARRAY['FACT'::text, 'ASSUMPTION'::text, 'SIMULATION'::text, 'UNKNOWN'::text])))");
    const result = await checkObservedMigrationApplied(client);
    expect(result.applied).toBe(false);
  });

  it('reports applied=false when the constraint does not exist at all (never assumed true)', async () => {
    const client = fakePgClient(null);
    const result = await checkObservedMigrationApplied(client);
    expect(result.applied).toBe(false);
    expect(result.constraintDef).toBeNull();
  });

  it('queries pg_constraint by exact name — never a PostgREST head-count probe', async () => {
    const client = fakePgClient('...OBSERVED...');
    await checkObservedMigrationApplied(client);
    expect(client.queries[0].sql).toMatch(/pg_constraint/);
    expect(client.queries[0].sql).toMatch(/pg_get_constraintdef/);
    expect(client.queries[0].params).toEqual([CONSTRAINT_NAME]);
  });

  it('includes a checked_at timestamp (never silently assumed, always explicitly reported)', async () => {
    const client = fakePgClient('OBSERVED');
    const result = await checkObservedMigrationApplied(client);
    expect(Number.isNaN(Date.parse(result.checked_at))).toBe(false);
  });
});
