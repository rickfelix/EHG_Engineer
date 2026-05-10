/**
 * SD-FDBK-ENH-CASCADE-TRIGGER-3627-001 — FR-3 regression coverage.
 *
 * Pins the repaired `assertSweepHandoffGate` contract:
 *   - sd_key input → resolves to UUID via strategic_directives_v2 lookup, then queries sd_id
 *   - UUID input → bypasses resolver, queries sd_id directly
 *   - SD lookup miss → throws SD_NOT_FOUND (fail-loud, NOT silent fail-open)
 *   - Schema-class DB error (SQLSTATE 42703/42P01/42883) → throws SCHEMA_ERROR (fail-CLOSED)
 *   - Transient DB error (e.g., timeout) → returns {ok:true, dbError} (fail-OPEN preserved)
 *   - Unclassified DB error (no code) → fail-OPEN (default conservative)
 *   - Handoffs past target → throws ACCEPTED_HANDOFF_OVERRIDE
 *   - No handoffs past target → returns {ok:true}
 *
 * Stub-injected supabase client only — zero live DB.
 *
 * Witness regression: assertSweepHandoffGate("SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001", "LEAD")
 * was returning {ok:true, dbError:"column sd_phase_handoffs.sd_key does not exist"} due to a
 * non-existent column reference in the .or() clause. PR repairs the query and pins this here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  assertSweepHandoffGate,
  ExecContextError,
  SCHEMA_SQLSTATE_CODES,
  PHASE_RANK,
} from '../../lib/exec-context-guard.mjs';

const WITNESS_SDKEY = 'SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001';
const WITNESS_UUID = '2a017ba5-ad88-4746-b2a8-0a8016c13835';

/**
 * Minimal supabase client stub that records calls and returns
 * configurable {data, error} per table.from(...) chain.
 *
 * Usage:
 *   const stub = makeStub({
 *     'strategic_directives_v2': { data: { id: '<uuid>' }, error: null },
 *     'sd_phase_handoffs':       { data: [...], error: null },
 *   });
 *
 * Each from(table) returns a chain that supports .select().eq().eq().maybeSingle()
 * (lookup) and .select().eq().eq() awaited as the final call (handoff query).
 */
function makeStub(perTable) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push({ table });
      const cfg = perTable[table];
      if (!cfg) {
        throw new Error(`makeStub: no config for table=${table}`);
      }
      const builder = {
        select: () => builder,
        eq: () => builder,
        or: () => builder,
        maybeSingle: () => Promise.resolve({ data: cfg.data, error: cfg.error }),
        // The handoff query awaits the chain directly (no .maybeSingle):
        then: (resolve, reject) => Promise.resolve({ data: cfg.data, error: cfg.error }).then(resolve, reject),
      };
      return builder;
    },
  };
}

