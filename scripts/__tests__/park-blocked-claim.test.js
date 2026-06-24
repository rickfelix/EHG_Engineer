// Tests for scripts/park-blocked-claim.cjs — the executable form of loop-rule 4b
// (a worker that hits a blocker /signals the coordinator + parks the claim instead of
// self-authorizing the irreversible action or silently re-arming a wakeup to retry it).
// Pure core only (buildParkPatch + parseArgs) — no DB, unit tier.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const MOD = path.resolve(__dirname, '../park-blocked-claim.cjs'); // require.main guard → main() does NOT run
const { buildParkPatch, parseArgs } = require(MOD);

describe('park-blocked-claim — buildParkPatch (pure)', () => {
  const base = {
    sessionId: 'sess-A',
    reason: 'migration must be applied by the database sub-agent, not a worker',
    nowIso: '2026-06-24T12:00:00.000Z',
  };

  it('records the blocker under metadata.blocker (status open) and preserves existing metadata', () => {
    const sd = { metadata: { target_application: 'EHG', pr_number: 713 }, claiming_session_id: 'sess-A' };
    const { metadataPatch } = buildParkPatch({ ...base, sd });
    expect(metadataPatch.target_application).toBe('EHG'); // preserved
    expect(metadataPatch.pr_number).toBe(713);            // preserved
    expect(metadataPatch.blocker).toMatchObject({
      reason: base.reason, status: 'open', signalled_at: base.nowIso, parked_by: 'sess-A',
    });
  });

  it('releases the claim ONLY when this session holds it', () => {
    const mine = { metadata: {}, claiming_session_id: 'sess-A' };
    const foreign = { metadata: {}, claiming_session_id: 'sess-B' };
    const unclaimed = { metadata: {}, claiming_session_id: null };
    expect(buildParkPatch({ ...base, sd: mine }).releaseClaim).toBe(true);
    expect(buildParkPatch({ ...base, sd: foreign }).releaseClaim).toBe(false); // never clear a foreign claim
    expect(buildParkPatch({ ...base, sd: unclaimed }).releaseClaim).toBe(false);
  });

  it('honors --no-release (releaseRequested=false) even when this session holds the claim', () => {
    const sd = { metadata: {}, claiming_session_id: 'sess-A' };
    expect(buildParkPatch({ ...base, sd, releaseRequested: false }).releaseClaim).toBe(false);
  });

  it('handles a missing metadata object without throwing', () => {
    const sd = { claiming_session_id: 'sess-A' };
    const { metadataPatch, releaseClaim } = buildParkPatch({ ...base, sd });
    expect(metadataPatch.blocker.status).toBe('open');
    expect(releaseClaim).toBe(true);
  });

  it('caps an over-long blocker reason at 1000 chars', () => {
    const sd = { metadata: {}, claiming_session_id: 'sess-A' };
    const long = 'x'.repeat(5000);
    const { metadataPatch } = buildParkPatch({ ...base, sd, reason: long });
    expect(metadataPatch.blocker.reason.length).toBe(1000);
  });
});

describe('park-blocked-claim — parseArgs (pure)', () => {
  it('defaults to signal=true, release=true, type=stuck, severity=high', () => {
    const a = parseArgs(['SD-X-001', '--reason', 'blocked on prod migration']);
    expect(a._[0]).toBe('SD-X-001');
    expect(a.reason).toBe('blocked on prod migration');
    expect(a).toMatchObject({ signal: true, release: true, type: 'stuck', severity: 'high' });
  });

  it('parses --no-signal / --no-release / --type / --severity', () => {
    const a = parseArgs(['SD-X-001', '--reason', 'r', '--no-signal', '--no-release', '--type', 'gate-bug', '--severity', 'critical']);
    expect(a.signal).toBe(false);
    expect(a.release).toBe(false);
    expect(a.type).toBe('gate-bug');
    expect(a.severity).toBe('critical');
  });
});
