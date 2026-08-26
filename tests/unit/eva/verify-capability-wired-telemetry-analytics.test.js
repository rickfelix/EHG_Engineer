/**
 * SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-C (FR-3)
 *
 * Unit coverage for verifyCapabilityWired's telemetry-analytics branch: calls
 * fn_venture_usage_window_summary via supabase.rpc() (never a raw table SELECT),
 * and reports wired=true iff event_count > 0.
 *
 * FR-5 (active-user counting via actor_hash) was WITHDRAWN post-EXEC: Child A's
 * actual shipped venture_usage_events table (PR #7563) has no actor_hash column
 * and no user-identifier of any kind -- a deliberate GDPR/erasure-boundary
 * decision by Child A's own RISK sub-agent. Only event_count is derivable.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { verifyCapabilityWired, WIRED_CAPABILITY_FEEDBACK_TYPES } from '../../../lib/eva/utils/validate-venture-default-capabilities.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = resolve(__dirname, '../../../lib/eva/utils/validate-venture-default-capabilities.js');

function buildMockSupabaseWithRpc(rpcResult) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  return {
    rpc,
    from() {
      throw new Error('verifyCapabilityWired must call fn_venture_usage_window_summary via .rpc(), never .from() for telemetry-analytics');
    },
  };
}

describe('SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-C: verifyCapabilityWired telemetry-analytics', () => {
  it('TS-1: reports wired=true with event_count when the RPC returns real data', async () => {
    const supabase = buildMockSupabaseWithRpc({ data: [{ event_count: 3 }], error: null });
    const result = await verifyCapabilityWired(supabase, 'venture-a', 'telemetry-analytics');
    expect(result.wired).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith(
      'fn_venture_usage_window_summary',
      expect.objectContaining({ p_venture_id: 'venture-a' }),
    );
  });

  it('TS-2: reports wired=false when the RPC returns zero events', async () => {
    const supabase = buildMockSupabaseWithRpc({ data: [{ event_count: 0 }], error: null });
    const result = await verifyCapabilityWired(supabase, 'venture-b', 'telemetry-analytics');
    expect(result.wired).toBe(false);
  });

  it('reports wired=false (not a thrown error) when the RPC call errors', async () => {
    const supabase = buildMockSupabaseWithRpc({ data: null, error: { message: 'connection reset' } });
    const result = await verifyCapabilityWired(supabase, 'venture-d', 'telemetry-analytics');
    expect(result.wired).toBe(false);
    expect(result.reason).toMatch(/connection reset/);
  });

  it('AC-5 (dead-code-placement, source-order proof): the telemetry-analytics branch appears BEFORE the WIRED_CAPABILITY_FEEDBACK_TYPES lookup in verifyCapabilityWired', () => {
    // Static/structural assertion, not a behavioral one -- TESTING sub-agent finding F1
    // (evidence 5054d3bc) mutation-tested a prior version of this test and found it passed
    // identically whether the branch was placed before OR after the lookup, because it only
    // asserted the registry lacks a 'telemetry-analytics' key (true regardless of placement).
    // This version reads the actual source text and proves ORDER, the property that matters:
    // a post-lookup placement is unreachable dead code since telemetry-analytics is not in
    // WIRED_CAPABILITY_FEEDBACK_TYPES.
    const source = readFileSync(SOURCE_PATH, 'utf8');
    const fnBody = source.slice(
      source.indexOf('export async function verifyCapabilityWired'),
      source.indexOf('\nasync function verifyTelemetryAnalyticsWired'),
    );
    const branchIdx = fnBody.indexOf("capabilityId === 'telemetry-analytics'");
    const lookupIdx = fnBody.indexOf('WIRED_CAPABILITY_FEEDBACK_TYPES[capabilityId]');
    expect(branchIdx).toBeGreaterThan(-1);
    expect(lookupIdx).toBeGreaterThan(-1);
    expect(branchIdx).toBeLessThan(lookupIdx);
  });

  it('WIRED_CAPABILITY_FEEDBACK_TYPES has no telemetry-analytics entry (it is RPC-verified, not registry-verified)', () => {
    expect(WIRED_CAPABILITY_FEEDBACK_TYPES['telemetry-analytics']).toBeUndefined();
  });

  it('FR-3 AC-6: supplies a default trailing 30-day window when calling the RPC', async () => {
    const supabase = buildMockSupabaseWithRpc({ data: [{ event_count: 1 }], error: null });
    const before = Date.now();
    await verifyCapabilityWired(supabase, 'venture-f', 'telemetry-analytics');
    const after = Date.now();

    const [, args] = supabase.rpc.mock.calls[0];
    const start = new Date(args.p_window_start).getTime();
    const end = new Date(args.p_window_end).getTime();

    expect(Number.isNaN(start)).toBe(false);
    expect(Number.isNaN(end)).toBe(false);
    expect(start).toBeLessThan(end);
    // end is "now" at call time
    expect(end).toBeGreaterThanOrEqual(before);
    expect(end).toBeLessThanOrEqual(after);
    // window is 30 days (within a few ms of test-execution slack)
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(end - start).toBeGreaterThanOrEqual(thirtyDaysMs - 1000);
    expect(end - start).toBeLessThanOrEqual(thirtyDaysMs + 1000);
  });

  it('existing feedback-widget/error-capture-middleware behavior is unmodified', async () => {
    const supabase = {
      from(table) {
        expect(table).toBe('feedback');
        return {
          select() {
            return {
              eq() { return this; },
              in() { return this; },
              limit() {
                return Promise.resolve({ data: [{ id: 'row-1' }], error: null });
              },
            };
          },
        };
      },
    };
    const result = await verifyCapabilityWired(supabase, 'venture-e', 'feedback-widget');
    expect(result.wired).toBe(true);
  });
});

describe('SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-C FR-2: fn_venture_usage_window_summary migration (static content)', () => {
  // The DO $verify$ posture-assertion block cannot execute here (it requires a live
  // database, and the migration is chairman-gated / not applied) -- this asserts the
  // migration file actually contains the required clauses (TESTING finding F3),
  // mirroring the existing "FR-6: backfill migration" static-content test pattern.
  const MIGRATION_PATH = resolve(__dirname, '../../../database/chairman-gated/20260826_venture_usage_window_summary_rpc.sql');
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('grants EXECUTE to service_role only, revoking PUBLIC/anon/authenticated (secdef-execute-revoke-lint compliant)', () => {
    // Must be REVOKE EXECUTE (not REVOKE ALL) -- scripts/lint/secdef-execute-revoke-lint.mjs
    // pattern-matches this exact literal and would otherwise false-fail in CI even though
    // REVOKE ALL is semantically equivalent for a function (SECURITY finding, evidence ae6b2476).
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.fn_venture_usage_window_summary[^;]*FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.fn_venture_usage_window_summary[^;]*TO service_role/);
  });

  it('guards against Child A\'s venture_usage_events table not existing yet', () => {
    expect(sql).toMatch(/to_regclass\('public\.venture_usage_events'\)\s+IS\s+NULL/);
    expect(sql).toMatch(/RAISE EXCEPTION/);
  });

  it('is SECURITY DEFINER with search_path pinned', () => {
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public, pg_temp/);
  });

  it('has a DO $verify$ block asserting the grant posture', () => {
    expect(sql).toMatch(/DO \$verify\$/);
    expect(sql).toMatch(/has_function_privilege\('anon'/);
    expect(sql).toMatch(/has_function_privilege\('service_role'/);
  });

  it('returns event_count only (no active_users/actor_hash column -- withdrawn, see file header)', () => {
    // The file header's explanatory comment legitimately mentions actor_hash/active_users
    // (explaining why they were withdrawn) -- scope this assertion to the function body
    // and return type, not the whole file.
    const fnBody = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'), sql.indexOf('COMMENT ON FUNCTION'));
    expect(fnBody).toMatch(/RETURNS TABLE\(event_count BIGINT\)/);
    expect(fnBody).not.toMatch(/actor_hash/i);
    expect(fnBody).not.toMatch(/active_users/i);
  });

  it('TS-3 (VALIDATION mutation M4): scopes rows to the requested venture_id, not a tautology', () => {
    // VALIDATION finding VAL-2 (evidence 7d046e79): a mutation replacing this WHERE
    // clause with a tautology survived every prior static assertion -- this table's
    // SECURITY DEFINER function bypasses RLS by design, so the venture_id predicate
    // IS the access boundary. Requires the literal column comparison, not just any
    // WHERE presence.
    expect(sql).toMatch(/WHERE\s+venture_id\s*=\s*p_venture_id/);
    expect(sql).toMatch(/AND\s+created_at\s*>=\s*p_window_start/);
    expect(sql).toMatch(/AND\s+created_at\s*<=\s*p_window_end/);
  });

  it('TS-6 (VALIDATION mutation M5): malformed-window guard returns an empty result rather than erroring', () => {
    // VALIDATION finding VAL-3: a mutation disabling this guard (IF false THEN) survived
    // every prior static assertion.
    expect(sql).toMatch(/IF\s+p_window_start\s+IS\s+NULL\s+OR\s+p_window_end\s+IS\s+NULL\s+OR\s+p_window_start\s*>\s*p_window_end\s+THEN/);
    expect(sql).toMatch(/RETURN QUERY SELECT 0::BIGINT;/);
  });

  it('is transaction-wrapped and staged as chairman-gated (not applied)', () => {
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/^COMMIT;/m);
    expect(sql).toMatch(/STAGED, NOT APPLIED\. CHAIRMAN-GATED\. DO NOT RUN THIS FILE\./);
  });
});