describe('SD-FDBK-ENH-CASCADE-TRIGGER-3627-001 FR-3: assertSweepHandoffGate query-repair regression', () => {
  describe('Module-level exports (FR-1, FR-2)', () => {
    it('exports PHASE_RANK with LEAD/PLAN/PLAN_PRD/EXEC ordering', () => {
      expect(PHASE_RANK).toBeDefined();
      expect(PHASE_RANK.LEAD).toBe(0);
      expect(PHASE_RANK.PLAN).toBe(1);
      expect(PHASE_RANK.PLAN_PRD).toBe(1);
      expect(PHASE_RANK.EXEC).toBe(2);
    });

    it('exports SCHEMA_SQLSTATE_CODES set with PG codes 42703, 42P01, 42883', () => {
      expect(SCHEMA_SQLSTATE_CODES).toBeDefined();
      expect(SCHEMA_SQLSTATE_CODES.has('42703')).toBe(true);
      expect(SCHEMA_SQLSTATE_CODES.has('42P01')).toBe(true);
      expect(SCHEMA_SQLSTATE_CODES.has('42883')).toBe(true);
      expect(SCHEMA_SQLSTATE_CODES.has('PGRST301')).toBe(false);
    });
  });

  describe('FR-1: sd_key→UUID resolution path', () => {
    it('throws ACCEPTED_HANDOFF_OVERRIDE when sd_key input has accepted handoffs past target', async () => {
      const stub = makeStub({
        'strategic_directives_v2': { data: { id: WITNESS_UUID }, error: null },
        'sd_phase_handoffs': {
          data: [
            { id: '1', from_phase: 'LEAD', to_phase: 'PLAN', status: 'accepted', created_at: '2026-05-09T23:55:58Z' },
            { id: '2', from_phase: 'PLAN', to_phase: 'EXEC', status: 'accepted', created_at: '2026-05-10T00:15:21Z' },
          ],
          error: null,
        },
      });
      await expect(assertSweepHandoffGate(stub, WITNESS_SDKEY, 'LEAD'))
        .rejects.toMatchObject({ name: 'ExecContextError', code: 'ACCEPTED_HANDOFF_OVERRIDE' });
    });

    it('throws SD_NOT_FOUND when sd_key lookup misses (fail-loud, NOT silent fail-open)', async () => {
      const stub = makeStub({
        'strategic_directives_v2': { data: null, error: null }, // maybeSingle returns null when no row
        'sd_phase_handoffs': { data: [], error: null }, // unused but required by stub
      });
      await expect(assertSweepHandoffGate(stub, 'SD-DOES-NOT-EXIST-9999', 'LEAD'))
        .rejects.toMatchObject({ name: 'ExecContextError', code: 'SD_NOT_FOUND' });
    });

    it('returns {ok:true} when sd_key resolves but no handoffs past target', async () => {
      const stub = makeStub({
        'strategic_directives_v2': { data: { id: WITNESS_UUID }, error: null },
        'sd_phase_handoffs': { data: [], error: null },
      });
      const result = await assertSweepHandoffGate(stub, WITNESS_SDKEY, 'LEAD');
      expect(result).toEqual({ ok: true });
    });
  });

  describe('FR-1: UUID input direct-query path (resolver bypassed)', () => {
    it('throws ACCEPTED_HANDOFF_OVERRIDE when UUID input has accepted handoffs past target', async () => {
      // Note: with UUID input, the strategic_directives_v2 lookup is skipped.
      // Stub still needs an entry for it because makeStub validates table presence,
      // but it should never be called.
      const stub = makeStub({
        'strategic_directives_v2': { data: null, error: null }, // sentinel — should not be reached
        'sd_phase_handoffs': {
          data: [{ id: '1', from_phase: 'PLAN', to_phase: 'EXEC', status: 'accepted', created_at: '2026-05-10T00:15:21Z' }],
          error: null,
        },
      });
      await expect(assertSweepHandoffGate(stub, WITNESS_UUID, 'LEAD'))
        .rejects.toMatchObject({ name: 'ExecContextError', code: 'ACCEPTED_HANDOFF_OVERRIDE' });

      // Verify the resolver was NOT consulted for UUID input
      const sdLookupCalls = stub.calls.filter(c => c.table === 'strategic_directives_v2');
      expect(sdLookupCalls).toHaveLength(0);
    });

    it('returns {ok:true} on UUID input with no handoffs past target', async () => {
      const stub = makeStub({
        'strategic_directives_v2': { data: null, error: null },
        'sd_phase_handoffs': { data: [], error: null },
      });
      const result = await assertSweepHandoffGate(stub, WITNESS_UUID, 'LEAD');
      expect(result).toEqual({ ok: true });
    });
  });

  describe('FR-2: schema-class errors → fail-CLOSED (throws SCHEMA_ERROR)', () => {
    let consoleErrorSpy;
    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('throws SCHEMA_ERROR on PG SQLSTATE 42703 (column does not exist) at handoff query', async () => {
      const stub = makeStub({
        'strategic_directives_v2': { data: { id: WITNESS_UUID }, error: null },
        'sd_phase_handoffs': { data: null, error: { code: '42703', message: 'column sd_phase_handoffs.X does not exist' } },
      });
      await expect(assertSweepHandoffGate(stub, WITNESS_SDKEY, 'LEAD'))
        .rejects.toMatchObject({ name: 'ExecContextError', code: 'SCHEMA_ERROR' });
    });

    it('throws SCHEMA_ERROR on PG SQLSTATE 42P01 (relation does not exist)', async () => {
      const stub = makeStub({
        'strategic_directives_v2': { data: { id: WITNESS_UUID }, error: null },
        'sd_phase_handoffs': { data: null, error: { code: '42P01', message: 'relation X does not exist' } },
      });
      await expect(assertSweepHandoffGate(stub, WITNESS_SDKEY, 'LEAD'))
        .rejects.toMatchObject({ name: 'ExecContextError', code: 'SCHEMA_ERROR' });
    });

    it('throws SCHEMA_ERROR on PG SQLSTATE 42883 (function does not exist)', async () => {
      const stub = makeStub({
        'strategic_directives_v2': { data: { id: WITNESS_UUID }, error: null },
        'sd_phase_handoffs': { data: null, error: { code: '42883', message: 'function X does not exist' } },
      });
      await expect(assertSweepHandoffGate(stub, WITNESS_SDKEY, 'LEAD'))
        .rejects.toMatchObject({ name: 'ExecContextError', code: 'SCHEMA_ERROR' });
    });

    it('FR-5: emits structured stderr log line on SCHEMA_ERROR fail-CLOSED', async () => {
      const stub = makeStub({
        'strategic_directives_v2': { data: { id: WITNESS_UUID }, error: null },
        'sd_phase_handoffs': { data: null, error: { code: '42703', message: 'column does not exist' } },
      });
      try {
        await assertSweepHandoffGate(stub, WITNESS_SDKEY, 'LEAD');
      } catch (e) {
        // expected throw
      }
      const logged = consoleErrorSpy.mock.calls.flat().join(' ');
      expect(logged).toMatch(/\[exec-context-guard\] SCHEMA_ERROR/);
      expect(logged).toMatch(`sd_key=${WITNESS_SDKEY}`);
      expect(logged).toMatch('target=LEAD');
      expect(logged).toMatch('sqlstate=42703');
      expect(logged).toMatch('hint=');
    });

    it('throws SCHEMA_ERROR when SD lookup itself returns 42703', async () => {
      const stub = makeStub({
        'strategic_directives_v2': { data: null, error: { code: '42703', message: 'column sd_key does not exist' } },
        'sd_phase_handoffs': { data: [], error: null }, // unused
      });
      await expect(assertSweepHandoffGate(stub, WITNESS_SDKEY, 'LEAD'))
        .rejects.toMatchObject({
          name: 'ExecContextError',
          code: 'SCHEMA_ERROR',
          details: expect.objectContaining({ step: 'sd_lookup' }),
        });
    });
  });

  describe('FR-2: transient errors → fail-OPEN preserved', () => {
    it('returns {ok:true,dbError} on PostgREST timeout-class error (PGRST301)', async () => {
      const stub = makeStub({
        'strategic_directives_v2': { data: { id: WITNESS_UUID }, error: null },
        'sd_phase_handoffs': { data: null, error: { code: 'PGRST301', message: 'timeout' } },
      });
      const result = await assertSweepHandoffGate(stub, WITNESS_SDKEY, 'LEAD');
      expect(result).toEqual({ ok: true, dbError: 'timeout' });
    });

    it('returns {ok:true,dbError} on unclassified error (code undefined → conservative fail-OPEN)', async () => {
      const stub = makeStub({
        'strategic_directives_v2': { data: { id: WITNESS_UUID }, error: null },
        'sd_phase_handoffs': { data: null, error: { message: 'unknown', code: undefined } },
      });
      const result = await assertSweepHandoffGate(stub, WITNESS_SDKEY, 'LEAD');
      expect(result).toEqual({ ok: true, dbError: 'unknown' });
    });
  });

  describe('Existing contract preservation (regression check)', () => {
    it('throws on unknown targetResetPhase (caller bug)', async () => {
      const stub = makeStub({
        'strategic_directives_v2': { data: null, error: null },
        'sd_phase_handoffs': { data: [], error: null },
      });
      await expect(assertSweepHandoffGate(stub, WITNESS_UUID, 'NONSENSE_PHASE'))
        .rejects.toMatchObject({ name: 'ExecContextError', code: 'ACCEPTED_HANDOFF_OVERRIDE' });
    });

    it('returns {ok:true} when target=EXEC and only LEAD-TO-PLAN handoff exists (PLAN < EXEC)', async () => {
      const stub = makeStub({
        'strategic_directives_v2': { data: { id: WITNESS_UUID }, error: null },
        'sd_phase_handoffs': {
          data: [{ id: '1', from_phase: 'LEAD', to_phase: 'PLAN', status: 'accepted', created_at: '2026-05-09T23:55:58Z' }],
          error: null,
        },
      });
      const result = await assertSweepHandoffGate(stub, WITNESS_SDKEY, 'EXEC');
      expect(result).toEqual({ ok: true });
    });
  });
});
