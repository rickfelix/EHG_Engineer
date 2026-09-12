/**
 * SD-LEO-INFRA-AUDIT-ACTOR-THREADING-001 — FR-2, FR-4.
 * lib/supabase-client.js createSupabaseServiceClient: verifies the global x-actor-session
 * header is threaded through to createClient() in BOTH the plain branch and the
 * fetchTimeoutMs/boundedFetch branch, without clobbering the custom fetch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const createClientCalls = [];
vi.mock('@supabase/supabase-js', () => ({
  createClient: (url, key, options) => {
    createClientCalls.push({ url, key, options });
    return { url, key, options };
  },
}));

const { createSupabaseServiceClient } = await import('../../lib/supabase-client.js');

beforeEach(() => {
  createClientCalls.length = 0;
  delete process.env.CLAUDE_SESSION_ID;
  delete process.env.LEO_ACTOR_ROLE_TAG;
});

describe('createSupabaseServiceClient (lib/supabase-client.js) — actor threading', () => {
  it('plain branch (no fetchTimeoutMs): sets global.headers["x-actor-session"] when CLAUDE_SESSION_ID is set', () => {
    process.env.CLAUDE_SESSION_ID = 'test-session-abc';
    createSupabaseServiceClient();
    expect(createClientCalls).toHaveLength(1);
    expect(createClientCalls[0].options.global.headers['x-actor-session']).toBe('test-session-abc');
  });

  it('plain branch: passes no options object at all when no identity resolves (byte-identical to pre-fix behavior)', () => {
    createSupabaseServiceClient();
    expect(createClientCalls[0].options).toBeUndefined();
  });

  it('boundedFetch branch (fetchTimeoutMs set): sets the actor header WITHOUT dropping the custom fetch', () => {
    process.env.CLAUDE_SESSION_ID = 'test-session-abc';
    createSupabaseServiceClient({ fetchTimeoutMs: 5000 });
    expect(createClientCalls[0].options.global.fetch).toBeTypeOf('function');
    expect(createClientCalls[0].options.global.headers['x-actor-session']).toBe('test-session-abc');
  });

  it('boundedFetch branch: still sets a custom fetch even when no identity resolves', () => {
    createSupabaseServiceClient({ fetchTimeoutMs: 5000 });
    expect(createClientCalls[0].options.global.fetch).toBeTypeOf('function');
    expect(createClientCalls[0].options.global.headers).toBeUndefined();
  });

  it('uses the role-tag fallback when CLAUDE_SESSION_ID is absent but LEO_ACTOR_ROLE_TAG is set', () => {
    process.env.LEO_ACTOR_ROLE_TAG = 'coordinator-cron';
    createSupabaseServiceClient();
    expect(createClientCalls[0].options.global.headers['x-actor-session']).toBe('role:coordinator-cron');
  });
});
