/**
 * Vitest cases for db-content-parity-gate.js (FR-6).
 * SD: SD-LEO-INFRA-CODE-CONTENT-PARITY-001
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateDbContentParity, evaluateExpectation } from '../../../../scripts/modules/handoff/gates/db-content-parity-gate.js';
import { REGISTRY_TABLES } from '../../../../lib/db-content-registry-allowlist.js';

function makeMockClient({ sd, rowsByTable = {} }) {
  const calls = { from: [], inserts: [], queries: [] };

  function table(name) {
    calls.from.push(name);
    if (name === 'strategic_directives_v2') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: sd, error: null }),
          }),
        }),
      };
    }
    if (name === 'sd_verification_results') {
      return {
        insert: async (row) => {
          calls.inserts.push(row);
          return { error: null };
        },
      };
    }
    // registry table query: select(...).eq(col, val).eq(...).maybeSingle()
    let filters = {};
    const queryObj = {
      select: () => queryObj,
      eq: (col, val) => {
        filters[col] = val;
        return queryObj;
      },
      maybeSingle: async () => {
        calls.queries.push({ table: name, filters: { ...filters } });
        const rows = rowsByTable[name] || [];
        const match = rows.find((r) =>
          Object.entries(filters).every(([k, v]) => r[k] === v)
        );
        return { data: match || null, error: null };
      },
    };
    return queryObj;
  }
  return { from: table, _calls: calls };
}

describe('validateDbContentParity', () => {
  beforeEach(() => {
    delete process.env.LEO_PARITY_REGEX_REQUIRE_ANCHORS;
  });

  it('TS-1 happy path: assertion matches live row', async () => {
    const sd = {
      id: 'uuid-1',
      metadata: {
        db_content_assertions: [
          { table: 'stage_config', row_filter: { stage_number: 18 }, expected_columns: { stage_name: 'MVP Development' } },
        ],
      },
    };
    const client = makeMockClient({
      sd,
      rowsByTable: { stage_config: [{ stage_number: 18, stage_name: 'MVP Development' }] },
    });
    const r = await validateDbContentParity('SD-X', client);
    expect(r.pass).toBe(true);
    expect(r.score).toBe(100);
    expect(r.mismatches).toEqual([]);
    expect(r.skipped).toBe(false);
    expect(client._calls.inserts).toHaveLength(1);
    expect(client._calls.inserts[0].result).toBe('pass');
  });

  it('TS-2 literal mismatch detected', async () => {
    const sd = {
      id: 'uuid-2',
      metadata: {
        db_content_assertions: [
          { table: 'stage_config', row_filter: { stage_number: 20 }, expected_columns: { stage_name: 'Code Quality Gate' } },
        ],
      },
    };
    const client = makeMockClient({
      sd,
      rowsByTable: { stage_config: [{ stage_number: 20, stage_name: 'User Testing' }] },
    });
    const r = await validateDbContentParity('SD-X', client);
    expect(r.pass).toBe(false);
    expect(r.mismatches).toHaveLength(1);
    expect(r.mismatches[0]).toMatchObject({ column: 'stage_name', expected: 'Code Quality Gate', actual: 'User Testing' });
    expect(client._calls.inserts[0].result).toBe('fail');
  });

  it('TS-3 regex mismatch detected', async () => {
    const sd = {
      id: 'uuid-3',
      metadata: {
        db_content_assertions: [
          { table: 'stage_config', row_filter: { stage_number: 21 }, expected_columns: { description: { regex: '^Pre-Launch' } } },
        ],
      },
    };
    const client = makeMockClient({
      sd,
      rowsByTable: { stage_config: [{ stage_number: 21, description: 'Deployment to production' }] },
    });
    const r = await validateDbContentParity('SD-X', client);
    expect(r.pass).toBe(false);
    expect(r.mismatches[0].expected).toEqual({ regex: '^Pre-Launch' });
    expect(r.mismatches[0].actual).toBe('Deployment to production');
  });

  it('TS-4 missing row → actual:null mismatch', async () => {
    const sd = {
      id: 'uuid-4',
      metadata: {
        db_content_assertions: [
          { table: 'stage_config', row_filter: { stage_number: 99 }, expected_columns: { stage_name: 'Doesnt Exist' } },
        ],
      },
    };
    const client = makeMockClient({ sd, rowsByTable: { stage_config: [] } });
    const r = await validateDbContentParity('SD-X', client);
    expect(r.pass).toBe(false);
    expect(r.mismatches[0].actual).toBeNull();
  });

  it('TS-5 skip path: no assertions → no DB reads on registry tables', async () => {
    const sd = { id: 'uuid-5', metadata: {} };
    const client = makeMockClient({ sd });
    const r = await validateDbContentParity('SD-X', client);
    expect(r.pass).toBe(true);
    expect(r.skipped).toBe(true);
    expect(client._calls.queries).toHaveLength(0);
    expect(client._calls.inserts[0].result).toBe('skip');
  });

  it('TS-6 multi-assertion partial fail: 1 pass + 1 fail → pass:false with 1 mismatch', async () => {
    const sd = {
      id: 'uuid-6',
      metadata: {
        db_content_assertions: [
          { table: 'stage_config', row_filter: { stage_number: 18 }, expected_columns: { stage_name: 'MVP Development' } },
          { table: 'stage_config', row_filter: { stage_number: 20 }, expected_columns: { stage_name: 'Code Quality Gate' } },
        ],
      },
    };
    const client = makeMockClient({
      sd,
      rowsByTable: {
        stage_config: [
          { stage_number: 18, stage_name: 'MVP Development' },
          { stage_number: 20, stage_name: 'User Testing' },
        ],
      },
    });
    const r = await validateDbContentParity('SD-X', client);
    expect(r.pass).toBe(false);
    expect(r.mismatches).toHaveLength(1);
    expect(r.mismatches[0].row_filter).toEqual({ stage_number: 20 });
  });

  it('shape-error: table not in REGISTRY_TABLES → __shape_error__', async () => {
    const sd = {
      id: 'uuid-7',
      metadata: {
        db_content_assertions: [
          { table: 'arbitrary_table', row_filter: { id: 1 }, expected_columns: { name: 'X' } },
        ],
      },
    };
    const client = makeMockClient({ sd });
    const r = await validateDbContentParity('SD-X', client);
    expect(r.pass).toBe(false);
    expect(r.mismatches[0].column).toBe('__shape_error__');
  });
});

describe('evaluateExpectation anti-ReDoS guard (TR-6)', () => {
  it('rejects regex over 500-char cap', () => {
    const r = evaluateExpectation('x', { regex: 'a'.repeat(501) });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/cap/);
  });

  it('LEO_PARITY_REGEX_REQUIRE_ANCHORS=true rejects unanchored', () => {
    process.env.LEO_PARITY_REGEX_REQUIRE_ANCHORS = 'true';
    try {
      const r = evaluateExpectation('x', { regex: 'foo' });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/anchor/);
    } finally {
      delete process.env.LEO_PARITY_REGEX_REQUIRE_ANCHORS;
    }
  });
});

describe('REGISTRY_TABLES allowlist contract (FR-2)', () => {
  it('contains the seed tables', () => {
    expect(REGISTRY_TABLES).toEqual(['stage_config', 'chairman_dashboard_config']);
  });
  it('is frozen', () => {
    expect(Object.isFrozen(REGISTRY_TABLES)).toBe(true);
  });
});
