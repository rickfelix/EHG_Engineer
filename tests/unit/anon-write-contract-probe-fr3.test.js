/**
 * FR-3 starvation-coupling acceptance. SD-LEO-FIX-POINT-STARVATION-COUPLING-001.
 *
 * NO DATABASE, for the reason the sibling suite states: the vitest `db` project on this repo has an
 * empty DESIGNATED_NON_PROD_REFS, so anything placed there SKIPS AND REPORTS GREEN. A live-tier test
 * of this invariant would be permanently, silently inert — weaker than a fake-client test that runs.
 *
 * WHAT THIS SUITE IS FOR, and why it drives main() rather than the assertion function: the defect
 * this SD removes is a verdict that is computed correctly and then reaches nothing. `res.bound` was
 * assigned, printed, and never folded into the exit code. So every acceptance below asserts THE
 * EXIT CODE main() RETURNS — deleting the fold in probeTable turns these red, whereas a test of
 * assertIngressBoundCannotBind alone would stay green through exactly the bug that mattered.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(import.meta.dirname, '..', '..');
const PROBE = join(REPO, 'scripts', 'anon-write-contract-probe.mjs');

// The seam is the client factory. Every test swaps `currentQ` and drives the real main().
let currentQ = null;
vi.mock('../../scripts/lib/supabase-connection.js', () => ({
  createDatabaseClient: async () => ({
    query: (sql, params) => currentQ(sql, params),
    end: async () => {}
  })
}));

const { main, EXIT, assertIngressBoundCannotBind, boundExitCode } =
  await import('../../scripts/anon-write-contract-probe.mjs');

/**
 * A fake of the QUERY FUNCTION, not of a pg client — the same choice the sibling suite's mkQ makes,
 * because it lets a test assert what was NOT sent as well as what was.
 *
 * HEALTHY DEFAULTS ARE THE LIVE MEASUREMENT: as postgres the true count is 8; as anon the DIRECT
 * count is 0 and the count VIA THE DEFINER is 8. Every hazard below is one field off this baseline,
 * so a failure names the hazard rather than the fixture.
 */
const mkQ = (over = {}) => {
  const cfg = {
    ownerCount: 8,
    anonDirect: 0,
    anonViaDefiner: 8,
    withCheck: '(public.fn_anon_ingress_prior_hour_count((source_type)::text) < 50)',
    prosecdef: true,
    definerOwner: 'postgres',
    definerThrows: null,
    ...over
  };
  const issued = [];
  let asAnon = false;
  const q = async (sql, params) => {
    const s = String(sql);
    issued.push(s);
    if (/set local role anon/i.test(s)) { asAnon = true; return { rows: [] }; }
    if (/reset role/i.test(s)) { asAnon = false; return { rows: [] }; }
    if (/^\s*(BEGIN|set local|savepoint|rollback|release)/i.test(s)) return { rows: [] };
    if (/in_tx/.test(s)) return { rows: [{ in_tx: true }] };
    if (/from pg_policies/i.test(s)) return { rows: [{ permissive: 'RESTRICTIVE', qual: '', with_check: cfg.withCheck }] };
    if (/from ventures v/i.test(s)) return { rows: [{ id: 'v1' }] };
    if (/to_regprocedure/i.test(s)) return { rows: [{ prosecdef: cfg.prosecdef, owner: cfg.definerOwner }] };
    if (/fn_anon_ingress_prior_hour_count\(\$1\)/i.test(s)) {
      if (cfg.definerThrows) { const e = new Error(cfg.definerThrows); e.code = '42501'; throw e; }
      return { rows: [{ n: cfg.anonViaDefiner }] };
    }
    if (/count\(\*\)::int as n/i.test(s)) {
      if (params?.[0] === 'telegram') return { rows: [{ n: 0 }] };   // control-source headroom check
      return { rows: [{ n: asAnon ? cfg.anonDirect : cfg.ownerCount }] };
    }
    if (/current_user::text/.test(s)) {
      return { rows: [{ usr: 'anon', bypass: false, rowsec: 'on', active: true, relrls: true, pid: 7, port: 5432 }] };
    }
    if (/pg_backend_pid\(\) as pid/.test(s)) return { rows: [{ pid: 7 }] };
    if (/^\s*insert into/i.test(s)) {
      // Exactly the live contract, so cmp.ok is TRUE in every case below and the ONLY thing that can
      // move the exit code is the FR-3 fold. A fixture whose forms already diverge would prove nothing.
      const refused = /returning id, title/.test(s) || /on conflict \(id\) do nothing/.test(s) || /do update/.test(s);
      if (refused) { const e = new Error('denied'); e.code = '42501'; throw e; }
      return { rows: [] };
    }
    return { rows: [] };
  };
  return { q, issued, cfg };
};

