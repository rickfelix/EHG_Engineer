/**
 * SD-LEO-INFRA-CHECKER-READBACK-WRITE-001 — 'both directions' known-answer suite for
 * lib/checkers/readback-checker.mjs (TS-1..TS-4, TS-7..TS-9).
 *
 * The unit tier cannot reach a live database (tests/setup.unit.js hard-fences it), so
 * this suite mocks the client FACTORY (lib/supabase-client.js createSupabaseServiceClient)
 * rather than a real table — the established seam already used across this repo's unit
 * tests. verifyReadback's real rowcount/equality/key logic still runs for real against
 * the mocked return value; only the network hop is faked.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }));
vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: (...args) => mockCreateClient(...args),
}));

import {
  verifyReadback,
  ReadbackRowcountError,
  ReadbackFieldMismatchError,
  ReadbackKeyDropError,
  ReadbackQueryError,
} from '../../../lib/checkers/readback-checker.mjs';
import {
  correctWriteFixture,
  fenceNoOpFixture,
  metadataClobberFixture,
  phantomFlipFixture,
} from '../../../lib/checkers/readback-fixtures.mjs';

function mockClientReturning(rows) {
  return {
    from: (table) => ({
      select: () => ({
        match: (matchArg) => Promise.resolve({ data: rows, error: null, _table: table, _match: matchArg }),
      }),
    }),
  };
}

function mockClientErroring(message) {
  return {
    from: () => ({
      select: () => ({
        match: () => Promise.resolve({ data: null, error: { message } }),
      }),
    }),
  };
}

beforeEach(() => {
  mockCreateClient.mockReset();
});

describe('verifyReadback — TS-1 positive control + fresh-client call count (G1)', () => {
  it('resolves PASS for a correct write, constructing the factory exactly once', async () => {
    const { intendedRow, persistedRow } = correctWriteFixture();
    mockCreateClient.mockReturnValue(mockClientReturning([persistedRow]));

    const result = await verifyReadback({
      table: 'sub_agent_execution_results',
      match: { id: intendedRow.id },
      expectedFields: { verdict: intendedRow.verdict, sub_agent_code: intendedRow.sub_agent_code },
      requiredKeys: { metadata: ['is_coordinator', 'coordinator_since'] },
    });

    expect(result.verdict).toBe('PASS');
    expect(result.row).toEqual(persistedRow);
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
  });
});

describe('verifyReadback — TS-2 rowcount: fence-no-op (0 rows) and over-broad match (>1 rows) (G2)', () => {
  it('throws ReadbackRowcountError for zero rows (fence-no-op), carrying count=0 and the match used', async () => {
    const { intendedRow } = fenceNoOpFixture();
    mockCreateClient.mockReturnValue(mockClientReturning([]));
    let caught;
    try {
      await verifyReadback({
        table: 'sub_agent_execution_results',
        match: { id: intendedRow.id },
        expectedFields: { verdict: intendedRow.verdict },
      });
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ReadbackRowcountError);
    expect(caught.count).toBe(0);
    expect(caught.table).toBe('sub_agent_execution_results');
    expect(caught.match).toEqual({ id: intendedRow.id });
  });

  it('throws ReadbackRowcountError with a distinct message and count=2 for more than one matched row', async () => {
    const { intendedRow, persistedRow } = correctWriteFixture();
    mockCreateClient.mockReturnValue(mockClientReturning([persistedRow, { ...persistedRow, id: 'row-2' }]));
    let caught;
    try {
      await verifyReadback({
        table: 'sub_agent_execution_results',
        match: { id: intendedRow.id },
        expectedFields: { verdict: intendedRow.verdict },
      });
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ReadbackRowcountError);
    expect(caught.count).toBe(2);
    expect(caught.message).toMatch(/expected exactly 1 row/);
  });
});

describe('verifyReadback — TS-3 metadata-clobber: dropped AND nulled required keys (G4)', () => {
  it('throws ReadbackKeyDropError naming BOTH dropped keys when fully absent', async () => {
    const { intendedRow, persistedRow } = metadataClobberFixture({ nullify: false });
    mockCreateClient.mockReturnValue(mockClientReturning([persistedRow]));
    let caught;
    try {
      await verifyReadback({
        table: 'sub_agent_execution_results',
        match: { id: intendedRow.id },
        requiredKeys: { metadata: ['is_coordinator', 'coordinator_since'] },
      });
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ReadbackKeyDropError);
    expect(caught.column).toBe('metadata');
    expect(caught.droppedKeys.sort()).toEqual(['coordinator_since', 'is_coordinator']);
  });

  it('throws ReadbackKeyDropError naming the dropped key when present but null (the clobber survives as null, not absent)', async () => {
    const { intendedRow, persistedRow } = metadataClobberFixture({ nullify: true });
    mockCreateClient.mockReturnValue(mockClientReturning([persistedRow]));
    let caught;
    try {
      await verifyReadback({
        table: 'sub_agent_execution_results',
        match: { id: intendedRow.id },
        requiredKeys: { metadata: ['is_coordinator', 'coordinator_since'] },
      });
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ReadbackKeyDropError);
    expect(caught.droppedKeys.sort()).toEqual(['coordinator_since', 'is_coordinator']);
  });

  it('throws ReadbackKeyDropError (not a crash) naming the key when the whole required column is null', async () => {
    mockCreateClient.mockReturnValue(mockClientReturning([{ id: 'row-1', metadata: null }]));
    let caught;
    try {
      await verifyReadback({
        table: 'sub_agent_execution_results',
        match: { id: 'row-1' },
        requiredKeys: { metadata: ['is_coordinator'] },
      });
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ReadbackKeyDropError);
    expect(caught.droppedKeys).toEqual(['is_coordinator']);
  });
});

describe('verifyReadback — TS-4 phantom-flip + deep equality, not === (G3, G6)', () => {
  it('throws ReadbackFieldMismatchError for a mismatched primitive field, carrying field+expected+actual', async () => {
    const { intendedRow, persistedRow } = phantomFlipFixture();
    mockCreateClient.mockReturnValue(mockClientReturning([persistedRow]));
    let caught;
    try {
      await verifyReadback({
        table: 'sub_agent_execution_results',
        match: { id: intendedRow.id },
        expectedFields: { verdict: intendedRow.verdict },
      });
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ReadbackFieldMismatchError);
    expect(caught.field).toBe('verdict');
    expect(caught.expected).toBe(intendedRow.verdict); // 'PASS'
    expect(caught.actual).toBe(persistedRow.verdict); // 'FAIL'
  });

  it('does NOT throw for a deep-equal object/array-valued field (proves comparison is not ===)', async () => {
    const row = { id: 'row-1', tags: ['a', 'b'], nested: { x: 1, y: [1, 2] } };
    mockCreateClient.mockReturnValue(mockClientReturning([row]));
    await expect(verifyReadback({
      table: 'sub_agent_execution_results',
      match: { id: row.id },
      // Different object/array identity, same shape — a === comparison would throw here.
      expectedFields: { tags: ['a', 'b'], nested: { x: 1, y: [1, 2] } },
    })).resolves.toMatchObject({ verdict: 'PASS' });
  });

  it('does NOT false-positive on a semantically-equal timestamp in a different string form', async () => {
    const row = { id: 'row-1', created_at: '2026-08-12T18:31:56+00:00' };
    mockCreateClient.mockReturnValue(mockClientReturning([row]));
    await expect(verifyReadback({
      table: 'sub_agent_execution_results',
      match: { id: row.id },
      expectedFields: { created_at: '2026-08-12T18:31:56Z' },
    })).resolves.toMatchObject({ verdict: 'PASS' });
  });

  it('DOES throw for a genuinely different timestamp instant', async () => {
    const row = { id: 'row-1', created_at: '2026-08-12T18:31:57Z' };
    mockCreateClient.mockReturnValue(mockClientReturning([row]));
    await expect(verifyReadback({
      table: 'sub_agent_execution_results',
      match: { id: row.id },
      expectedFields: { created_at: '2026-08-12T18:31:56Z' },
    })).rejects.toThrow(ReadbackFieldMismatchError);
  });

  it('fails loud (does not false-PASS) on a non-JSON-serializable expected value', async () => {
    // A nested-BigInt field can't round-trip through JSON.stringify — deepEqual's catch branch
    // must return false (mismatch), never silently treat it as equal. Two DISTINCT object
    // instances (not the same reference, and not primitive BigInts, which compare === by value)
    // are required to actually reach that branch rather than short-circuiting on a === b.
    mockCreateClient.mockReturnValue(mockClientReturning([{ id: 'row-1', big: { nested: 10n } }]));
    await expect(verifyReadback({
      table: 'sub_agent_execution_results',
      match: { id: 'row-1' },
      expectedFields: { big: { nested: 10n } },
    })).rejects.toThrow(ReadbackFieldMismatchError);
  });
});

describe('verifyReadback — TS-7 no memoization across calls (independence, G1)', () => {
  it('reflects a changed mocked return value on a second call — nothing cached from the first', async () => {
    mockCreateClient.mockReturnValueOnce(mockClientReturning([{ id: 'row-1', verdict: 'PASS' }]));
    const first = await verifyReadback({ table: 't', match: { id: 'row-1' }, expectedFields: { verdict: 'PASS' } });
    expect(first.verdict).toBe('PASS');

    mockCreateClient.mockReturnValueOnce(mockClientReturning([{ id: 'row-1', verdict: 'FAIL' }]));
    await expect(verifyReadback({ table: 't', match: { id: 'row-1' }, expectedFields: { verdict: 'PASS' } }))
      .rejects.toThrow(ReadbackFieldMismatchError);

    expect(mockCreateClient).toHaveBeenCalledTimes(2); // a fresh client construction every call
  });
});

describe('verifyReadback — TS-8 query error is not coerced into a rowcount failure (G5)', () => {
  it('throws ReadbackQueryError, not ReadbackRowcountError, on a genuine {error} response', async () => {
    mockCreateClient.mockReturnValue(mockClientErroring('connection reset by peer'));
    await expect(verifyReadback({ table: 't', match: { id: 'x' } })).rejects.toThrow(ReadbackQueryError);
  });

  it('wraps a thrown exception (not just an {error} object) the same way', async () => {
    mockCreateClient.mockReturnValue({
      from: () => ({ select: () => ({ match: () => { throw new Error('network down'); } }) }),
    });
    await expect(verifyReadback({ table: 't', match: { id: 'x' } })).rejects.toThrow(ReadbackQueryError);
  });
});

describe('verifyReadback — TS-9 static source-pin: no write calls (FR-2 AC-3, G7)', () => {
  it('lib/checkers/readback-checker.mjs source contains no insert/update/upsert/delete calls', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'lib', 'checkers', 'readback-checker.mjs'), 'utf8');
    expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });

  it('verifyReadback() public signature has no client-injection parameter (TR-1/G9)', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'lib', 'checkers', 'readback-checker.mjs'), 'utf8');
    const sigMatch = src.match(/export async function verifyReadback\(\{([^}]*)\}/);
    expect(sigMatch, 'verifyReadback signature not found').not.toBeNull();
    expect(sigMatch[1]).not.toMatch(/\bsupabase\b/);
  });
});

describe('verifyReadback — input validation', () => {
  it('throws if table is missing', async () => {
    await expect(verifyReadback({ match: { id: 'x' } })).rejects.toThrow(/table is required/);
  });

  it('throws if match is missing or empty', async () => {
    await expect(verifyReadback({ table: 't' })).rejects.toThrow(/match is required/);
    await expect(verifyReadback({ table: 't', match: {} })).rejects.toThrow(/match is required/);
  });
});
