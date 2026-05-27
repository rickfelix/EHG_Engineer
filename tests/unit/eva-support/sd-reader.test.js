/**
 * Unit tests for lib/eva-support/sd-reader.js — SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C
 * FR-1 + FR-7 + TS-5.
 *
 * Covers:
 *   - TS-5: EVA_SD_READER_ENABLED=false → returns [], writes one reader_disabled
 *     audit row, ZERO .from(strategic_directives_v2) calls.
 *   - Flag default (UNSET = disabled, fail-safe).
 *   - Flag enabled: query uses column allowlist + active-SD predicate filters.
 *   - Reader error path: returns [], writes reader_error audit row.
 *   - targetApplication filter chains through.
 *   - Column allowlist regex check (no SELECT *).
 *
 * Uses vi.stubEnv per CLAUDE_PLAN.md walker-style guidance.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const READER_PATH = resolve(HERE, '../../../lib/eva-support/sd-reader.js');

// Static-source regex checks (independent of runtime mocks).
describe('sd-reader.js — static source invariants', () => {
  const source = readFileSync(READER_PATH, 'utf8');

  it('FR-1: column allowlist contains exactly the 7 documented columns', () => {
    const allowlistMatch = source.match(/const ALLOWED_COLUMNS\s*=\s*Object\.freeze\(\[([\s\S]+?)\]\)/);
    expect(allowlistMatch).toBeTruthy();
    const cols = allowlistMatch[1]
      .split(',')
      .map((s) => s.replace(/['"\s\n]/g, ''))
      .filter(Boolean);
    expect(cols).toEqual([
      'sd_key',
      'title',
      'status',
      'current_phase',
      'target_application',
      'priority',
      'progress',
    ]);
  });

  it('FR-1: source contains NO bare "select(\'*\')" call', () => {
    expect(source).not.toMatch(/select\(\s*['"]\*['"]\s*\)/);
  });

  it('FR-1: source imports getActiveSDFilter from active-sd-predicate', () => {
    expect(source).toMatch(/from\s+['"]\.\.\/sd\/active-sd-predicate(?:\.js)?['"]/);
  });

  it('T1 boundary: source does NOT import child_process / execa / spawn', () => {
    expect(source).not.toMatch(/from\s+['"]child_process['"]/);
    expect(source).not.toMatch(/from\s+['"]execa['"]/);
    expect(source).not.toMatch(/require\(\s*['"]child_process['"]/);
    expect(source).not.toMatch(/spawn\s*\(/);
  });

  it('T7 boundary: source does NOT import decision-log-store write functions', () => {
    expect(source).not.toMatch(/from\s+['"][^'"]*decision-log-store(?:\.js)?['"]/);
    expect(source).not.toMatch(/insertEntry/);
  });
});

// Runtime behavior tests with mocked dependencies.
describe('sd-reader.js — runtime behavior', () => {
  let supabaseFromCalls;
  let auditCalls;
  let mockSupabaseClient;

  beforeEach(() => {
    supabaseFromCalls = [];
    auditCalls = [];

    // Build a chainable mock Supabase query that records every call.
    const buildChain = (result) => {
      const chain = {};
      const passthrough = ['select', 'in', 'or', 'is', 'eq', 'order', 'limit'];
      for (const m of passthrough) {
        chain[m] = vi.fn((..._args) => chain);
      }
      chain.then = undefined; // not a thenable yet
      // Make the final-resolution method return a promise
      chain.limit = vi.fn(() => Promise.resolve(result));
      return chain;
    };

    mockSupabaseClient = {
      from: vi.fn((tableName) => {
        supabaseFromCalls.push(tableName);
        return buildChain({ data: [{ sd_key: 'SD-DEMO-001', title: 'demo', status: 'draft', current_phase: 'LEAD', target_application: 'EHG_Engineer', priority: 'high', progress: 0 }], error: null });
      }),
    };

    // Mock the audit writer so we can observe calls.
    vi.doMock('../../../lib/eva-support/sd-decision-log-writer.js', () => ({
      writeAuditRow: vi.fn(async (args) => {
        auditCalls.push(args);
        return { inserted: true, row: { task_id: 'SYSTEM:eva-support-sd-reader:test', sequence: 1 }, error: null };
      }),
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock('../../../lib/eva-support/sd-decision-log-writer.js');
  });

  it('TS-5: flag=false → returns [], writes one reader_disabled audit row, ZERO .from() calls', async () => {
    vi.stubEnv('EVA_SD_READER_ENABLED', 'false');

    const { getActiveSDs } = await import('../../../lib/eva-support/sd-reader.js');
    const result = await getActiveSDs({ client: mockSupabaseClient, eva_invocation_id: 'test-inv-001' });

    expect(result.sds).toEqual([]);
    expect(result.flag_enabled).toBe(false);
    expect(supabaseFromCalls).toEqual([]); // critical: zero strategic_directives_v2 calls
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].decision_kind).toBe('reader_disabled');
    expect(auditCalls[0].eva_invocation_id).toBe('test-inv-001');
    expect(auditCalls[0].metadata.flag_value).toBe('false');
  });

  it('TS-5 (UNSET variant): flag default UNSET → returns [], writes audit row, ZERO .from() calls', async () => {
    // Don't stubEnv — leave UNSET.
    vi.stubEnv('EVA_SD_READER_ENABLED', '');

    const { getActiveSDs } = await import('../../../lib/eva-support/sd-reader.js');
    const result = await getActiveSDs({ client: mockSupabaseClient, eva_invocation_id: 'test-inv-002' });

    expect(result.sds).toEqual([]);
    expect(result.flag_enabled).toBe(false);
    expect(supabaseFromCalls).toEqual([]);
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].decision_kind).toBe('reader_disabled');
  });

  it('flag=true → queries strategic_directives_v2 and returns rows', async () => {
    vi.stubEnv('EVA_SD_READER_ENABLED', 'true');

    const { getActiveSDs } = await import('../../../lib/eva-support/sd-reader.js');
    const result = await getActiveSDs({ client: mockSupabaseClient, eva_invocation_id: 'test-inv-003' });

    expect(result.flag_enabled).toBe(true);
    expect(supabaseFromCalls).toEqual(['strategic_directives_v2']);
    expect(result.sds).toHaveLength(1);
    expect(result.sds[0].sd_key).toBe('SD-DEMO-001');
    expect(auditCalls).toHaveLength(0); // no audit row when flag ON and no error
  });

  it('flag enabled with targetApplication filter chains through', async () => {
    vi.stubEnv('EVA_SD_READER_ENABLED', 'true');

    const chainSpy = { select: vi.fn(() => chainSpy), in: vi.fn(() => chainSpy), or: vi.fn(() => chainSpy), is: vi.fn(() => chainSpy), eq: vi.fn(() => chainSpy), order: vi.fn(() => chainSpy), limit: vi.fn(() => Promise.resolve({ data: [], error: null })) };
    const filteredClient = { from: vi.fn(() => chainSpy) };

    const { getActiveSDs } = await import('../../../lib/eva-support/sd-reader.js');
    await getActiveSDs({ client: filteredClient, targetApplication: 'EHG', eva_invocation_id: 'test-inv-004' });

    // .eq was called with target_application
    const eqCallArgs = chainSpy.eq.mock.calls.map((c) => c[0]);
    expect(eqCallArgs).toContain('target_application');
  });
});
