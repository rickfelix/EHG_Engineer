/**
 * QF-20260704-051 — fleet-dashboard.cjs now calls computeClaimableLeaves() on every render to
 * source the AVAILABLE FOR CLAIM headline count (instead of a divergent naive status filter).
 * That function previously logged a console.log line per skipped SD unconditionally, which
 * would spam stdout on every dashboard render. The new `{quiet:true}` option silences that
 * logging without changing the computed claimable set — these tests pin both properties.
 */
import { describe, it, expect, vi } from 'vitest';
import { computeClaimableLeaves } from '../../scripts/coordinator-backlog-rank.mjs';

/** Minimal fake sb supporting the two query shapes computeClaimableLeaves issues. */
function fakeSb(rows) {
  return {
    from() {
      return {
        select() {
          return {
            not: () => Promise.resolve({ data: rows, error: null }),
            in: () => Promise.resolve({ data: [], error: null }),
          };
        },
      };
    },
  };
}

const rows = [
  { sd_key: 'SD-CLEAN-A', sd_type: 'infrastructure', status: 'draft', current_phase: 'LEAD', claiming_session_id: null, metadata: {}, dependencies: null },
  { sd_key: 'SD-RHA', sd_type: 'infrastructure', status: 'draft', current_phase: 'LEAD', claiming_session_id: null, metadata: { requires_human_action: true }, dependencies: null },
];

describe('computeClaimableLeaves — quiet option (QF-20260704-051)', () => {
  it('quiet:true suppresses every console.log call the function makes', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await computeClaimableLeaves(fakeSb(rows), { quiet: true });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('default (no opts) behavior is unchanged — it still logs skip reasons', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await computeClaimableLeaves(fakeSb(rows));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('quiet mode computes the IDENTICAL claimable set as loud mode', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const loud = await computeClaimableLeaves(fakeSb(rows));
    const quiet = await computeClaimableLeaves(fakeSb(rows), { quiet: true });
    spy.mockRestore();

    const loudKeys = loud.claimable.map((d) => d.sd_key);
    const quietKeys = quiet.claimable.map((d) => d.sd_key);
    expect(quietKeys).toEqual(loudKeys);
    expect(quietKeys).toEqual(['SD-CLEAN-A']); // SD-RHA excluded (requires_human_action)
  });
});
