/**
 * Vitest coverage for the Stage-20 DB-sourced + env-based finding producers
 * (SD-LEO-INFRA-STAGE-ANALYZER-ADD-001).
 *
 * Hermetic: a hand-rolled mock supabase query-builder drives every DB path, and
 * the capability gate is mocked so the env-based producer is deterministic. No
 * live DB, no real environment probing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the env-based capability gate so produceCapabilityFindings is deterministic.
// Arrow-indirection so the hoisted factory resolves the spy lazily (repo convention).
const evalMock = vi.fn(() => ({ pass: true, missing_required: [], missing_optional: [], versions: {} }));
vi.mock('../../../../lib/eva/quality-findings/capability-gate.js', () => ({
  evaluateCapabilities: (...args) => evalMock(...args),
}));

const {
  resolveVentureSdIdentifiers,
  produceUatTestFindings,
  produceUatSignoffFindings,
  produceBugReportFindings,
  produceCapabilityFindings,
  collectNonRepoFindings,
} = await import('../../../../lib/eva/quality-findings/db-sourced-findings.js');

const silentLogger = { warn: () => {}, info: () => {}, error: () => {} };

/**
 * Build a mock supabase. `tables` maps table name -> { data, error }. Every chain
 * method returns the same builder; awaiting the builder resolves to the table's
 * configured result. `throwTables` makes .from(table) throw synchronously (to
 * exercise the best-effort catch paths).
 */
function makeSupabase(tables = {}, { throwTables = [] } = {}) {
  return {
    from(table) {
      if (throwTables.includes(table)) {
        throw new Error(`boom: ${table}`);
      }
      const result = tables[table] || { data: [], error: null };
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        or: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => Promise.resolve(result),
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
      };
      return builder;
    },
  };
}

beforeEach(() => {
  evalMock.mockReset();
  evalMock.mockReturnValue({ pass: true, missing_required: [], missing_optional: [], versions: {} });
});

describe('resolveVentureSdIdentifiers', () => {
  it('collects UUIDs and sd_keys for the venture', async () => {
    const supabase = makeSupabase({
      strategic_directives_v2: { data: [{ id: 'uuid-1', sd_key: 'SD-A-001' }, { id: 'uuid-2', sd_key: 'SD-B-001' }], error: null },
    });
    const r = await resolveVentureSdIdentifiers(supabase, 'venture-1', silentLogger);
    expect(r.uuids).toEqual(['uuid-1', 'uuid-2']);
    expect(r.keys).toEqual(['SD-A-001', 'SD-B-001']);
    expect(r.all).toEqual(['SD-A-001', 'SD-B-001', 'uuid-1', 'uuid-2']);
  });

  it('returns empty on DB error (best-effort)', async () => {
    const supabase = makeSupabase({ strategic_directives_v2: { data: null, error: { message: 'nope' } } });
    const r = await resolveVentureSdIdentifiers(supabase, 'venture-1', silentLogger);
    expect(r).toEqual({ uuids: [], keys: [], all: [] });
  });

  it('returns empty when no supabase/ventureId', async () => {
    expect(await resolveVentureSdIdentifiers(null, 'v', silentLogger)).toEqual({ uuids: [], keys: [], all: [] });
    expect(await resolveVentureSdIdentifiers(makeSupabase(), null, silentLogger)).toEqual({ uuids: [], keys: [], all: [] });
  });
});

describe('produceUatTestFindings', () => {
  it('emits one finding per non-passing result on the latest run', async () => {
    const supabase = makeSupabase({
      uat_test_runs: { data: [{ run_id: 'run-1', sd_id: 'SD-A-001', status: 'completed', failed_tests: 2, pass_rate: 80 }], error: null },
      uat_test_results: { data: [
        { test_case_id: 'TC-1', status: 'fail', failure_category: 'assertion', error_message: 'expected X' },
        { test_case_id: 'TC-2', status: 'error', failure_category: null, error_message: 'threw' },
        { test_case_id: 'TC-3', status: 'pass', failure_category: null, error_message: null },
        { test_case_id: 'TC-4', status: 'skipped', failure_category: null, error_message: null },
      ], error: null },
    });
    const out = await produceUatTestFindings(supabase, ['SD-A-001'], silentLogger);
    expect(out).toHaveLength(2);
    expect(out.every((f) => f.check === 'uat_test')).toBe(true);
    expect(out.find((f) => f.title.includes('TC-1')).severity).toBe('high'); // fail
    expect(out.find((f) => f.title.includes('TC-2')).severity).toBe('medium'); // error
  });

  it('emits nothing when there are no linked SDs', async () => {
    expect(await produceUatTestFindings(makeSupabase(), [], silentLogger)).toEqual([]);
  });

  it('is best-effort: returns [] when the runs query errors', async () => {
    const supabase = makeSupabase({ uat_test_runs: { data: null, error: { message: 'db down' } } });
    expect(await produceUatTestFindings(supabase, ['SD-A-001'], silentLogger)).toEqual([]);
  });
});

