/**
 * SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-B / FR-1
 *
 * lib/coordinator/chairman-directive-gauge.cjs — the per-role chairman-directive ack/compliance gauge.
 * decideChairmanDirectiveCompliance() is a PURE core (zero IO, injected now/windowMs) that, per
 * directive_id, keeps only the latest issued_at (SUPERSEDES) and reports each applies_to role as
 * ACKED (has a chairman_directive_ack with actioned_at) vs OUTSTANDING.
 */
import { describe, it, expect } from 'vitest';
import { decideChairmanDirectiveCompliance } from '../chairman-directive-gauge.cjs';

const NOW = Date.parse('2026-07-02T00:00:00Z');

function directive({ id, issuedAt, roles }) {
  return { payload: { kind: 'chairman_directive', directive_id: id, issued_at: issuedAt, applies_to: roles } };
}
function ack({ id, role, actionedAt }) {
  return { payload: { kind: 'chairman_directive_ack', directive_id: id, role, actioned_at: actionedAt } };
}

describe('decideChairmanDirectiveCompliance', () => {
  it('(a) all applies_to roles OUTSTANDING when there are no acks', () => {
    const directives = [directive({ id: 'd1', issuedAt: '2026-07-01T23:55:00Z', roles: ['adam', 'coordinator', 'solomon'] })];
    const rows = decideChairmanDirectiveCompliance({ directives, acks: [], now: NOW });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === 'outstanding')).toBe(true);
    expect(rows.map((r) => r.role).sort()).toEqual(['adam', 'coordinator', 'solomon']);
    // ageMs is measured from issued_at
    expect(rows[0].ageMs).toBe(NOW - Date.parse('2026-07-01T23:55:00Z'));
  });

  it('(b) a role flips ACKED after an ack row carrying actioned_at; the others stay OUTSTANDING', () => {
    const directives = [directive({ id: 'd1', issuedAt: '2026-07-01T23:55:00Z', roles: ['adam', 'coordinator', 'solomon'] })];
    const acks = [ack({ id: 'd1', role: 'solomon', actionedAt: '2026-07-01T23:58:00Z' })];
    const rows = decideChairmanDirectiveCompliance({ directives, acks, now: NOW });
    const byRole = Object.fromEntries(rows.map((r) => [r.role, r]));
    expect(byRole.solomon.status).toBe('acked');
    expect(byRole.solomon.ackedAt).toBe('2026-07-01T23:58:00Z');
    expect(byRole.adam.status).toBe('outstanding');
    expect(byRole.coordinator.status).toBe('outstanding');
  });

  it('an ack row WITHOUT actioned_at does NOT flip the role to ACKED (two-stage: DELIVERED != ACTIONED)', () => {
    const directives = [directive({ id: 'd1', issuedAt: '2026-07-01T23:55:00Z', roles: ['adam'] })];
    const acks = [{ payload: { kind: 'chairman_directive_ack', directive_id: 'd1', role: 'adam' } }]; // no actioned_at
    const rows = decideChairmanDirectiveCompliance({ directives, acks, now: NOW });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('outstanding');
  });

  it('(c) SUPERSEDES — the NEWER issued_at directive for the same directive_id is tracked; the stale one is not counted', () => {
    // Chairman reversed effort low->high->low: same directive_id, three issuances, newest is 'solomon'-only.
    const directives = [
      directive({ id: 'baseline', issuedAt: '2026-07-01T22:00:00Z', roles: ['adam', 'coordinator', 'solomon'] }), // stale low
      directive({ id: 'baseline', issuedAt: '2026-07-01T22:30:00Z', roles: ['adam', 'coordinator', 'solomon'] }), // stale high
      directive({ id: 'baseline', issuedAt: '2026-07-01T23:00:00Z', roles: ['solomon'] }),                        // NEWEST low
    ];
    const rows = decideChairmanDirectiveCompliance({ directives, acks: [], now: NOW });
    // Only the newest directive is tracked → exactly its applies_to (['solomon']), not the stale ['adam','coordinator','solomon'].
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('solomon');
    expect(rows[0].issuedAt).toBe('2026-07-01T23:00:00Z');
    expect(rows[0].status).toBe('outstanding');
  });

  it('SUPERSEDES is directive_id-scoped: two distinct directive_ids are both tracked independently', () => {
    const directives = [
      directive({ id: 'd1', issuedAt: '2026-07-01T23:00:00Z', roles: ['adam'] }),
      directive({ id: 'd2', issuedAt: '2026-07-01T23:10:00Z', roles: ['solomon'] }),
    ];
    const rows = decideChairmanDirectiveCompliance({ directives, acks: [], now: NOW });
    expect(rows.map((r) => r.directiveId).sort()).toEqual(['d1', 'd2']);
  });
});
