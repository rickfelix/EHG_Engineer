/**
 * Tests for orchestrator-terminal-guard.js
 * SD-FDBK-FIX-ORCHESTRATOR-GHOST-COMPLETE-001
 *
 * Invariants:
 *   1. No canonical SD_COMPLETION retro -> refuse (RETRO_MISSING), no SD write at all.
 *   2. Canonical retro -> stage at status='pending_approval' and surface the
 *      LEAD-FINAL-APPROVAL command. NEVER write status='completed'.
 *   3. Staging update failure -> routed=false, no command.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { routeOrchestratorToLeadFinal, leadFinalCommand } from './orchestrator-terminal-guard.js';

/**
 * Chainable, thenable Supabase query mock. Every builder method returns the
 * chain; awaiting the chain (or calling maybeSingle) resolves `result`.
 */
function makeChain(result) {
  const c = {};
  ['select', 'eq', 'neq', 'or', 'gt', 'order', 'limit', 'update', 'insert', 'in'].forEach(m => {
    c[m] = vi.fn(() => c);
  });
  c.maybeSingle = vi.fn(async () => result);
  c.single = vi.fn(async () => result);
  c.then = (res, rej) => Promise.resolve(result).then(res, rej);
  return c;
}

function makeSupabase(tables) {
  return {
    from: vi.fn((table) => {
      if (!tables[table]) throw new Error(`unexpected table: ${table}`);
      return tables[table];
    })
  };
}

describe('leadFinalCommand', () => {
  it('names the LEAD-FINAL-APPROVAL executor for the SD', () => {
    expect(leadFinalCommand('SD-X-001')).toBe('node scripts/handoff.js execute LEAD-FINAL-APPROVAL SD-X-001');
  });
});

describe('routeOrchestratorToLeadFinal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses with RETRO_MISSING and performs NO SD write when no canonical retro exists', async () => {
    const sdChain = makeChain({ data: null, error: null });
    const supabase = makeSupabase({
      strategic_directives_v2: sdChain,
      sd_phase_handoffs: makeChain({ data: null, error: null }),
      retrospectives: makeChain({ data: null, error: null }) // e.g. only HANDOFF retros -> filter matches nothing
    });

    const result = await routeOrchestratorToLeadFinal(
      supabase,
      { id: 'uuid-1', created_at: '2026-01-01T00:00:00Z' },
      { source: 'test' }
    );

    expect(result.routed).toBe(false);
    expect(result.reason).toBe('RETRO_MISSING');
    expect(result.command).toBeNull();
    expect(sdChain.update).not.toHaveBeenCalled();
  });

  it('stages at pending_approval (never completed) and surfaces the LEAD-FINAL command when the canonical retro exists', async () => {
    const sdChain = makeChain({ data: { id: 'uuid-1' }, error: null });
    const supabase = makeSupabase({
      strategic_directives_v2: sdChain,
      sd_phase_handoffs: makeChain({ data: { accepted_at: '2026-01-02T00:00:00Z' }, error: null }),
      retrospectives: makeChain({
        data: { id: 'r1', retro_type: 'SD_COMPLETION', created_at: '2026-01-03T00:00:00Z' },
        error: null
      })
    });

    const result = await routeOrchestratorToLeadFinal(
      supabase,
      { id: 'uuid-1', sd_key: 'SD-ORCH-001', created_at: '2026-01-01T00:00:00Z' },
      { source: 'test' }
    );

    expect(result.routed).toBe(true);
    expect(result.command).toBe('node scripts/handoff.js execute LEAD-FINAL-APPROVAL SD-ORCH-001');

    expect(sdChain.update).toHaveBeenCalledOnce();
    const payload = sdChain.update.mock.calls[0][0];
    expect(payload.status).toBe('pending_approval');
    expect(payload.status).not.toBe('completed');
    expect(payload.current_phase).toBeUndefined(); // terminal phase is written only by the LFA executor
    // guard refuses to touch already-completed rows
    expect(sdChain.neq).toHaveBeenCalledWith('status', 'completed');
  });

  it('returns STAGE_UPDATE_FAILED (no command) when the staging update errors', async () => {
    const sdChain = makeChain({ data: null, error: { message: 'trigger blocked' } });
    const supabase = makeSupabase({
      strategic_directives_v2: sdChain,
      sd_phase_handoffs: makeChain({ data: null, error: null }),
      retrospectives: makeChain({
        data: { id: 'r1', retro_type: 'SD_COMPLETION', created_at: '2026-01-03T00:00:00Z' },
        error: null
      })
    });

    const result = await routeOrchestratorToLeadFinal(
      supabase,
      { id: 'uuid-1', created_at: '2026-01-01T00:00:00Z' },
      { source: 'test' }
    );

    expect(result.routed).toBe(false);
    expect(result.reason).toBe('STAGE_UPDATE_FAILED');
    expect(result.command).toBeNull();
  });
});
