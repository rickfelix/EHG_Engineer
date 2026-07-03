// Tests for SD-LEO-INFRA-ADAM-ROLE-FORMALIZATION-001-A
// scripts/adam-register.cjs — idempotent verify-first Adam role tagger.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const { computeAdamTag, registerAdam, ADAM_ROLE } = require('./adam-register.cjs');

// These tests exercise the legacy (flag-OFF) registerAdam path, but the real .env sets
// ROLE_HANDOFF_ADAM_V1=on for the FR-3 single-Adam guard — force it off here so the suite
// isn't at the mercy of ambient env (mirrors tests/unit/coordination/adam-singleton.test.js).
const PRIOR_ROLE_HANDOFF_ADAM_V1 = process.env.ROLE_HANDOFF_ADAM_V1;
beforeEach(() => { delete process.env.ROLE_HANDOFF_ADAM_V1; });
afterEach(() => {
  if (PRIOR_ROLE_HANDOFF_ADAM_V1 === undefined) delete process.env.ROLE_HANDOFF_ADAM_V1;
  else process.env.ROLE_HANDOFF_ADAM_V1 = PRIOR_ROLE_HANDOFF_ADAM_V1;
});

describe('computeAdamTag (pure)', () => {
  it('tags an untagged metadata and preserves existing keys', () => {
    const { alreadyTagged, merged } = computeAdamTag({ callsign: 'Adam', cc_pid: 123 });
    expect(alreadyTagged).toBe(false);
    expect(merged.role).toBe('adam');
    expect(merged.non_fleet).toBe(true);
    expect(merged.callsign).toBe('Adam'); // preserved
    expect(merged.cc_pid).toBe(123);
  });

  it('detects already-tagged (idempotent no-op)', () => {
    const { alreadyTagged } = computeAdamTag({ role: 'adam', non_fleet: true, callsign: 'X' });
    expect(alreadyTagged).toBe(true);
  });

  it('treats role-only or non_fleet-only as NOT fully tagged', () => {
    expect(computeAdamTag({ role: 'adam' }).alreadyTagged).toBe(false);
    expect(computeAdamTag({ non_fleet: true }).alreadyTagged).toBe(false);
  });

  it('handles null/array metadata defensively', () => {
    expect(computeAdamTag(null).merged.role).toBe('adam');
    expect(computeAdamTag([]).merged.non_fleet).toBe(true);
  });
});

function stub({ row, updateErr = null, selectErr = null }) {
  const calls = { updated: null };
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: row, error: selectErr }),
    update: (payload) => { calls.updated = payload; return { eq: () => Promise.resolve({ error: updateErr }) }; },
  };
  return { sb: { from: () => chain }, calls };
}

describe('registerAdam', () => {
  it('errors without a session id', async () => {
    const { sb } = stub({ row: null });
    const r = await registerAdam(sb, '');
    expect(r.ok).toBe(false);
    expect(r.action).toBe('error');
  });

  it('errors when the session row is absent', async () => {
    const { sb } = stub({ row: null });
    const r = await registerAdam(sb, 'sess-x');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not found/);
  });

  it('tags an untagged session (writes merged metadata)', async () => {
    const { sb, calls } = stub({ row: { session_id: 'sess-1', metadata: { callsign: 'Adam' } } });
    const r = await registerAdam(sb, 'sess-1');
    expect(r.ok).toBe(true);
    expect(r.action).toBe('tagged');
    expect(calls.updated.metadata.role).toBe(ADAM_ROLE);
    expect(calls.updated.metadata.non_fleet).toBe(true);
    expect(calls.updated.metadata.callsign).toBe('Adam'); // preserved
  });

  it('verifies (no write) when already tagged', async () => {
    const { sb, calls } = stub({ row: { session_id: 'sess-2', metadata: { role: 'adam', non_fleet: true } } });
    const r = await registerAdam(sb, 'sess-2');
    expect(r.ok).toBe(true);
    expect(r.action).toBe('verified');
    expect(calls.updated).toBeNull(); // idempotent: no update issued
  });
});
