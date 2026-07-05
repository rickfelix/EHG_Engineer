/**
 * SD-LEO-INFRA-DEFINITION-DONE-ACTIVATION-001 (G3) — activation-evidence extension to the
 * INVOCATION_PATH_PROOF gate. FR-1 (tri-state classification), FR-3 (real-event evidence via
 * scope_completion_chain), FR-4 (ARMED via periodic_process_registry), FR-5 (parent exemption).
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  createInvocationPathGate,
  evaluateActivationEvidence,
  resolveActivationEvidenceMode,
  checkActivationEvidence,
  checkArmedRegistration,
} from '../../../scripts/modules/handoff/executors/lead-final-approval/gates/invocation-path-gate.js';

const WORKER_SD = { sd_key: 'SD-TEST-WORKER-001', id: 'sd-1', key_changes: [{ type: 'worker', change: 'Add a new worker' }] };
const DOCS_SD = { sd_key: 'SD-TEST-DOCS-001', id: 'sd-2', key_changes: [{ type: 'documentation', change: 'docs' }] };
const ORCH_PARENT_SD = { sd_key: 'SD-TEST-ORCH-001', id: 'sd-3', sd_type: 'orchestrator', key_changes: [{ type: 'worker', change: 'children build workers' }] };

describe('resolveActivationEvidenceMode', () => {
  it('defaults to advisory', () => {
    expect(resolveActivationEvidenceMode({})).toBe('advisory');
  });
  it('promotes to block only on the exact literal', () => {
    expect(resolveActivationEvidenceMode({ ACTIVATION_EVIDENCE_MODE: 'block' })).toBe('block');
    expect(resolveActivationEvidenceMode({ ACTIVATION_EVIDENCE_MODE: 'BLOCK' })).toBe('advisory');
  });
});

describe('evaluateActivationEvidence — pure tri-state classification', () => {
  it('non-machinery SD is not_applicable regardless of evidence', () => {
    expect(evaluateActivationEvidence(DOCS_SD, {}).state).toBe('not_applicable');
  });

  it('FR-5: orchestrator parent is exempt even with a machinery-class type', () => {
    const result = evaluateActivationEvidence(ORCH_PARENT_SD, {});
    expect(result.state).toBe('not_applicable');
    expect(result.reason).toBe('orchestrator_parent_exempt');
  });

  it('machinery-class SD with no evidence is UNWIRED', () => {
    expect(evaluateActivationEvidence(WORKER_SD, {}).state).toBe('UNWIRED');
  });

  it('machinery-class SD with real-event evidence is ACTIVATED', () => {
    expect(evaluateActivationEvidence(WORKER_SD, { hasActivatedEvidence: true }).state).toBe('ACTIVATED');
  });

  it('machinery-class SD with only an ARMED registration is ARMED', () => {
    expect(evaluateActivationEvidence(WORKER_SD, { hasArmedRegistration: true }).state).toBe('ARMED');
  });

  it('ACTIVATED wins over ARMED when both are present', () => {
    expect(evaluateActivationEvidence(WORKER_SD, { hasActivatedEvidence: true, hasArmedRegistration: true }).state).toBe('ACTIVATED');
  });
});

describe('checkActivationEvidence / checkArmedRegistration — DB lookups (fail-open)', () => {
  function fakeSb({ activationRows = [], armedRows = [], errorOn = null, selectCalls = [] } = {}) {
    return {
      selectCalls,
      from(table) {
        return {
          select(cols) {
            selectCalls.push({ table, cols });
            const chain = {
              in: () => chain,
              eq: () => chain,
              not: () => chain,
              contains: () => chain,
              limit: () => {
                if (errorOn === table) return Promise.resolve({ data: null, error: { message: 'boom' } });
                return Promise.resolve({ data: table === 'scope_completion_chain' ? activationRows : armedRows, error: null });
              },
            };
            return chain;
          },
        };
      },
    };
  }

  // Regression: periodic_process_registry's PRIMARY KEY is process_key (TEXT) — the table
  // has NO `id` column. A `.select('id')` against it does not error in this mock (which
  // doesn't validate real column existence), but WOULD error against the live schema,
  // silently making checkArmedRegistration always fail-open to false. Pin the real column.
  it("checkArmedRegistration selects 'process_key' (periodic_process_registry has no id column)", async () => {
    const calls = [];
    const sb = fakeSb({ selectCalls: calls });
    await checkArmedRegistration(sb, WORKER_SD);
    const call = calls.find((c) => c.table === 'periodic_process_registry');
    expect(call.cols).toBe('process_key');
  });

  it("checkActivationEvidence selects 'id' (scope_completion_chain DOES have an id PK)", async () => {
    const calls = [];
    const sb = fakeSb({ selectCalls: calls });
    await checkActivationEvidence(sb, WORKER_SD);
    const call = calls.find((c) => c.table === 'scope_completion_chain');
    expect(call.cols).toBe('id');
  });

  it('returns true when scope_completion_chain has a matching real-event row', async () => {
    const sb = fakeSb({ activationRows: [{ id: 'row-1' }] });
    expect(await checkActivationEvidence(sb, WORKER_SD)).toBe(true);
  });

  it('returns false when scope_completion_chain has no matching row', async () => {
    const sb = fakeSb({ activationRows: [] });
    expect(await checkActivationEvidence(sb, WORKER_SD)).toBe(false);
  });

  it('fails open (false) on a query error, never throws', async () => {
    const sb = fakeSb({ errorOn: 'scope_completion_chain' });
    await expect(checkActivationEvidence(sb, WORKER_SD)).resolves.toBe(false);
  });

  it('returns true when periodic_process_registry has a matching liveness_source_ref', async () => {
    const sb = fakeSb({ armedRows: [{ id: 'row-2' }] });
    expect(await checkArmedRegistration(sb, WORKER_SD)).toBe(true);
  });

  it('fails open (false) when supabase is null/undefined', async () => {
    expect(await checkActivationEvidence(null, WORKER_SD)).toBe(false);
    expect(await checkArmedRegistration(undefined, WORKER_SD)).toBe(false);
  });
});

describe('createInvocationPathGate — end-to-end activation-evidence merge (advisory default)', () => {
  const ORIGINAL_ENV = process.env.ACTIVATION_EVIDENCE_MODE;
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.ACTIVATION_EVIDENCE_MODE;
    else process.env.ACTIVATION_EVIDENCE_MODE = ORIGINAL_ENV;
  });

  function fakeSbNoEvidence() {
    return {
      from() {
        return {
          select() {
            const chain = { in: () => chain, eq: () => chain, not: () => chain, contains: () => chain, limit: () => Promise.resolve({ data: [], error: null }) };
            return chain;
          },
        };
      },
    };
  }

  it('advisory (default): a machinery-class SD with no evidence still PASSES, with a warning', async () => {
    delete process.env.ACTIVATION_EVIDENCE_MODE;
    const g = createInvocationPathGate(fakeSbNoEvidence());
    const res = await g.validator({ sd: WORKER_SD });
    expect(res.passed).toBe(true);
    expect(res.warnings.some((w) => w.includes('Machinery-class deliverable'))).toBe(true);
  });

  it('block mode: a machinery-class SD with no evidence FAILS, naming the requirement', async () => {
    process.env.ACTIVATION_EVIDENCE_MODE = 'block';
    const g = createInvocationPathGate(fakeSbNoEvidence());
    const res = await g.validator({ sd: WORKER_SD });
    expect(res.passed).toBe(false);
    expect(res.issues.some((i) => i.includes('Machinery-class deliverable'))).toBe(true);
  });

  it('a non-machinery SD is unaffected (no activation warnings/issues at all)', async () => {
    process.env.ACTIVATION_EVIDENCE_MODE = 'block';
    const g = createInvocationPathGate(fakeSbNoEvidence());
    const res = await g.validator({ sd: DOCS_SD });
    expect(res.passed).toBe(true);
    expect(res.warnings.some((w) => w.includes('Machinery-class'))).toBe(false);
    expect(res.issues.some((i) => i.includes('Machinery-class'))).toBe(false);
  });

  it('FR-5: an orchestrator-parent machinery-class SD is exempt even in block mode', async () => {
    process.env.ACTIVATION_EVIDENCE_MODE = 'block';
    const g = createInvocationPathGate(fakeSbNoEvidence());
    const res = await g.validator({ sd: ORCH_PARENT_SD });
    expect(res.passed).toBe(true);
    expect(res.issues.some((i) => i.includes('Machinery-class'))).toBe(false);
  });
});
