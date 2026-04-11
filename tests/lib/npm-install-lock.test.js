/**
 * Tests for npm-install-lock.js — distributed mutex via session_coordination
 * SD: SD-MAN-INFRA-FLEET-NPM-INSTALL-001
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Mock supabase client
function createMockSupabase(rows = []) {
  const store = [...rows];
  let insertError = null;

  const chainable = {
    select: () => chainable,
    eq: () => chainable,
    is: () => chainable,
    order: () => chainable,
    limit: () => ({ data: store.filter(r => !r.read_at), error: null }),
    insert: (row) => {
      if (insertError) return { error: insertError };
      store.push({ id: `mock-${Date.now()}`, ...row, created_at: new Date().toISOString() });
      return { error: null };
    },
    update: () => chainable,
  };

  const mock = {
    from: () => chainable,
    _store: store,
    _setInsertError: (err) => { insertError = err; },
  };
  return mock;
}

describe('npm-install-lock', () => {
  let acquireLock, waitForLock, releaseLock;

  beforeEach(() => {
    vi.resetModules();
    ({ acquireLock, waitForLock, releaseLock } = require('../../lib/npm-install-lock.cjs'));
  });

  describe('acquireLock', () => {
    it('acquires lock when none exists', async () => {
      const sb = createMockSupabase();
      const result = await acquireLock(sb, 'session-aaa');
      expect(result.acquired).toBe(true);
    });

    it('detects held lock from another session', async () => {
      const sb = createMockSupabase([{
        id: 'lock-1',
        message_type: 'INFO',
        payload: { lock_type: 'NODE_MODULES', status: 'locked', holder_session: 'session-bbb' },
        created_at: new Date().toISOString(),
        read_at: null
      }]);
      const result = await acquireLock(sb, 'session-aaa');
      expect(result.held).toBe(true);
      expect(result.holder).toBe('session-bbb');
    });

    it('auto-expires stale lock older than TTL', async () => {
      const staleTime = new Date(Date.now() - 130_000).toISOString();
      const sb = createMockSupabase([{
        id: 'lock-old',
        message_type: 'INFO',
        payload: { lock_type: 'NODE_MODULES', status: 'locked', holder_session: 'session-dead' },
        created_at: staleTime,
        read_at: null
      }]);
      const result = await acquireLock(sb, 'session-aaa');
      expect(result.acquired).toBe(true);
    });

    it('returns error on insert failure', async () => {
      const sb = createMockSupabase();
      sb._setInsertError({ message: 'DB unavailable' });
      const result = await acquireLock(sb, 'session-aaa');
      expect(result.acquired).toBe(false);
      expect(result.error).toBe('DB unavailable');
    });
  });

  describe('waitForLock', () => {
    it('resolves immediately when no lock exists', async () => {
      const sb = createMockSupabase();
      const result = await waitForLock(sb, { timeout: 10000, pollInterval: 100 });
      expect(result.resolved).toBe(true);
      expect(result.reason).toBe('lock_released');
    });

    it('times out when lock persists', async () => {
      const sb = createMockSupabase([{
        id: 'lock-persistent',
        message_type: 'INFO',
        payload: { lock_type: 'NODE_MODULES', status: 'locked', holder_session: 'session-busy' },
        created_at: new Date().toISOString(),
        read_at: null
      }]);
      const result = await waitForLock(sb, { timeout: 200, pollInterval: 50 });
      expect(result.resolved).toBe(false);
      expect(result.reason).toBe('timeout');
    });

    it('calls onPoll callback while waiting', async () => {
      const sb = createMockSupabase([{
        id: 'lock-1',
        message_type: 'INFO',
        payload: { lock_type: 'NODE_MODULES', status: 'locked', holder_session: 'session-x' },
        created_at: new Date().toISOString(),
        read_at: null
      }]);
      const polls = [];
      await waitForLock(sb, {
        timeout: 300,
        pollInterval: 50,
        onPoll: (info) => polls.push(info)
      });
      expect(polls.length).toBeGreaterThan(0);
      expect(polls[0]).toHaveProperty('holder', 'session-x');
    });
  });

  describe('releaseLock', () => {
    it('releases lock held by session', async () => {
      const sb = createMockSupabase([{
        id: 'lock-mine',
        message_type: 'INFO',
        payload: { lock_type: 'NODE_MODULES', status: 'locked', holder_session: 'session-aaa' },
        created_at: new Date().toISOString(),
        read_at: null
      }]);
      const result = await releaseLock(sb, 'session-aaa');
      expect(result.released).toBe(true);
    });

    it('succeeds when no lock exists', async () => {
      const sb = createMockSupabase();
      const result = await releaseLock(sb, 'session-aaa');
      expect(result.released).toBe(true);
    });
  });
});
