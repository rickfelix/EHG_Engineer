/**
 * QF-20260727-380 — an advisory must never read ACTIONED when its reply was dropped.
 *
 * Two independent defects, both covered here:
 *   (A) ORDERING: coordinator-ack-adam.cjs stamped payload.actioned_at BEFORE attempting the reply,
 *       so a failed reply retired the advisory with the response body discarded. Every downstream
 *       gauge then read clean while a ~2000-char substantive answer was gone (live, 2026-07-27).
 *   (B) SCOPE: a non-UUID sender_session (e.g. 'adam-coordinator-health-cron', or null) was refused
 *       outright, making cron-emitted advisories structurally unrepliable — ~15% of a 500-row sample.
 *
 * These are behavioural contracts on the SEQUENCE and the TARGET RESOLUTION, so the test asserts
 * the source ordering and the guard's subject rather than shelling out to the live CLI (which needs
 * a coordinator session, a live Adam and real credentials).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.resolve(__dirname, '../../scripts/coordinator-ack-adam.cjs'), 'utf8');

const idx = (needle) => SRC.indexOf(needle);

describe('QF-20260727-380 (A): deliver the reply before retiring the advisory', () => {
  it('calls deliverReplyOrExit BEFORE stampActionedGroup', () => {
    const deliverCall = idx('await deliverReplyOrExit(supabase');
    const stampCall = idx('await stampActionedGroup(supabase');
    expect(deliverCall).toBeGreaterThan(-1);
    expect(stampCall).toBeGreaterThan(-1);
    // The whole point of the fix: a failed reply must exit before anything is retired.
    expect(deliverCall).toBeLessThan(stampCall);
  });

  it('every FATAL branch in the delivery helper exits non-zero', () => {
    const helper = SRC.slice(idx('async function deliverReplyOrExit'), idx('async function main()'));
    // Distinguish fatal errors from the one non-fatal WARN: a stuck-inbound recovery failure must
    // NOT abort a reply that can still be delivered — recovery is best-effort and reported.
    const fatalLines = helper.split('\n')
      .filter((l) => l.includes('console.error(') && !l.includes('WARN:'));
    const warnLines = helper.split('\n')
      .filter((l) => l.includes('console.error(') && l.includes('WARN:'));
    const exits = helper.split('\n').filter((l) => l.includes('process.exit('));

    expect(fatalLines.length).toBeGreaterThan(0);
    expect(warnLines.length).toBe(1);              // the recovery warning, deliberately non-fatal
    expect(exits.length).toBe(fatalLines.length);  // one exit per fatal branch, no more, no fewer
    // And none of them exit 0 — a dropped reply is never a success.
    expect(helper).not.toMatch(/process\.exit\(0\)/);
  });

  it('states in the failure text that the advisory was NOT actioned, so the operator can retry', () => {
    const helper = SRC.slice(idx('async function deliverReplyOrExit'), idx('async function main()'));
    expect(helper).toMatch(/NOT actioned/i);
  });
});

describe('QF-20260727-380 (B): a non-UUID sender is resolved by role, not refused', () => {
  it('validates the RESOLVED target, never the raw originator', () => {
    const helper = SRC.slice(idx('async function deliverReplyOrExit'), idx('async function main()'));
    // The resolved live-Adam target is what must be UUID-checked.
    expect(helper).toMatch(/isFullUuid\(adamSession\)/);
    // The old guard — refusing on the originator — must be gone from the reply path.
    expect(helper).not.toMatch(/if\s*\(!isFullUuid\(originator\)\)\s*\{\s*console\.error\('ERROR: advisory sender_session is not a full UUID'/);
  });

  it('resolves the target before checking it, so a cron sender can still be answered', () => {
    const helper = SRC.slice(idx('async function deliverReplyOrExit'), idx('async function main()'));
    expect(idx('async function deliverReplyOrExit')).toBeGreaterThan(-1);
    expect(helper.indexOf('resolveAdamReplyTarget')).toBeLessThan(helper.indexOf('isFullUuid(adamSession)'));
  });

  it('only attempts stuck-inbound recovery for a real session id', () => {
    const helper = SRC.slice(idx('async function deliverReplyOrExit'), idx('async function main()'));
    // A cron sender string was never a deliverable target, so there is nothing stuck at it.
    const recoveryIdx = helper.indexOf('retargetStaleAdamInbound');
    const guardIdx = helper.indexOf('if (isFullUuid(originator))');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(recoveryIdx);
  });

  it('does NOT widen coordinator-reply to accept a non-UUID target (the named wrong fix)', () => {
    // The QF is explicit: writing a row nothing can deliver converts a loud refusal into a silent
    // drop. coordinator-ack-adam must not relax the target contract, only resolve a better target.
    const replySrc = readFileSync(path.resolve(__dirname, '../../scripts/coordinator-reply.cjs'), 'utf8');
    expect(replySrc).toMatch(/isFullUuid|FULL_UUID_RE|assertValidTarget/);
  });
});

describe('unchanged paths', () => {
  it('the reply-less ack still stamps without any delivery attempt', () => {
    // deliverReplyOrExit is gated on wantsReply — a bare --advisory ack must not enter it.
    expect(SRC).toMatch(/if \(wantsReply && twoWayEnabled\)/);
  });

  it('COORDINATOR_TWOWAY_V2=off still actions the advisory and exits 0', () => {
    expect(SRC).toMatch(/--reply skipped — COORDINATOR_TWOWAY_V2 is OFF \(advisory was still actioned\)/);
  });
});
