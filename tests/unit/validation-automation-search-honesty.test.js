// The VALIDATION semantic search must not report a search it did not perform.
// SD-LEO-INFRA-VALIDATION-DUPE-DETECTION-DEAD-001.
//
// WHAT THIS SUITE IS ACTUALLY GUARDING. searchExistingInfrastructure() used to set
// `search_performed: true` in its results INITIALIZER, before attempting anything. When every
// query failed, the per-query catch logged and continued, and the function returned
// search_performed:true with empty arrays. A TOTAL FAILURE AND A CLEAN RESULT WERE THE SAME BYTES.
// That is why a feature which has never once executed looked, for 289 days, exactly like a
// feature that ran and found nothing.
//
// EVERY DISCRIMINATOR HERE IS TESTED FROM BOTH SIDES ON PURPOSE. A single-arm assertion
// ("failure reports could_not_search") is satisfiable by a constant, and a constant would be a
// new way to lie. So could_not_search is paired with searched, and absent-table is paired with
// empty-table. If either pair collapses to one arm, the test stops measuring anything.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// GUARDED AT THE MODULE BOUNDARY. validation-automation.js builds a Supabase service client at
// IMPORT TIME (module scope), so merely importing it in the unit tier would construct a real
// client against whatever SUPABASE_URL is in the environment. Mocking here makes that
// UNREACHABLE rather than merely unused — the distinction between a test that is safe and one
// that happens not to have connected yet.
const rpcMock = vi.fn();
const selectMock = vi.fn();

vi.mock('../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({
    rpc: (...args) => rpcMock(...args),
    from: () => ({
      select: (...args) => selectMock(...args),
    }),
  }),
}));

const embedMock = vi.fn();

// THE MOCK DELIBERATELY EXPORTS BOTH FACTORY FUNCTIONS, INCLUDING THE ONE THE FIXED CODE NO
// LONGER IMPORTS. Reason: this suite's value depends on it going RED against the pre-fix module,
// and the pre-fix module imports getLLMClient. A mock exporting only getEmbeddingClient would make
// the old module fail to LOAD, so every test would fail for a missing-export reason that has
// nothing to do with the defect — a red that proves the mock is incomplete, not that the bug is
// caught. getLLMClient is modelled with its REAL measured surface (complete/chat/messages present,
// embeddings UNDEFINED) so the old `client.embeddings.create(...)` throws exactly the production
// TypeError rather than a mock artifact.
vi.mock('../../lib/llm/client-factory.js', () => ({
  getEmbeddingClient: () => ({
    embed: (...args) => embedMock(...args),
    model: 'test-embedding-model',
    dimensions: 1536,
    provider: 'test',
  }),
  getLLMClient: async () => ({
    complete: () => {},
    chat: {},
    messages: {},
    // embeddings intentionally absent — this is the measured adapter surface, and the absence is
    // the whole defect.
  }),
}));

const { searchExistingInfrastructure, checkSemanticIndexStatus } =
  await import('../../lib/utils/validation-automation.js');

const SD = { title: 'a feature', description: 'some description of a feature', target_application: 'EHG_Engineer' };
const vector = () => [Array.from({ length: 1536 }, () => 0.01)];

beforeEach(() => {
  rpcMock.mockReset();
  selectMock.mockReset();
  embedMock.mockReset();
});

describe('a search that could not run must never report that it searched', () => {
  it('TS-1: EVERY query fails -> could_not_search, search_performed FALSE', async () => {
    // THE REGRESSION TEST FOR THE 289-DAY DEFECT. Against the pre-fix code this returns
    // search_performed:true with empty arrays, which is indistinguishable from a clean run.
    embedMock.mockRejectedValue(new Error('embedding provider exploded'));

    const r = await searchExistingInfrastructure(SD, { application: 'EHG_Engineer' });

    expect(r.search_status).toBe('could_not_search');
    expect(r.search_performed).toBe(false);
    expect(r.queries_succeeded).toBe(0);
    expect(r.queries_attempted).toBeGreaterThan(0);
    expect(r.failure_reasons.join(' ')).toContain('embedding provider exploded');
  });

  it('TS-2: every query succeeds and genuinely matches nothing -> searched, search_performed TRUE', async () => {
    // The other arm. Without it, an implementation that returned could_not_search
    // UNCONDITIONALLY would pass TS-1 and be just as useless.
    embedMock.mockResolvedValue(vector());
    rpcMock.mockResolvedValue({ data: [], error: null });

    const r = await searchExistingInfrastructure(SD, { application: 'EHG_Engineer' });

    expect(r.search_status).toBe('searched');
    expect(r.search_performed).toBe(true);
    expect(r.queries_succeeded).toBeGreaterThan(0);
    expect(r.summary.potential_duplicates_count).toBe(0);
    // An empty result from a search that RAN is a real finding, and must look different from TS-1.
    expect(r.failure_reasons).toEqual([]);
  });

  it('TS-3: partial failure -> searched, but the losses are recorded rather than hidden', async () => {
    embedMock
      .mockResolvedValueOnce(vector())
      .mockRejectedValue(new Error('provider rate limited'));
    rpcMock.mockResolvedValue({ data: [], error: null });

    const r = await searchExistingInfrastructure(SD, { application: 'EHG_Engineer' });

    expect(r.search_status).toBe('searched');
    expect(r.queries_succeeded).toBeGreaterThan(0);
    if (r.queries_attempted > r.queries_succeeded) {
      expect(r.failure_reasons.length).toBeGreaterThan(0);
    }
  });

  it('an RPC error is a failed query, not a quiet empty result', async () => {
    // This is the exact live condition found while building: semantic_code_search DOES NOT EXIST
    // in the database (PGRST202, same code a fabricated RPC name returns). Pre-fix, this produced
    // search_performed:true and a tidy zero.
    embedMock.mockResolvedValue(vector());
    rpcMock.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.semantic_code_search' } });

    const r = await searchExistingInfrastructure(SD, { application: 'EHG_Engineer' });

    expect(r.search_status).toBe('could_not_search');
    expect(r.search_performed).toBe(false);
    expect(r.failure_reasons.join(' ')).toContain('semantic_code_search');
  });
});