describe('produceUatSignoffFindings', () => {
  it('flags RED (pass_rate < 93) as high', async () => {
    const supabase = makeSupabase({ uat_test_runs: { data: [{ run_id: 'r', sd_id: 'SD-A-001', failed_tests: 3, pass_rate: 80 }], error: null } });
    const out = await produceUatSignoffFindings(supabase, ['SD-A-001'], silentLogger);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ check: 'uat_signoff', severity: 'high' });
    expect(out[0].title).toContain('RED');
  });

  it('flags YELLOW (failures but pass_rate >= 93) as medium', async () => {
    const supabase = makeSupabase({ uat_test_runs: { data: [{ run_id: 'r', sd_id: 'SD-A-001', failed_tests: 1, pass_rate: 95 }], error: null } });
    const out = await produceUatSignoffFindings(supabase, ['SD-A-001'], silentLogger);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('medium');
    expect(out[0].title).toContain('YELLOW');
  });

  it('emits nothing for a GREEN run', async () => {
    const supabase = makeSupabase({ uat_test_runs: { data: [{ run_id: 'r', sd_id: 'SD-A-001', failed_tests: 0, pass_rate: 100 }], error: null } });
    expect(await produceUatSignoffFindings(supabase, ['SD-A-001'], silentLogger)).toEqual([]);
  });

  it('prefers an explicit metadata.quality_gate when present', async () => {
    const supabase = makeSupabase({ uat_test_runs: { data: [{ run_id: 'r', sd_id: 'SD-A-001', failed_tests: 0, pass_rate: 100, metadata: { quality_gate: 'RED' } }], error: null } });
    const out = await produceUatSignoffFindings(supabase, ['SD-A-001'], silentLogger);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('high');
  });
});

describe('produceBugReportFindings', () => {
  it('emits one finding per user_bug feedback row, normalizing severity', async () => {
    const supabase = makeSupabase({
      feedback: { data: [
        { id: 'fb-1', title: 'Crash on save', description: 'stack...', severity: 'high' },
        { id: 'fb-2', title: 'Typo', description: 'minor', severity: 'bogus' },
      ], error: null },
    });
    const out = await produceBugReportFindings(supabase, 'venture-1', { uuids: ['u1'], keys: ['SD-A-001'], all: ['SD-A-001', 'u1'] }, silentLogger);
    expect(out).toHaveLength(2);
    expect(out.every((f) => f.check === 'bug_report')).toBe(true);
    expect(out.find((f) => f.title.includes('Crash')).severity).toBe('high');
    expect(out.find((f) => f.title.includes('Typo')).severity).toBe('medium'); // normalized fallback
  });

  it('is best-effort: returns [] on query error', async () => {
    const supabase = makeSupabase({ feedback: { data: null, error: { message: 'boom' } } });
    expect(await produceBugReportFindings(supabase, 'venture-1', { uuids: [], keys: [], all: [] }, silentLogger)).toEqual([]);
  });
});

describe('produceCapabilityFindings', () => {
  it('maps missing_required -> high and missing_optional -> low', () => {
    evalMock.mockReturnValue({
      pass: false,
      missing_required: [{ name: 'gh-cli', error: 'gh not on PATH' }],
      missing_optional: [{ name: 'sandbox-runtime', error: 'no docker' }],
      versions: {},
    });
    const out = produceCapabilityFindings({}, silentLogger);
    expect(out).toHaveLength(2);
    expect(out.find((f) => f.title.includes('required')).severity).toBe('high');
    expect(out.find((f) => f.title.includes('optional')).severity).toBe('low');
    expect(out.every((f) => f.check === 'capability')).toBe(true);
  });

  it('emits nothing when all capabilities are present', () => {
    expect(produceCapabilityFindings({}, silentLogger)).toEqual([]);
  });

  it('is best-effort: returns [] if the probe throws', () => {
    evalMock.mockImplementation(() => { throw new Error('probe blew up'); });
    expect(produceCapabilityFindings({}, silentLogger)).toEqual([]);
  });
});

describe('collectNonRepoFindings', () => {
  it('combines all four producers', async () => {
    evalMock.mockReturnValue({ pass: false, missing_required: [{ name: 'gh-cli', error: 'missing' }], missing_optional: [], versions: {} });
    const supabase = makeSupabase({
      strategic_directives_v2: { data: [{ id: 'u1', sd_key: 'SD-A-001' }], error: null },
      uat_test_runs: { data: [{ run_id: 'r', sd_id: 'SD-A-001', failed_tests: 1, pass_rate: 80 }], error: null },
      uat_test_results: { data: [{ test_case_id: 'TC-1', status: 'fail', error_message: 'x' }], error: null },
      feedback: { data: [{ id: 'fb-1', title: 'bug', description: 'd', severity: 'medium' }], error: null },
    });
    const out = await collectNonRepoFindings({ supabase, ventureId: 'venture-1', logger: silentLogger });
    const cats = new Set(out.map((f) => f.check));
    expect(cats).toEqual(new Set(['uat_test', 'uat_signoff', 'bug_report', 'capability']));
  });

  it('returns only capability findings when supabase/ventureId are absent', async () => {
    evalMock.mockReturnValue({ pass: false, missing_required: [{ name: 'gh-cli', error: 'missing' }], missing_optional: [], versions: {} });
    const out = await collectNonRepoFindings({ logger: silentLogger });
    expect(out).toHaveLength(1);
    expect(out[0].check).toBe('capability');
  });

  it('fail-safe: never throws when supabase access throws; still returns capability findings', async () => {
    evalMock.mockReturnValue({ pass: false, missing_required: [], missing_optional: [{ name: 'sandbox', error: 'x' }], versions: {} });
    const supabase = makeSupabase({}, { throwTables: ['strategic_directives_v2', 'uat_test_runs', 'feedback'] });
    const out = await collectNonRepoFindings({ supabase, ventureId: 'venture-1', logger: silentLogger });
    // DB producers degrade to [], capability producer still contributes.
    expect(out).toEqual([{ check: 'capability', title: 'Missing optional capability: sandbox', severity: 'low', detail: 'x' }]);
  });
});
