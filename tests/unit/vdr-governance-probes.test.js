/**
 * SD-LEO-INFRA-V1-GOV-PROBES-001 (FR-3) — adversarial tests for the 5 V1 governance-cluster probes.
 *
 * These tests are NOT green-by-construction: each probe is fed DIFFERENT live signals and the
 * capability score is asserted to CHANGE across built/partial/unbuilt/unknown. They also pin the
 * registry WIRING (probe.code / probe.path / probe.pattern) so a wrong-KR or wrong-path edit fails,
 * and they enforce the coherence INVARIANT that the criteria rows (denominator) and VDR_REGISTRY
 * entries (numerator) must stay 1:1 or the WHOLE gauge withholds (the atomic-PR guard). All IO is
 * injected — no real DB, FS, or git.
 */
import { describe, it, expect } from 'vitest';
import { VDR_REGISTRY, assertRegistryCoherence, computeBuildGauge } from '../../lib/vision/vdr-registry.js';
import { runProbe } from '../../lib/vision/vdr-probes.js';

const GOV_CAPS = [
  'Govern-by-exception',
  'Decision Filter Engine',
  'Governance cascade enforced',
  'OKR-driven prioritization + day-28 hard stop',
  'All 7 governance guardrails',
];

/** Find a VDR_REGISTRY entry by its capability label (throws if the wiring is missing). */
function reg(cap) {
  const e = VDR_REGISTRY.find((x) => x.capability === cap);
  if (!e) throw new Error(`no VDR_REGISTRY entry for capability "${cap}"`);
  return e;
}

/** Minimal supabase mock for kr_status: from('key_results').select().eq('code',code).maybeSingle(). */
function krSupabase(rowsByCode) {
  return {
    from() {
      let code = null;
      const b = {
        select() { return b; },
        eq(col, val) { if (col === 'code') code = val; return b; },
        maybeSingle() { return Promise.resolve({ data: rowsByCode[code] ?? null, error: null }); },
      };
      return b;
    },
  };
}

describe('FR-2/FR-3: governance kr_status probes — score tracks the live KR signal', () => {
  // Each capability is wired to its SEMANTICALLY-CORRECT KR (honest reading), not merely an achieved one:
  //   guardrails → KR-GOV-3.2 (7/7 achieved → built); cascade → KR-GOV-3.1 (2/6 at_risk → partial live);
  //   OKR+hard-stop → KR-GOV-3.3 (0/3 at_risk → unbuilt live, owns the day-28 hard-stop).
  const KR_CAPS = [
    ['All 7 governance guardrails', 'KR-GOV-3.2'],
    ['OKR-driven prioritization + day-28 hard stop', 'KR-GOV-3.3'],
    ['Governance cascade enforced', 'KR-GOV-3.1'],
  ];

  for (const [cap, code] of KR_CAPS) {
    it(`${cap} is wired to kr_status ${code} (layer process)`, () => {
      const e = reg(cap);
      expect(e.probe.type).toBe('kr_status');
      expect(e.probe.code).toBe(code);
      expect(e.layer).toBe('process');
    });

    it(`${cap} reads built→partial→unbuilt→unknown as the KR signal changes (adversarial)`, async () => {
      const probe = reg(cap).probe;
      // BUILT — status achieved (the live state these were chosen for)
      expect((await runProbe(probe, { supabase: krSupabase({ [code]: { code, status: 'achieved', current_value: 7, target_value: 7 } }) })).status).toBe('built');
      // PARTIAL — in progress, current>0 but below target and not achieved
      expect((await runProbe(probe, { supabase: krSupabase({ [code]: { code, status: 'on_track', current_value: 1, target_value: 9 } }) })).status).toBe('partial');
      // UNBUILT — zero progress
      expect((await runProbe(probe, { supabase: krSupabase({ [code]: { code, status: 'at_risk', current_value: 0, target_value: 5 } }) })).status).toBe('unbuilt');
      // UNKNOWN — KR row missing (excluded from denominator, never false-0)
      expect((await runProbe(probe, { supabase: krSupabase({}) })).status).toBe('unknown');
      // UNKNOWN — no supabase client
      expect((await runProbe(probe, {})).status).toBe('unknown');
    });
  }
});

