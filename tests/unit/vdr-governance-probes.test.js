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
    ['Govern-by-exception', 'database/migrations', 'enforce_doctrine_of_constraint'],
    // 'Decision Filter Engine' moved to a db_count audit_log coverage probe by
    // SD-LEO-INFRA-DFE-CHAIRMAN-FORWARD-GATE-001 (it is now WIRED, not merely defined) — see its
    // dedicated db_count describe block below.
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

describe('SD-LEO-INFRA-DFE-CHAIRMAN-FORWARD-GATE-001: ord-13 Decision Filter Engine reads forward-gate coverage (db_count audit_log)', () => {
  /** Mock supabase whose audit_log count(event_type=chairman_forward_gate_score) is `n`. */
  function countMock(n) {
    return {
      from(table) {
        const b = {
          select() { return b; },
          eq() { return b; },
          then(resolve) {
            if (table === 'audit_log') return resolve({ count: n, error: null });
            return resolve({ count: null, error: { message: 'unexpected table ' + table } });
          },
        };
        return b;
      },
    };
  }

  it('is wired to db_count over audit_log event_type=chairman_forward_gate_score (NOT code_grep)', () => {
    const e = reg('Decision Filter Engine');
    expect(e.probe.type).toBe('db_count');
    expect(e.probe.table).toBe('audit_log');
    expect(e.probe.filter).toEqual({ event_type: 'chairman_forward_gate_score' });
    expect(e.probe.builtWhen).toBe('gte');
    expect(e.probe.min).toBe(1);
    expect(e.layer).toBe('process');
  });

  it('bands BUILT on real coverage (>=1 scored decision) and UNBUILT on zero — honest both ways', async () => {
    const probe = reg('Decision Filter Engine').probe;
    expect((await runProbe(probe, { supabase: countMock(52) })).status).toBe('built');
    expect((await runProbe(probe, { supabase: countMock(1) })).status).toBe('built');
    expect((await runProbe(probe, { supabase: countMock(0) })).status).toBe('unbuilt');
  });

  it('label stays byte-identical so assertRegistryCoherence holds after the probe-type change', () => {
    const rows = VDR_REGISTRY.map((x) => ({ capability: x.capability, today: '', required: '' }));
    const res = assertRegistryCoherence(rows);
    expect(res.ok).toBe(true);
    expect(res.missingProbes).toEqual([]);
    expect(res.staleProbes).toEqual([]);
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

  it('registry has 25 entries (11 original + 4 automation + 2 capability-layer + 5 governance + 3 consolidation)', () => {
    expect(VDR_REGISTRY.length).toBe(25);
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
    expect(gauge.total_capabilities).toBe(25); // +4 automation +3 consolidation since the 18-entry baseline
    const byCap = Object.fromEntries(gauge.components.map((c) => [c.capability, c.status]));
    expect(byCap['All 7 governance guardrails']).toBe('built');
    expect(byCap['OKR-driven prioritization + day-28 hard stop']).toBe('built');
    expect(byCap['Governance cascade enforced']).toBe('built');
    expect(byCap['Govern-by-exception']).toBe('partial');
    // Decision Filter Engine is now a db_count audit_log probe; gaugeMock returns a count error for
    // db_count → 'unknown' (excluded, never false-built). Live coverage bands it 'built' (see the
    // dedicated db_count describe block above).
    expect(byCap['Decision Filter Engine']).toBe('unknown');
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
