import { describe, it, expect, vi, beforeEach } from 'vitest';

// SD-LEO-INFRA-VENTURE-SCAFFOLD-CODE-001 FR-4. TESTING sub-agent evidence (15ada745)
// found the original PRD's negative-test framing backwards: registry_updated's
// registry.json write (venture-provisioner.js:274-299) is already correct, shipped
// behavior that must be preserved. The real gap is the DB write-through
// (lines ~308-327): it only UPDATEs a matching applications row and silently
// WARN-logs-and-skips when no match exists — a brand-new venture (the actual
// ApexNiche-class failure) never gets a DB row at all. This test proves the fix:
// insert-if-missing (upsert), not update-only.

const fsState = { registryJson: null };
let insertPayloads = [];
let updatePayloads = [];
let selectResult = [];
let isCalls = [];

function freshRegistry() {
  return { applications: {}, metadata: { total_apps: 0, active_apps: 0, last_updated: null } };
}

vi.mock('fs', () => ({
  readFileSync: vi.fn(() => JSON.stringify(fsState.registryJson)),
  writeFileSync: vi.fn((_p, content) => { fsState.registryJson = JSON.parse(content); }),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
}));

vi.mock('../../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({
    from: (table) => {
      if (table !== 'applications') throw new Error(`unexpected table ${table}`);
      return {
        // V1 fix (VALIDATION PLAN_VERIFICATION review, evidence 95af1848): the
        // real code chains .is('deleted_at', null), mirroring the partial unique
        // index predicate (uq_applications_normalized_name is WHERE deleted_at IS
        // NULL). selectResult here represents what the DB would ACTUALLY return
        // after that server-side filter -- i.e. tests must never put a
        // soft-deleted row in selectResult, since Postgres itself would exclude
        // it. isCalls proves the query is actually built with the filter.
        select: () => ({
          is: (col, val) => {
            isCalls.push({ col, val });
            // fetchAllPaginated calls .range(from, to) on whatever the queryFactory
            // returns (lib/db/fetch-all-paginated.mjs) -- slicing selectResult by the
            // real offsets makes this mock behave like genuinely paginated data, so a
            // multi-page test (selectResult longer than pageSize) exercises the real
            // merge-across-pages path, not just a single short-page return.
            return { range: (from, to) => Promise.resolve({ data: selectResult.slice(from, to + 1), error: null }) };
          },
        }),
        update: (payload) => ({
          eq: (_col, val) => {
            updatePayloads.push({ payload, id: val });
            return Promise.resolve({ error: null });
          },
        }),
        insert: (payload) => {
          insertPayloads.push(payload);
          return Promise.resolve({ error: null });
        },
      };
    },
  }),
}));

const { DEFAULT_STEPS } = await import('../../../../lib/eva/bridge/venture-provisioner.js');

function registryStep() {
  const step = DEFAULT_STEPS.find((s) => s.name === 'registry_updated');
  if (!step) throw new Error('registry_updated step not found in DEFAULT_STEPS');
  return step;
}

beforeEach(() => {
  insertPayloads = [];
  updatePayloads = [];
  selectResult = [];
  isCalls = [];
  fsState.registryJson = freshRegistry();
});

