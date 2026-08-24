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
        // SEC-5 fix: the real code no longer chains .eq('status','active') on this
        // select -- it matches across ANY status now, so select() itself must be
        // directly awaitable (a thenable), not require an .eq() call first.
        select: () => Promise.resolve({ data: selectResult, error: null }),
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
