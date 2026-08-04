/**
 * SD-LEO-INFRA-ROLE-BLIND-SESSION-001 FR-4 — the SET_IDENTITY receiver guard.
 *
 * The sending side already refuses to hand a NATO callsign to a role seat. A guard on only one
 * side is satisfied by any caller that skips that side, which is how a role session ended up
 * wearing a worker callsign.
 *
 * The damage is not cosmetic: the SET_IDENTITY handler REPLACES the identity file wholesale, and
 * the file it clobbers is the one writeRoleStatusIdentity wrote with `role: true` — the same
 * marker FR-2's stop hook reads. An unguarded write silently un-does FR-2 for that seat and burns
 * one of the 8 claim-gated NATO names on a session that will never hold a claim.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { setIdentityRefusalReason } = require_('../../../scripts/hooks/coordination-inbox.cjs');
const { writeRoleStatusIdentity } = require_('../../../lib/fleet/role-status-identity.cjs');

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'setid-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('FR-4 SET_IDENTITY refusal', () => {
  it('REFUSES a write onto a solomon seat, and names why', () => {
    writeRoleStatusIdentity({ sessionId: 'sess-solomon', role: 'solomon', dir });
    const reason = setIdentityRefusalReason('sess-solomon', dir);
    expect(reason).toBeTruthy();
    expect(reason).toMatch(/role session/);
    expect(reason).toMatch(/Solomon/);        // names the seat it is protecting
  });

  it('REFUSES on an adam seat too — two roles, so the guard is not keyed to one name', () => {
    writeRoleStatusIdentity({ sessionId: 'sess-adam', role: 'adam', dir });
    expect(setIdentityRefusalReason('sess-adam', dir)).toBeTruthy();
  });

  it('TWO-SIDED: ALLOWS the write for a worker seat', () => {
    // The half that matters. A guard that refuses everything would pass every role-side
    // assertion above while breaking callsign assignment for the entire fleet.
    writeFileSync(join(dir, 'fleet-identity-sess-worker.json'), JSON.stringify({ callsign: 'Alpha' }));
    expect(setIdentityRefusalReason('sess-worker', dir)).toBeNull();
  });

  it('ALLOWS the write when no identity file exists yet — the first assignment must land', () => {
    // A brand-new worker has no file. Refusing here would mean no worker ever gets a callsign.
    expect(setIdentityRefusalReason('sess-brandnew', dir)).toBeNull();
  });

  it('ALLOWS on a malformed/unreadable file — fail-open preserves pre-SD behaviour', () => {
    writeFileSync(join(dir, 'fleet-identity-sess-bad.json'), '{not json');
    expect(setIdentityRefusalReason('sess-bad', dir)).toBeNull();
  });

  it('the guard protects the exact marker FR-2 depends on', () => {
    // Ties the two FRs together explicitly: what makes this refusal load-bearing is that the file
    // being defended carries role:true, which the stop hook reads to pick its text.
    writeRoleStatusIdentity({ sessionId: 'sess-link', role: 'coordinator', dir });
    const rp = require_('../../../lib/fleet/role-status-identity.cjs');
    expect(rp.verdictFromIdentityFile(rp.readIdentityFile('sess-link', dir))).toBe(rp.ROLE_VERDICT.ROLE);
    expect(setIdentityRefusalReason('sess-link', dir)).toBeTruthy();
  });

  it('CONTROL: role and worker seats produce DIFFERENT verdicts from the same function', () => {
    // Without this, every assertion above is satisfied by a function that always returns null
    // (allow-everything) or always returns a string (refuse-everything).
    writeRoleStatusIdentity({ sessionId: 'r', role: 'solomon', dir });
    writeFileSync(join(dir, 'fleet-identity-w.json'), JSON.stringify({ callsign: 'Bravo' }));
    const roleVerdict = setIdentityRefusalReason('r', dir);
    const workerVerdict = setIdentityRefusalReason('w', dir);
    expect(roleVerdict).toBeTruthy();
    expect(workerVerdict).toBeNull();
    expect(roleVerdict).not.toBe(workerVerdict);
  });
});
