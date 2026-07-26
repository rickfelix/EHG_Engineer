/**
 * QF-20260726-642 element 5 — the per-session ACCOUNT the chairman named, emitted by
 * server/routes/fleet-panel.js formatSessionRow.
 *
 * The element was dropped originally because the comparison was run against mockup.html, which
 * contains ZERO account references, so nothing ever surfaced it. These tests pin the emit so it
 * cannot silently disappear again.
 *
 * KEY POINT ON NULL: a null account is EXPECTED, not broken. The writer
 * (scripts/hooks/session-register.cjs, QF-20260726-514) stamps at SessionStart with no backfill,
 * so every session predating that merge reports null until it restarts. This layer passes null
 * through honestly and never invents a placeholder — the UI is the only place where "not captured"
 * can be distinguished from "no account".
 */
import { describe, it, expect } from 'vitest';
import { formatSessionRow } from '../../../server/routes/fleet-panel.js';

const baseRow = (metadata) => ({
  session_id: 'sess-1',
  sd_key: null,
  computed_status: 'active',
  heartbeat_age_human: '5s ago',
  metadata,
});

describe('formatSessionRow — account fields (QF-20260726-642 element 5)', () => {
  it('emits the ORG NAME, because the artifact renders a name like "Deep Soul Sessions"', () => {
    const out = formatSessionRow(
      baseRow({ model: 'opus', effort: 'xhigh', account_org_name: 'Deep Soul Sessions', account_email: 'x@y.z' }),
    );
    expect(out.account_org_name).toBe('Deep Soul Sessions');
    expect(out.account_email).toBe('x@y.z');
  });

  it('emits account_email even when no org name exists, so the UI has a fallback', () => {
    const out = formatSessionRow(baseRow({ model: 'opus', effort: 'high', account_email: 'solo@example.com' }));
    expect(out.account_email).toBe('solo@example.com');
    expect(out.account_org_name).toBeNull();
  });

  it('emits NULL (never a placeholder) for a session that predates the account writer', () => {
    const out = formatSessionRow(baseRow({ model: 'opus', effort: 'medium' }));
    expect(out.account_email).toBeNull();
    expect(out.account_org_name).toBeNull();
    // Explicitly present-but-null rather than absent, so the UI can distinguish the states.
    expect('account_email' in out).toBe(true);
    expect('account_org_name' in out).toBe(true);
  });

  it('does NOT confuse the account name with the accountUuid8 fragment', () => {
    const out = formatSessionRow(
      baseRow({
        model: 'opus',
        effort: 'max',
        account_org_name: 'Rick Felix 2000',
        fleet_identity: { callsign: 'Alpha-4', accountUuid8: 'ca1de6e4' },
      }),
    );
    // `account` was never a name — that is why the column looked implemented but wasn't.
    expect(out.account).toBe('ca1de6e4');
    expect(out.account_org_name).toBe('Rick Felix 2000');
    expect(out.account_org_name).not.toBe(out.account);
  });

  it('tolerates a row with no metadata at all without throwing', () => {
    const out = formatSessionRow({ session_id: 's', metadata: null });
    expect(out.account_email).toBeNull();
    expect(out.account_org_name).toBeNull();
  });

  it('leaves the pre-existing emitted fields untouched (no regression from the addition)', () => {
    const out = formatSessionRow(
      baseRow({ model: 'opus', effort: 'medium', fleet_identity: { callsign: 'Bravo', color: '#4fbf7f', role: 'worker' } }),
    );
    expect(out.callsign).toBe('Bravo');
    expect(out.color).toBe('#4fbf7f');
    expect(out.model_effort).toBe('opus/medium');
    expect(out.status).toBe('active');
  });
});
