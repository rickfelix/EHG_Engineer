// SD-LEO-INFRA-AUTOMATED-ONE-ROADMAP-001 (FR-1/FR-6) — VDR engine unit tests.
// Hermetic: no live DB, no real grep, no real vision file. Validates the deterministic
// numerator/denominator math, the typed probe runners, coherence, and fail-soft behavior.
import { describe, it, expect } from 'vitest';
import {
  parseCapabilityGap,
  assertRegistryCoherence,
  computeBuildGauge,
  formatGaugeForSummary,
  VDR_REGISTRY,
  STATUS_SCORE,
} from '../../../lib/vision/vdr-registry.js';
import { runProbe } from '../../../lib/vision/vdr-probes.js';

// Build a CAPABILITY GAP markdown table from the registry labels so coherence passes by construction.
function visionFixture(labels = VDR_REGISTRY.map((e) => e.capability)) {
  const rows = labels.map((l) => `| **${l}** | today cell | required cell |`).join('\n');
  return [
    '## CAPABILITY GAP — at-a-glance table',
    '',
    '| Vision capability | TODAY (verified live) | REQUIRED to realize the vision |',
    '|---|---|---|',
    rows,
    '',
    '## THROUGH-LINES',
    'next section (must be excluded from the table parse)',
    '| **Not a capability** | x | y |',
  ].join('\n');
}

// Chainable supabase stub: head/count queries resolve to { count }, maybeSingle to { data }.
function stubSupabase({ countByTable = {}, krRows = {} } = {}) {
  return {
    from(table) {
      const ctx = { table, filters: {} };
      const chain = {
        select() { return chain; },
        eq(k, v) { ctx.filters[k] = v; return chain; },
        maybeSingle() { return Promise.resolve({ data: krRows[ctx.filters.code] || null, error: null }); },
        then(res, rej) { return Promise.resolve({ count: countByTable[table] ?? 0, error: null }).then(res, rej); },
      };
      return chain;
    },
  };
}

describe('parseCapabilityGap (FR-1 deterministic denominator)', () => {
  it('extracts only the CAPABILITY GAP table rows, stripping bold + bounding at the next heading', () => {
    const rows = parseCapabilityGap(visionFixture(['Alpha cap', 'Beta cap']));
    expect(rows.map((r) => r.capability)).toEqual(['Alpha cap', 'Beta cap']); // "Not a capability" (post-heading) excluded
    expect(rows[0]).toMatchObject({ capability: 'Alpha cap', today: 'today cell', required: 'required cell' });
  });
  it('returns [] when the section is absent', () => {
    expect(parseCapabilityGap('# nothing here')).toEqual([]);
    expect(parseCapabilityGap(null)).toEqual([]);
  });
  it('is deterministic (same input → same output)', () => {
    const md = visionFixture();
    expect(parseCapabilityGap(md)).toEqual(parseCapabilityGap(md));
  });
});

describe('assertRegistryCoherence (FR-1 fail-loud denominator↔probe lockstep)', () => {
  it('ok when the parsed table matches VDR_REGISTRY exactly', () => {
    const r = assertRegistryCoherence(parseCapabilityGap(visionFixture()));
    expect(r.ok).toBe(true);
    expect(r.missingProbes).toEqual([]);
    expect(r.staleProbes).toEqual([]);
  });
  it('flags a vision capability with no probe (missingProbes) and a probe for a removed capability (staleProbes)', () => {
    const dropped = VDR_REGISTRY.slice(1).map((e) => e.capability); // remove the first registered capability
    const r = assertRegistryCoherence([...dropped.map((c) => ({ capability: c })), { capability: 'Brand New Vision Cap' }]);
    expect(r.ok).toBe(false);
    expect(r.missingProbes).toContain('Brand New Vision Cap'); // in vision, no probe
    expect(r.staleProbes).toContain(VDR_REGISTRY[0].capability); // probe exists, capability gone
  });
});