const runMain = async (over) => {
  const { q, issued } = mkQ(over);
  currentQ = q;
  const code = await main(['--table', 'public.feedback']);
  return { code, issued };
};

beforeEach(() => { currentQ = null; });

describe('FR-3 — the invariant is a PAIR, and it reaches the exit code', () => {
  it('healthy posture: the definer sees the true count, anon does not, and the run is GREEN', async () => {
    const { code } = await runMain();
    expect(code).toBe(EXIT.OK);
  });

  // Hazard path 1 (DOMINANT) and 2: ALTER FUNCTION OWNER to a non-bypassing role, or a BODY rewrite.
  // Both surface identically — the definer stops returning the true count.
  it('FIRES when the definer no longer ignores caller visibility (owner change / body rewrite)', async () => {
    const { code } = await runMain({ anonViaDefiner: 0 });
    expect(code).toBe(EXIT.CONTRACT_CHANGED);
  });

  // Hazard path 3: the policy re-inlines the count, which then runs as the INSERTING role. The
  // function itself can stay untouched and SECURITY DEFINER while the hazard is fully back — this is
  // the path that made retiring compareCountVisibility contingent, so it is asserted here.
  it('FIRES when the policy re-inlines the count, even with the function untouched', async () => {
    const { code } = await runMain({
      withCheck: '((select count(*) from feedback f where f.source_type = source_type) < 50)'
    });
    expect(code).toBe(EXIT.CONTRACT_CHANGED);
  });

  // Hazard path 4: REVOKE EXECUTE from anon, precedented by 20260603_03 across ~112 secdef functions.
  // Fail-closed rather than starvation — but invisible to any flag, and it must never read as a pass.
  it('reports INCONCLUSIVE, never OK, when the definer count is unreadable as anon', async () => {
    const { code } = await runMain({ definerThrows: 'permission denied for function' });
    expect(code).toBe(EXIT.PROBE_INCONCLUSIVE);
    expect(code).not.toBe(EXIT.OK);
  });

  /**
   * THE SECOND HALF OF THE PAIR. The equality alone is satisfied by a globally-inert RLS — this
   * probe's own most-guarded failure. Here the definer still agrees with the true count (8 === 8),
   * so a single-equality check would report AGREES, while anon's DIRECT count is also 8: RLS is not
   * actually filtering anything and the equality means nothing. Deleting the `rlsInForce` conjunct
   * turns this test, and only this test, green-to-red.
   */
  it('does NOT pass on an inert RLS, even though the equality itself holds', async () => {
    const { code } = await runMain({ anonDirect: 8, anonViaDefiner: 8, ownerCount: 8 });
    expect(code).toBe(EXIT.CONTRACT_CHANGED);
  });

  it('stays quiet on a quiet hour: too few rows is VACUOUS, which is neither a pass nor a failure', async () => {
    const { code } = await runMain({ ownerCount: 1, anonDirect: 0, anonViaDefiner: 1 });
    expect(code).toBe(EXIT.OK);
  });
});

/**
 * THE NEGATIVE CONTROL, and the reason this SD exists.
 *
 * The remedy first ratified for this SD watched TWO POSTURE FLAGS: prosecdef, and
 * relforcerowsecurity on feedback. relforcerowsecurity was REFUTED as a hazard flag — postgres holds
 * rolbypassrls and BYPASSRLS is checked BEFORE the owner/FORCE test, proven by natural experiment on
 * live prod with zero DDL (ai_gen_provenance and ai_gen_dwell_tracking both carry
 * relforcerowsecurity=true and are postgres-owned, yet row_security_active() is FALSE for postgres on
 * both). A comparator on that flag would have DIVERGED ON A HARMLESS FLIP — the wolf-cry back in a
 * new costume, which is the exact defect this SD removes.
 *
 * So the false positive that was caught becomes the control that proves it was removed.
 */
