/**
 * SD-ARCH-HOTSPOT-SD-START-001 FR-7/FR-8 (TS-7..TS-10) — dispatch-authorization
 * polarity gate (flag-laddered, observe-first, authority-allowlisted) + the
 * inert backfill tooling.
 *
 * @module tests/unit/claim/gates/dispatch-authorization.test
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  resolveDispatchAuthMode,
  evaluateDispatchAuthorization,
  formatWouldDenyLine,
  DISPATCH_AUTH_AUTHORITY_ALLOWLIST,
} = require('../../../../lib/claim/gates/dispatch-authorization.cjs');

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const grantRow = (authority, status = 'dispositioned') => ({
  payload: { decision_type: 'dispatch_auth', status, authority, subject: { subject_id: 'SD-X-001', gate_type: 'dispatch' } },
});

describe('resolveDispatchAuthMode — two-flag ladder (D7 adapted: no metadata column on leo_feature_flags)', () => {
  it('base flag off/absent → off; base on → observe; base+enforce on → enforce', async () => {
    expect(await resolveDispatchAuthMode({ isEnabledFn: async () => false })).toBe('off');
    expect(await resolveDispatchAuthMode({ isEnabledFn: async (k) => k === 'dispatch_auth_born_denied' })).toBe('observe');
    expect(await resolveDispatchAuthMode({ isEnabledFn: async () => true })).toBe('enforce');
  });

  it('evaluator error → off (fail-soft: flag infrastructure never changes claim behavior) — TS-9', async () => {
    expect(await resolveDispatchAuthMode({ isEnabledFn: async () => { throw new Error('flag table gone'); } })).toBe('off');
  });
});

describe('evaluateDispatchAuthorization — TS-7/TS-8/TS-9', () => {
  const sd = { sd_key: 'SD-X-001' };

  it('TS-9 mode=off: authorized with ZERO disposition lookups (byte-identical behavior)', async () => {
    const spy = vi.fn();
    const v = await evaluateDispatchAuthorization(sd, {}, { mode: 'off', getDispositionBySubjectFn: spy });
    expect(v).toEqual({ authorized: true, mode: 'off' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('TS-7 observe + no grant: would_deny logged-not-blocked (claim proceeds)', async () => {
    const v = await evaluateDispatchAuthorization(sd, {}, { mode: 'observe', getDispositionBySubjectFn: async () => null });
    expect(v.authorized).toBe(true);
    expect(v.would_deny).toBe(true);
    expect(v.reason).toBe('dispatch_auth_pending');
    expect(formatWouldDenyLine(sd.sd_key, v, 'checkin_self_claim')).toMatch(/DISPATCH_AUTH_WOULD_DENY sd=SD-X-001 lane=checkin_self_claim/);
  });

  it('TS-7 observe + allowlisted grant: authorized silently (no would_deny)', async () => {
    for (const authority of DISPATCH_AUTH_AUTHORITY_ALLOWLIST) {
      const v = await evaluateDispatchAuthorization(sd, {}, { mode: 'observe', getDispositionBySubjectFn: async () => grantRow(authority) });
      expect(v.authorized).toBe(true);
      expect(v.would_deny).toBeUndefined();
      expect(v.authority).toBe(authority);
    }
  });

  it('TS-8 authority allowlist (the specified-never-built claim-eligibility L421-425 check): a non-allowlisted authority NEVER authorizes', async () => {
    const rogue = async () => grantRow('some-worker-session-id');
    const obs = await evaluateDispatchAuthorization(sd, {}, { mode: 'observe', getDispositionBySubjectFn: rogue });
    expect(obs.would_deny).toBe(true);
    expect(obs.reason).toMatch(/authority_not_allowlisted: some-worker-session-id/);
    const enf = await evaluateDispatchAuthorization(sd, {}, { mode: 'enforce', getDispositionBySubjectFn: rogue });
    expect(enf.authorized).toBe(false);
  });

  it('enforce + no grant: refused with dispatch_auth_pending; awaiting_disposition status does not authorize', async () => {
    const v = await evaluateDispatchAuthorization(sd, {}, { mode: 'enforce', getDispositionBySubjectFn: async () => null });
    expect(v).toMatchObject({ authorized: false, reason: 'dispatch_auth_pending' });
    const pending = await evaluateDispatchAuthorization(sd, {}, { mode: 'enforce', getDispositionBySubjectFn: async () => grantRow('chairman', 'awaiting_disposition') });
    expect(pending.authorized).toBe(false);
  });

  it('consumed grants authorize (both load-bearing statuses); disposition read error surfaces in the reason and fails closed under enforce', async () => {
    const consumed = await evaluateDispatchAuthorization(sd, {}, { mode: 'enforce', getDispositionBySubjectFn: async () => grantRow('coordinator', 'consumed') });
    expect(consumed.authorized).toBe(true);
    const err = await evaluateDispatchAuthorization(sd, {}, { mode: 'enforce', getDispositionBySubjectFn: async () => { throw new Error('boom'); } });
    expect(err.authorized).toBe(false);
    expect(err.reason).toMatch(/dispatch_auth_read_error: boom/);
    const errObs = await evaluateDispatchAuthorization(sd, {}, { mode: 'observe', getDispositionBySubjectFn: async () => { throw new Error('boom'); } });
    expect(errObs.authorized).toBe(true); // observe NEVER blocks, even on read errors
    expect(errObs.would_deny).toBe(true);
  });
});

describe('WIRING PINS (D8 placement + lane exemptions)', () => {
  const checkin = readFileSync(resolve(repoRoot, 'scripts/worker-checkin.cjs'), 'utf8');
  const sdStart = readFileSync(resolve(repoRoot, 'scripts/sd-start.js'), 'utf8');

  it('checkin: the hook sits AFTER parentLeadPending/isSdInFlight and BEFORE tryClaim in tryClaimDraftCandidate', () => {
    const fnStart = checkin.indexOf('async function tryClaimDraftCandidate');
    const body = checkin.slice(fnStart, fnStart + 3500);
    const parentIdx = body.indexOf('parentLeadPending(sb, d)');
    const authIdx = body.indexOf('evaluateDispatchAuthorization(d, sb');
    const claimIdx = body.indexOf('tryClaim(sb, d.sd_key, sessionId)');
    expect(parentIdx).toBeGreaterThan(0);
    expect(authIdx).toBeGreaterThan(parentIdx);
    expect(claimIdx).toBeGreaterThan(authIdx);
    // Observe logging + enforce skip both wired.
    expect(body).toMatch(/formatWouldDenyLine\(d\.sd_key, authVerdict, 'checkin_self_claim'\)/);
    expect(body).toMatch(/if \(!authVerdict\.authorized\) return null;/);
  });

  it('checkin: mode resolved once per pass (memoized promise), and ONLY the self-claim lane is hooked (orphan-adopt + WORK_ASSIGNMENT exempt)', () => {
    expect(checkin).toMatch(/_dispatchAuthModePromise/);
    const hookCount = (checkin.match(/evaluateDispatchAuthorization\(/g) || []).length;
    expect(hookCount).toBe(1); // exactly the tryClaimDraftCandidate choke point
  });

  it('sd-start: the hook sits immediately before the claimGuard claim write and hard-refuses only under enforce', () => {
    const authIdx = sdStart.indexOf('evaluateDispatchAuthorization(sd, supabase');
    const claimIdx = sdStart.indexOf('claimGuard(effectiveId, session.session_id, { autoFallback');
    expect(authIdx).toBeGreaterThan(0);
    expect(claimIdx).toBeGreaterThan(authIdx);
    expect(sdStart.slice(authIdx, claimIdx)).toMatch(/process\.exit\(1\)/); // enforce refusal path
  });

  it('sd-start: the auto-FALLBACK lane is ALSO gated (self-review gap fix) with skip-polarity before its claimGuard', () => {
    const fbIdx = sdStart.indexOf('evaluateDispatchAuthorization({ sd_key: nextSD.sdKey }');
    expect(fbIdx).toBeGreaterThan(0);
    const fbClaimIdx = sdStart.indexOf('claimGuard(nextSD.sdKey, session.session_id, { autoFallback: true })');
    expect(fbClaimIdx).toBeGreaterThan(fbIdx); // check precedes the fallback claim write
    const between = sdStart.slice(fbIdx, fbClaimIdx);
    expect(between).toMatch(/sd_start_fallback_claim/);      // observe logging on this lane
    expect(between).toMatch(/continue;/);                    // skip-polarity, not process.exit
    expect(between).not.toMatch(/process\.exit/);
  });

  it('documented lane exemptions hold: stranded-final recovery + orphan-adopt + QF claims carry NO auth hook (phase-2 surface)', () => {
    // Exactly one evaluateDispatchAuthorization call site in checkin (the self-claim
    // choke point) — recovery/adoption/QF lanes are deliberate phase-1 exemptions.
    const checkinHooks = (checkin.match(/evaluateDispatchAuthorization\(/g) || []).length;
    expect(checkinHooks).toBe(1);
    // And exactly two in sd-start (direct claim + fallback lane).
    const sdStartHooks = (sdStart.match(/evaluateDispatchAuthorization\(/g) || []).length;
    expect(sdStartHooks).toBe(2);
  });
});

describe('TS-10 — backfill tool (inert, idempotent) helpers', () => {
  it('enumerates the exact worker-checkin claimable status surface and partitions grant coverage', async () => {
    const backfill = await import('../../../../scripts/backfill-dispatch-auth-grants.mjs');
    expect(backfill.CLAIMABLE_STATUSES).toEqual(['draft', 'active', 'planning', 'ready', 'in_progress', 'pending_approval']);

    // verifyGrantCoverage over a mixed set (mocked disposition reads via a fake supabase
    // the real getDispositionBySubject queries: system_events by idempotency_key).
    const grants = {
      // dq_ keys are content-derived; fake matches on the subject embedded in payload instead:
    };
    void grants;
    const fakeSb = {
      from(table) {
        expect(table).toBe('system_events');
        const q = {};
        const b = {
          select() { return b; },
          eq(col, val) { q[col] = val; return b; },
          maybeSingle() {
            // Grant exists only for SD-GRANTED-001's question key: emulate by
            // checking the key material embedded when computeQuestionKey ran.
            // We can't reverse the hash here; instead seed by call order via the
            // idempotency_key of a real computeQuestionKey call below.
            return Promise.resolve({ data: q.idempotency_key === grantedKey ? { payload: { status: 'dispositioned', authority: 'backfill-cutover' } } : null, error: null });
          },
        };
        return b;
      },
    };
    const { computeQuestionKey } = await import('../../../../lib/decision-binding/disposition.js');
    const grantedKey = computeQuestionKey('dispatch_auth', { subject_id: 'SD-GRANTED-001', gate_type: 'dispatch' });

    const { granted, unGranted } = await backfill.verifyGrantCoverage(fakeSb, [
      { sd_key: 'SD-GRANTED-001', status: 'draft' },
      { sd_key: 'SD-BARE-001', status: 'ready' },
    ]);
    expect(granted.map(s => s.sd_key)).toEqual(['SD-GRANTED-001']);
    expect(unGranted.map(s => s.sd_key)).toEqual(['SD-BARE-001']);
  });

  it('applyGrants writes via recordDisposition with the allowlisted backfill authority and is idempotent (created:false counted as reused)', async () => {
    const backfill = await import('../../../../scripts/backfill-dispatch-auth-grants.mjs');
    const inserts = [];
    let call = 0;
    const fakeSb = {
      from() {
        const b = {
          select() { return b; },
          eq() { return b; },
          maybeSingle() {
            // recordDisposition pre-checks existing: first SD absent, second SD already granted.
            return Promise.resolve({ data: call === 0 ? null : { payload: { status: 'dispositioned', authority: 'backfill-cutover' } }, error: null });
          },
          insert(row) {
            inserts.push(row);
            return { select: () => ({ single: () => { call += 1; return Promise.resolve({ data: row, error: null }); } }) };
          },
        };
        return b;
      },
    };
    // First grant: created. Then simulate second run over an already-granted SD: reused.
    const r1 = await backfill.applyGrants(fakeSb, [{ sd_key: 'SD-NEW-001', status: 'draft' }]);
    expect(r1.created).toBe(1);
    const r2 = await backfill.applyGrants(fakeSb, [{ sd_key: 'SD-NEW-001', status: 'draft' }]);
    expect(r2.reused).toBe(1);
    expect(r2.created).toBe(0);
    expect(inserts[0].payload.authority).toBe('backfill-cutover');
    expect(inserts[0].payload.decision_type).toBe('dispatch_auth');
  });
});
