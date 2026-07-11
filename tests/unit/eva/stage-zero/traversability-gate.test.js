/**
 * SD-LEO-INFRA-STAGE0-TRAVERSABILITY-GATE-001 (spec R6): traversability gate proofs.
 *
 * The three commission success criteria, mechanically:
 *  1. UNDELIVERABLE CANDIDATES CANNOT WIN — a top-ranked candidate requiring a
 *     capability absent from the envelope is excluded with the missing capability named.
 *  2. ENVELOPE IS READ LIVE — adding the capability to the envelope flips the outcome;
 *     an unreachable view fails closed (EnvelopeUnavailableError, no silent pass).
 *  3. NURSERY INTEGRATION — failed candidates park with machine-readable resurfacing
 *     conditions into the LIVE venture_nursery schema, never silently dropped.
 */

import { describe, test, expect, vi } from 'vitest';
import {
  loadCapabilityEnvelope,
  checkTraversability,
  parkFailedCandidate,
  normalizeCapabilityName,
  EnvelopeUnavailableError,
} from '../../../../lib/eva/stage-zero/traversability-gate.js';
import { executeDiscoveryMode } from '../../../../lib/eva/stage-zero/paths/discovery-mode.js';

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

const ENVELOPE_ROWS = [
  { name: 'venture web deploy', capability_type: 'service', maturity_level: 'production', scope: 'platform' },
  { name: 'domain_intelligence', capability_type: 'agent_capability', maturity_level: 'production', scope: 'platform' },
  { name: 'email delivery', capability_type: 'service', maturity_level: 'production', scope: 'platform' },
];

function envelopeSupabase({ rows = ENVELOPE_ROWS, error = null } = {}) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: error ? null : rows, error }),
    })),
  };
}

function envelopeOf(rows) {
  return { delivered: rows, deliveredNames: rows.map(r => normalizeCapabilityName(r.name)), loadedAt: 't', count: rows.length };
}

describe('loadCapabilityEnvelope — live, fail-closed (FR-1)', () => {
  test('missing supabase client throws no_supabase_client', async () => {
    await expect(loadCapabilityEnvelope({ logger: silentLogger })).rejects.toMatchObject({ name: 'EnvelopeUnavailableError', reason: 'no_supabase_client' });
  });

  test('view error throws view_unavailable — no fallback envelope', async () => {
    const supabase = envelopeSupabase({ error: { message: 'relation missing' } });
    await expect(loadCapabilityEnvelope({ supabase, logger: silentLogger })).rejects.toMatchObject({ reason: 'view_unavailable' });
  });

  test('loads delivered rows and normalized names; empty envelope is honest, not an error', async () => {
    const full = await loadCapabilityEnvelope({ supabase: envelopeSupabase(), logger: silentLogger });
    expect(full.count).toBe(3);
    expect(full.deliveredNames).toContain('venture web deploy');
    expect(full.deliveredNames).toContain('domain intelligence'); // underscore normalized

    const empty = await loadCapabilityEnvelope({ supabase: envelopeSupabase({ rows: [] }), logger: silentLogger });
    expect(empty.count).toBe(0);
  });
});

describe('checkTraversability — hard mechanical check (FR-2)', () => {
  const topRanked = {
    name: 'ShopSync', composite_score: 95, problem_statement: 'p', solution: 's', target_market: 'm',
    required_capabilities: [{ name: 'shopify integration', kind: 'integration' }, { name: 'venture web deploy', kind: 'form_factor' }],
  };
  const runnerUp = {
    name: 'MailBot', composite_score: 80,
    required_capabilities: [{ name: 'email delivery', kind: 'integration' }],
  };
  const undeclared = { name: 'MysteryCo', composite_score: 60 };

  test('SUCCESS CRITERION 1: top-ranked candidate with absent capability is excluded, missing capability NAMED', () => {
    const result = checkTraversability([topRanked, runnerUp, undeclared], envelopeOf(ENVELOPE_ROWS));
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].candidate.name).toBe('ShopSync');
    expect(result.failed[0].missing).toEqual([{ name: 'shopify integration', kind: 'integration' }]);
    expect(result.passed.map(c => c.name)).toEqual(['MailBot', 'MysteryCo']);
  });

  test('SUCCESS CRITERION 2: adding the capability to the envelope flips the outcome', () => {
    const grown = envelopeOf([...ENVELOPE_ROWS, { name: 'Shopify integration adapter', maturity_level: 'production' }]);
    const result = checkTraversability([topRanked], grown);
    expect(result.failed).toHaveLength(0);
    expect(result.passed[0].name).toBe('ShopSync');
    expect(result.passed[0].traversability).toBe('passed');
  });

  test('no declared requirements passes STAMPED, never silently', () => {
    const result = checkTraversability([undeclared], envelopeOf(ENVELOPE_ROWS));
    expect(result.passed[0].traversability).toBe('no_requirements_declared');
    expect(result.stats.undeclared).toBe(1);
  });

  test('string-form requirements and containment both directions', () => {
    const c = { name: 'X', required_capabilities: ['web deploy'] }; // contained in 'venture web deploy'
    const result = checkTraversability([c], envelopeOf(ENVELOPE_ROWS));
    expect(result.passed).toHaveLength(1);
  });

  test('resurfacing conditions are machine-readable per missing capability', () => {
    const result = checkTraversability([topRanked], envelopeOf(ENVELOPE_ROWS));
    expect(result.failed[0].resurfacing_conditions).toEqual([
      { type: 'capability_ships', capability: 'shopify integration', kind: 'integration', condition: 'viable when capability shopify integration ships' },
    ]);
  });

  test('throws when called without a loaded envelope (no default)', () => {
    expect(() => checkTraversability([topRanked], null)).toThrow(EnvelopeUnavailableError);
  });
});

