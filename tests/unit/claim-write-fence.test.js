/**
 * QF-20260711-272 — live coordinator-authority fence at the claim-WRITE boundary.
 *
 * Three claim paths bypassed dispatch fences (worker-checkin resume_final, belt self-claim
 * racing a just-stamped needs_coordinator_review flag, sd-start auto-fallback) because
 * eligibility ran only at candidate-LIST time or not at all. liveClaimWriteFenceReason
 * re-fetches the LIVE row at the write boundary and binds ONLY the coordinator-authority
 * axes (human_action_required / needs_coordinator_review / not_before_hold) — fail-CLOSED
 * on query error, pass-through on a missing row (QF ids), and deliberately NOT binding
 * axes with documented directed-dispatch exemptions (one_way door).
 *
 * @module tests/unit/claim-write-fence.test
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const {
  liveClaimWriteFenceReason,
  CLAIM_WRITE_FENCE_AXES,
} = require('../../lib/fleet/claim-eligibility.cjs');

/** Minimal chainable supabase stub resolving maybeSingle() to the given result. */
function sbReturning(result) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => result,
  };
  return { from: () => chain };
}

describe('liveClaimWriteFenceReason (QF-20260711-272)', () => {
  it('fences a requires_human_action SD at the write boundary', async () => {
    const sb = sbReturning({ data: { sd_key: 'SD-HELD-001', sd_type: 'infrastructure', status: 'draft', metadata: { requires_human_action: true } }, error: null });
    expect(await liveClaimWriteFenceReason(sb, 'SD-HELD-001')).toBe('human_action_required');
  });

  it('fences a needs_coordinator_review SD stamped AFTER candidate assembly (the read-then-claim race)', async () => {
    const sb = sbReturning({ data: { sd_key: 'SD-REVIEW-001', sd_type: 'infrastructure', status: 'draft', metadata: { needs_coordinator_review: true } }, error: null });
    expect(await liveClaimWriteFenceReason(sb, 'SD-REVIEW-001')).toBe('needs_coordinator_review');
  });

  it('fences a future not_before hold', async () => {
    const sb = sbReturning({ data: { sd_key: 'SD-GATED-001', sd_type: 'infrastructure', status: 'draft', metadata: { not_before: '2126-01-01T00:00:00Z' } }, error: null });
    expect(await liveClaimWriteFenceReason(sb, 'SD-GATED-001')).toBe('not_before_hold');
  });

  it('passes an unfenced SD (null)', async () => {
    const sb = sbReturning({ data: { sd_key: 'SD-OPEN-001', sd_type: 'infrastructure', status: 'draft', metadata: {} }, error: null });
    expect(await liveClaimWriteFenceReason(sb, 'SD-OPEN-001')).toBeNull();
  });

  it('does NOT bind non-authority axes at the write boundary (one_way door keeps its directed-dispatch exemption; orchestrator/fixture stay path-specific)', async () => {
    const sb = sbReturning({ data: { sd_key: 'SD-DOOR-001', sd_type: 'orchestrator', status: 'draft', metadata: { door_class_note: 'one_way' } }, error: null });
    expect(await liveClaimWriteFenceReason(sb, 'SD-DOOR-001')).toBeNull();
    expect(CLAIM_WRITE_FENCE_AXES.has('one_way_door_requires_supervision')).toBe(false);
    expect(CLAIM_WRITE_FENCE_AXES.has('orchestrator_parent')).toBe(false);
  });

  it('passes through a missing row (QF ids and other non-SD keys — claim_sd arbitrates those)', async () => {
    const sb = sbReturning({ data: null, error: null });
    expect(await liveClaimWriteFenceReason(sb, 'QF-20260711-999')).toBeNull();
  });

  it('fails CLOSED on a query error', async () => {
    const sb = sbReturning({ data: null, error: new Error('connection reset') });
    expect(await liveClaimWriteFenceReason(sb, 'SD-ERR-001')).toBe('eligibility_check_error');
  });

  it('fails CLOSED on a thrown fault', async () => {
    const sb = { from: () => { throw new Error('boom'); } };
    expect(await liveClaimWriteFenceReason(sb, 'SD-THROW-001')).toBe('eligibility_check_error');
  });
});

describe('claimGuard acquire lane consults the fence (QF-20260711-937 — orchestrator-children / handoff lane)', () => {
  const src = readFileSync(path.resolve(__dirname, '../../lib/claim-guard.mjs'), 'utf8');

  it('imports the shared predicate (no hand-rolled fence re-implementation)', () => {
    expect(src).toContain("liveClaimWriteFenceReason");
    expect(src).toContain("./fleet/claim-eligibility.cjs");
  });

  it('consults the fence BEFORE the acquire claim_sd RPC (Case 3), refusing with the fence named', () => {
    const caseThree = src.indexOf('// Case 3: No active claim');
    expect(caseThree).toBeGreaterThan(-1);
    const fenceCall = src.indexOf('await liveClaimWriteFenceReason(supabase, sdKey)', caseThree);
    const acquireRpc = src.indexOf("rpc('claim_sd'", caseThree);
    expect(fenceCall).toBeGreaterThan(-1);
    expect(acquireRpc).toBeGreaterThan(-1);
    expect(fenceCall).toBeLessThan(acquireRpc);
    expect(src).toContain('claim_write_fence:${fenceReason}');
  });

  it('formatClaimFailure names the fence instead of reporting a claim conflict', () => {
    expect(src).toContain('COORDINATOR-AUTHORITY FENCE');
  });
});

describe('handoff boundary consults the fence (QF-20260711-569 scope-widened leg — SPINE-001-C ran PLAN->EXEC through the fence)', () => {
  const execSrc = readFileSync(path.resolve(__dirname, '../../scripts/modules/handoff/executors/BaseExecutor.js'), 'utf8');

  it('BaseExecutor.execute consults the SHARED predicate before setup/claim and refuses with a named gate', () => {
    const fenceIdx = execSrc.indexOf('liveClaimWriteFenceReason(this.supabase');
    const setupIdx = execSrc.indexOf('// Step 2: Pre-execution setup');
    const claimIdx = execSrc.indexOf('_claimSDForSession(sdId, sd)');
    expect(fenceIdx).toBeGreaterThan(-1);
    expect(setupIdx).toBeGreaterThan(-1);
    expect(fenceIdx).toBeLessThan(setupIdx);
    expect(fenceIdx).toBeLessThan(claimIdx);
    expect(execSrc).toContain('GATE_COORDINATOR_AUTHORITY_FENCE');
    expect(execSrc).toContain('../../../../lib/fleet/claim-eligibility.cjs');
  });

  it('a fenced SD refuses the handoff naming the fence (message embeds the live reason)', () => {
    expect(execSrc).toMatch(/GATE_COORDINATOR_AUTHORITY_FENCE: \$\{fenceReason\} — handoff refused/);
  });

  it('only the documented bypassValidation emergency hatch crosses it, loudly', () => {
    const fenceIdx = execSrc.indexOf('Step 1.9: QF-20260711-569');
    expect(fenceIdx).toBeGreaterThan(-1);
    const block = execSrc.slice(fenceIdx, fenceIdx + 2200);
    expect(block).toContain('options.bypassValidation');
    expect(block).toContain('BYPASS ACTIVE');
  });
});
