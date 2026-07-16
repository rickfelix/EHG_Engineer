/**
 * SD-LEO-GEN-SATELLITE-AGENT-LIFECYCLE-001 (Satellite 3.6 Agent-lifecycle, phase b)
 *
 * Proofs (mirrors tests/unit/eva/stage-zero/retire-monitoring-chain.test.js's structure):
 *  1. HONESTY — zero venture_ceo rows renders NO-DATA, never a fabricated all-clear.
 *  2. ANTI-FABRICATION — status='active' alone never clears a ghost (the core trap).
 *  3. FALSE-POSITIVE GUARD — a row with real live evidence is not flagged.
 *  4. READ-ONLY — the gauge never calls a mutating Supabase method.
 *  5. RETENTION — venture-ceo-factory.js's chairman-ratified data exports are untouched.
 *  6. RETIREMENT NOTE — the CEO-authority-gate documents its retirement + successor path.
 */

import { describe, test, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve as resolvePath } from 'path';
import { checkGhostCeos, NO_DATA_MARKER } from '../../../lib/agents/ghost-ceo-gauge.js';
import { STANDARD_VENTURE_TEMPLATE, EHG_SHARED_OPERATORS } from '../../../lib/agents/venture-ceo-factory.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(__dir, '../../..');

function mockSupabase(rows, { trackMutations } = {}) {
  const calls = [];
  const chain = {
    select: (...a) => { calls.push(['select', ...a]); return chain; },
    eq: (...a) => { calls.push(['eq', ...a]); return chain; },
    insert: (...a) => { calls.push(['insert', ...a]); return chain; },
    update: (...a) => { calls.push(['update', ...a]); return chain; },
    delete: (...a) => { calls.push(['delete', ...a]); return chain; },
    upsert: (...a) => { calls.push(['upsert', ...a]); return chain; },
    then: (resolve) => resolve({ data: rows, error: null }),
  };
  return {
    from: (table) => { calls.push(['from', table]); return chain; },
    __calls: calls,
  };
}

describe('honesty: zero venture_ceo rows', () => {
  test('renders the explicit NO-DATA marker, never a fabricated all-clear', async () => {
    const supabase = mockSupabase([]);
    const result = await checkGhostCeos(supabase);
    expect(result.status).toBe('NO_DATA');
    expect(result.ghosts).toEqual([]);
    expect(result.status).not.toBe('OK'); // NO-DATA must never read as a clean bill of health
  });

  test('NO_DATA_MARKER is exported and stable for downstream greppability', () => {
    expect(NO_DATA_MARKER).toMatch(/^NO-DATA:/);
  });
});

describe('anti-fabrication: status alone never clears a ghost', () => {
  test('a status=active row with no independent live evidence is flagged as a ghost', async () => {
    const rows = [{ id: 'ceo-1', venture_id: 'v-1', status: 'active' }];
    const supabase = mockSupabase(rows);
    const result = await checkGhostCeos(supabase); // default provider: no evidence source exists
    expect(result.status).toBe('GHOSTS_FOUND');
    expect(result.ghosts).toHaveLength(1);
    expect(result.ghosts[0].agentId).toBe('ceo-1');
    expect(result.ghosts[0].reason).toMatch(/not proof of liveness/);
  });
});

describe('false-positive guard: real live evidence clears a row', () => {
  test('a row with corroborating live evidence is not flagged', async () => {
    const rows = [{ id: 'ceo-2', venture_id: 'v-2', status: 'active' }];
    const supabase = mockSupabase(rows);
    const livenessEvidenceProvider = async (row) => row.id === 'ceo-2';
    const result = await checkGhostCeos(supabase, { livenessEvidenceProvider });
    expect(result.status).toBe('OK');
    expect(result.ghosts).toEqual([]);
  });
});

describe('read-only guarantee', () => {
  test('the gauge never invokes a mutating Supabase method', async () => {
    const rows = [{ id: 'ceo-3', venture_id: null, status: 'active' }];
    const supabase = mockSupabase(rows);
    await checkGhostCeos(supabase);
    const mutatingCalls = supabase.__calls.filter(([method]) => ['insert', 'update', 'delete', 'upsert'].includes(method));
    expect(mutatingCalls).toEqual([]);
  });
});

describe('retention: chairman-ratified venture-ceo-factory.js data exports are untouched', () => {
  test('STANDARD_VENTURE_TEMPLATE still contains VP_CUSTOMER, Sales_Crew, and VP_MARKETING', () => {
    const serialized = JSON.stringify(STANDARD_VENTURE_TEMPLATE);
    expect(serialized).toContain('VP_CUSTOMER');
    expect(serialized).toContain('Sales_Crew');
    expect(serialized).toContain('VP_MARKETING');
  });

  test('EHG_SHARED_OPERATORS still has all 4 chairman-ratified shared operators', () => {
    const roles = EHG_SHARED_OPERATORS.map((o) => o.agent_role);
    expect(roles).toContain('FINANCE_BILLING_OPERATOR');
    expect(roles).toContain('LEGAL_COMPLIANCE_OPERATOR');
    expect(roles).toContain('SECURITY_POSTURE_OPERATOR');
    expect(EHG_SHARED_OPERATORS.length).toBeGreaterThanOrEqual(4);
  });
});

describe('retirement note: CEO-authority-gate documents its retirement + successor path', () => {
  test('handoff-operations.js names this SD, the audit verdict, and retains the code', () => {
    const src = readFileSync(resolvePath(repoRoot, 'lib/agents/modules/venture-state-machine/handoff-operations.js'), 'utf8');
    expect(src).toContain('RETIREMENT NOTE');
    expect(src).toContain('SD-LEO-GEN-SATELLITE-AGENT-LIFECYCLE-001');
    expect(src).toContain('venture-ceo-factory-reachability-verdict.json');
    expect(src).toContain('export async function verifyCeoAuthority');
  });

  test('venture-state-machine.js names this SD + verdict at commitStageTransition, and retains the method', () => {
    const src = readFileSync(resolvePath(repoRoot, 'lib/agents/venture-state-machine.js'), 'utf8');
    expect(src).toContain('RETIREMENT NOTE');
    expect(src).toContain('SD-LEO-GEN-SATELLITE-AGENT-LIFECYCLE-001');
    expect(src).toContain('venture-ceo-factory-reachability-verdict.json');
    expect(src).toContain('async commitStageTransition(commitRequest)');
  });

  test('the cited audit verdict file exists and records verdict=RETIRE', () => {
    const verdictPath = resolvePath(repoRoot, 'docs/audits/venture-ceo-factory-reachability-verdict.json');
    const verdict = JSON.parse(readFileSync(verdictPath, 'utf8'));
    expect(verdict.verdict).toBe('RETIRE');
  });
});
