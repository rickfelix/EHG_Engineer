/**
 * SD-LEO-INFRA-AUDIT-ACTOR-THREADING-001 — FR-1, FR-2, FR-4.
 *
 * createDatabaseClient: verifies set_config('app.actor', ...) is issued once, right after
 * connect, using the resolved actor identity — session-level (is_local=false), proven safe by
 * the FR-6 pooler-mode spike (this client's backend connection is stable for its lifetime).
 *
 * The second createSupabaseServiceClient factory in this same file: verifies the global
 * x-actor-session header is threaded through to createClient().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const queries = [];
class FakeClient {
  constructor(opts) { this.opts = opts; }
  async connect() {}
  async query(sql, params) { queries.push({ sql, params }); return { rows: [{ current_database: 'x', current_user: 'y', version: 'z' }] }; }
  async end() {}
  on() {}
}

vi.mock('pg', () => ({ default: { Client: FakeClient } }));

const createClientCalls = [];
vi.mock('@supabase/supabase-js', () => ({
  createClient: (url, key, options) => {
    createClientCalls.push({ url, key, options });
    return { url, key, options };
  },
}));

// tests/setup.unit.js already stubs SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY with sentinel
// values for the unit project; createDatabaseClient additionally needs a (fake) DB password
// to pass its pre-flight check before ever reaching the mocked pg.Client.
process.env.SUPABASE_DB_PASSWORD = 'fake-password-for-test';

const { createDatabaseClient, createSupabaseServiceClient } = await import('../../../scripts/lib/supabase-connection.js');

beforeEach(() => {
  queries.length = 0;
  createClientCalls.length = 0;
  delete process.env.CLAUDE_SESSION_ID;
  delete process.env.LEO_ACTOR_ROLE_TAG;
});

describe('createDatabaseClient — actor threading (app.actor)', () => {
  it('issues set_config(app.actor, <sessionId>, false) once after connect when CLAUDE_SESSION_ID is set', async () => {
    process.env.CLAUDE_SESSION_ID = 'test-session-abc';
    await createDatabaseClient('engineer', { verify: false });
    const actorQueries = queries.filter((q) => q.sql.includes('set_config'));
    expect(actorQueries).toHaveLength(1);
    expect(actorQueries[0].sql).toMatch(/set_config\('app\.actor', \$1, false\)/);
    expect(actorQueries[0].params).toEqual(['test-session-abc']);
  });

  it('does NOT issue set_config when no actor identity resolves (source=none)', async () => {
    await createDatabaseClient('engineer', { verify: false });
    const actorQueries = queries.filter((q) => q.sql.includes('set_config'));
    expect(actorQueries).toHaveLength(0);
  });

  it('uses the role-tag fallback when CLAUDE_SESSION_ID is absent but LEO_ACTOR_ROLE_TAG is set', async () => {
    process.env.LEO_ACTOR_ROLE_TAG = 'coordinator-cron';
    await createDatabaseClient('engineer', { verify: false });
    const actorQueries = queries.filter((q) => q.sql.includes('set_config'));
    expect(actorQueries).toHaveLength(1);
    expect(actorQueries[0].params).toEqual(['role:coordinator-cron']);
  });
});

describe('createSupabaseServiceClient (scripts/lib/supabase-connection.js) — actor threading (x-actor-session)', () => {
  it('sets global.headers["x-actor-session"] when CLAUDE_SESSION_ID is set', async () => {
    process.env.CLAUDE_SESSION_ID = 'test-session-abc';
    await createSupabaseServiceClient('engineer');
    expect(createClientCalls).toHaveLength(1);
    expect(createClientCalls[0].options.global.headers['x-actor-session']).toBe('test-session-abc');
  });

  it('omits the actor header when no identity resolves', async () => {
    await createSupabaseServiceClient('engineer');
    expect(createClientCalls[0].options.global).toBeUndefined();
  });

  it('merges the actor header with caller-supplied clientOptions.global rather than clobbering it', async () => {
    process.env.CLAUDE_SESSION_ID = 'test-session-abc';
    const customFetch = () => {};
    await createSupabaseServiceClient('engineer', { clientOptions: { global: { fetch: customFetch } } });
    expect(createClientCalls[0].options.global.fetch).toBe(customFetch);
    expect(createClientCalls[0].options.global.headers['x-actor-session']).toBe('test-session-abc');
  });

  it('a caller-supplied x-actor-session header (via clientOptions.global.headers) wins over the resolved one, end-to-end through the factory', async () => {
    process.env.CLAUDE_SESSION_ID = 'test-session-abc';
    await createSupabaseServiceClient('engineer', {
      clientOptions: { global: { headers: { 'x-actor-session': 'caller-value', 'x-other': 'keep-me' } } },
    });
    expect(createClientCalls[0].options.global.headers).toEqual({
      'x-actor-session': 'caller-value',
      'x-other': 'keep-me',
    });
  });
});
