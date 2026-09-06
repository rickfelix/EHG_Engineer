/**
 * QF-20260903-281 — every role must be able to DRAIN the kinds dispatch lets past backpressure.
 *
 * THE INCIDENT: lib/coordinator/dispatch.cjs privileges six kinds as BACKPRESSURE_EXEMPT precisely
 * because corrections must always get through. Three of the four receiving roles had no lane to
 * surface any of them. On 2026-09-03 a coordinator retraction was delivered 19:12:51 and stamped
 * read 19:15:02, while the advisory it cancelled was read 19:20:56 and acted on — six worker seats
 * throttled on an instruction its author had already withdrawn. A kind that is exempt on send and
 * absent from the receiver's drain set is orphaned by construction, and it carries read_at and
 * acknowledged_at stamps that make it look consumed.
 *
 * WHY EVERY ASSERTION HERE GOES THROUGH resolveRecognizedKinds() AND NEVER A SINGLE SURFACE.
 * The effective set is a UNION: drain-set-registry returns [...new Set([...DRAIN_SETS[role],
 * ...role_drain_sets rows])]. On 2026-09-03 three seats each measured ONE contributing surface and
 * produced three confident, reproducible, mutually contradictory answers within an hour — none of
 * them called the resolver. When a resolver unions N sources, querying any contributing source
 * measures a TERM, not the SUM. A test written against DRAIN_SETS or against the table alone would
 * false-pass or false-fail for exactly that reason.
 */
import { describe, it, expect } from 'vitest';
import { resolveRecognizedKinds } from '../../../lib/fleet/drain-set-registry.js';
import workerStatus from '../../../lib/fleet/worker-status.cjs';

const { BACKPRESSURE_EXEMPT_KINDS } = workerStatus;
const ROLES = ['adam', 'coordinator', 'solomon', 'worker'];

/** Minimal thenable stub matching the registry's .from().select().eq().eq().eq() chain. */
function stubSupabase(rows) {
  const chain = {
    eq: () => chain,
    then: (resolve) => resolve({ data: rows, error: null }),
  };
  return { from: () => ({ select: () => chain }) };
}

describe('QF-20260903-281: backpressure-exempt kinds are drainable by every role', () => {
  it.each(ROLES)('%s resolves all six exempt kinds with no registry available', async (role) => {
    // supabase=null exercises the fail-open floor — the guarantee that must hold even if the
    // table is missing, empty, or unreachable.
    const kinds = await resolveRecognizedKinds({ supabase: null, role });
    for (const kind of BACKPRESSURE_EXEMPT_KINDS) {
      expect(kinds, `role '${role}' cannot drain '${kind}' — dispatch lets it past backpressure, so it would be orphaned on arrival`).toContain(kind);
    }
  });

  it.each(ROLES)('%s still resolves all six when the registry omits them entirely', async (role) => {
    // THE REAL MEASURED CONDITION, not a hypothetical: role_drain_sets held 70 rows on
    // 2026-09-03 and ZERO of these six for ANY role, adam included. The union's floor is the
    // only thing supplying them, so this pins that a stale table cannot regress the guarantee.
    const kinds = await resolveRecognizedKinds({
      supabase: stubSupabase([{ kind: 'coordinator_directive' }, { kind: 'roll_call' }]),
      role,
    });
    for (const kind of BACKPRESSURE_EXEMPT_KINDS) {
      expect(kinds, `role '${role}' lost '${kind}' when the registry did not list it`).toContain(kind);
    }
  });

  it('the registry can still ADD kinds beyond the floor — neither surface may be deleted', async () => {
    // Guards the dangerous cleanup: "the JS constant is authoritative anyway, delete the table"
    // would strip every kind the DB adds. The union is additive by design in BOTH directions.
    const kinds = await resolveRecognizedKinds({
      supabase: stubSupabase([{ kind: 'a_kind_only_the_registry_knows' }]),
      role: 'coordinator',
    });
    expect(kinds).toContain('a_kind_only_the_registry_knows');
    expect(kinds).toContain('retraction'); // floor survives alongside it
  });
});
