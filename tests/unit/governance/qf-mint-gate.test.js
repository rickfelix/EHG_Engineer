// GSB-B — the QF-side demand gate. SD-LEO-INFRA-GATE-SIDE-BELT-001, TS-4/TS-6/TS-7/TS-8.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import {
  openQfMintGate, gatedQfMint, FINGERPRINT_PROMOTER_ENGINE, RETRO_ACTION_PROMOTER_ENGINE,
} from '../../../lib/governance/qf-mint-gate.mjs';
import { BELT_DEPTH_GATED_PRODUCERS, DEMAND_DECISION } from '../../../lib/governance/demand-gate.js';
const require = createRequire(import.meta.url);
const { countClaimableQuickFixes } = require('../../../lib/fleet/belt-depth.cjs');

// DEMAND_DECISION values are LOWERCASE ('sourced' / 'withheld' / 'unmeasurable'). Imported rather
// than spelled out: the first draft of this file hand-wrote 'SOURCED' and mayProduce silently
// returned false, so the SOURCED arm asserted withheld behaviour and looked like a code defect.
// A constant is a claim about the consumer — import it, do not retype it.
const decision = (d) => ({ decision: d, gauge_value: 1, floor: 3, measured_at: '2026-08-03T00:00:00Z', engine: 'x' });
const noop = () => {};

describe('TS-4 — a WITHHELD decision prevents minting; a SOURCED one does not', () => {
  // BOTH ARMS IN ONE SCENARIO. A suite whose every arm expects the same verdict is satisfied by a
  // constant function — a gate that always withholds and a gate that never withholds would each
  // pass a single-arm suite.
  it('withheld => mint never runs; sourced => mint runs — same harness, opposite outcomes', async () => {
    let mintCalls = 0;
    const mint = async () => { mintCalls += 1; return 7; };
    const base = { engine: 'e', gauge: async () => 0, record: async () => {}, log: noop };

    const withheld = await gatedQfMint({}, { ...base, measure: async () => decision(DEMAND_DECISION.WITHHELD) }, mint);
    expect(withheld.withheldByDemand).toBe(true);
    expect(withheld.minted).toBe(0);
    expect(mintCalls).toBe(0);

    const sourced = await gatedQfMint({}, { ...base, measure: async () => decision(DEMAND_DECISION.SOURCED) }, mint);
    expect(sourced.withheldByDemand).toBe(false);
    expect(sourced.minted).toBe(7);
    expect(mintCalls).toBe(1);
  });

  it('records and prints the decision EVEN WHEN WITHHELD', async () => {
    // A withheld run leaving no audit_log row is indistinguishable from a dead cron, which is the
    // exact ambiguity this mechanism exists to remove.
    let recorded = null; let printed = null;
    await gatedQfMint({}, {
      engine: 'e', gauge: async () => 0, measure: async () => decision(DEMAND_DECISION.WITHHELD),
      record: async (_sb, d) => { recorded = d; }, log: (m) => { printed = m; },
    }, async () => 1);
    expect(recorded).toBeTruthy();
    expect(recorded.decision).toBe(DEMAND_DECISION.WITHHELD);
    expect(printed).toMatch(/demand-gate/);
  });

  it('THROWS on a malformed decision rather than minting ungated', async () => {
    await expect(gatedQfMint({}, {
      engine: 'e', gauge: async () => 0, measure: async () => ({ nonsense: true }),
      record: async () => {}, log: noop,
    }, async () => 1)).rejects.toThrow(/malformed/);
  });

  it('THROWS when no engine is named — an unnamed producer renders NEVER RAN forever', async () => {
    await expect(openQfMintGate({}, { measure: async () => decision(DEMAND_DECISION.SOURCED), record: async () => {}, log: noop }))
      .rejects.toThrow(/engine is required/);
  });
});

