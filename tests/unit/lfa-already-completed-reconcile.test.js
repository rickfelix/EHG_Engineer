/**
 * SD-REFILL-0038AO42 — pins the already-completed / resume-from-checkpoint ghost fix.
 *
 * Shape: an SD that reaches LEAD-FINAL-APPROVAL while ALREADY status='completed'
 * (squash-merge / reconcile raced ahead, then the session resumed from a compacted
 * checkpoint) took the `_alreadyCompleted` early-return in executeSpecific, which
 * NEVER wrote the canonical accepted sd_phase_handoffs LFA row that
 * v_sd_completion_integrity requires — leaving a permanent ghost despite a genuine,
 * gate-verified completion (observed: SD-LEO-INFRA-VENTURE-INTAKE-GATE-PACK-001).
 *
 * Fix under pin: the `_alreadyCompleted` branch calls `_reconcileCanonicalLfaRow`,
 * which idempotently writes the canonical row (created_by='ADMIN_OVERRIDE', since a
 * completed SD has is_working_on=false), sourced from the accepted
 * leo_handoff_executions row, and is NON-FATAL on write failure.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LeadFinalApprovalExecutor } from '../../scripts/modules/handoff/executors/lead-final-approval/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(
  resolve(__dirname, '../../scripts/modules/handoff/executors/lead-final-approval/index.js'),
  'utf8'
);

/**
 * Minimal chainable Supabase mock. Each `.from(table)` returns a thenable builder
 * whose terminal awaits resolve to a per-(table, op) configured result. Captures the
 * insert payload for assertions.
 *
 * @param {object} cfg
 * @param {object|null} cfg.existingSph  result for the sd_phase_handoffs select (maybeSingle)
 * @param {Array}       cfg.lheRows      result for the leo_handoff_executions select (await)
 * @param {object|null} cfg.insertError  error to return from the insert (null = success)
 */
function makeSupabase(cfg) {
  const calls = { inserts: [], selectedTables: [] };
  function builder(table) {
    let op = 'select';
    const b = {
      select() { op = 'select'; return b; },
      insert(payload) { op = 'insert'; calls.inserts.push({ table, payload }); return Promise.resolve({ error: cfg.insertError ?? null }); },
      eq() { return b; },
      order() { return b; },
      limit() {
        // leo_handoff_executions select resolves on .limit() (no maybeSingle)
        if (table === 'leo_handoff_executions') return Promise.resolve({ data: cfg.lheRows ?? [] });
        return b;
      },
      maybeSingle() { return Promise.resolve({ data: cfg.existingSph ?? null }); },
    };
    return b;
  }
  return {
    _calls: calls,
    from(table) { calls.selectedTables.push(table); return builder(table); },
  };
}

function makeExecutor(supabase) {
  // Bypass the heavy constructor — _reconcileCanonicalLfaRow only touches this.supabase.
  const exec = Object.create(LeadFinalApprovalExecutor.prototype);
  exec.supabase = supabase;
  return exec;
}

const SD = { id: 'uuid-gate-pack', sd_key: 'SD-LEO-INFRA-VENTURE-INTAKE-GATE-PACK-001' };

describe('LFA already-completed canonical reconcile (SD-REFILL-0038AO42)', () => {
  it('writes the canonical accepted SPH LFA row when none exists, using ADMIN_OVERRIDE', async () => {
    const supabase = makeSupabase({ existingSph: null, lheRows: [{ id: 'lhe-1', validation_score: 99 }], insertError: null });
    const exec = makeExecutor(supabase);
    await exec._reconcileCanonicalLfaRow(SD, { actualScore: 50 });

    expect(supabase._calls.inserts).toHaveLength(1);
    const { table, payload } = supabase._calls.inserts[0];
    expect(table).toBe('sd_phase_handoffs');
    expect(payload.handoff_type).toBe('LEAD-FINAL-APPROVAL');
    expect(payload.status).toBe('accepted');
    expect(payload.created_by).toBe('ADMIN_OVERRIDE'); // completed SD => is_working_on=false => must bypass claim guard
    expect(payload.to_phase).toBe('LEAD'); // APPROVAL->LEAD coercion (CHECK-safe)
    expect(payload.validation_score).toBe(99); // sourced from accepted LHE, not the gate fallback
    expect(payload.metadata.source_execution_id).toBe('lhe-1');
  });

  it('is idempotent: an existing accepted canonical row short-circuits the insert', async () => {
    const supabase = makeSupabase({ existingSph: { id: 'sph-existing' }, lheRows: [{ id: 'lhe-1', validation_score: 99 }], insertError: null });
    const exec = makeExecutor(supabase);
    await exec._reconcileCanonicalLfaRow(SD, {});
    expect(supabase._calls.inserts).toHaveLength(0);
  });

  it('falls back to score 100 when no accepted LHE row and no gate score', async () => {
    const supabase = makeSupabase({ existingSph: null, lheRows: [], insertError: null });
    const exec = makeExecutor(supabase);
    await exec._reconcileCanonicalLfaRow(SD, undefined);
    expect(supabase._calls.inserts).toHaveLength(1);
    expect(supabase._calls.inserts[0].payload.validation_score).toBe(100);
    expect(supabase._calls.inserts[0].payload.metadata.source_execution_id).toBeNull();
  });

  it('is NON-FATAL: a rejected insert does not throw (verification still succeeds)', async () => {
    const supabase = makeSupabase({ existingSph: null, lheRows: [{ id: 'lhe-1', validation_score: 99 }], insertError: { message: 'trigger rejected' } });
    const exec = makeExecutor(supabase);
    await expect(exec._reconcileCanonicalLfaRow(SD, {})).resolves.toBeUndefined();
  });

  it('source-contract: the _alreadyCompleted branch invokes the reconcile before returning success', () => {
    const branchIdx = SRC.indexOf('SD already completed - verification passed');
    const reconcileCallIdx = SRC.indexOf('_reconcileCanonicalLfaRow(sd, gateResults)');
    const returnIdx = SRC.indexOf("message: 'SD already completed - all gates verified'");
    expect(branchIdx).toBeGreaterThan(-1);
    expect(reconcileCallIdx).toBeGreaterThan(branchIdx);
    expect(reconcileCallIdx).toBeLessThan(returnIdx); // reconcile happens before the success return
  });
});
