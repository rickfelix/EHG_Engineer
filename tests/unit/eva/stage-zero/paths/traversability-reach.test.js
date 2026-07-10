/**
 * SD-LEO-INFRA-STAGE0-TRAVERSABILITY-REACH-001 (PRD FR-3/FR-4, TS-2/TS-3/TS-5)
 *
 * CH-6: the traversability gate was invoked on only 1 of 4 Stage-0 entry paths
 * (discovery_mode). blueprint_browse, competitor_teardown, and seeded_from_venture
 * never called it -- a candidate entering by any of those 3 paths skipped the
 * capability check entirely. This file enumerates all 3 newly-gated paths explicitly
 * (discovery_mode's gate is already covered by traversability-gate.test.js's
 * integration block) and proves, per path: the gate is invoked (pass case), a failing
 * candidate is parked and the path returns null (fail case), and EnvelopeUnavailableError
 * propagates fail-closed rather than being silently swallowed.
 */

import { describe, test, expect, vi } from 'vitest';

vi.mock('../../../../../lib/llm/client-factory.js', () => ({
  getValidationClient: vi.fn(),
}));
vi.mock('../../../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockReturnValue('SD-TEST-001'),
  generateChildKey: vi.fn().mockReturnValue('SD-TEST-001-A'),
  normalizeVenturePrefix: vi.fn().mockReturnValue('TEST'),
}));

import { executeBlueprintBrowse } from '../../../../../lib/eva/stage-zero/paths/blueprint-browse.js';
import { executeCompetitorTeardown } from '../../../../../lib/eva/stage-zero/paths/competitor-teardown.js';
import { executeVentureReseeding } from '../../../../../lib/eva/stage-zero/paths/venture-reseeding.js';
import { EnvelopeUnavailableError } from '../../../../../lib/eva/stage-zero/traversability-gate.js';

const silentLogger = { log: vi.fn(), warn: vi.fn() };

const DELIVERED_ROWS = [
  { name: 'venture web deploy', capability_type: 'service', maturity_level: 'production', scope: 'platform' },
];

/** Generic Supabase query-builder mock: every method chains, resolves via `then`. */
function chainableResult(data) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error: null }),
    then: (resolve) => resolve({ data, error: null }),
  };
  return chain;
}

function makeSupabase({ envelopeRows = [], tableData = {}, onParkInsert } = {}) {
  const calledTables = [];
  return {
    _calledTables: calledTables,
    from: vi.fn((table) => {
      calledTables.push(table);
      if (table === 'v_unified_capabilities') {
        return { select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: envelopeRows, error: null }) };
      }
      if (table === 'venture_nursery') {
        return {
          insert: vi.fn((row) => {
            onParkInsert?.(row);
            return {
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { id: 'parked-1', ...row }, error: null }),
            };
          }),
        };
      }
      return chainableResult(tableData[table] ?? null);
    }),
  };
}

describe('traversability gate reach — blueprint_browse (CH-6)', () => {
  const blueprints = [
    { id: 'bp-1', title: 'SaaS MVP', category: 'saas', summary: 'x', problem_statement: 'p', solution_concept: 's', target_market: 'm', is_active: true },
  ];

  test('pass case: gate invoked, undeclared candidate auto-passes, PathOutput returned', async () => {
    const supabase = makeSupabase({ envelopeRows: DELIVERED_ROWS, tableData: { opportunity_blueprints: blueprints } });
    const result = await executeBlueprintBrowse({}, { supabase, logger: silentLogger });

    expect(result).not.toBeNull();
    expect(result.origin_type).toBe('blueprint');
    expect(supabase._calledTables).toContain('v_unified_capabilities');
  });

  test('EnvelopeUnavailableError propagates fail-closed, not swallowed', async () => {
    const supabase = makeSupabase({ tableData: { opportunity_blueprints: blueprints } });
    supabase.from = vi.fn((table) => {
      if (table === 'v_unified_capabilities') {
        return { select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: null, error: { message: 'view down' } }) };
      }
      return chainableResult(blueprints);
    });

    await expect(executeBlueprintBrowse({}, { supabase, logger: silentLogger }))
      .rejects.toBeInstanceOf(EnvelopeUnavailableError);
  });
});

