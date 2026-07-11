/**
 * Activation-evidence block promotion — SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-C.
 * TS-1..TS-6: cutoff-aware machinery default (advisory -> block), env escape hatches,
 * fail-open on lookup error, ARMED pass preserved, grandfather-adjacent lookup helper.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveActivationEvidenceMode,
  getLeadFinalEntry,
  evaluateActivationEvidence,
  ACTIVATION_EVIDENCE_BLOCK_CUTOFF,
} from '../../scripts/modules/handoff/executors/lead-final-approval/gates/invocation-path-gate.js';

const CUTOFF_MS = Date.parse(ACTIVATION_EVIDENCE_BLOCK_CUTOFF);
const before = new Date(CUTOFF_MS - 60_000);
const after = new Date(CUTOFF_MS + 60_000);

describe('resolveActivationEvidenceMode (cutoff-aware default, TS-1/TS-2/TS-3/TS-4)', () => {
  it('TS-1: new entrant (no prior PLAN-TO-LEAD) defaults to block', () => {
    expect(resolveActivationEvidenceMode({}, { leadFinalEnteredAt: null })).toBe('block');
  });

  it('TS-1: post-cutoff entrant defaults to block', () => {
    expect(resolveActivationEvidenceMode({}, { leadFinalEnteredAt: after })).toBe('block');
  });

  it('TS-2: pre-cutoff entrant stays advisory (no retroactive blocks on re-runs)', () => {
    expect(resolveActivationEvidenceMode({}, { leadFinalEnteredAt: before })).toBe('advisory');
  });

  it('boundary: entry exactly at the cutoff blocks (>=)', () => {
    expect(resolveActivationEvidenceMode({}, { leadFinalEnteredAt: new Date(CUTOFF_MS) })).toBe('block');
  });

  it('TS-3: explicit env wins both directions regardless of cutoff', () => {
    expect(resolveActivationEvidenceMode({ ACTIVATION_EVIDENCE_MODE: 'block' }, { leadFinalEnteredAt: before })).toBe('block');
    expect(resolveActivationEvidenceMode({ ACTIVATION_EVIDENCE_MODE: 'advisory' }, { leadFinalEnteredAt: after })).toBe('advisory');
    expect(resolveActivationEvidenceMode({ ACTIVATION_EVIDENCE_MODE: 'advisory' }, { leadFinalEnteredAt: null })).toBe('advisory');
  });

  it('TS-4: lookup-failed (undefined) fail-opens to advisory — never a manufactured block', () => {
    expect(resolveActivationEvidenceMode({}, { leadFinalEnteredAt: undefined })).toBe('advisory');
    expect(resolveActivationEvidenceMode({}, {})).toBe('advisory');
  });
});

describe('getLeadFinalEntry (TS-4 fail-open plumbing)', () => {
  const chain = (result) => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => result }) }) }) }) }) }),
  });

  it('returns Date for an existing PLAN-TO-LEAD row', async () => {
    const d = await getLeadFinalEntry(chain({ data: { created_at: '2026-07-01T00:00:00Z' }, error: null }), { id: 'x' });
    expect(d).toBeInstanceOf(Date);
    expect(d.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('returns null for no row (new entrant)', async () => {
    expect(await getLeadFinalEntry(chain({ data: null, error: null }), { id: 'x' })).toBeNull();
  });

  it('returns undefined on query error / missing client / missing sd id', async () => {
    expect(await getLeadFinalEntry(chain({ data: null, error: { message: 'boom' } }), { id: 'x' })).toBeUndefined();
    expect(await getLeadFinalEntry(null, { id: 'x' })).toBeUndefined();
    expect(await getLeadFinalEntry(chain({ data: null, error: null }), {})).toBeUndefined();
  });
});

describe('evaluateActivationEvidence regression (TS-6)', () => {
  const machinerySd = {
    sd_key: 'SD-X-001',
    sd_type: 'infrastructure',
    title: 'nightly registry sweep',
    // Matches MACHINERY_TEXT_REGEX ('cron job') — the classifier's free-text lane.
    description: 'ship a cron job that sweeps the registry nightly',
    key_changes: [],
    metadata: {},
  };

  it('ARMED machinery SD passes regardless of mode (legitimate pre-fire state)', () => {
    const r = evaluateActivationEvidence(machinerySd, { hasActivatedEvidence: false, hasArmedRegistration: true });
    expect(r.state).toBe('ARMED');
  });

  it('ACTIVATED machinery SD passes', () => {
    const r = evaluateActivationEvidence(machinerySd, { hasActivatedEvidence: true, hasArmedRegistration: false });
    expect(r.state).toBe('ACTIVATED');
  });

  it('UNWIRED machinery SD is the state the block default fails (TS-1 integration seam)', () => {
    const r = evaluateActivationEvidence(machinerySd, { hasActivatedEvidence: false, hasArmedRegistration: false });
    expect(r.state).toBe('UNWIRED');
    // and the mode for a post-cutoff entrant is block:
    expect(resolveActivationEvidenceMode({}, { leadFinalEnteredAt: after })).toBe('block');
  });
});