describe('parkFailedCandidate — LIVE venture_nursery schema (FR-3 / criterion 3)', () => {
  test('insert uses live columns with machine-readable trigger_conditions', async () => {
    const inserted = [];
    const supabase = {
      from: vi.fn((table) => ({
        insert: vi.fn((row) => {
          inserted.push({ table, row });
          return { select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'n1', ...row }, error: null }) }) };
        }),
      })),
    };
    const failure = {
      candidate: {
        name: 'ShopSync', problem_statement: 'p', solution: 's', target_market: 'm', composite_score: 95, prompt_version: 'v3',
        required_capabilities: [{ name: 'shopify integration', kind: 'integration' }, { name: 'venture web deploy', kind: 'form_factor' }],
      },
      missing: [{ name: 'shopify integration', kind: 'integration' }],
      resurfacing_conditions: [{ type: 'capability_ships', capability: 'shopify integration', kind: 'integration', condition: 'viable when capability shopify integration ships' }],
    };
    await parkFailedCandidate(failure, { posture_version: 'phase_1_process_proving@v1', strategy: 'trend_scanner' }, { supabase, logger: silentLogger });

    expect(inserted[0].table).toBe('venture_nursery');
    const row = inserted[0].row;
    // Live schema columns only (the drifted parkVenture columns must NOT appear).
    expect(Object.keys(row).sort()).toEqual(['current_score', 'description', 'maturity_level', 'name', 'source_ref', 'source_type', 'trigger_conditions']);
    expect(row.maturity_level).toBe('seed');            // live CHECK: seed|sprout|ready
    expect(row.source_type).toBe('discovery_mode');     // live CHECK includes discovery_mode
    expect(row.trigger_conditions[0]).toMatchObject({ type: 'capability_ships', capability: 'shopify integration' });
    expect(row.source_ref.gate).toBe('traversability');
    expect(row.source_ref.posture_version).toBe('phase_1_process_proving@v1');
  });

  // QF-20260711-607: parkFailedCandidate's persisted candidate snapshot previously
  // omitted required_capabilities, so a nursery re-eval's carry-forward reconstruction
  // always found zero requirements and trivially auto-passed via no_requirements_declared
  // regardless of whether the original envelope gap was ever fixed.
  test('persists required_capabilities in source_ref.candidate so re-eval carry-forward can reconstruct the original requirements', async () => {
    const inserted = [];
    const supabase = {
      from: vi.fn((table) => ({
        insert: vi.fn((row) => {
          inserted.push({ table, row });
          return { select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'n1', ...row }, error: null }) }) };
        }),
      })),
    };
    const requiredCapabilities = [{ name: 'shopify integration', kind: 'integration' }];
    const failure = {
      candidate: { name: 'ShopSync', composite_score: 95, required_capabilities: requiredCapabilities },
      missing: [{ name: 'shopify integration', kind: 'integration' }],
      resurfacing_conditions: [],
    };
    await parkFailedCandidate(failure, {}, { supabase, logger: silentLogger });

    expect(inserted[0].row.source_ref.candidate.required_capabilities).toEqual(requiredCapabilities);
  });

  test('defaults required_capabilities to an empty array when the candidate declares none', async () => {
    const inserted = [];
    const supabase = {
      from: vi.fn((table) => ({
        insert: vi.fn((row) => {
          inserted.push({ table, row });
          return { select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'n1', ...row }, error: null }) }) };
        }),
      })),
    };
    const failure = {
      candidate: { name: 'MysteryCo', composite_score: 60 },
      missing: [],
      resurfacing_conditions: [],
    };
    await parkFailedCandidate(failure, {}, { supabase, logger: silentLogger });

    expect(inserted[0].row.source_ref.candidate.required_capabilities).toEqual([]);
  });
});