describe('traversability gate reach — competitor_teardown (CH-6)', () => {
  function makeLlm(deconstructionOverrides = {}) {
    return {
      _model: 'test-model',
      complete: vi.fn().mockImplementation((_sys, prompt) => {
        // analyzeCompetitor prompt asks for company_name; deconstructToFirstPrinciples asks for automation_solution
        if (prompt.includes('first-principles')) {
          return Promise.resolve(JSON.stringify({
            suggested_venture_name: 'AI Venture', root_customer_problem: 'p', automation_solution: 's', target_market: 'm',
            ...deconstructionOverrides,
          }));
        }
        return Promise.resolve(JSON.stringify({ company_name: 'TestCorp', url: 'http://test.com' }));
      }),
    };
  }

  test('pass case: gate invoked, required_capabilities matching the envelope passes', async () => {
    const supabase = makeSupabase({ envelopeRows: DELIVERED_ROWS });
    const llmClient = makeLlm({ required_capabilities: [{ name: 'venture web deploy', kind: 'form_factor' }] });

    const result = await executeCompetitorTeardown(
      { urls: ['http://competitor.com'] },
      { supabase, logger: silentLogger, llmClient }
    );

    expect(result).not.toBeNull();
    expect(result.required_capabilities).toEqual([{ name: 'venture web deploy', kind: 'form_factor' }]);
    expect(supabase._calledTables).toContain('v_unified_capabilities');
  });

  test('fail case: undelivered required_capabilities -> parked, path returns null', async () => {
    let parkedRow = null;
    const supabase = makeSupabase({
      envelopeRows: DELIVERED_ROWS,
      onParkInsert: (row) => { parkedRow = row; },
    });
    const llmClient = makeLlm({ required_capabilities: [{ name: 'undelivered thing', kind: 'integration' }] });

    const result = await executeCompetitorTeardown(
      { urls: ['http://competitor.com'] },
      { supabase, logger: silentLogger, llmClient }
    );

    expect(result).toBeNull();
    expect(parkedRow).not.toBeNull();
    expect(parkedRow.source_ref.missing[0].name).toBe('undelivered thing');
  });

  test('EnvelopeUnavailableError propagates fail-closed, not swallowed', async () => {
    const supabase = makeSupabase({});
    supabase.from = vi.fn((table) => {
      if (table === 'v_unified_capabilities') {
        return { select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: null, error: { message: 'view down' } }) };
      }
      return chainableResult(null);
    });
    const llmClient = makeLlm();

    await expect(executeCompetitorTeardown({ urls: ['http://competitor.com'] }, { supabase, logger: silentLogger, llmClient }))
      .rejects.toBeInstanceOf(EnvelopeUnavailableError);
  });
});

describe('traversability gate reach — seeded_from_venture (CH-6)', () => {
  const sourceVenture = {
    id: 'venture-1', name: 'Acme', problem_statement: 'p', solution: 's', target_market: 'm',
    archetype: 'b2b_saas', raw_chairman_intent: 'x', moat_strategy: 'y',
    metadata: { stage_zero: { required_capabilities: [{ name: 'venture web deploy', kind: 'form_factor' }] } },
  };

  test('pass case: carried-forward required_capabilities matching the envelope passes, gate invoked', async () => {
    const supabase = makeSupabase({ envelopeRows: DELIVERED_ROWS, tableData: { ventures: sourceVenture } });

    const result = await executeVentureReseeding({ source_venture_id: 'venture-1' }, { supabase, logger: silentLogger });

    expect(result).not.toBeNull();
    expect(result.required_capabilities).toEqual([{ name: 'venture web deploy', kind: 'form_factor' }]);
    expect(supabase._calledTables).toContain('v_unified_capabilities');
  });

  test('fail case: source venture requires an undelivered capability -> parked, path returns null', async () => {
    const source = { ...sourceVenture, metadata: { stage_zero: { required_capabilities: [{ name: 'undelivered thing', kind: 'integration' }] } } };
    let parkedRow = null;
    const supabase = makeSupabase({
      envelopeRows: DELIVERED_ROWS,
      tableData: { ventures: source },
      onParkInsert: (row) => { parkedRow = row; },
    });

    const result = await executeVentureReseeding({ source_venture_id: 'venture-1' }, { supabase, logger: silentLogger });

    expect(result).toBeNull();
    expect(parkedRow).not.toBeNull();
    expect(parkedRow.source_ref.missing[0].name).toBe('undelivered thing');
  });

  test('EnvelopeUnavailableError propagates fail-closed, not swallowed', async () => {
    const supabase = makeSupabase({ tableData: { ventures: sourceVenture } });
    supabase.from = vi.fn((table) => {
      if (table === 'v_unified_capabilities') {
        return { select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: null, error: { message: 'view down' } }) };
      }
      return chainableResult(sourceVenture);
    });

    await expect(executeVentureReseeding({ source_venture_id: 'venture-1' }, { supabase, logger: silentLogger }))
      .rejects.toBeInstanceOf(EnvelopeUnavailableError);
  });
});
