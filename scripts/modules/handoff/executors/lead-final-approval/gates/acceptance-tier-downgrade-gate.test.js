/**
 * Vitest specs for acceptance-tier-downgrade-gate.
 * SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001-C.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createAcceptanceTierDowngradeGate,
  detectLiveTierFRs,
  crossReferenceEvidence,
  normalizeAcceptanceCriteria,
  acEntryText,
  isBindingEnabled,
  LIVE_TIER_KEYWORDS,
  EVIDENCE_TEXT_COLUMNS,
} from './acceptance-tier-downgrade-gate.js';

// The full, live-verified column list on sub_agent_execution_results (queried directly against
// the real database, not a possibly-stale schema file — this is what caught the original
// evidence/test_execution nonexistent-column bug). Frozen here as a regression fence: any
// column the gate selects must be a member of this set.
const REAL_SUB_AGENT_EXECUTION_RESULTS_COLUMNS = [
  'id', 'sd_id', 'sub_agent_code', 'sub_agent_name', 'verdict', 'confidence', 'critical_issues',
  'warnings', 'recommendations', 'detailed_analysis', 'execution_time', 'metadata', 'created_at',
  'updated_at', 'risk_assessment_id', 'validation_mode', 'justification', 'conditions',
  'invocation_id', 'summary', 'raw_output', 'source', 'required_sub_agents', 'phase', 'executed_from_cwd',
];

function mockSupabase({ prd = null, evidenceRows = [], prdThrows = null, evidenceThrows = null, prdQueryError = null, evidenceQueryError = null } = {}) {
  return {
    from(table) {
      if (table === 'product_requirements_v2') {
        return {
          select() { return this; },
          eq() { return this; },
          limit() { return this; },
          maybeSingle: async () => {
            if (prdThrows) throw prdThrows;
            if (prdQueryError) return { data: null, error: prdQueryError };
            return { data: prd };
          },
        };
      }
      if (table === 'sub_agent_execution_results') {
        return {
          select() { return this; },
          eq() { return this; },
          in: async () => {
            if (evidenceThrows) throw evidenceThrows;
            if (evidenceQueryError) return { data: null, error: evidenceQueryError };
            return { data: evidenceRows };
          },
        };
      }
      return { select() { return this; }, eq() { return this; }, in: async () => ({ data: [] }) };
    },
  };
}

const sd = { id: 'test-sd-uuid' };

describe('normalizeAcceptanceCriteria / acEntryText', () => {
  it('handles plain string array entries', () => {
    expect(normalizeAcceptanceCriteria(['never mocked', 'other'])).toEqual(['never mocked', 'other']);
  });

  it('ADD-1: handles object AC entries ({id, criteria, type} shape from auto-trigger-stories.mjs)', () => {
    const entries = [{ id: 'AC-1', criteria: 'this path is never mocked', type: 'functional' }, { id: 'AC-2', criteria: 'must be fast' }];
    expect(normalizeAcceptanceCriteria(entries)).toEqual(['this path is never mocked', 'must be fast']);
  });

  it('ADD-1: mixed array with non-string/null/undefined entries never throws', () => {
    const entries = ['never mocked', 42, null, { criteria: 'live proof required' }, undefined];
    expect(() => normalizeAcceptanceCriteria(entries)).not.toThrow();
    const texts = normalizeAcceptanceCriteria(entries);
    expect(texts).toContain('never mocked');
    expect(texts).toContain('live proof required');
  });

  it('ADD-2: handles acceptance_criteria as a JSON-string-encoded array', () => {
    expect(normalizeAcceptanceCriteria('["never mocked"]')).toEqual(['never mocked']);
  });

  it('ADD-2: handles acceptance_criteria as a plain (non-JSON) string', () => {
    expect(normalizeAcceptanceCriteria('live proof required')).toEqual(['live proof required']);
  });

  it('null/undefined/empty never throw', () => {
    expect(normalizeAcceptanceCriteria(null)).toEqual([]);
    expect(normalizeAcceptanceCriteria(undefined)).toEqual([]);
    expect(normalizeAcceptanceCriteria('')).toEqual([]);
  });

  it('acEntryText falls back to JSON.stringify for an object with no known text field', () => {
    expect(acEntryText({ foo: 'bar' })).toBe('{"foo":"bar"}');
  });
});

describe('TS-1/TS-2 — detectLiveTierFRs keyword matching', () => {
  it('TS-1: flags an FR whose AC contains a high-precision live-tier phrase', () => {
    const frs = [{ id: 'FR-1', title: 'x', acceptance_criteria: ['this is never mocked in prod'] }];
    const flagged = detectLiveTierFRs(frs);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({ frId: 'FR-1', matchedPhrase: 'never mocked' });
  });

  it('TS-2 / ADD-4: does not flag ordinary prose or near-miss phrases', () => {
    const nearMisses = [
      'users should never see a mocked response',       // "never" and "mocked" non-adjacent
      'this endpoint is not mocked in the demo',         // "not mocked" is not a substring of any keyword
      'the feature was delivered live to customers',     // bare "live" (inside "delivered") is not a keyword
    ];
    for (const text of nearMisses) {
      const flagged = detectLiveTierFRs([{ id: 'FR-1', acceptance_criteria: [text] }]);
      expect(flagged, `should not flag: "${text}"`).toHaveLength(0);
    }
  });

  it('ADD-4: LIVE_TIER_KEYWORDS is a fixed, exported list (regression fence against silent loosening)', () => {
    expect(LIVE_TIER_KEYWORDS).toEqual(['never mocked', 'never-mocked', 'live proof required', 'live-verified']);
  });

  it('an FR with no live-tier phrase in any AC is never flagged', () => {
    const frs = [{ id: 'FR-1', acceptance_criteria: ['should be fast', 'should look good'] }];
    expect(detectLiveTierFRs(frs)).toHaveLength(0);
  });
});

describe('TS-3/TS-4/ADD-5 — crossReferenceEvidence, per-FR isolation', () => {
  it('TS-3: a flagged FR with a matching live-evidence row is cleared (hasLiveEvidence=true)', () => {
    const flagged = [{ frId: 'FR-1', matchedPhrase: 'never mocked' }];
    const evidence = [{ summary: 'ran a live proof against production' }];
    const result = crossReferenceEvidence(flagged, evidence);
    expect(result[0].hasLiveEvidence).toBe(true);
  });

  it('TS-4: a flagged FR with zero matching evidence rows is reported (hasLiveEvidence=false)', () => {
    const flagged = [{ frId: 'FR-1', matchedPhrase: 'never mocked' }];
    const evidence = [{ summary: 'ran unit tests only, all passing' }];
    const result = crossReferenceEvidence(flagged, evidence);
    expect(result[0].hasLiveEvidence).toBe(false);
  });

  it('ADD-5: per-FR isolation — evidence for one flagged FR never clears an unrelated flagged FR', () => {
    const flagged = [
      { frId: 'FR-1', matchedPhrase: 'never mocked' },
      { frId: 'FR-2', matchedPhrase: 'live-verified' },
    ];
    // Only ONE evidence row exists, and it says nothing live-tier-related at all.
    const evidence = [{ summary: 'unit tests passing for FR-1 and FR-2' }];
    const result = crossReferenceEvidence(flagged, evidence);
    expect(result.find((f) => f.frId === 'FR-1').hasLiveEvidence).toBe(false);
    expect(result.find((f) => f.frId === 'FR-2').hasLiveEvidence).toBe(false);
  });

  it('ADD-5: a live-evidence row clears ALL flagged FRs when the evidence is genuinely SD-wide (documented leniency)', () => {
    // The scan is SD-wide (any evidence row for the SD), not FR-scoped inside evidence text —
    // this test documents that behavior explicitly rather than leaving it an accident.
    const flagged = [{ frId: 'FR-1', matchedPhrase: 'never mocked' }, { frId: 'FR-2', matchedPhrase: 'live-verified' }];
    const evidence = [{ summary: 'live proof run covering the whole SD' }];
    const result = crossReferenceEvidence(flagged, evidence);
    expect(result.every((f) => f.hasLiveEvidence)).toBe(true);
  });

  it('ADD-3: evidence text found in a JSONB object column (metadata) is detected after stringify', () => {
    const flagged = [{ frId: 'FR-1', matchedPhrase: 'never mocked' }];
    const evidence = [{ summary: null, metadata: { note: 'live run passed' } }];
    expect(crossReferenceEvidence(flagged, evidence)[0].hasLiveEvidence).toBe(true);
  });

  it('ADD-3: null/absent evidence columns never throw', () => {
    const flagged = [{ frId: 'FR-1', matchedPhrase: 'never mocked' }];
    const evidence = [{ detailed_analysis: null, summary: null, critical_issues: null, warnings: null, recommendations: null, metadata: null }];
    expect(() => crossReferenceEvidence(flagged, evidence)).not.toThrow();
    expect(crossReferenceEvidence(flagged, evidence)[0].hasLiveEvidence).toBe(false);
  });

  it('ADD-7 (adversarial-review regression): "reproduction" must NEVER be matched as evidence for "production" (word-boundary fix)', () => {
    const flagged = [{ frId: 'FR-1', matchedPhrase: 'never mocked' }];
    const evidence = [{ summary: 'see reproduction steps in the bug report; unit tests only' }];
    const result = crossReferenceEvidence(flagged, evidence);
    expect(result[0].hasLiveEvidence).toBe(false);
  });

  it('ADD-7: a genuine whole-word "production" mention still counts as live evidence', () => {
    const flagged = [{ frId: 'FR-1', matchedPhrase: 'never mocked' }];
    const evidence = [{ summary: 'ran against production data' }];
    const result = crossReferenceEvidence(flagged, evidence);
    expect(result[0].hasLiveEvidence).toBe(true);
  });
});

describe('TS-5/TS-6/ADD-6 — observe-only vs binding gate result', () => {
  it('TS-5/ADD-6: observe-only mode never blocks and keeps issues empty even with downgrades', async () => {
    delete process.env.ACCEPTANCE_TIER_DOWNGRADE_GATE_BINDING;
    const prd = { functional_requirements: [{ id: 'FR-1', acceptance_criteria: ['never mocked'] }] };
    const evidenceRows = [{ summary: 'unit tests only' }];
    const gate = createAcceptanceTierDowngradeGate(mockSupabase({ prd, evidenceRows }), null);
    const result = await gate.validator({ sd });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.issues).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('FR-1');
  });

  it('TS-6: binding mode blocks when a flagged FR has no live-evidence signal', async () => {
    process.env.ACCEPTANCE_TIER_DOWNGRADE_GATE_BINDING = 'true';
    try {
      const prd = { functional_requirements: [{ id: 'FR-1', acceptance_criteria: ['never mocked'] }] };
      const evidenceRows = [{ summary: 'unit tests only' }];
      const gate = createAcceptanceTierDowngradeGate(mockSupabase({ prd, evidenceRows }), null);
      const result = await gate.validator({ sd });

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.issues).toHaveLength(1);
    } finally {
      delete process.env.ACCEPTANCE_TIER_DOWNGRADE_GATE_BINDING;
    }
  });

  it('binding mode still passes when live-evidence exists', async () => {
    process.env.ACCEPTANCE_TIER_DOWNGRADE_GATE_BINDING = 'true';
    try {
      const prd = { functional_requirements: [{ id: 'FR-1', acceptance_criteria: ['never mocked'] }] };
      const evidenceRows = [{ summary: 'live proof completed' }];
      const gate = createAcceptanceTierDowngradeGate(mockSupabase({ prd, evidenceRows }), null);
      const result = await gate.validator({ sd });
      expect(result.passed).toBe(true);
    } finally {
      delete process.env.ACCEPTANCE_TIER_DOWNGRADE_GATE_BINDING;
    }
  });

  it('isBindingEnabled reads the env flag correctly', () => {
    expect(isBindingEnabled({})).toBe(false);
    expect(isBindingEnabled({ ACCEPTANCE_TIER_DOWNGRADE_GATE_BINDING: 'true' })).toBe(true);
    expect(isBindingEnabled({ ACCEPTANCE_TIER_DOWNGRADE_GATE_BINDING: 'false' })).toBe(false);
  });
});

describe('TS-7 — no PRD / no FRs -> clean pass, no crash', () => {
  it('no PRD found', async () => {
    const gate = createAcceptanceTierDowngradeGate(mockSupabase({ prd: null }), null);
    const result = await gate.validator({ sd });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  it('PRD with no functional_requirements', async () => {
    const gate = createAcceptanceTierDowngradeGate(mockSupabase({ prd: { functional_requirements: [] } }), null);
    const result = await gate.validator({ sd });
    expect(result.passed).toBe(true);
  });

  it('PRD with FRs but none flagged never queries evidence and passes clean', async () => {
    const prd = { functional_requirements: [{ id: 'FR-1', acceptance_criteria: ['should be fast'] }] };
    const gate = createAcceptanceTierDowngradeGate(mockSupabase({ prd, evidenceRows: [] }), null);
    const result = await gate.validator({ sd });
    expect(result.passed).toBe(true);
    expect(result.warnings).toEqual([]);
  });
});

describe('ADD-8/ADD-9 (adversarial-review regression) — DB/IO errors fail OPEN, never escape to the orchestrator', () => {
  it('ADD-8: a PRD lookup error yields a passing result with a warning, not a thrown exception', async () => {
    const gate = createAcceptanceTierDowngradeGate(mockSupabase({ prdThrows: new Error('connection reset') }), null);
    let result;
    await expect((async () => { result = await gate.validator({ sd }); })()).resolves.not.toThrow();
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.warnings.join(' ')).toContain('connection reset');
  });

  it('ADD-9: an evidence lookup error (after FRs are flagged) yields a passing result with a warning, not a thrown exception', async () => {
    const prd = { functional_requirements: [{ id: 'FR-1', acceptance_criteria: ['never mocked'] }] };
    const gate = createAcceptanceTierDowngradeGate(mockSupabase({ prd, evidenceThrows: new Error('timeout') }), null);
    let result;
    await expect((async () => { result = await gate.validator({ sd }); })()).resolves.not.toThrow();
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.warnings.join(' ')).toContain('timeout');
  });

  it('ADD-11 (2nd adversarial-review regression): a PRD query that resolves {data:null,error} WITHOUT throwing still fails open (not silently treated as "no PRD")', async () => {
    const gate = createAcceptanceTierDowngradeGate(mockSupabase({ prdQueryError: { message: 'column "functional_requirements" does not exist' } }), null);
    const result = await gate.validator({ sd });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.warnings.join(' ')).toContain('functional_requirements');
    expect(result.details.error).toBe('prd_lookup_failed');
  });

  it('ADD-12 (2nd adversarial-review regression): an evidence query that resolves {data:null,error} WITHOUT throwing still fails open (not silently treated as "no evidence" -> all-downgraded)', async () => {
    const prd = { functional_requirements: [{ id: 'FR-1', acceptance_criteria: ['never mocked'] }] };
    const gate = createAcceptanceTierDowngradeGate(mockSupabase({ prd, evidenceQueryError: { message: 'permission denied for table sub_agent_execution_results' } }), null);
    const result = await gate.validator({ sd });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.warnings.join(' ')).toContain('permission denied');
    expect(result.details.error).toBe('evidence_lookup_failed');
  });
});

describe('ADD-10 (adversarial-review regression) — prdRepo path (production primary path) is exercised', () => {
  it('prdRepo.getBySdUuid is used when provided, taking precedence over the supabase fallback', async () => {
    const prd = { functional_requirements: [{ id: 'FR-1', acceptance_criteria: ['should be fast'] }] };
    const prdRepo = { getBySdUuid: async () => prd };
    // supabase would return a DIFFERENT (flagged) PRD if it were consulted — proves prdRepo wins.
    const supabase = mockSupabase({ prd: { functional_requirements: [{ id: 'FR-X', acceptance_criteria: ['never mocked'] }] } });
    const gate = createAcceptanceTierDowngradeGate(supabase, prdRepo);
    const result = await gate.validator({ sd });
    expect(result.warnings).toEqual([]); // the unflagged prdRepo PRD was used, not the flagged supabase one
  });
});

describe('TS-8 — evidence query only ever selects columns that really exist on sub_agent_execution_results', () => {
  it('EVIDENCE_TEXT_COLUMNS is a fixed, exported allowlist (regression fence)', () => {
    expect(EVIDENCE_TEXT_COLUMNS).toEqual(['detailed_analysis', 'summary', 'critical_issues', 'warnings', 'recommendations', 'metadata']);
  });

  it('adversarial-review regression: every column in EVIDENCE_TEXT_COLUMNS is a real, live-verified column — and `evidence`/`test_execution` (the originally-shipped bug) are absent', () => {
    for (const col of EVIDENCE_TEXT_COLUMNS) {
      expect(REAL_SUB_AGENT_EXECUTION_RESULTS_COLUMNS, `EVIDENCE_TEXT_COLUMNS entry "${col}" must be a real column`).toContain(col);
    }
    expect(EVIDENCE_TEXT_COLUMNS).not.toContain('evidence');
    expect(EVIDENCE_TEXT_COLUMNS).not.toContain('test_execution');
  });

  it('the gate source never selects a `findings` column, and its sub_agent_execution_results select is built from EVIDENCE_TEXT_COLUMNS', () => {
    const src = readFileSync(new URL('./acceptance-tier-downgrade-gate.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/\.select\([^)]*\bfindings\b[^)]*\)/);
    expect(src).toMatch(/EVIDENCE_TEXT_COLUMNS\.join/);
  });
});