describe('computeBuildGauge (FR-1 numerator math + honest unknown handling)', () => {
  it('computes overall % + per-layer with HONEST banding, EXCLUDING unknowns from the denominator', async () => {
    // After the V1->V2 re-cut (SD-LEO-INFRA-VISION-LADDER-V1-V2-RECUT-001) the 4 revenue/operating caps
    // (Take-a-dollar, distance-to-quit, self-operating, venture-learning) are V2-deferred — NOT probed.
    // Remaining DB-backed in this stub: survivability (KR02 45/90 → partial 0.5), north-star (KR05 0/1 → 0),
    //   Capability Registry (0 < min50 → 0), Expertise on-demand (0 < min10 → 0), + 3 consolidation probes (0).
    const io = {
      supabase: stubSupabase({
        countByTable: { agent_messages: 2, pattern_occurrences: 0, key_results: 1 },
        krRows: {
          'KR-2026-07-04': { status: 'achieved', current_value: 1, target_value: 1 },
          'KR-2026-07-05': { status: 'pending', current_value: 0, target_value: 1 },
          'KR-2026-07-02': { status: 'pending', current_value: 45, target_value: 90 },
        },
      }),
    };
    const g = await computeBuildGauge({ io, visionMarkdown: visionFixture() });
    expect(g.available).toBe(true);
    expect(g.coherence.ok).toBe(true);
    expect(g.total_capabilities).toBe(VDR_REGISTRY.length);
    // unknown_count = 5 original code_grep + 5 governance (V1-GOV-PROBES) + 4 automation/intelligence
    // (V1-AUTOMATION-PROBES) = 14, all 'unknown' (no seam / KR-GOV rows in this stub) → EXCLUDED. The 4
    // moved revenue/operating probes leave the denominator (11 → 7); the +3 consolidation probes (unbuilt
    // at count 0) still ENTER it.
    expect(g.unknown_count).toBe(14);
    expect(g.denominator).toBe(7); // 4 DB-backed remaining (survivability + north-star + Cap Registry + Expertise) + 3 consolidation
    // numerator 0.5 (survivability only); 0.5/7 = 7%
    expect(g.overall_pct).toBe(7);
    // infrastructure scored = survivability(0.5) + Capability Registry(0) + Expertise on-demand(0) = 0.5/3 = 17%
    // venture layer now has 0 probes (both moved to V2) → venture %=null; application/process stay 0.
    expect(g.per_layer).toMatchObject({ infrastructure: 17, application: 0, process: 0 });
    for (const c of g.components) expect(STATUS_SCORE).toHaveProperty(c.status);
  });

  it('FIX: all-unknown (0 probeable) ⇒ overall_pct=null + available:false (not a confident 0%)', async () => {
    // no supabase, no grep ⇒ every probe is 'unknown'
    const g = await computeBuildGauge({ io: {}, visionMarkdown: visionFixture() });
    expect(g.denominator).toBe(0);
    expect(g.available).toBe(false);
    expect(g.overall_pct).toBeNull();
    expect(g.measured_at_note).toMatch(/unmeasurable|no probeable/i);
  });

  it('FIX: registry↔vision drift ⇒ gauge withheld (available:false), not computed over a wrong denominator', async () => {
    // a vision fixture with an unmapped capability → coherence.ok=false
    const md = visionFixture([...VDR_REGISTRY.map((e) => e.capability), 'Brand New Unmapped Capability']);
    const g = await computeBuildGauge({ io: { supabase: stubSupabase({}) }, visionMarkdown: md });
    expect(g.coherence.ok).toBe(false);
    expect(g.available).toBe(false);
    expect(g.overall_pct).toBeNull();
    expect(g.measured_at_note).toMatch(/drift/i);
  });

  it('fails soft (available:false) when the vision doc path does not exist', async () => {
    const g = await computeBuildGauge({ io: {}, visionPath: '/no/such/EHG-VISION.md' });
    expect(g.available).toBe(false);
    expect(g.overall_pct).toBeNull();
    expect(g.measured_at_note).toMatch(/unavailable/i);
  });
});

