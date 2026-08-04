/**
 * SD-LEO-INFRA-ROLE-BLIND-SESSION-001 FR-1 — the shared role predicate.
 *
 * Pure unit tests with a fake supabase and a temp identity dir. No live DB.
 *
 * The load-bearing case is TS-5: UNKNOWN must stay distinguishable from WORKER. Collapsing them
 * reproduces the defect one layer down — a hook that cannot reach the DB would read "could not
 * look" as "not a role session" and apply worker doctrine to a role seat, which is the exact
 * behaviour this SD removes.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const {
  ROLE_VERDICT, verdictFromMetadata, verdictFromIdentityFile,
  roleVerdictFor, shouldApplyWorkerMachinery,
} = require_('../../../lib/fleet/role-status-identity.cjs');

/** Minimal supabase stub: one row, or an error. */
const fakeDb = (row, error = null) => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error }) }) }) }),
});

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'roleid-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('verdictFromMetadata — the DB shape alone', () => {
  it('TS-1: metadata.role=solomon -> ROLE', () => {
    expect(verdictFromMetadata({ role: 'solomon' })).toBe(ROLE_VERDICT.ROLE);
  });

  it('TS-2: metadata.role=adam -> ROLE (second role proves the axis is metadata.role, not one name)', () => {
    // An Adam-only suite would admit an Adam-keyed implementation that leaves the class alive for
    // solomon and coordinator. Success criterion 5 requires two distinct roles.
    expect(verdictFromMetadata({ role: 'adam' })).toBe(ROLE_VERDICT.ROLE);
    expect(verdictFromMetadata({ role: 'coordinator' })).toBe(ROLE_VERDICT.ROLE);
  });

  it('TS-3: no role key -> WORKER (every role seat sets it at startup, so absence is a real signal)', () => {
    expect(verdictFromMetadata({ auto_proceed: true })).toBe(ROLE_VERDICT.WORKER);
  });

  it('an UNRECOGNISED role string is WORKER, not UNKNOWN — the key was set and read fine', () => {
    expect(verdictFromMetadata({ role: 'gardener' })).toBe(ROLE_VERDICT.WORKER);
  });

  it('a MALFORMED role value is UNKNOWN, not WORKER — guessing from bad data is the collapse', () => {
    expect(verdictFromMetadata({ role: '' })).toBe(ROLE_VERDICT.UNKNOWN);
    expect(verdictFromMetadata({ role: 42 })).toBe(ROLE_VERDICT.UNKNOWN);
    expect(verdictFromMetadata(null)).toBe(ROLE_VERDICT.UNKNOWN);
  });
});

describe('verdictFromIdentityFile — the fallback carrier that already existed', () => {
  it('role:true -> ROLE', () => {
    expect(verdictFromIdentityFile({ role: true, callsign: 'Solomon' })).toBe(ROLE_VERDICT.ROLE);
  });

  it('a worker identity file is UNKNOWN, not WORKER', () => {
    // The file can only ever CONFIRM a role. A worker's file simply lacks the key, which is
    // indistinguishable from a truncated write — so the DB stays the authority for "worker".
    expect(verdictFromIdentityFile({ callsign: 'Alpha' })).toBe(ROLE_VERDICT.UNKNOWN);
  });
});

describe('roleVerdictFor — DB first, file fallback', () => {
  it('TS-4: no DB reach, identity file says role:true -> ROLE', async () => {
    writeFileSync(join(dir, 'fleet-identity-sess1.json'), JSON.stringify({ role: true }));
    expect(await roleVerdictFor({ sessionId: 'sess1', dir })).toBe(ROLE_VERDICT.ROLE);
  });

  it('TS-5: no DB reach AND no identity file -> UNKNOWN, never WORKER', async () => {
    // THE case. If this ever returns WORKER, a role seat with an unreachable DB gets worker
    // doctrine — the original defect, rebuilt inside its own fix.
    expect(await roleVerdictFor({ sessionId: 'nofile', dir })).toBe(ROLE_VERDICT.UNKNOWN);
  });

  it('a DB ERROR falls through to the file rather than answering from a failed read', async () => {
    writeFileSync(join(dir, 'fleet-identity-sess2.json'), JSON.stringify({ role: true }));
    const db = fakeDb(null, { message: 'connection refused' });
    expect(await roleVerdictFor({ sessionId: 'sess2', supabase: db, dir })).toBe(ROLE_VERDICT.ROLE);
  });

  it('the DB wins over a stale file when it has a definite answer', async () => {
    writeFileSync(join(dir, 'fleet-identity-sess3.json'), JSON.stringify({ role: true }));
    const db = fakeDb({ metadata: { role: null } });   // definitively a worker now
    expect(await roleVerdictFor({ sessionId: 'sess3', supabase: db, dir })).toBe(ROLE_VERDICT.WORKER);
  });

  it('an invalid sessionId is UNKNOWN (also the path-traversal guard)', async () => {
    expect(await roleVerdictFor({ sessionId: '../../etc/passwd', dir })).toBe(ROLE_VERDICT.UNKNOWN);
    expect(await roleVerdictFor({ sessionId: '', dir })).toBe(ROLE_VERDICT.UNKNOWN);
  });
});

describe('shouldApplyWorkerMachinery — UNKNOWN keeps the guard', () => {
  it('role session -> false (no worker machinery)', async () => {
    const db = fakeDb({ metadata: { role: 'solomon' } });
    expect(await shouldApplyWorkerMachinery({ sessionId: 's', supabase: db, dir })).toBe(false);
  });

  it('worker session -> true', async () => {
    const db = fakeDb({ metadata: {} });
    expect(await shouldApplyWorkerMachinery({ sessionId: 's', supabase: db, dir })).toBe(true);
  });

  it('UNKNOWN -> TRUE: the ambiguous case KEEPS the worker guard', async () => {
    // Deliberately fail-loud. A role seat wrongly showing a worker banner is noise someone
    // reports; a worker seat wrongly losing its stop-hook guard goes incognito and strands a
    // claim. The SD says a fix that quiets a worker guard is worse than the noise it removes.
    expect(await shouldApplyWorkerMachinery({ sessionId: 'nofile', dir })).toBe(true);
  });
});

describe('TS-12 CONTROL — the role-side assertions can actually fail', () => {
  it('a stubbed always-worker predicate breaks every role-side expectation', async () => {
    // Without this, "role session gets no worker machinery" is satisfied just as well by an
    // implementation that returns WORKER for everything — the cannot-fail shape.
    const stub = async () => true;
    expect(await stub()).toBe(true);                      // stub applies worker machinery always
    const db = fakeDb({ metadata: { role: 'solomon' } });
    const real = await shouldApplyWorkerMachinery({ sessionId: 's', supabase: db, dir });
    expect(real).not.toBe(await stub());                  // the real predicate must DIFFER
  });
});
