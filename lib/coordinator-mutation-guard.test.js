/**
 * coordinator-mutation-guard.test.js — SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-B / FR-3
 *
 * Tests for lib/coordinator-mutation-guard.mjs:
 *   MG-1: canonical session → allowed
 *   MG-2: different canonical → fail-closed (block)
 *   MG-3: resolver throws → fail-open
 *   MG-4: resolver returns null/falsy → fail-open
 *   MG-5: no sessionId → fail-open (resolver NOT called)
 *   MG-6: guardMutation convenience wrapper — logs warn on block, returns verdict
 *   MG-7: daemon-wiring (coordinator-self-review seam) — guard blocks vs. allows
 *   MG-8: daemon-wiring (coordinator-backlog-rank seam) — guard blocks vs. allows
 *   MG-9:  resolveOwnSessionId — env-first, .claude/session-id.json fallback, null (Finding 1)
 *   MG-10: stale-session-sweep WORK_ASSIGNMENT dispatch — gated by !allowed (Finding 3 HIGH)
 *
 * Uses opts._getCanonicalId injection seam (no vi.mock required — avoids CJS/ESM
 * boundary issues with createRequire-based imports).
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { assertCanonicalCoordinator, guardMutation, resolveOwnSessionId } from './coordinator-mutation-guard.mjs';

// dispatchWorkAssignmentsIfAllowed is the guarded dispatch helper extracted from
// scripts/stale-session-sweep.cjs (CJS); require it via createRequire.
const _require = createRequire(import.meta.url);
const { dispatchWorkAssignmentsIfAllowed } = _require('../scripts/stale-session-sweep.cjs');

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Seam helpers ─────────────────────────────────────────────────────────────
// opts._getCanonicalId: injectable resolver seam that bypasses the real CJS require.
const resolverReturns = (val) => ({ _getCanonicalId: async () => val });
const resolverThrows = (msg) => ({ _getCanonicalId: async () => { throw new Error(msg); } });

// ─────────────────────────────────────────────────────────────────────────────
// MG-1: canonical session → allowed
// ─────────────────────────────────────────────────────────────────────────────
describe('MG-1: canonical session → allowed', () => {
  it('returns allowed:true and reason:canonical when sessionId matches canonical', async () => {
    const result = await assertCanonicalCoordinator({}, 'session-abc', resolverReturns('session-abc'));
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('canonical');
    expect(result.canonical_session_id).toBe('session-abc');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MG-2: different canonical → fail-closed
// ─────────────────────────────────────────────────────────────────────────────
describe('MG-2: different canonical → fail-closed', () => {
  it('returns allowed:false and canonical_session_id of the real coordinator', async () => {
    const result = await assertCanonicalCoordinator({}, 'rogue-session', resolverReturns('the-real-coordinator'));
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('not_canonical');
    expect(result.canonical_session_id).toBe('the-real-coordinator');
  });

  it('blocked verdict contains the canonical id (not the caller id)', async () => {
    const result = await assertCanonicalCoordinator({}, 'other-session', resolverReturns('canonical-id-xyz'));
    expect(result.canonical_session_id).toBe('canonical-id-xyz');
    expect(result.canonical_session_id).not.toBe('other-session');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MG-3: resolver throws → fail-open
// ─────────────────────────────────────────────────────────────────────────────
describe('MG-3: resolver throws → fail-open', () => {
  it('returns allowed:true and reason:resolver_error_fail_open when resolver throws', async () => {
    const result = await assertCanonicalCoordinator({}, 'some-session', resolverThrows('DB is down'));
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('resolver_error_fail_open');
    expect(result.canonical_session_id).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MG-4: resolver returns null/falsy → fail-open
// ─────────────────────────────────────────────────────────────────────────────
describe('MG-4: resolver returns null/falsy → fail-open', () => {
  it('returns allowed:true and reason:resolver_null_fail_open when resolver returns null', async () => {
    const result = await assertCanonicalCoordinator({}, 'some-session', resolverReturns(null));
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('resolver_null_fail_open');
    expect(result.canonical_session_id).toBeNull();
  });

  it('returns fail-open when resolver returns empty string (falsy)', async () => {
    const result = await assertCanonicalCoordinator({}, 'some-session', resolverReturns(''));
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('resolver_null_fail_open');
  });

  it('returns fail-open when resolver returns undefined', async () => {
    const result = await assertCanonicalCoordinator({}, 'some-session', resolverReturns(undefined));
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('resolver_null_fail_open');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MG-5: no sessionId → fail-open (resolver NOT called)
// ─────────────────────────────────────────────────────────────────────────────
describe('MG-5: no sessionId → fail-open', () => {
  it('returns allowed:true and reason:no_session_id_fail_open when sessionId is null', async () => {
    const resolverSpy = vi.fn(async () => 'canonical');
    const result = await assertCanonicalCoordinator({}, null, { _getCanonicalId: resolverSpy });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('no_session_id_fail_open');
    expect(result.canonical_session_id).toBeNull();
    // Resolver must NOT be called when sessionId is absent — no unnecessary DB round-trip
    expect(resolverSpy).not.toHaveBeenCalled();
  });

  it('returns fail-open when sessionId is undefined', async () => {
    const resolverSpy = vi.fn(async () => 'canonical');
    const result = await assertCanonicalCoordinator({}, undefined, { _getCanonicalId: resolverSpy });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('no_session_id_fail_open');
    expect(resolverSpy).not.toHaveBeenCalled();
  });

  it('returns fail-open when sessionId is empty string', async () => {
    const resolverSpy = vi.fn(async () => 'canonical');
    const result = await assertCanonicalCoordinator({}, '', { _getCanonicalId: resolverSpy });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('no_session_id_fail_open');
    expect(resolverSpy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MG-6: guardMutation convenience wrapper
// ─────────────────────────────────────────────────────────────────────────────
describe('MG-6: guardMutation convenience wrapper', () => {
  it('returns the verdict from assertCanonicalCoordinator (allowed case)', async () => {
    const result = await guardMutation({}, 'my-session', 'test-duty', resolverReturns('my-session'));
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('canonical');
  });

  it('emits a structured console.warn when blocked and returns the verdict', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await guardMutation({}, 'rogue-session', 'some-duty-label', resolverReturns('canonical-session'));

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('not_canonical');
    expect(warnSpy).toHaveBeenCalledOnce();
    const warnMsg = warnSpy.mock.calls[0][0];
    expect(warnMsg).toContain('[COORD_MUTATION_BLOCKED]');
    expect(warnMsg).toContain('some-duty-label');
    expect(warnMsg).toContain('rogue-session');
    expect(warnMsg).toContain('canonical-session');
  });

  it('does NOT emit console.warn when allowed', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await guardMutation({}, 'my-session', 'test-duty', resolverReturns('my-session'));
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does NOT emit console.warn on fail-open cases (no block noise when uncertain)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await guardMutation({}, 'some-session', 'test-duty', resolverReturns(null));
    expect(result.allowed).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does NOT emit console.warn when resolver throws (fail-open, no block)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await guardMutation({}, 'some-session', 'test-duty', resolverThrows('boom'));
    expect(result.allowed).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MG-7: daemon-wiring seam (coordinator-self-review)
// Tests the guard contract that selfReviewMain enforces:
//   - When guardMutation returns !allowed → early return (no DB writes happen)
//   - When guardMutation returns allowed → execution continues
// We test via the guard directly with the same calling convention the daemon uses.
// ─────────────────────────────────────────────────────────────────────────────
describe('MG-7: coordinator-self-review daemon wiring (seam test)', () => {
  it('guard blocks and returns !allowed when running as non-canonical session', async () => {
    const guardResult = await guardMutation(
      {},
      'rogue-session',
      'coordinator-self-review',
      resolverReturns('canonical-coordinator')
    );
    expect(guardResult.allowed).toBe(false);
    expect(guardResult.reason).toBe('not_canonical');
    expect(guardResult.canonical_session_id).toBe('canonical-coordinator');
    // The daemon: if (!_guardVerdict.allowed) return _guardVerdict;
    // Confirmed: early-return path is triggered by this verdict shape.
  });

  it('guard allows when this session IS the canonical coordinator', async () => {
    const guardResult = await guardMutation(
      {},
      'canonical-coordinator',
      'coordinator-self-review',
      resolverReturns('canonical-coordinator')
    );
    expect(guardResult.allowed).toBe(true);
    expect(guardResult.reason).toBe('canonical');
  });

  it('guard is fail-open when resolver throws (daemon proceeds normally)', async () => {
    const guardResult = await guardMutation(
      {},
      'any-session',
      'coordinator-self-review',
      resolverThrows('transient DB error')
    );
    expect(guardResult.allowed).toBe(true);
    expect(guardResult.reason).toBe('resolver_error_fail_open');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MG-8: daemon-wiring seam (coordinator-backlog-rank)
// ─────────────────────────────────────────────────────────────────────────────
describe('MG-8: coordinator-backlog-rank daemon wiring (seam test)', () => {
  it('guard blocks writes when running as non-canonical session', async () => {
    const verdict = await guardMutation(
      {},
      'non-coordinator-session',
      'coordinator-backlog-rank',
      resolverReturns('real-coordinator')
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.canonical_session_id).toBe('real-coordinator');
  });

  it('guard allows writes when running as canonical coordinator', async () => {
    const verdict = await guardMutation(
      {},
      'coord-session-123',
      'coordinator-backlog-rank',
      resolverReturns('coord-session-123')
    );
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBe('canonical');
  });

  it('guard is fail-open when resolver returns null (transient blip — writes proceed)', async () => {
    const verdict = await guardMutation(
      {},
      'some-session',
      'coordinator-backlog-rank',
      resolverReturns(null)
    );
    // fail-open: writes proceed when we cannot determine the canonical
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBe('resolver_null_fail_open');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MG-9: resolveOwnSessionId — env-first, on-disk pointer fallback, null (Finding 1)
// ─────────────────────────────────────────────────────────────────────────────
describe('MG-9: resolveOwnSessionId (Finding 1 — disk-pointer fallback)', () => {
  const origEnv = process.env.CLAUDE_SESSION_ID;
  let tmpFile;

  afterEach(() => {
    if (origEnv === undefined) delete process.env.CLAUDE_SESSION_ID;
    else process.env.CLAUDE_SESSION_ID = origEnv;
    if (tmpFile) { try { fs.unlinkSync(tmpFile); } catch { /* ignore */ } tmpFile = null; }
  });

  it('returns process.env.CLAUDE_SESSION_ID when set (env wins over disk)', () => {
    process.env.CLAUDE_SESSION_ID = 'env-session-id';
    // Write a DIFFERENT id to disk to prove env takes precedence.
    tmpFile = path.join(os.tmpdir(), `sid-env-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify({ session_id: 'disk-session-id' }));
    expect(resolveOwnSessionId(tmpFile)).toBe('env-session-id');
  });

  it('falls back to .session_id from the disk pointer when env is empty', () => {
    delete process.env.CLAUDE_SESSION_ID;
    tmpFile = path.join(os.tmpdir(), `sid-disk-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify({ session_id: 'disk-recovered-id', host: 'h' }));
    expect(resolveOwnSessionId(tmpFile)).toBe('disk-recovered-id');
  });

  it('returns null when env empty AND pointer file is absent (guard then fail-opens)', () => {
    delete process.env.CLAUDE_SESSION_ID;
    const missing = path.join(os.tmpdir(), `sid-missing-${Date.now()}-${Math.random()}.json`);
    expect(resolveOwnSessionId(missing)).toBeNull();
  });

  it('returns null fail-safe when the pointer file is malformed JSON', () => {
    delete process.env.CLAUDE_SESSION_ID;
    tmpFile = path.join(os.tmpdir(), `sid-bad-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, '{ this is not valid json');
    expect(resolveOwnSessionId(tmpFile)).toBeNull();
  });

  it('returns null when the pointer file has no usable session_id', () => {
    delete process.env.CLAUDE_SESSION_ID;
    tmpFile = path.join(os.tmpdir(), `sid-nokey-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify({ host: 'h', session_id: '' }));
    expect(resolveOwnSessionId(tmpFile)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MG-10: stale-session-sweep WORK_ASSIGNMENT dispatch gating (Finding 3 — HIGH)
// The whole point of the SD: a lingering NON-canonical coordinator's sweep must NOT
// re-dispatch WORK_ASSIGNMENT (sender_type:'sweep') rows. Asserts NO insert when !allowed,
// and that the insert DOES happen when allowed.
// ─────────────────────────────────────────────────────────────────────────────
describe('MG-10: sweep WORK_ASSIGNMENT dispatch is gated by the single-writer verdict', () => {
  // Minimal supabase mock: records inserts; .select()… chain returns no existing rows
  // so the "don't spam" check passes and a fresh insert would fire when allowed.
  function makeSweepSb(inserts) {
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      limit: () => Promise.resolve({ data: [], error: null }), // no existing unacked assignment
      insert: (row) => { inserts.push(row); return Promise.resolve({ data: null, error: null }); },
    };
    return { from: () => chain };
  }

  const activeSessions = [
    { session_id: 'worker-1', sd_key: 'SD-FOO-BAR-001' },
    { session_id: 'worker-2', sd_key: 'SD-BAZ-QUX-002' },
  ];

  it('does NOT insert ANY WORK_ASSIGNMENT (sender_type:sweep) when !allowed', async () => {
    const inserts = [];
    const sb = makeSweepSb(inserts);
    const result = await dispatchWorkAssignmentsIfAllowed(sb, activeSessions, ['SD-NEXT-001'], /* allowed */ false);

    // The harmful double-act is fully suppressed.
    expect(inserts.length).toBe(0);
    expect(result.blocked).toBe(true);
    expect(result.dispatched).toBe(0);
    expect(result.skipped).toBe(activeSessions.length);
    // Belt-and-suspenders: no row carrying sender_type:'sweep' WORK_ASSIGNMENT escaped.
    expect(inserts.some(r => r.message_type === 'WORK_ASSIGNMENT' && r.sender_type === 'sweep')).toBe(false);
  });

  it('DOES insert WORK_ASSIGNMENT (sender_type:sweep) for each active session when allowed', async () => {
    const inserts = [];
    const sb = makeSweepSb(inserts);
    const result = await dispatchWorkAssignmentsIfAllowed(sb, activeSessions, ['SD-NEXT-001'], /* allowed */ true);

    expect(result.blocked).toBe(false);
    expect(result.dispatched).toBe(activeSessions.length);
    expect(inserts.length).toBe(activeSessions.length);
    // Every inserted row is the canonical sweep WORK_ASSIGNMENT shape.
    for (const r of inserts) {
      expect(r.message_type).toBe('WORK_ASSIGNMENT');
      expect(r.sender_type).toBe('sweep');
    }
    expect(inserts.map(r => r.target_session).sort()).toEqual(['worker-1', 'worker-2']);
  });

  it('dispatches to ZERO sessions safely when activeSessions is empty (allowed)', async () => {
    const inserts = [];
    const sb = makeSweepSb(inserts);
    const result = await dispatchWorkAssignmentsIfAllowed(sb, [], [], true);
    expect(inserts.length).toBe(0);
    expect(result.dispatched).toBe(0);
    expect(result.blocked).toBe(false);
  });
});
