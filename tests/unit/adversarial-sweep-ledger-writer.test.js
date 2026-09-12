/**
 * SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-G
 *
 * scripts/adversarial-verification-sweep.mjs's writeLedger() re-run branch used a two-field
 * DENYLIST ({status,severity} excluded, everything else from buildLedgerRow() included) when
 * refreshing an existing ledger row. title/description are DERIVED FROM disposition and change
 * on every genuine re-verification -- both are guarded CONTENT columns under feedback_no_update's
 * WHEN clause (database/chairman-gated/20260912_feedback_no_update_lifecycle_allowlist.sql), so a
 * real disposition change still threw even after that migration landed. This pins the fix: the
 * re-run UPDATE now sends an explicit allowlist ({updated_at, metadata} only).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('dotenv/config', () => ({}));

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';

/** Minimal in-memory `feedback` table faking the exact chain shapes writeLedger() calls. */
function makeFakeFeedbackClient(initialRows = []) {
  let rows = initialRows.map((r, i) => ({ id: r.id || `row-${i}`, ...r }));
  let idSeq = rows.length;

  function matchFilters(row, filters) {
    return filters.every(([kind, a, b, c]) => {
      if (kind === 'eq') return row[a] === b;
      if (kind === 'filter') {
        // filter('metadata->>work_key', 'eq', val)
        const m = a.match(/^(\w+)->>(\w+)$/);
        if (!m) return true;
        return (row[m[1]] || {})[m[2]] === c;
      }
      return true;
    });
  }

  return {
    _rows: () => rows,
    from(table) {
      if (table !== 'feedback') throw new Error(`unexpected table: ${table}`);
      const filters = [];
      let limitN = null;
      let rangeArgs = null;

      const builder = {
        select() { return builder; },
        eq(col, val) { filters.push(['eq', col, val]); return builder; },
        filter(expr, op, val) { filters.push(['filter', expr, op, val]); return builder; },
        limit(n) { limitN = n; return builder; },
        order() { return builder; },
        range(from, to) { rangeArgs = [from, to]; return builder; },
        update(patch) {
          return {
            eq(col, val) {
              const idx = rows.findIndex((r) => r[col] === val);
              if (idx === -1) return Promise.resolve({ error: { message: `no row with ${col}=${val}` } });
              // Real supabase UPDATE only overwrites the keys present in `patch` -- never merges
              // nested objects itself. Asserting THIS shape is the whole point of the test: if
              // the caller ever again includes title/description in `patch`, this fake still
              // faithfully overwrites them (proving the production code, not the fake, is what
              // must keep them out).
              rows[idx] = { ...rows[idx], ...patch };
              return Promise.resolve({ error: null });
            },
          };
        },
        insert(row) {
          rows.push({ id: `row-${idSeq++}`, ...row });
          return Promise.resolve({ error: null });
        },
        then(resolve, reject) {
          let result = rows.filter((r) => matchFilters(r, filters));
          if (rangeArgs) result = result.slice(rangeArgs[0], rangeArgs[1] + 1);
          else if (limitN != null) result = result.slice(0, limitN);
          return Promise.resolve({ data: result, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

let fakeClient;
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => fakeClient,
}));
vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));
vi.mock('../../lib/ship/witness-adoption.mjs', () => ({
  PLATFORM_REPOS: [],
  WITNESS_CUTOVER_ISO: '2026-01-01T00:00:00Z',
  defaultFetchMergedPlatformPRs: vi.fn(),
  detectUnwitnessedMerges: vi.fn(),
}));

let writeLedger, buildLedgerRow;
let tmpDir;

beforeEach(async () => {
  vi.resetModules();
  fakeClient = makeFakeFeedbackClient();
  tmpDir = mkdtempSync(path.join(tmpdir(), 'adversarial-ledger-test-'));
  const mod = await import('../../scripts/adversarial-verification-sweep.mjs');
  writeLedger = mod.writeLedger;
  buildLedgerRow = mod.buildLedgerRow;
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeDispositions(items) {
  const p = path.join(tmpDir, 'dispositions.json');
  writeFileSync(p, JSON.stringify(items), 'utf8');
  return p;
}

describe('writeLedger — re-run with a CHANGED disposition (SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-G)', () => {
  it('completes with 0 thrown errors when a second run changes the disposition for the same work_key', async () => {
    const workKey = 'lib/foo.js:some-check';
    const p1 = writeDispositions([{ work_key: workKey, disposition: 'unverifiable', evidence: { notes: 'first pass' } }]);
    await writeLedger(p1);

    const before = fakeClient._rows().find((r) => r.metadata.work_key === workKey);
    expect(before.metadata.disposition).toBe('unverifiable');

    // Second run: disposition genuinely CHANGES -- this is the exact shape that used to throw,
    // because title/description (derived from disposition) leaked through the old denylist.
    const p2 = writeDispositions([{ work_key: workKey, disposition: 'verified_working', evidence: { notes: 'second pass, confirmed' } }]);
    await expect(writeLedger(p2)).resolves.not.toThrow();

    const after = fakeClient._rows().find((r) => r.metadata.work_key === workKey);
    expect(after.metadata.disposition).toBe('verified_working');
    // Exactly one row for this work_key -- an UPDATE happened, not a duplicate INSERT.
    expect(fakeClient._rows().filter((r) => r.metadata.work_key === workKey)).toHaveLength(1);
  });

  it('the re-run UPDATE payload is an explicit allowlist of {updated_at, metadata} only', async () => {
    const workKey = 'lib/bar.js:another-check';
    const p1 = writeDispositions([{ work_key: workKey, disposition: 'unverifiable' }]);
    await writeLedger(p1);

    const p2 = writeDispositions([{ work_key: workKey, disposition: 'refuted_dormant' }]);
    await writeLedger(p2);

    const row = fakeClient._rows().find((r) => r.metadata.work_key === workKey);
    // title/description were set on first INSERT and must be UNCHANGED by the re-run UPDATE --
    // proving the update payload never included them, not merely that this fake happened not to
    // clobber them.
    expect(row.title).toBe(`${workKey}: unverifiable`);
    expect(row.description).toMatch(/^\[unverifiable\]/);
    expect(row.metadata.disposition).toBe('refuted_dormant');
  });
});

describe('writeLedger — first run (INSERT path) is unaffected by the allowlist change', () => {
  it('inserts a new ledger row with the full buildLedgerRow shape', async () => {
    const workKey = 'lib/baz.js:new-check';
    const p = writeDispositions([{ work_key: workKey, disposition: 'verified_working', evidence: { notes: 'ok' } }]);
    await writeLedger(p);

    const row = fakeClient._rows().find((r) => r.metadata.work_key === workKey);
    expect(row).toBeTruthy();
    expect(row.status).toBe('new');
    expect(row.severity).toBe('low');
    expect(row.title).toBe(buildLedgerRow({ work_key: workKey, disposition: 'verified_working', evidence: { notes: 'ok' } }, row.updated_at).title);
  });
});
