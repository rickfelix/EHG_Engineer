/**
 * Unit tests for scripts/wiring-validators/lib/step-executors.js
 * SD-LEO-WIRING-VERIFICATION-FRAMEWORK-ORCH-001-E
 *
 * Tests dispatcher heuristic + each executor's contract (return shape).
 * Shell executor uses real child_process. SQL/HTTP executors use mocks.
 */

import { describe, it, expect } from 'vitest';
import {
  chooseExecutor,
  executeShell,
  executeSql,
  executeHttp,
  executeStep
} from '../../scripts/wiring-validators/lib/step-executors.js';

describe('chooseExecutor heuristic', () => {
  it('returns sql for SELECT', () => {
    expect(chooseExecutor('SELECT * FROM users')).toBe('sql');
    expect(chooseExecutor('select 1')).toBe('sql');
  });

  it('returns sql for WITH (CTE)', () => {
    expect(chooseExecutor('WITH cte AS (SELECT 1) SELECT * FROM cte')).toBe('sql');
  });

  it('returns http for HTTP verbs', () => {
    expect(chooseExecutor('GET https://example.com')).toBe('http');
    expect(chooseExecutor('POST https://api.example.com {}')).toBe('http');
    expect(chooseExecutor('DELETE https://x.com/y')).toBe('http');
    expect(chooseExecutor('PUT https://x.com/y {}')).toBe('http');
  });

  it('returns shell for everything else', () => {
    expect(chooseExecutor('echo hello')).toBe('shell');
    expect(chooseExecutor('ls -la')).toBe('shell');
    expect(chooseExecutor('node -v')).toBe('shell');
  });

  it('handles non-string instruction', () => {
    expect(chooseExecutor(null)).toBe('shell');
    expect(chooseExecutor(undefined)).toBe('shell');
  });

  it('does not match SELECT-prefix words like SELECTOR', () => {
    expect(chooseExecutor('SELECTOR mode')).toBe('shell');
  });
});

describe('executeShell', () => {
  it('captures stdout and exit code 0 on success', async () => {
    const r = await executeShell('echo hello');
    expect(r.exit_code).toBe(0);
    expect(r.stdout).toContain('hello');
    expect(r.stderr).toBe('');
    expect(r.timed_out).toBe(false);
    expect(r.duration_ms).toBeGreaterThanOrEqual(0);
  }, 10000);

  it('captures non-zero exit code on failure', async () => {
    // Use a command that exits non-zero on both Win and Unix
    const r = await executeShell(process.platform === 'win32' ? 'exit /b 1' : 'exit 1');
    expect(r.exit_code).not.toBe(0);
    expect(r.timed_out).toBe(false);
  }, 10000);

  it('reports timeout with timed_out=true', async () => {
    // Use a command that takes longer than the timeout
    const cmd = process.platform === 'win32'
      ? 'ping -n 5 127.0.0.1 > nul'
      : 'sleep 5';
    const r = await executeShell(cmd, { timeout_ms: 200 });
    expect(r.timed_out).toBe(true);
    expect(r.stderr).toContain('exceeded timeout');
  }, 10000);
});

describe('executeSql with mocked supabase', () => {
  it('returns stdout=JSON when rpc succeeds', async () => {
    const mockSupabase = {
      rpc: async () => ({ data: [{ count: 42 }], error: null })
    };
    const r = await executeSql('SELECT count(*) FROM x', { supabase: mockSupabase });
    expect(r.exit_code).toBe(0);
    expect(r.stdout).toContain('42');
    expect(r.stderr).toBe('');
    expect(r.timed_out).toBe(false);
  });

  it('returns stderr when rpc errors', async () => {
    const mockSupabase = {
      rpc: async () => ({ data: null, error: { message: 'syntax error' } })
    };
    const r = await executeSql('SELECT bogus', { supabase: mockSupabase });
    expect(r.exit_code).toBe(1);
    expect(r.stderr).toContain('syntax error');
  });

  it('returns stderr when no supabase client provided', async () => {
    const r = await executeSql('SELECT 1', { supabase: null });
    expect(r.exit_code).toBe(1);
    expect(r.stderr).toContain('No supabase client');
  });

  it('handles timeout', async () => {
    const slowSupabase = {
      rpc: () => new Promise(() => { /* never resolves */ })
    };
    const r = await executeSql('SELECT 1', { supabase: slowSupabase, timeout_ms: 100 });
    expect(r.timed_out).toBe(true);
    expect(r.stderr).toContain('exceeded timeout');
  });

  it('handles thrown exceptions', async () => {
    const brokenSupabase = {
      rpc: async () => { throw new Error('connection refused'); }
    };
    const r = await executeSql('SELECT 1', { supabase: brokenSupabase });
    expect(r.exit_code).toBe(1);
    expect(r.stderr).toContain('connection refused');
  });
});

describe('executeHttp', () => {
  it('captures successful response stdout', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true, status: 200, statusText: 'OK', text: async () => 'hello'
    });
    try {
      const r = await executeHttp('GET https://example.com');
      expect(r.exit_code).toBe(0);
      expect(r.stdout).toContain('200');
      expect(r.stdout).toContain('hello');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns non-zero exit on HTTP error status', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false, status: 500, statusText: 'Internal Server Error', text: async () => 'oops'
    });
    try {
      const r = await executeHttp('GET https://example.com/bad');
      expect(r.exit_code).toBe(1);
      expect(r.stdout).toContain('500');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('handles AbortError (timeout)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    };
    try {
      const r = await executeHttp('GET https://example.com', { timeout_ms: 50 });
      expect(r.timed_out).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('parses POST instruction with body', async () => {
    const originalFetch = globalThis.fetch;
    let receivedOpts;
    globalThis.fetch = async (url, opts) => {
      receivedOpts = opts;
      return { ok: true, status: 201, statusText: 'Created', text: async () => '' };
    };
    try {
      await executeHttp('POST https://example.com {"key":"value"}');
      expect(receivedOpts.method).toBe('POST');
      expect(receivedOpts.body).toContain('value');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('executeStep dispatcher', () => {
  it('dispatches shell instructions to executeShell', async () => {
    const r = await executeStep('echo hi');
    expect(r.exit_code).toBe(0);
    expect(r.stdout).toContain('hi');
  }, 10000);

  it('dispatches SQL instructions to executeSql', async () => {
    const mockSupabase = {
      rpc: async () => ({ data: [], error: null })
    };
    const r = await executeStep('SELECT 1', { supabase: mockSupabase });
    expect(r.exit_code).toBe(0);
  });

  it('dispatches HTTP instructions to executeHttp', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => '' });
    try {
      const r = await executeStep('GET https://example.com');
      expect(r.exit_code).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
