// SD-LEO-INFRA-PREMISE-LIVENESS-GATE-SOURCING-001 (FR-1/FR-2/FR-3) — deterministic premise-liveness
// re-verification at SOURCE. Verdict matrix: STALE only when recent recurrence ~0 AND a shipped fix
// exists; LIVE when recent >= threshold; LIVE-but-warn on ambiguity (NEVER STALE). The leo-create-sd
// stale-guard skips STALE diagnostic proposals (no SD created) and fails OPEN on any checker error.
import { describe, it, expect } from 'vitest';
import { checkPremiseLiveness } from '../../lib/eva/premise-liveness.js';
import { ingestProposalObject } from '../../scripts/leo-create-sd.js';

const NOW = Date.parse('2026-06-23T00:00:00Z');

// Configurable supabase double supporting both query chains the checker uses:
//   sd_phase_handoffs: select → eq → gte → order → range (paginated, FR-6 batch 7)
//   strategic_directives_v2: select → eq → gte → or → limit
function mockSb({ handoffs = [], handoffsError = null, completed = [] } = {}) {
  return {
    from(table) {
      if (table === 'sd_phase_handoffs') {
        // Chainable + thenable builder: fetchAllPaginated awaits builder.range(...)
        // and stops on the short page; an error result makes it throw, which the
        // checker's catch converts to { count: null } (fail-open policy under test).
        const b = {};
        for (const m of ['select', 'eq', 'gte', 'order', 'range', 'limit']) b[m] = () => b;
        b.then = (resolve, reject) => Promise.resolve({ data: handoffs, error: handoffsError }).then(resolve, reject);
        return b;
      }
      if (table === 'strategic_directives_v2') {
        return { select: () => ({ eq: () => ({ gte: () => ({ or: () => ({ limit: () => Promise.resolve({ data: completed, error: null }) }) }) }) }) };
      }
      return null;
    },
  };
}

const noGit = () => '';
const gitWithCommits = () => 'abc1234 fix(SD-X): repair the gate';

const GATE = 'ACCEPTANCE_CRITERIA_VALIDATION';
function rejection(reason) { return { rejection_reason: reason, validation_details: null, created_at: '2026-06-20T00:00:00Z' }; }

describe('checkPremiseLiveness — verdict matrix (FR-1)', () => {
  it('STALE: recent recount ~0 AND a shipped fix found → ARCHIVE', async () => {
    const sb = mockSb({ handoffs: [], completed: [{ sd_key: 'SD-LEO-INFRA-HARDEN-LEO-HANDOFF-001', title: 'fix' }] });
    const v = await checkPremiseLiveness(
      { kind: 'retro-mined', gate_name: GATE, source: 't', premise_text: 'recurring AC failures' },
      { supabase: sb, git: noGit, nowMs: NOW }
    );
    expect(v.status).toBe('STALE');
    expect(v.recommendation).toBe('ARCHIVE');
    expect(v.evidence.join(' ')).toMatch(/already-shipped fix|reference/i);
  });

  it('STALE via referenced-file git match → highest confidence', async () => {
    const sb = mockSb({ handoffs: [], completed: [] });
    const v = await checkPremiseLiveness(
      { kind: 'retro-mined', gate_name: GATE, referenced_files: ['scripts/x/acceptance-criteria-validation.js'], source: 't', premise_text: 'x' },
      { supabase: sb, git: gitWithCommits, nowMs: NOW }
    );
    expect(v.status).toBe('STALE');
    expect(v.confidence_score).toBeGreaterThanOrEqual(0.9);
  });

  it('LIVE: recent recount >= threshold → PROCEED', async () => {
    const sb = mockSb({ handoffs: [rejection(GATE), rejection(GATE), rejection(GATE), rejection(GATE)], completed: [] });
    const v = await checkPremiseLiveness(
      { kind: 'rejection-cluster', gate_name: GATE, source: 't', premise_text: 'x' },
      { supabase: sb, git: noGit, nowMs: NOW }
    );
    expect(v.status).toBe('LIVE');
    expect(v.recommendation).toBe('PROCEED');
  });

  it('ambiguous source (no gate/cluster) → LIVE, never STALE', async () => {
    const v = await checkPremiseLiveness(
      { kind: 'retro-mined', source: 't', premise_text: 'no identifier' },
      { supabase: mockSb(), git: noGit, nowMs: NOW }
    );
    expect(v.status).toBe('LIVE');
    expect(v.confidence_score).toBe(0);
  });

  it('recent~0 but NO shipped fix → LIVE (HOLD_FOR_REVIEW), not STALE', async () => {
    const sb = mockSb({ handoffs: [], completed: [] });
    const v = await checkPremiseLiveness(
      { kind: 'retro-mined', gate_name: 'SOME_NEW_GATE', source: 't', premise_text: 'x' },
      { supabase: sb, git: noGit, nowMs: NOW }
    );
    expect(v.status).toBe('LIVE');
    expect(v.recommendation).toBe('HOLD_FOR_REVIEW');
  });

  it('recount query error → LIVE (fail-open), never STALE', async () => {
    const sb = mockSb({ handoffsError: { message: 'db down' }, completed: [{ sd_key: 'SD-X' }] });
    const v = await checkPremiseLiveness(
      { kind: 'retro-mined', gate_name: GATE, source: 't', premise_text: 'x' },
      { supabase: sb, git: noGit, nowMs: NOW }
    );
    expect(v.status).toBe('LIVE');
  });
});