describe('venture-provisioner DEFAULT_STEPS: registry_updated DB write-through (FR-4 upsert)', () => {
  it('FR-4: a venture with NO pre-existing applications row gets one INSERTed (not silently skipped)', async () => {
    selectResult = []; // no matching row
    const ctx = {
      ventureId: 'v1',
      venture: { name: 'AcmeVenture', repoName: 'acme-venture', localPath: '/tmp/acme-venture' },
      stepsCompleted: [],
      log: () => {},
    };
    await registryStep().execute(ctx);

    expect(updatePayloads).toEqual([]);
    expect(insertPayloads.length).toBe(1);
    expect(insertPayloads[0]).toEqual({
      name: 'AcmeVenture',
      // TESTING finding F4 (EXEC-TO-PLAN review, evidence baa1c962, HIGH,
      // mutation-proven): normalized_name is the exact key the resolver's
      // normalizeVentureName matches against and carries a UNIQUE index -- a
      // wrong value produces a row that exists but is unresolvable. Asserting
      // the literal expected value, not just "is a non-empty string".
      normalized_name: 'acmeventure',
      kind: 'venture',
      github_repo: 'rickfelix/acme-venture',
      // TESTING finding F6: venture_id + repo_url must be populated too.
      repo_url: 'https://github.com/rickfelix/acme-venture',
      local_path: '/tmp/acme-venture',
      status: 'active',
      venture_id: 'v1',
    });
  });

  it('preserves existing behavior: a venture WITH a matching row gets local_path UPDATEd, not re-inserted', async () => {
    selectResult = [{ id: 'app-1', name: 'AcmeVenture' }];
    const ctx = {
      ventureId: 'v1',
      venture: { name: 'AcmeVenture', repoName: 'acme-venture', localPath: '/tmp/acme-venture' },
      stepsCompleted: [],
      log: () => {},
    };
    await registryStep().execute(ctx);

    expect(insertPayloads).toEqual([]);
    expect(updatePayloads.length).toBe(1);
    expect(updatePayloads[0].id).toBe('app-1');
    expect(updatePayloads[0].payload).toEqual({ local_path: '/tmp/acme-venture' });
  });

  // SECURITY finding SEC-5 (EXEC-TO-PLAN review, evidence 6f9eabc9): the collision
  // probe used to filter .eq('status','active'), so a venture matching an INACTIVE
  // row took the INSERT branch, hit the normalized_name UNIQUE constraint, and was
  // silently WARN-logged-and-skipped -- the same silent-skip class FR-4 exists to fix.
  it('SEC-5 regression: a venture matching an INACTIVE row is UPDATEd (not a doomed INSERT), and status is never touched', async () => {
    selectResult = [{ id: 'app-inactive-1', name: 'AcmeVenture' }]; // status is not surfaced by the trimmed select — matches regardless
    const ctx = {
      ventureId: 'v1',
      venture: { name: 'AcmeVenture', repoName: 'acme-venture', localPath: '/tmp/acme-venture' },
      stepsCompleted: [],
      log: () => {},
    };
    await registryStep().execute(ctx);

    expect(insertPayloads).toEqual([]);
    expect(updatePayloads.length).toBe(1);
    expect(updatePayloads[0].id).toBe('app-inactive-1');
    // local_path only -- status is deliberately never included, so a deliberately
    // deactivated venture is never silently reactivated by this write-through.
    expect(updatePayloads[0].payload).toEqual({ local_path: '/tmp/acme-venture' });
    expect(Object.keys(updatePayloads[0].payload)).not.toContain('status');
  });

  // VALIDATION finding V1 (PLAN_VERIFICATION review, evidence 95af1848, HIGH,
  // measured against the LIVE DB): uq_applications_normalized_name is a PARTIAL
  // unique index (WHERE deleted_at IS NULL) -- confirmed live: 4 soft-deleted
  // tombstone rows exist today (MarketLens, CronGenius, Market Modeling SaaS,
  // DataDistill). The SEC-5 fix widened the collision probe from
  // .eq('status','active') to no filter at all, which (without also excluding
  // tombstones) would match a soft-deleted row and take the UPDATE branch,
  // resurrecting the exact ApexNiche-class silent-skip FR-4 exists to close --
  // one mechanism over. Fixed by adding .is('deleted_at', null), mirroring the
  // index's own predicate exactly. This test proves the query is actually built
  // with that filter (a soft-deleted row would never even reach the client, so
  // simulating "the DB already filtered it out" and asserting isCalls is the
  // correct way to test a server-side WHERE clause).
  it('V1 regression: the collision probe queries with deleted_at IS NULL, mirroring the partial unique index', async () => {
    selectResult = []; // the DB itself excludes tombstones once .is() is applied
    const ctx = {
      ventureId: 'v1',
      venture: { name: 'MarketLens', repoName: 'marketlens', localPath: '/tmp/marketlens' },
      stepsCompleted: [],
      log: () => {},
    };
    await registryStep().execute(ctx);

    expect(isCalls).toEqual([{ col: 'deleted_at', val: null }]);
    // With the tombstone correctly excluded by the query, a same-named NEW
    // venture must take the INSERT branch, not silently match the tombstone.
    expect(insertPayloads.length).toBe(1);
    expect(updatePayloads).toEqual([]);
  });

  // count-truncation-diff-lint finding (CI, PR #7482): the collision probe was a bare
  // .select() with no pagination, which PostgREST silently caps at 1000 rows -- a
  // collision beyond the first page would be missed, resurrecting the ApexNiche-class
  // bug at scale. Fixed with fetchAllPaginated (lib/db/fetch-all-paginated.mjs). This
  // test proves it genuinely merges across pages: 1000 filler rows + a real match as
  // row 1001 (past the default pageSize=1000, so it can only be found on page 2).
  it('count-truncation regression: the collision probe finds a match past the 1000-row page boundary', async () => {
    const filler = Array.from({ length: 1000 }, (_, i) => ({ id: `filler-${i}`, name: `Filler${i}` }));
    selectResult = [...filler, { id: 'app-page2', name: 'AcmeVenture' }];
    const ctx = {
      ventureId: 'v1',
      venture: { name: 'AcmeVenture', repoName: 'acme-venture', localPath: '/tmp/acme-venture' },
      stepsCompleted: [],
      log: () => {},
    };
    await registryStep().execute(ctx);

    // A single-page (capped) read would never see row 1001 and would wrongly INSERT.
    expect(insertPayloads).toEqual([]);
    expect(updatePayloads.length).toBe(1);
    expect(updatePayloads[0].id).toBe('app-page2');
  });

  it('the registry.json write (existing, correct behavior) is preserved unchanged alongside the new INSERT', async () => {
    selectResult = [];
    const ctx = {
      ventureId: 'v1',
      venture: { name: 'AcmeVenture', repoName: 'acme-venture', localPath: '/tmp/acme-venture' },
      stepsCompleted: [],
      log: () => {},
    };
    await registryStep().execute(ctx);

    const apps = fsState.registryJson.applications;
    const entry = Object.values(apps).find((a) => a.name === 'acme-venture');
    expect(entry).toBeDefined();
    expect(entry.local_path).toBe('/tmp/acme-venture');
  });
});
