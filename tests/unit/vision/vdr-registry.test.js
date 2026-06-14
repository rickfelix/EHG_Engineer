// SD-LEO-INFRA-AUTOMATED-ONE-ROADMAP-001 (FR-1/FR-6) — VDR engine unit tests.
// Hermetic: no live DB, no real grep, no real vision file. Validates the deterministic
// numerator/denominator math, the typed probe runners, coherence, and fail-soft behavior.
import { describe, it, expect } from 'vitest';
import {
  parseCapabilityGap,
  assertRegistryCoherence,
  computeBuildGauge,
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
  it('computes overall % + per-layer, EXCLUDING unknowns from the denominator', async () => {
    // KR-04 achieved (built), KR-05 pending (unbuilt), KR-02 pending current>0 (partial);
    // agent_messages=2 (built), pattern_occurrences=0 (unbuilt); all code_grep → unknown (no grep seam).
    const io = {
      supabase: stubSupabase({
        countByTable: { agent_messages: 2, pattern_occurrences: 0, key_results: 1 },
        krRows: {
          'KR-2026-07-04': { status: 'achieved', current_value: 1, target_value: 1 },
          'KR-2026-07-05': { status: 'pending', current_value: 0, target_value: 1 },
          'KR-2026-07-02': { status: 'pending', current_value: 45, target_value: 90 },
        },
      }),
      // no grep → code_grep probes return 'unknown'
    };
    const g = await computeBuildGauge({ io, visionMarkdown: visionFixture() });
    expect(g.available).toBe(true);
    expect(g.coherence.ok).toBe(true);
    expect(g.total_capabilities).toBe(VDR_REGISTRY.length);
    // 5 code_grep capabilities → unknown; 6 DB-backed → probeable
    expect(g.unknown_count).toBe(5);
    expect(g.denominator).toBe(6);
    // built: Take-a-dollar(KR04), north-star(row_predicate exists), self-operating(agent_messages=2) = 3 built(1.0)
    // partial: survivability(KR02 45/90) = 0.5 ; unbuilt: distance-to-quit(KR05), venture-learning(pattern_occurrences=0) = 0
    // overall = (1+1+1+0.5+0+0)/6 = 3.5/6 = 58%
    expect(g.overall_pct).toBe(58);
    // every component carries an honest status + score mapping
    for (const c of g.components) expect(STATUS_SCORE).toHaveProperty(c.status);
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
  it('db_count: gte builds when present; absent builds when zero', async () => {
    const sb = stubSupabase({ countByTable: { t_has: 5, t_empty: 0 } });
    expect((await runProbe({ type: 'db_count', table: 't_has', min: 1, builtWhen: 'gte' }, { supabase: sb })).status).toBe('built');
    expect((await runProbe({ type: 'db_count', table: 't_empty', min: 1, builtWhen: 'gte' }, { supabase: sb })).status).toBe('unbuilt');
    expect((await runProbe({ type: 'db_count', table: 't_empty', builtWhen: 'absent' }, { supabase: sb })).status).toBe('built');
  });
  it('code_grep: unknown when no grep seam; built/unbuilt via injected grep', async () => {
    expect((await runProbe({ type: 'code_grep', path: 'x', pattern: 'y' }, {})).status).toBe('unknown');
    const grepHit = async () => ({ accessible: true, matched: true });
    const grepMiss = async () => ({ accessible: true, matched: false });
    const grepGone = async () => ({ accessible: false, matched: false });
    expect((await runProbe({ type: 'code_grep', path: 'x', pattern: 'y', builtWhen: 'present' }, { grep: grepHit })).status).toBe('built');
    expect((await runProbe({ type: 'code_grep', path: 'x', pattern: 'y', builtWhen: 'present' }, { grep: grepMiss })).status).toBe('unbuilt');
    expect((await runProbe({ type: 'code_grep', path: 'x', pattern: 'y' }, { grep: grepGone })).status).toBe('unknown');
  });
  it('unknown probe type → unknown (never fabricated)', async () => {
    expect((await runProbe({ type: 'bogus' }, {})).status).toBe('unknown');
  });
});