describe('runProbe (FR-1 typed probe runners, injected IO)', () => {
  it('kr_status: built when achieved, partial when current>0<target, unbuilt at 0', async () => {
    const sb = stubSupabase({ krRows: {
      A: { status: 'achieved', current_value: 1, target_value: 1 },
      B: { status: 'pending', current_value: 3, target_value: 10 },
      C: { status: 'pending', current_value: 0, target_value: 1 },
    } });
    expect((await runProbe({ type: 'kr_status', code: 'A' }, { supabase: sb })).status).toBe('built');
    expect((await runProbe({ type: 'kr_status', code: 'B' }, { supabase: sb })).status).toBe('partial');
    expect((await runProbe({ type: 'kr_status', code: 'C' }, { supabase: sb })).status).toBe('unbuilt');
  });
  it('db_count: HONEST band — built at >=min, partial in (0,min), unbuilt at 0; absent builds at 0', async () => {
    const sb = stubSupabase({ countByTable: { t_many: 25, t_one: 1, t_empty: 0 } });
    expect((await runProbe({ type: 'db_count', table: 't_many', min: 20, builtWhen: 'gte' }, { supabase: sb })).status).toBe('built');
    expect((await runProbe({ type: 'db_count', table: 't_one', min: 20, builtWhen: 'gte' }, { supabase: sb })).status).toBe('partial'); // single stray row ⇒ NOT built
    expect((await runProbe({ type: 'db_count', table: 't_empty', min: 20, builtWhen: 'gte' }, { supabase: sb })).status).toBe('unbuilt');
    expect((await runProbe({ type: 'db_count', table: 't_empty', builtWhen: 'absent' }, { supabase: sb })).status).toBe('built');
  });
  it('code_grep: unknown when no grep seam; a present MATCH ⇒ partial (intent, not built); no match ⇒ unbuilt', async () => {
    expect((await runProbe({ type: 'code_grep', path: 'x', pattern: 'y' }, {})).status).toBe('unknown');
    const grepHit = async () => ({ accessible: true, matched: true });
    const grepMiss = async () => ({ accessible: true, matched: false });
    const grepGone = async () => ({ accessible: false, matched: false });
    // FIX (review): a code/vocabulary match is intent/scaffolding, not realization ⇒ 'partial', NOT 'built'.
    expect((await runProbe({ type: 'code_grep', path: 'x', pattern: 'y', builtWhen: 'present' }, { grep: grepHit })).status).toBe('partial');
    expect((await runProbe({ type: 'code_grep', path: 'x', pattern: 'y', builtWhen: 'present' }, { grep: grepMiss })).status).toBe('unbuilt');
    // absence-is-built still earns 'built' (a clean absence proves the capability)
    expect((await runProbe({ type: 'code_grep', path: 'x', pattern: 'y', builtWhen: 'absent' }, { grep: grepMiss })).status).toBe('built');
    expect((await runProbe({ type: 'code_grep', path: 'x', pattern: 'y' }, { grep: grepGone })).status).toBe('unknown');
  });
  it('unknown probe type → unknown (never fabricated)', async () => {
    expect((await runProbe({ type: 'bogus' }, {})).status).toBe('unknown');
  });
});

describe('formatGaugeForSummary (FR-4/FR-5 single-source display mapping)', () => {
  it('maps an available gauge to pct + layerLine + a live note', () => {
    const fmt = formatGaugeForSummary({
      available: true, overall_pct: 42,
      per_layer: { infrastructure: 10, application: 80, venture: null, process: 25 },
      denominator: 6, total_capabilities: 11, unknown_count: 5,
    });
    expect(fmt.available).toBe(true);
    expect(fmt.pct).toBe(42);
    // null layers dropped; venture omitted; labels applied (application → UI/UX, venture → venture/income)
    expect(fmt.layerLine).toBe('infrastructure 10%  ·  UI/UX 80%  ·  process 25%');
    expect(fmt.note).toMatch(/live VDR gauge.*6\/11 capabilities probed, 5 unknown/);
  });
  it('omits the "unknown" suffix when unknown_count is 0', () => {
    const fmt = formatGaugeForSummary({ available: true, overall_pct: 100, per_layer: {}, denominator: 11, total_capabilities: 11, unknown_count: 0 });
    expect(fmt.note).toMatch(/11\/11 capabilities probed\)/);
    expect(fmt.note).not.toMatch(/unknown/);
  });
  it('maps an unavailable gauge to pct=null + a clear unavailable note', () => {
    const fmt = formatGaugeForSummary({ available: false, overall_pct: null, measured_at_note: 'vision doc unavailable at X' });
    expect(fmt.available).toBe(false);
    expect(fmt.pct).toBeNull();
    expect(fmt.layerLine).toBe('');
    expect(fmt.note).toMatch(/gauge unavailable.*vision doc unavailable at X/);
  });
  it('treats null/garbage gauge as unavailable (never throws)', () => {
    expect(formatGaugeForSummary(null).available).toBe(false);
    expect(formatGaugeForSummary(undefined).pct).toBeNull();
  });
});
