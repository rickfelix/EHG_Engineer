/**
 * SD-LEO-INFRA-OWNERSHIP-PRESERVATION-ASSERTION-001 — the consumer wire, asserted TWO-SIDED.
 *
 * ── WHY THIS FILE EXISTS, AND WHY THE OBVIOUS TEST WOULD HAVE BEEN WORTHLESS ────────────────
 * emitBreakageAlert is FAIL-SOFT BY CONTRACT: it catches everything and returns {ok:false}. The
 * fence discards its return value so a broken alert can never corrupt the exit code — which is
 * correct, and which means a wire that throws on EVERY call is COMPLETELY INVISIBLE in the exit
 * code, the only thing every other check here inspects. Both the TESTING and SECURITY sub-agents
 * independently mutated the wire to always-throw and the entire 36,000-test unit project stayed
 * GREEN. "The fence still exits 1" proves nothing about whether anyone was told.
 *
 * So the assertions have to be two-sided about the CALL ITSELF: it FIRES on divergence, and it is
 * SILENT on agreement. One side alone is satisfied by a wire that is stuck on or stuck off.
 *
 * This is only possible because the module now has an entrypoint guard. Before that, main() ran at
 * import and every terminus called process.exit(), so importing the fence would have killed the
 * test runner and every assertion about it had to be a regex over source text.
 */

import { describe, it, expect } from 'vitest';
import { emitDriftAlert } from '../../../scripts/severity-pair-divergence-fence.mjs';

/** Records calls instead of writing. The `deps` seam exists so no live row is ever created here. */
function spy(impl) {
  const calls = [];
  const fn = async (...args) => { calls.push(args); return impl ? impl(...args) : { ok: true, id: 'row-1' }; };
  return { calls, fn };
}

const DIVERGED_RESULT = [{ detail: 'DIVERGENCE: v_x is missing 2 column(s) present on t_x: a, b' }];

describe('the divergence fence tells a consumer', () => {
  it('FIRES on divergence — with the schema-drift break class and the detail', async () => {
    const s = spy();
    await emitDriftAlert(DIVERGED_RESULT, { emitBreakageAlert: s.fn });
    expect(s.calls, 'a divergence that alerts nobody is a detector nobody reads').toHaveLength(1);
    const [breakClass, sourceService, opts] = s.calls[0];
    expect(breakClass, 'the schema-drift class already exists — no new class is minted').toBe('schema-drift');
    expect(sourceService).toBe('divergence-fence');
    expect(opts.message, 'the alert must carry what actually diverged, not just that something did')
      .toMatch(/missing 2 column/);
  });

  it('is SILENT when nothing diverged — the other half, without which stuck-on passes', async () => {
    const s = spy();
    const r = await emitDriftAlert([], { emitBreakageAlert: s.fn });
    expect(s.calls, 'alerting on a healthy run trains every reader to ignore this alert').toHaveLength(0);
    expect(r).toMatchObject({ skipped: 'no_divergence' });
  });

  it('[DEDUP] the UNREADABLE path uses a DISTINCT source_service', async () => {
    // recordSystemAlert dedups on (source_service, break_class, resolved_at IS NULL). A tripped
    // -fence alert sits open almost by definition — the drift it reports is precisely what nobody
    // has fixed yet — so sharing a source_service would let that open row SWALLOW the unreadable
    // alert, and the fix built for the dead-and-invisible mode would itself be invisible.
    const s = spy();
    await emitDriftAlert([{ detail: 'UNREADABLE: no credentials' }], { emitBreakageAlert: s.fn }, 'divergence-fence-unreadable');
    expect(s.calls[0][1]).toBe('divergence-fence-unreadable');
    expect(s.calls[0][1], 'must not collide with the tripped-fence identity').not.toBe('divergence-fence');
  });

  it('a THROWING wire never corrupts the fence — but is still observable HERE', async () => {
    // The fail-soft contract is correct and must be preserved: an alert failure must not turn a
    // readable catalog into an unreadable verdict. The cost is that the exit code cannot witness
    // it, which is exactly why the witness has to live at this level.
    const s = spy(() => { throw new Error('alerting is down'); });
    const r = await emitDriftAlert(DIVERGED_RESULT, { emitBreakageAlert: s.fn });
    expect(s.calls, 'it must still ATTEMPT the call').toHaveLength(1);
    expect(r.ok, 'and report its own failure rather than claiming success').toBe(false);
    expect(r.error).toMatch(/alerting is down/);
  });

  it('[CONTROL] the spy is really injected — no live write can happen in this file', async () => {
    // If the deps seam were ignored, the real emitter would run and these tests would be writing
    // rows to system_alerts on every CI run. The call count IS the proof the seam is honoured.
    const s = spy();
    await emitDriftAlert(DIVERGED_RESULT, { emitBreakageAlert: s.fn });
    await emitDriftAlert(DIVERGED_RESULT, { emitBreakageAlert: s.fn });
    expect(s.calls).toHaveLength(2);
  });
});