describe('the embedding call shape — the defect that matched neither factory', () => {
  it('TS-6: embed() returns number[][], and the FLAT vector is what reaches the RPC', async () => {
    // The old call was `client.embeddings.create(...)` returning `response.data[0].embedding` — a
    // single vector needing no indexing. embed() returns an ARRAY OF VECTORS, so the [0] is
    // load-bearing. A regression that passed the outer array through would send a number[][] to
    // the RPC and fail confusingly at the database rather than here.
    embedMock.mockResolvedValue(vector());
    rpcMock.mockResolvedValue({ data: [], error: null });

    await searchExistingInfrastructure(SD, { application: 'EHG_Engineer' });

    expect(rpcMock).toHaveBeenCalled();
    const passed = rpcMock.mock.calls[0][1].query_embedding;
    expect(Array.isArray(passed)).toBe(true);
    expect(passed).toHaveLength(1536);
    expect(typeof passed[0]).toBe('number');   // flat, NOT an array of arrays
  });

  it('an unexpected embed() shape fails LOUDLY rather than reaching the RPC malformed', async () => {
    embedMock.mockResolvedValue({ not: 'an array' });

    const r = await searchExistingInfrastructure(SD, { application: 'EHG_Engineer' });

    expect(r.search_status).toBe('could_not_search');
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('index status must tell ABSENT from EMPTY', () => {
  it('TS-7: a MISSING table is reported as a schema problem, not as an empty index', async () => {
    // Measured live: a head:true count against a fabricated table returns error:null AND
    // count:null — no error at all. So the previous head-only probe reported a dropped table as
    // "empty" and advised running the indexer, which cannot help.
    selectMock.mockReturnValue({ limit: () => Promise.resolve({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.codebase_semantic_index'" } }) });

    const s = await checkSemanticIndexStatus();

    expect(s.available).toBe(false);
    expect(s.table_present).toBe(false);
    expect(s.message).toMatch(/DOES NOT EXIST|schema problem/i);
    expect(s.message).not.toMatch(/run scripts\/semantic-indexer/i);
  });

  it('TS-7b: an error that proves NEITHER — presence is UNKNOWN, never asserted true', async () => {
    // THE ARM I ORIGINALLY SHIPPED WITHOUT A TEST, and it carried the defect this SD exists to
    // remove. `table_present: !absent` made every non-absence error (RLS 42501, network, expired
    // JWT) a POSITIVE claim that the table exists — manufactured from evidence that says nothing
    // either way. I enforced two-sidedness on every other discriminator and skipped it on the arm
    // I added last. A RETRO sub-agent caught it before merge, not me.
    for (const err of [
      { code: '42501', message: 'permission denied for table codebase_semantic_index' },
      { code: 'PGRST301', message: 'JWT expired' },
      { message: 'network unreachable' },
    ]) {
      selectMock.mockReturnValue({ limit: () => Promise.resolve({ data: null, error: err }) });
      const s = await checkSemanticIndexStatus();
      expect(s.available, `${err.code}: must not be available`).toBe(false);
      expect(s.table_present, `${err.code}: presence must be UNKNOWN (null), never asserted`).toBeNull();
      expect(s.message).toMatch(/UNREADABLE|cannot tell/i);
    }
  });

  it('TS-8: a PRESENT but EMPTY table still advises running the indexer', async () => {
    // Two-sided partner to TS-7. Either arm alone is satisfiable by a constant message.
    selectMock.mockReturnValue({ limit: () => Promise.resolve({ data: [], error: null }) });

    const s = await checkSemanticIndexStatus();

    expect(s.available).toBe(false);
    expect(s.table_present).toBe(true);
    expect(s.entity_count).toBe(0);
    expect(s.message).toMatch(/run scripts\/semantic-indexer/i);
  });
});
