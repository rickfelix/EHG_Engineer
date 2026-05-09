// SD-LEO-INFRA-ORPHAN-REAPER-INTEGRATION-001
// FR-4: mocked main() integration test covering both reconciliation paths.
// FR-5: malformed qf.id rejection (shell-injection defense).
// FR-6: execSync argv shape regex pin.
//
// Both UPDATE call sites are mocked at the @supabase/supabase-js level + child_process
// at the execSync level so this test runs hermetically with no real DB or gh access.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks must be hoisted via vi.mock() ----
const execSyncMock = vi.fn();
vi.mock('node:child_process', () => ({
  execSync: (...args) => execSyncMock(...args),
}));

// supabase chain shape recorder
function makeSupabaseMock(scenarios) {
  // scenarios: { firstQuery: rows[], secondQuery: rows[], updateResult: { data, error } }
  let queryCallCount = 0;
  const updateCalls = [];

  function chainSelect() {
    let chain = {};
    const builder = {};
    // Generate all chainable methods that just return builder
    for (const m of ['select', 'in', 'not', 'is', 'lt', 'limit', 'order', 'eq', 'gte']) {
      builder[m] = vi.fn(() => builder);
    }
    // terminal: thenable that resolves to {data,error}
    builder.then = (resolve) => {
      queryCallCount += 1;
      const rows = queryCallCount === 1 ? scenarios.firstQuery : scenarios.secondQuery;
      resolve({ data: rows, error: null });
      return Promise.resolve({ data: rows, error: null });
    };
    return builder;
  }

  function chainUpdate(payload) {
    updateCalls.push({ payload });
    const builder = {};
    for (const m of ['eq']) {
      builder[m] = vi.fn(() => builder);
    }
    builder.select = vi.fn(() => ({
      single: vi.fn(async () => scenarios.updateResult || { data: { id: 'mock', status: 'completed' }, error: null }),
    }));
    return builder;
  }

  const from = vi.fn(() => ({
    select: chainSelect().select,
    update: chainUpdate,
    // back-compat: allow .select(...).in(...).not(...).is(...).lt(...).limit(...)
    in: chainSelect().in,
    not: chainSelect().not,
    is: chainSelect().is,
    lt: chainSelect().lt,
    limit: chainSelect().limit,
  }));

  // The script does: const { data: candidates, error } = await supabase.from('quick_fixes').select(...).in(...).not(...).lt(...).limit(...);
  // We need each call to .from to return a fresh chainable that, on terminal await, resolves to the right scenario.
  const fromCalls = [];
  const fromMock = vi.fn((tableName) => {
    fromCalls.push(tableName);
    let chain = {};
    const builder = {};
    let isUpdate = false;
    let updatePayload = null;
    for (const m of ['select', 'in', 'not', 'is', 'lt', 'limit', 'order', 'gte']) {
      builder[m] = vi.fn(() => builder);
    }
    builder.update = vi.fn((payload) => {
      isUpdate = true;
      updatePayload = payload;
      updateCalls.push({ payload, table: tableName });
      const upBuilder = {};
      upBuilder.eq = vi.fn(() => upBuilder);
      upBuilder.select = vi.fn(() => ({
        single: vi.fn(async () => scenarios.updateResult || { data: { id: 'mock', status: 'completed' }, error: null }),
      }));
      return upBuilder;
    });
    builder.then = (resolve) => {
      if (isUpdate) {
        return Promise.resolve(scenarios.updateResult).then(resolve);
      }
      queryCallCount += 1;
      const rows = queryCallCount === 1 ? (scenarios.firstQuery || []) : (scenarios.secondQuery || []);
      const result = { data: rows, error: null };
      resolve(result);
      return Promise.resolve(result);
    };
    return builder;
  });

  return {
    from: fromMock,
    _calls: { fromCalls, updateCalls, get queryCallCount() { return queryCallCount; } },
  };
}

let supabaseInstance;
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabaseInstance),
}));

// dotenv noop in test env
vi.mock('dotenv/config', () => ({}));

async function importMain() {
  vi.resetModules();
  return await import('../../../scripts/orphan-qf-reaper.mjs');
}

beforeEach(() => {
  execSyncMock.mockReset();
  process.env.SUPABASE_URL = 'http://test.supabase';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  process.env.ORPHAN_QF_REAPER_DRY_RUN = 'false';
  // gh auth status check + per-row gh calls
  execSyncMock.mockImplementation((cmd) => {
    if (cmd === 'gh auth status') return '';
    return '{}';
  });
});