describe('TS-6 — the QF gauge is asserted by IDENTITY, not by outcome', () => {
  // OUTCOME CANNOT DISCRIMINATE HERE. Live, the QF reading (145) and the SD reading (21) are BOTH
  // above the floor (3), so a silent fallback to the default SD gauge produces exactly the same
  // WITHHELD verdict as the correct wiring. An outcome-only assertion would pass on the broken code.
  // So the test inspects WHICH FUNCTION reaches measureDemand.
  it('defaults to countClaimableQuickFixes, not the SD-side gauge', async () => {
    let seenGauge = null;
    await openQfMintGate({}, {
      engine: 'e',
      measure: async (_sb, opts) => { seenGauge = opts.gauge; return decision(DEMAND_DECISION.SOURCED); },
      record: async () => {}, log: noop,
    });
    expect(seenGauge).toBe(countClaimableQuickFixes);
  });

  it('passes the resolved floor through', async () => {
    let seenFloor = null;
    await openQfMintGate({}, {
      engine: 'e', env: { BELT_DEMAND_FLOOR: '42' },
      measure: async (_sb, opts) => { seenFloor = opts.floor; return decision(DEMAND_DECISION.SOURCED); },
      record: async () => {}, log: noop,
    });
    expect(seenFloor).toBe(42);
  });
});

describe('TS-7 — both producers are registered under the SAME names they use', () => {
  // A name constant that drifts from its registry entry does not fail loudly: the startup badge
  // simply renders NEVER RAN forever, which reads identically to a producer that has not fired yet.
  it('each exported engine constant is in BELT_DEPTH_GATED_PRODUCERS', () => {
    expect(BELT_DEPTH_GATED_PRODUCERS).toContain(FINGERPRINT_PROMOTER_ENGINE);
    expect(BELT_DEPTH_GATED_PRODUCERS).toContain(RETRO_ACTION_PROMOTER_ENGINE);
  });
  it('the two QF engines are distinct from each other and from the SD-side pair', () => {
    expect(FINGERPRINT_PROMOTER_ENGINE).not.toBe(RETRO_ACTION_PROMOTER_ENGINE);
    expect([FINGERPRINT_PROMOTER_ENGINE, RETRO_ACTION_PROMOTER_ENGINE])
      .not.toContain('refill-auto-promote');
  });
});

describe('TS-8 — the gate is wired at BOTH call sites, and encloses the spawn', () => {
  // Source assertions, deliberately narrow: they cannot see control flow (which is why the seam
  // exists), but they CAN see that a call site was deleted — the mutant that matters most here.
  const read = (p) => require('node:fs').readFileSync(require.resolve(p), 'utf8');
  it.each([
    ['../../../scripts/feedback-fingerprint-promoter.mjs', 'FINGERPRINT_PROMOTER_ENGINE'],
    ['../../../scripts/promote-retro-action-items.mjs', 'RETRO_ACTION_PROMOTER_ENGINE'],
  ])('%s calls gatedQfMint with its own engine constant', (path, konst) => {
    const src = read(path);
    // BIND THE CONSTANT INTO THE CALL, not merely into the file. The first version asserted
    // toContain(konst), which the surviving IMPORT line satisfies — so replacing the constant at
    // the CALL SITE with a hard-coded literal (cross-wiring one minter to the other's engine name)
    // survived all 2961 tests. Found by TESTING at EXEC-TO-PLAN. That is precisely the failure
    // qf-mint-gate.mjs:36-43 says these constants exist to prevent: a wrong engine name does not
    // error, it renders NEVER RAN on the badge forever, indistinguishable from a producer that has
    // simply not fired yet.
    expect(src).toMatch(new RegExp(`gatedQfMint\\(supabase,\\s*\\{\\s*engine:\\s*${konst}\\s*\\},\\s*promoteAll\\)`));
    // And no gauge override may be slipped in alongside it — the brace body must contain ONLY the
    // engine, or a call site could silently re-point itself at the SD gauge and pass TS-6 too.
    expect(src).not.toMatch(/gatedQfMint\(supabase,\s*\{[^}]*gauge:/);
  });

  it('create-quick-fix.js is NOT gated — the shared boundary stays open to humans', () => {
    const src = read('../../../scripts/create-quick-fix.js');
    expect(src).not.toMatch(/qf-mint-gate|gatedQfMint|openQfMintGate/);
  });
});