describe('ingestProposalObject stale-guard (FR-2)', () => {
  const baseProposal = (extra = {}) => ({
    PROPOSAL: true, proposed_sd_key: 'SD-TEST-PREMISE-001', title: 'Test premise SD',
    sd_type: 'infrastructure', priority: 'high', ...extra,
  });

  it('STALE diagnostic proposal → skipped-stale, NO SD created', async () => {
    let created = false;
    const res = await ingestProposalObject(
      baseProposal({ premise_descriptor: { kind: 'retro-mined', gate_name: GATE } }),
      'test',
      { deps: {
        keyExists: async () => false,
        createSD: async () => { created = true; },
        checkPremiseLiveness: async () => ({ status: 'STALE', recommendation: 'ARCHIVE', evidence: ['stale'], confidence_score: 0.9 }),
      } }
    );
    expect(res.action).toBe('skipped-stale');
    expect(res.verdict.status).toBe('STALE');
    expect(created).toBe(false);
  });

  it('LIVE diagnostic proposal → proceeds to creation', async () => {
    let created = false;
    const res = await ingestProposalObject(
      baseProposal({ premise_descriptor: { kind: 'retro-mined', gate_name: GATE } }),
      'test',
      { deps: {
        keyExists: async () => false,
        createSD: async () => { created = true; },
        checkPremiseLiveness: async () => ({ status: 'LIVE', recommendation: 'PROCEED', evidence: [], confidence_score: 0.9 }),
      } }
    );
    expect(res.action).toBe('created');
    expect(created).toBe(true);
  });

  it('checker throws → fail-soft, SD still created', async () => {
    let created = false;
    const res = await ingestProposalObject(
      baseProposal({ premise_descriptor: { kind: 'retro-mined', gate_name: GATE } }),
      'test',
      { deps: {
        keyExists: async () => false,
        createSD: async () => { created = true; },
        checkPremiseLiveness: async () => { throw new Error('boom'); },
      } }
    );
    expect(res.action).toBe('created');
    expect(created).toBe(true);
  });

  it('non-diagnostic proposal (no premise_descriptor) → checker never called, created', async () => {
    let checked = false, created = false;
    const res = await ingestProposalObject(
      baseProposal(),
      'test',
      { deps: {
        keyExists: async () => false,
        createSD: async () => { created = true; },
        checkPremiseLiveness: async () => { checked = true; return { status: 'STALE' }; },
      } }
    );
    expect(checked).toBe(false);
    expect(created).toBe(true);
    expect(res.action).toBe('created');
  });

  it('idempotent keyExists skip unchanged (existing key)', async () => {
    const res = await ingestProposalObject(
      baseProposal({ premise_descriptor: { kind: 'retro-mined', gate_name: GATE } }),
      'test',
      { deps: { keyExists: async () => true, createSD: async () => {} } }
    );
    expect(res.action).toBe('skipped');
  });
});
