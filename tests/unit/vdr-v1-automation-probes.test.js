/**
 * SD-LEO-INFRA-V1-AUTOMATION-PROBES-001 (FR-5 / activation test).
 *
 * Pure verification of the 4 automation/intelligence VDR probes (ordinals 17-20):
 *   - the 4 layer-'process' code_grep VDR_REGISTRY entries exist with exact labels;
 *   - assertRegistryCoherence stays ok at 15<->15 and FAILS on drift in BOTH directions
 *     (the load-bearing invariant — any drift withholds the whole gauge);
 *   - each new probe bands HONESTLY via codeGrepProbe + an injected seam: a match is 'partial'
 *     (NEVER 'built'), an inaccessible signal is 'unknown' (excluded, never guessed);
 *   - buildCriteriaRows() emits the coherence-safe seed payload (labels match the registry exactly).
 * No DB/IO — every assertion is over pure functions.
 */
import { describe, it, expect } from 'vitest';
import { VDR_REGISTRY, assertRegistryCoherence } from '../../lib/vision/vdr-registry.js';
import { codeGrepProbe } from '../../lib/vision/vdr-probes.js';
import { buildCriteriaRows, EXPECTED_V1_RUNG_ID } from '../../scripts/seed-v1-automation-criteria.mjs';

const NEW_LABELS = ['Automation-by-default', 'Active intelligence per stage', 'Cross-stage data contracts', 'CLI authoritative'];

describe('VDR_REGISTRY — 4 new automation/intelligence entries (ordinals 17-20)', () => {
  it('contains all 4 new capabilities as layer=process probes (3 code_grep + Automation-by-default upgraded to count_ratio)', () => {
    for (const label of NEW_LABELS) {
      const e = VDR_REGISTRY.find((r) => r.capability === label);
      expect(e, `registry entry for "${label}"`).toBeTruthy();
      expect(e.layer).toBe('process');
      if (label === 'Automation-by-default') {
        // SD-LEO-INFRA-VDR-PROBE-RECALIBRATION-001 (FR-5): upgraded off the floor to the realized rate.
        expect(e.probe.type).toBe('count_ratio');
        expect(e.probe.builtAt).toBe(0.8);
      } else {
        expect(e.probe.type).toBe('code_grep');
        expect(e.probe.builtWhen).toBe('present');
      }
    }
  });

  it('Automation-by-default bands built ONLY from a real live realized rate, never from a policy flag (anti-inflation)', () => {
    const e = VDR_REGISTRY.find((r) => r.capability === 'Automation-by-default');
    // A leo_settings auto_proceed flag (row_predicate) would be a built-from-presence inflation — forbidden.
    expect(e.probe.type).not.toBe('row_predicate');
    // It is a count_ratio over the REALIZED accepted/total handoff rate (30d window, excl ADMIN_OVERRIDE),
    // so 'built' requires the live rate to actually clear builtAt(0.8); it can never come from mere presence.
    expect(e.probe.type).toBe('count_ratio');
    expect(e.probe.table).toBe('sd_phase_handoffs');
    expect(e.probe.builtAt).toBe(0.8);
    expect(e.probe.numerFilter.created_by).toEqual({ ne: 'ADMIN_OVERRIDE' });
    expect(e.probe.numerFilter.created_at).toEqual({ gteDaysAgo: 30 });
  });

  it('the registry includes these 4 (alongside the concurrently-landed governance + capability-layer clusters)', () => {
    // 21 = 7 original (after SD-LEO-INFRA-VISION-LADDER-V1-V2-RECUT-001 moved 4 revenue/operating caps to
    //      inactive V2) + 5 governance (V1-GOV-PROBES) + 2 capability-layer (V1-CAPLAYER-PROBES)
    //      + 4 here (automation ordinals 17-20) + 3 consolidation (V1-CONSOLIDATION-PROBES).
    expect(VDR_REGISTRY.length).toBe(21);
  });
});

describe('assertRegistryCoherence — strict 15<->15, fails on drift both directions', () => {
  const fullRows = () => VDR_REGISTRY.map((e) => ({ capability: e.capability, today: 'x', required: 'y' }));

  it('ok:true when the criteria exactly mirror the registry (15<->15)', () => {
    const c = assertRegistryCoherence(fullRows());
    expect(c.ok).toBe(true);
    expect(c.missingProbes).toEqual([]);
    expect(c.staleProbes).toEqual([]);
  });

  it('a registry entry with NO criterion => staleProbes (the merge-code-without-seed regression)', () => {
    const rows = fullRows().filter((r) => r.capability !== 'CLI authoritative'); // drop one criterion
    const c = assertRegistryCoherence(rows);
    expect(c.ok).toBe(false);
    expect(c.staleProbes).toContain('CLI authoritative');
  });

  it('a criterion with NO registry entry => missingProbes (the seed-without-code drift)', () => {
    const rows = [...fullRows(), { capability: 'Ghost capability', today: 'x', required: 'y' }];
    const c = assertRegistryCoherence(rows);
    expect(c.ok).toBe(false);
    expect(c.missingProbes).toContain('Ghost capability');
  });
});

describe('honesty — each new probe bands partial (never built) / unknown via codeGrepProbe', () => {
  const newDefs = () => NEW_LABELS.map((l) => VDR_REGISTRY.find((r) => r.capability === l).probe);

  it('a code match yields PARTIAL (never built) for every new probe', async () => {
    const grep = () => ({ matched: true, accessible: true });
    for (const def of newDefs()) {
      const r = await codeGrepProbe(def, { grep });
      expect(r.status).toBe('partial');
    }
  });

  it('no match yields UNBUILT', async () => {
    const grep = () => ({ matched: false, accessible: true });
    for (const def of newDefs()) {
      expect((await codeGrepProbe(def, { grep })).status).toBe('unbuilt');
    }
  });

  it('an inaccessible signal yields UNKNOWN (excluded, never guessed)', async () => {
    const grep = () => ({ matched: false, accessible: false });
    for (const def of newDefs()) {
      expect((await codeGrepProbe(def, { grep })).status).toBe('unknown');
    }
  });
});

describe('buildCriteriaRows — coherence-safe seed payload', () => {
  it('emits 4 rows at ordinals 17-20 with labels matching the registry exactly', () => {
    const rows = buildCriteriaRows(EXPECTED_V1_RUNG_ID);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.ordinal)).toEqual([17, 18, 19, 20]);
    expect(rows.map((r) => r.capability)).toEqual(NEW_LABELS);
    // every seeded label has a matching registry entry (coherence safety)
    for (const r of rows) {
      expect(VDR_REGISTRY.find((e) => e.capability === r.capability), `registry match for "${r.capability}"`).toBeTruthy();
      expect(r.rung_id).toBe(EXPECTED_V1_RUNG_ID);
      expect(typeof r.today).toBe('string');
      expect(typeof r.required).toBe('string');
    }
  });
});
