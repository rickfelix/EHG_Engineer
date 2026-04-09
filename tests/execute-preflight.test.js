/**
 * Unit tests for execute-preflight.mjs
 * SD: SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-A (FR-002)
 *
 * Tests the three pre-flight checks with mocked supabase client.
 */

import { describe, test, expect } from 'vitest';
import {
  checkNodeModules,
  checkDatabase,
  checkClaimGateRpc,
  runChecks
} from '../lib/execute/execute-preflight.mjs';

function mockSupabase({ dbError = null, rpcError = null } = {}) {
  return {
    from: () => ({
      select: () => ({
        limit: async () => ({ data: [], error: dbError })
      })
    }),
    rpc: async () => ({ data: null, error: rpcError })
  };
}

describe('execute-preflight', () => {
  describe('checkNodeModules', () => {
    test('passes when @supabase/supabase-js is loadable', async () => {
      const r = await checkNodeModules();
      expect(r.ok).toBe(true);
    });
  });

  describe('checkDatabase', () => {
    test('passes when DB returns no error', async () => {
      const r = await checkDatabase(mockSupabase());
      expect(r.ok).toBe(true);
    });

    test('fails with actionable error on DB error', async () => {
      const r = await checkDatabase(mockSupabase({ dbError: { message: 'connection refused' } }));
      expect(r.ok).toBe(false);
      expect(r.error).toContain('Database unreachable');
      expect(r.hint).toContain('SUPABASE_URL');
    });

    test('fails with actionable error on thrown exception', async () => {
      const supabase = {
        from: () => { throw new Error('network error'); }
      };
      const r = await checkDatabase(supabase);
      expect(r.ok).toBe(false);
      expect(r.error).toContain('network error');
    });
  });

  describe('checkClaimGateRpc', () => {
    test('passes when RPC returns no error', async () => {
      const r = await checkClaimGateRpc(mockSupabase());
      expect(r.ok).toBe(true);
    });

    test('passes even when RPC returns benign error (function exists)', async () => {
      const r = await checkClaimGateRpc(mockSupabase({ rpcError: { message: 'sentinel not found' } }));
      // Benign errors do NOT fail preflight — only "function does not exist" does
      expect(r.ok).toBe(true);
    });

    test('fails when RPC function is missing', async () => {
      const r = await checkClaimGateRpc(mockSupabase({ rpcError: { message: 'function fn_check_sd_claim does not exist' } }));
      expect(r.ok).toBe(false);
      expect(r.error).toContain('Claim gate RPC');
      expect(r.hint).toContain('claim-hardening migration');
    });

    test('fails on transport exception', async () => {
      const supabase = { rpc: async () => { throw new Error('timeout'); } };
      const r = await checkClaimGateRpc(supabase);
      expect(r.ok).toBe(false);
      expect(r.error).toContain('timeout');
    });
  });

  describe('runChecks', () => {
    test('aggregates all three checks (all pass)', async () => {
      const r = await runChecks(mockSupabase());
      expect(r.ok).toBe(true);
      expect(r.checks.node_modules.ok).toBe(true);
      expect(r.checks.db.ok).toBe(true);
      expect(r.checks.claim_gate.ok).toBe(true);
      expect(r.summary).toHaveLength(3);
      expect(r.summary[0]).toContain('node_modules');
      expect(r.summary[1]).toContain('database');
      expect(r.summary[2]).toContain('claim_gate_rpc');
    });

    test('overall fails when any check fails', async () => {
      const r = await runChecks(mockSupabase({ dbError: { message: 'unavailable' } }));
      expect(r.ok).toBe(false);
      expect(r.checks.db.ok).toBe(false);
    });

    test('summary contains hint on failed check', async () => {
      const r = await runChecks(mockSupabase({ dbError: { message: 'unavailable' } }));
      const dbLine = r.summary.find((s) => s.includes('database'));
      expect(dbLine).toContain('SUPABASE_URL');
    });
  });
});