describe('orphan-qf-reaper main() integration (FR-4)', () => {
  it('TS-1: pr_url path with MERGED PR → UPDATE issued with 8-col shape', async () => {
    supabaseInstance = makeSupabaseMock({
      firstQuery: [{ id: 'QF-20260508-001', status: 'open', pr_url: 'https://github.com/x/y/pull/123', started_at: '2026-05-08T00:00:00Z', claiming_session_id: 'sess' }],
      secondQuery: [],
      updateResult: { data: { id: 'QF-20260508-001', status: 'completed' }, error: null },
    });

    execSyncMock.mockImplementation((cmd) => {
      if (cmd === 'gh auth status') return '';
      if (cmd.startsWith('gh pr view 123')) return JSON.stringify({ state: 'MERGED', mergeCommit: { oid: 'abc123' }, mergedAt: '2026-05-08T01:00:00Z' });
      return '{}';
    });

    // Stub process.exit so it doesn't actually exit
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined);
    try {
      const { main } = await importMain();
      await main();
    } finally {
      exitSpy.mockRestore();
    }

    const calls = supabaseInstance._calls.updateCalls;
    expect(calls.length).toBe(1);
    const payload = calls[0].payload;
    const requiredCols = ['status', 'completed_at', 'commit_sha', 'compliance_verdict', 'compliance_details', 'verified_by', 'verification_notes', 'force_completed'];
    for (const c of requiredCols) {
      expect(payload, `missing ${c}`).toHaveProperty(c);
    }
    expect(payload.status).toBe('completed');
    expect(payload.force_completed).toBe(true);
    expect(payload.verified_by).toBe('ORPHAN_REAPER');
    // Forbidden columns must NOT be present
    expect(payload).not.toHaveProperty('metadata');
    expect(payload).not.toHaveProperty('merged_via');
  });

  it('TS-3: branch-derived path with merged PR → UPDATE with 9-col shape including pr_url', async () => {
    supabaseInstance = makeSupabaseMock({
      firstQuery: [],
      secondQuery: [{ id: 'QF-20260508-002', status: 'open', started_at: '2026-05-08T00:00:00Z', claiming_session_id: 'sess' }],
      updateResult: { data: { id: 'QF-20260508-002', status: 'completed' }, error: null },
    });

    execSyncMock.mockImplementation((cmd) => {
      if (cmd === 'gh auth status') return '';
      if (cmd.startsWith('gh pr list')) {
        return JSON.stringify([{ number: 999, url: 'https://github.com/x/y/pull/999', mergeCommit: { oid: 'def456' }, mergedAt: '2026-05-08T02:00:00Z' }]);
      }
      return '{}';
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined);
    try {
      const { main } = await importMain();
      await main();
    } finally {
      exitSpy.mockRestore();
    }

    const calls = supabaseInstance._calls.updateCalls;
    expect(calls.length).toBe(1);
    const payload = calls[0].payload;
    expect(payload).toHaveProperty('pr_url');
    expect(payload.pr_url).toBe('https://github.com/x/y/pull/999');
    expect(payload.status).toBe('completed');
    expect(payload.force_completed).toBe(true);
    expect(payload).not.toHaveProperty('metadata');
  });

  it('TS-2: pr_url path with OPEN PR → no UPDATE, skip counter increments', async () => {
    supabaseInstance = makeSupabaseMock({
      firstQuery: [{ id: 'QF-20260508-003', status: 'open', pr_url: 'https://github.com/x/y/pull/124', started_at: '2026-05-08T00:00:00Z' }],
      secondQuery: [],
    });
    execSyncMock.mockImplementation((cmd) => {
      if (cmd === 'gh auth status') return '';
      if (cmd.startsWith('gh pr view 124')) return JSON.stringify({ state: 'OPEN', mergeCommit: null, mergedAt: null });
      return '{}';
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined);
    try {
      const { main } = await importMain();
      await main();
    } finally {
      exitSpy.mockRestore();
    }

    expect(supabaseInstance._calls.updateCalls.length).toBe(0);
  });

  it('TS-4: branch-derived path with no merged PR → no UPDATE', async () => {
    supabaseInstance = makeSupabaseMock({
      firstQuery: [],
      secondQuery: [{ id: 'QF-20260508-004', status: 'open', started_at: '2026-05-08T00:00:00Z', claiming_session_id: 'sess' }],
    });
    execSyncMock.mockImplementation((cmd) => {
      if (cmd === 'gh auth status') return '';
      if (cmd.startsWith('gh pr list')) return '[]';
      return '{}';
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined);
    try {
      const { main } = await importMain();
      await main();
    } finally {
      exitSpy.mockRestore();
    }

    expect(supabaseInstance._calls.updateCalls.length).toBe(0);
  });

  it('TS-5: DRY_RUN=true → no UPDATEs even when reconciliation would happen', async () => {
    process.env.ORPHAN_QF_REAPER_DRY_RUN = 'true';
    supabaseInstance = makeSupabaseMock({
      firstQuery: [{ id: 'QF-20260508-005', status: 'open', pr_url: 'https://github.com/x/y/pull/125', started_at: '2026-05-08T00:00:00Z' }],
      secondQuery: [],
    });
    execSyncMock.mockImplementation((cmd) => {
      if (cmd === 'gh auth status') return '';
      if (cmd.startsWith('gh pr view 125')) return JSON.stringify({ state: 'MERGED', mergeCommit: { oid: 'xyz' }, mergedAt: '2026-05-08T03:00:00Z' });
      return '{}';
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined);
    try {
      // DRY_RUN is read at module load — must reimport AFTER setting env
      const { main } = await importMain();
      await main();
    } finally {
      exitSpy.mockRestore();
      process.env.ORPHAN_QF_REAPER_DRY_RUN = 'false';
    }

    expect(supabaseInstance._calls.updateCalls.length).toBe(0);
  });
});

describe('FR-5: malformed qf.id rejection (shell-injection defense)', () => {
  it('isValidQfId accepts canonical QF-YYYYMMDD-NNN format', async () => {
    const { isValidQfId } = await importMain();
    expect(isValidQfId('QF-20260508-001')).toBe(true);
    expect(isValidQfId('QF-20991231-999')).toBe(true);
  });

  it('isValidQfId rejects shell-injection payloads', async () => {
    const { isValidQfId } = await importMain();
    expect(isValidQfId('abc"; rm -rf /; echo "')).toBe(false);
    expect(isValidQfId('QF-20260508-001; ls')).toBe(false);
    expect(isValidQfId('QF-2026/05/08-001')).toBe(false);
    expect(isValidQfId('')).toBe(false);
    expect(isValidQfId(null)).toBe(false);
    expect(isValidQfId(undefined)).toBe(false);
    expect(isValidQfId(123)).toBe(false);
  });

  it('main() skips orphan rows with malformed ids and increments errored', async () => {
    supabaseInstance = makeSupabaseMock({
      firstQuery: [],
      secondQuery: [{ id: 'BAD"; rm -rf /; echo "', status: 'open', started_at: '2026-05-08T00:00:00Z', claiming_session_id: 'sess' }],
    });
    execSyncMock.mockImplementation((cmd) => {
      if (cmd === 'gh auth status') return '';
      // If main() reaches gh pr list with the bad id, the test fails:
      if (cmd.startsWith('gh pr list')) throw new Error('Reached gh with malformed id — FR-5 broken');
      return '{}';
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined);
    try {
      const { main } = await importMain();
      await main();
    } finally {
      exitSpy.mockRestore();
    }

    expect(supabaseInstance._calls.updateCalls.length).toBe(0);
    // gh pr list should NOT have been invoked for the malformed id
    const ghListCalls = execSyncMock.mock.calls.filter(c => typeof c[0] === 'string' && c[0].startsWith('gh pr list'));
    expect(ghListCalls.length).toBe(0);
  });
});

describe('FR-6: execSync argv shape regex pin', () => {
  const PR_VIEW_RE = /^gh pr view \d+ --json state,mergeCommit,mergedAt$/;
  const PR_LIST_RE = /^gh pr list --head "qf\/QF-\d{8}-\d{3}" --state merged --json number,url,mergeCommit,mergedAt --limit 1$/;

  it('pr_url path invokes gh pr view with exact argv shape', async () => {
    supabaseInstance = makeSupabaseMock({
      firstQuery: [{ id: 'QF-20260508-006', status: 'open', pr_url: 'https://github.com/x/y/pull/777', started_at: '2026-05-08T00:00:00Z' }],
      secondQuery: [],
    });
    execSyncMock.mockImplementation((cmd) => {
      if (cmd === 'gh auth status') return '';
      if (cmd.startsWith('gh pr view')) return JSON.stringify({ state: 'OPEN' });
      return '{}';
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined);
    try {
      const { main } = await importMain();
      await main();
    } finally {
      exitSpy.mockRestore();
    }

    const ghViewCmd = execSyncMock.mock.calls
      .map(c => c[0])
      .find(c => typeof c === 'string' && c.startsWith('gh pr view'));
    expect(ghViewCmd).toBeDefined();
    expect(ghViewCmd).toMatch(PR_VIEW_RE);
  });

  it('branch-derived path invokes gh pr list with exact argv shape', async () => {
    supabaseInstance = makeSupabaseMock({
      firstQuery: [],
      secondQuery: [{ id: 'QF-20260508-007', status: 'open', started_at: '2026-05-08T00:00:00Z', claiming_session_id: 'sess' }],
    });
    execSyncMock.mockImplementation((cmd) => {
      if (cmd === 'gh auth status') return '';
      if (cmd.startsWith('gh pr list')) return '[]';
      return '{}';
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined);
    try {
      const { main } = await importMain();
      await main();
    } finally {
      exitSpy.mockRestore();
    }

    const ghListCmd = execSyncMock.mock.calls
      .map(c => c[0])
      .find(c => typeof c === 'string' && c.startsWith('gh pr list'));
    expect(ghListCmd).toBeDefined();
    expect(ghListCmd).toMatch(PR_LIST_RE);
  });
});