describe('FR-2/FR-3: governance code_grep probes — partial on match, unbuilt on miss, unknown without a seam (never false-built)', () => {
  const GREP_CAPS = [
    // 'Govern-by-exception' was UPGRADED to a cross-table invert count_ratio by
    // SD-LEO-INFRA-VDR-PROBE-RECALIBRATION-001 (FR-4) — see the dedicated describe below; no longer code_grep.
    // 'Decision Filter Engine' stays code_grep (HONEST band = partial) even after
    // SD-LEO-INFRA-DFE-CHAIRMAN-FORWARD-GATE-001 wired it as an ADVISORY forward filter: the ord-13
    // required state is "gating" and CONST-002 forbids gating, so advisory wiring is not 'built'.
    ['Decision Filter Engine', 'lib/eva', 'evaluateDecision'],
  ];

  for (const [cap, expectedPath, expectedPattern] of GREP_CAPS) {
    it(`${cap} is wired to code_grep ${expectedPath} /${expectedPattern}/ in EHG_Engineer (layer process)`, () => {
      const e = reg(cap);
      expect(e.probe.type).toBe('code_grep');
      expect(e.probe.repo).toBe('EHG_Engineer');
      expect(e.probe.path).toBe(expectedPath);
      expect(e.probe.pattern).toBe(expectedPattern);
      expect(e.probe.builtWhen).toBe('present');
      expect(e.layer).toBe('process');
    });

    it(`${cap} reads partial→unbuilt→unknown as the grep signal changes — and is NEVER built`, async () => {
      const probe = reg(cap).probe;
      // MATCHED → partial (code presence is intent, not realization — capped, never built)
      const matched = await runProbe(probe, { grep: () => ({ matched: true, accessible: true }) });
      expect(matched.status).toBe('partial');
      expect(matched.status).not.toBe('built');
      // NO MATCH → unbuilt
      expect((await runProbe(probe, { grep: () => ({ matched: false, accessible: true }) })).status).toBe('unbuilt');
      // INACCESSIBLE checkout → unknown (excluded, never guessed)
      expect((await runProbe(probe, { grep: () => ({ matched: true, accessible: false }) })).status).toBe('unknown');
      // NO grep seam at all → unknown (the adam-exec-summary email path)
      expect((await runProbe(probe, {})).status).toBe('unknown');
    });
  }
});

describe('SD-LEO-INFRA-VDR-PROBE-RECALIBRATION-001 (FR-4): Govern-by-exception is a cross-table invert count_ratio — built only on a genuinely-low LIVE bypass rate', () => {
  // Mock supabase head-count: returns a fixed count per table; chainable filters are no-ops.
  const mkSb = (counts) => ({
    from: (table) => {
      const q = {
        select() { return this; }, eq() { return this; }, in() { return this; },
        neq() { return this; }, not() { return this; }, gte() { return this; },
        then(resolve, reject) { return Promise.resolve({ count: counts[table] ?? 0, error: null }).then(resolve, reject); },
      };
      return q;
    },
  });
  const probe = () => reg('Govern-by-exception').probe;

  it('is a count_ratio over sd_governance_bypass_audit ÷ leo_handoff_executions, inverted (1 − bypass-rate)', () => {
    const p = probe();
    expect(p.type).toBe('count_ratio');
    expect(p.invert).toBe(true);
    expect(p.table).toBe('leo_handoff_executions');
    expect(p.numerTable).toBe('sd_governance_bypass_audit');
    expect(p.builtAt).toBe(0.9);
  });
  it('a genuinely-low bypass rate → built (1 − 92/4000 = 0.977 ≥ 0.9)', async () => {
    const r = await runProbe(probe(), { supabase: mkSb({ leo_handoff_executions: 4000, sd_governance_bypass_audit: 92 }) });
    expect(r.status).toBe('built');
  });
  it('a HIGH bypass rate → partial, NEVER built (anti-inflation: only a real low rate earns built)', async () => {
    const r = await runProbe(probe(), { supabase: mkSb({ leo_handoff_executions: 100, sd_governance_bypass_audit: 50 }) }); // 1−0.5 = 0.5 < 0.9
    expect(r.status).toBe('partial');
    expect(r.status).not.toBe('built');
  });
  it('no supabase seam → unknown (never fabricated)', async () => {
    expect((await runProbe(probe(), {})).status).toBe('unknown');
  });
});

describe('SD-LEO-INFRA-DFE-CHAIRMAN-FORWARD-GATE-001: ord-13 stays HONEST partial (advisory wiring != gating)', () => {
  it('Decision Filter Engine is NOT banded built — required state is gating, CONST-002 forbids gating', async () => {
    const probe = reg('Decision Filter Engine').probe;
    // The engine IS present (advisory-wired) → code_grep matches → partial, never built.
    const matched = await runProbe(probe, { grep: () => ({ matched: true, accessible: true }) });
    expect(matched.status).toBe('partial');
    expect(matched.status).not.toBe('built');
  });
});