describe('FR-3 negative control — a flag is never a pass condition', () => {
  it('relforcerowsecurity is not read anywhere in the probe, so it cannot gate anything', () => {
    const code = readFileSync(PROBE, 'utf8')
      .split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
    expect(code).not.toMatch(/relforcerowsecurity/);
  });

  it('a prosecdef=false diagnostic does NOT redden a behaviourally healthy posture', async () => {
    const { code } = await runMain({ prosecdef: false });
    expect(code).toBe(EXIT.OK);
  });

  it('a prosecdef=true diagnostic does NOT rescue a behaviourally broken one', async () => {
    const { code } = await runMain({ prosecdef: true, anonViaDefiner: 0 });
    expect(code).toBe(EXIT.CONTRACT_CHANGED);
  });
});

describe('the catalog read is qualified', () => {
  it('resolves the function by signature, never by a bare proname', async () => {
    const { issued } = await runMain();
    const lookup = issued.find((s) => /pg_proc/.test(s));
    expect(lookup).toBeTruthy();
    // A bare `where proname = '...'` has neither namespace nor signature: one row today, two the
    // moment anyone adds an overload, and the probe would silently read whichever came back first.
    expect(lookup).toMatch(/to_regprocedure/);
    expect(lookup).not.toMatch(/proname\s*=/);
  });

  it('asks for the function by its fully-qualified name WITH argument types', async () => {
    const { issued } = await runMain();
    expect(issued.some((s) => /fn_anon_ingress_prior_hour_count\(\$1\)/.test(s))).toBe(true);
  });
});

describe('boundExitCode — the fold, stated once and unit-pinned', () => {
  it('maps DIVERGED to a failing code and UNREADABLE to inconclusive', () => {
    expect(boundExitCode({ applicable: true, verdict: 'DIVERGED' })).toBe(EXIT.CONTRACT_CHANGED);
    expect(boundExitCode({ applicable: true, verdict: 'UNREADABLE' })).toBe(EXIT.PROBE_INCONCLUSIVE);
    expect(boundExitCode({ applicable: true, verdict: 'AGREES' })).toBe(EXIT.OK);
    expect(boundExitCode({ applicable: true, verdict: 'VACUOUS' })).toBe(EXIT.OK);
  });

  it('an absent policy is benign, but a measurement that THREW is not', () => {
    expect(boundExitCode({ applicable: false, note: 'policy absent' })).toBe(EXIT.OK);
    // Both shapes carry applicable:false. Without the `errored` flag a thrown measurement is
    // indistinguishable from "already remediated" and exits 0 — the print-only defect one level up.
    expect(boundExitCode({ applicable: false, errored: true, note: 'not measurable: boom' }))
      .toBe(EXIT.PROBE_INCONCLUSIVE);
  });
});

describe('assertIngressBoundCannotBind — the anon window is left exactly as it was found', () => {
  it('restores the role and unwinds the savepoint even when the definer call throws', async () => {
    const { q, issued } = mkQ({ definerThrows: 'permission denied for function' });
    const r = await assertIngressBoundCannotBind(q, 'public.feedback', 'manual_feedback');
    expect(r.verdict).toBe('UNREADABLE');
    // The nested savepoint is load-bearing: a throw aborts the transaction, so without it BOTH the
    // role reset and the outer unwind would themselves fail and a detectable hazard would surface as
    // a probe crash instead. Assert the recovery actually ran.
    expect(issued.some((s) => /rollback to savepoint sp_definer/i.test(s))).toBe(true);
    expect(issued.some((s) => /reset role/i.test(s))).toBe(true);
    expect(issued.some((s) => /rollback to savepoint sp_bound/i.test(s))).toBe(true);
  });

  it('carries the dissolution and refutation citations in the module contract (binding condition B)', () => {
    const src = readFileSync(PROBE, 'utf8');
    expect(src).toMatch(/SD-LEO-FIX-POINT-STARVATION-COUPLING-001/);
    expect(src).toMatch(/validation_refutation_20260807/);
    expect(src).toMatch(/ai_gen_provenance/);          // the natural experiment, named where it is used
    expect(src).toMatch(/rolbypassrls/);               // why the FORCE flag was refuted
  });
});