describe('executeDiscoveryMode integration — hard gate in the selection path', () => {
  const POSTURE_ROW = {
    id: 'p1', phase_key: 'test_posture', version: 1,
    criteria: { weights: { automation_feasibility: 0.30, monthly_revenue_potential: 0.25, target_market_specificity: 0.20, strategic_fit: 0.15, competition_level: 0.10 } },
    status: 'active', ratified_by: 'chairman', ratified_at: '2026-07-10T00:00:00Z',
  };

  function fullSupabase({ envelopeRows = ENVELOPE_ROWS, envelopeError = null, nurseryInserts = [] } = {}) {
    const strategyChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { strategy_key: 'trend_scanner', name: 'Trend Scanner', is_active: true }, error: null }),
      order: vi.fn().mockResolvedValue({ data: [{ strategy_key: 'trend_scanner', is_active: true }], error: null }),
    };
    return {
      from: vi.fn((table) => {
        if (table === 'selection_postures') {
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [POSTURE_ROW], error: null }) };
        }
        if (table === 'v_unified_capabilities') {
          return { select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: envelopeError ? null : envelopeRows, error: envelopeError }) };
        }
        if (table === 'venture_nursery') {
          return {
            insert: vi.fn((row) => {
              nurseryInserts.push(row);
              return { select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'n1' }, error: null }) }) };
            }),
          };
        }
        return strategyChain;
      }),
    };
  }

  function llmWith(candidates) {
    return { _model: 'test-model', complete: vi.fn().mockResolvedValue(JSON.stringify(candidates)) };
  }

  const CANDIDATES = [
    // Ranks #1 (feasibility 10, low competition, big revenue) but requires an undelivered capability.
    { name: 'Undeliverable', problem_statement: 'p', solution: 's', target_market: 'B2B SaaS startups with 50-200 employees', automation_feasibility: 10, competition_level: 'low', monthly_revenue_potential: '$100K/month', required_capabilities: [{ name: 'blockchain settlement', kind: 'integration' }] },
    { name: 'Deliverable', problem_statement: 'p', solution: 's', target_market: 'B2B SaaS startups with 50-200 employees', automation_feasibility: 7, competition_level: 'medium', monthly_revenue_potential: '$5K/month', required_capabilities: [{ name: 'email delivery', kind: 'integration' }] },
    { name: 'Quiet', problem_statement: 'p', solution: 's', target_market: 'm', automation_feasibility: 6, competition_level: 'medium', monthly_revenue_potential: '$3K/month' },
  ];

  test('top-ranked undeliverable candidate cannot win; passing runner-up selected; failure parked + stamped', async () => {
    const nurseryInserts = [];
    const supabase = fullSupabase({ nurseryInserts });
    const result = await executeDiscoveryMode({ strategy: 'trend_scanner' }, { supabase, logger: silentLogger, llmClient: llmWith(CANDIDATES) });

    expect(result.raw_material.top_candidate.name).toBe('Deliverable');
    expect(result.raw_material.candidates.map(c => c.name)).not.toContain('Undeliverable');
    expect(result.raw_material.traversability_failures[0]).toMatchObject({ name: 'Undeliverable' });
    expect(result.raw_material.traversability_failures[0].missing[0].name).toBe('blockchain settlement');
    expect(result.metadata.traversability).toMatchObject({ checked: 3, passed: 2, failed: 1, undeclared: 1, envelope_count: 3 });
    expect(nurseryInserts).toHaveLength(1);
    expect(nurseryInserts[0].name).toBe('Undeliverable');
  });

  test('FAIL-CLOSED: unreachable envelope aborts the run with no PathOutput', async () => {
    const supabase = fullSupabase({ envelopeError: { message: 'view gone' } });
    await expect(
      executeDiscoveryMode({ strategy: 'trend_scanner' }, { supabase, logger: silentLogger, llmClient: llmWith(CANDIDATES) })
    ).rejects.toMatchObject({ name: 'EnvelopeUnavailableError', reason: 'view_unavailable' });
  });

  test('all candidates failing the envelope → parked, run returns null', async () => {
    const nurseryInserts = [];
    const supabase = fullSupabase({ envelopeRows: [], nurseryInserts });
    const allRequire = CANDIDATES.slice(0, 2).map(c => ({ ...c, required_capabilities: [{ name: 'anything at all', kind: 'ops' }] }));
    const result = await executeDiscoveryMode({ strategy: 'trend_scanner' }, { supabase, logger: silentLogger, llmClient: llmWith([...allRequire, { ...CANDIDATES[2], required_capabilities: [{ name: 'more', kind: 'ops' }] }]) });
    expect(result).toBeNull();
    expect(nurseryInserts).toHaveLength(3);
  });
});