describe('FR-1/FR-3: coherence invariant — criteria rows ↔ VDR_REGISTRY must stay 1:1 (atomic-PR guard)', () => {
  // The active-rung criteria rows the DB source yields, simulated from the registry labels.
  const rowsFromRegistry = () => VDR_REGISTRY.map((e) => ({ capability: e.capability, today: '', required: '' }));

  it('all 5 governance capabilities are registered at layer process', () => {
    for (const cap of GOV_CAPS) {
      const e = VDR_REGISTRY.find((x) => x.capability === cap);
      expect(e, `missing registry entry: ${cap}`).toBeTruthy();
      expect(e.layer).toBe('process');
    }
  });

  it('registry has 21 entries (7 original after the V1->V2 re-cut + 4 automation + 2 capability-layer + 5 governance + 3 consolidation)', () => {
    expect(VDR_REGISTRY.length).toBe(21);
  });

  it('a matched criteria set is coherent (ok:true, no missing/stale probes)', () => {
    const res = assertRegistryCoherence(rowsFromRegistry());
    expect(res.ok).toBe(true);
    expect(res.missingProbes).toEqual([]);
    expect(res.staleProbes).toEqual([]);
  });

  it('OMITTING a governance criteria row (registry has the probe, vision lacks the row) → staleProbe → NOT coherent', () => {
    const rows = rowsFromRegistry().filter((r) => r.capability !== 'All 7 governance guardrails');
    const res = assertRegistryCoherence(rows);
    expect(res.ok).toBe(false);
    expect(res.staleProbes).toContain('All 7 governance guardrails');
  });

  it('a governance criteria row with NO matching probe → missingProbe → NOT coherent', () => {
    const rows = [...rowsFromRegistry(), { capability: 'Unprobed governance capability', today: '', required: '' }];
    const res = assertRegistryCoherence(rows);
    expect(res.ok).toBe(false);
    expect(res.missingProbes).toContain('Unprobed governance capability');
  });
});

describe('FR-3: computeBuildGauge end-to-end — governance contributes, coherence holds, drift withholds', () => {
  const rows16 = () => VDR_REGISTRY.map((e) => ({ capability: e.capability, today: '', required: '' }));

  /** Mock io: kr 'achieved' only for the listed codes; counts unsupported (→unknown); grep matches. */
  function gaugeMock({ achievedCodes = [], grepMatched = true } = {}) {
    const supabase = {
      from(table) {
        let code = null;
        const b = {
          select() { return b; },
          eq(col, val) { if (col === 'code') code = val; return b; },
          maybeSingle() {
            if (table === 'key_results' && achievedCodes.includes(code)) {
              return Promise.resolve({ data: { code, status: 'achieved', current_value: 1, target_value: 1 }, error: null });
            }
            return Promise.resolve({ data: null, error: null }); // not found → unknown
          },
          // db_count / row_predicate await the builder → return an error so they read 'unknown' (excluded)
          then(resolve) { resolve({ count: null, error: { message: 'mock count unsupported' } }); },
        };
        return b;
      },
    };
    return { supabase, grep: () => ({ matched: grepMatched, accessible: true }) };
  }

  it('with the 16=16 set, the gauge is available + coherent and governance KR caps read built when their KRs are achieved', async () => {
    // Plumbing test: force all 3 governance KRs achieved to prove the built-path wiring through the gauge.
    // (Live readings differ honestly — see the per-probe banding tests + the live verification.)
    const io = gaugeMock({ achievedCodes: ['KR-GOV-3.2', 'KR-GOV-3.3', 'KR-GOV-3.1'], grepMatched: true });
    const gauge = await computeBuildGauge({ io, visionSource: async () => rows16() });
    expect(gauge.available).toBe(true);
    expect(gauge.coherence.ok).toBe(true);
    expect(gauge.total_capabilities).toBe(21); // 7 original (post V1->V2 re-cut) +4 automation +2 caplayer +5 governance +3 consolidation
    const byCap = Object.fromEntries(gauge.components.map((c) => [c.capability, c.status]));
    expect(byCap['All 7 governance guardrails']).toBe('built');
    expect(byCap['OKR-driven prioritization + day-28 hard stop']).toBe('built');
    expect(byCap['Governance cascade enforced']).toBe('built');
    // Govern-by-exception is now a count_ratio (FR-4); this mock returns a count error ⇒ honestly 'unknown'
    // (excluded), not fabricated. Its built/partial banding is covered by the dedicated FR-4 describe + live verification.
    expect(byCap['Govern-by-exception']).toBe('unknown');
    expect(byCap['Decision Filter Engine']).toBe('partial');
    // governance lives in the 'process' layer breakdown
    expect(gauge.per_layer.process).not.toBeNull();
  });

  it('withholds the gauge (available:false, pct null) when a vision criteria has no probe (drift)', async () => {
    const visionSource = async () => [...rows16(), { capability: 'Phantom gov cap', today: '', required: '' }];
    const gauge = await computeBuildGauge({ io: gaugeMock(), visionSource });
    expect(gauge.available).toBe(false);
    expect(gauge.overall_pct).toBeNull();
    expect(gauge.coherence.ok).toBe(false);
    expect(gauge.coherence.missingProbes).toContain('Phantom gov cap');
  });
});
