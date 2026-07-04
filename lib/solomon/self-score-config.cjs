/**
 * Solomon self-assessment RoleConfig — SD-LEO-INFRA-ROLE-RUBRIC-SCORE-001 FR-3.
 *
 * Dimensions per CLAUDE_SOLOMON.md's "Self-assessment rubric" section
 * (leo_protocol_sections id=611, section_type=solomon_role_contract):
 * D1 Propose-discipline, D2 Unbiased-perspective, D3 Silence/cost-discipline,
 * D4 Judgment quality, D5 Systemic hand-off accuracy.
 *
 * ADDITIVE to (not a replacement for) scripts/solomon-self-adherence-review.mjs, which scores
 * a DIFFERENT concept — duty-parity (did SOLOMON_LOOPS drift out of sync with the contract's
 * durable-duty markers), not rubric quality. Only D1/D3 have a reliable live signal available
 * to a standalone writer today (consult-ledger counters); D2/D4/D5 require reading the verdict
 * object's reasoning content itself and are left INCONCLUSIVE (never fabricated) until a
 * structured verdict-quality signal exists.
 */

const DIMENSIONS = [
  'D1_propose_discipline',
  'D2_unbiased_perspective',
  'D3_silence_cost_discipline',
  'D4_judgment_quality',
  'D5_systemic_handoff_accuracy',
];

const ACTION_HINTS = {
  D1_propose_discipline: 'never claim/source/edit or file an SD — advice and DRAFT feedback flags only',
  D2_unbiased_perspective: "reason from the artifact, not the asker's prior conclusions",
  D3_silence_cost_discipline: 'emit [SOLOMON_OK] when nothing clears the bar; stay within per-SD/per-day quota',
  D4_judgment_quality: 'always include a counterfactual and multi-step why in the verdict',
  D5_systemic_handoff_accuracy: 'flag systemic_flag only on genuine class-bugs; route to Adam, never file the fix',
};

const SCORERS = {
  // Solomon must NEVER claim/source/edit/file an SD -- 0 is the only passing state.
  D1_propose_discipline: (s) => {
    if (s.solomon_claim_count == null) return { score: null, provenance: 'no solomon_claim_count signal (inconclusive)' };
    const n = s.solomon_claim_count;
    return {
      score: n === 0 ? 5 : 1,
      signal: `solomon_claim_count=${n}`,
      provenance: 'claude_sessions Solomon-role rows with a non-null sd_key, or git changes in a Solomon session',
      red_flag: n > 0,
    };
  },
  D2_unbiased_perspective: () => ({ score: null, provenance: 'requires reading verdict reasoning content -- inconclusive, not fabricated' }),
  // quota discipline: consult/audit ledger breach count this cycle (0 = passing)
  D3_silence_cost_discipline: (s) => {
    if (s.quota_breach_count == null) return { score: null, provenance: 'no quota_breach_count signal (inconclusive)' };
    const n = s.quota_breach_count;
    const score = n === 0 ? 5 : n === 1 ? 3 : 1;
    return { score, signal: `quota_breach_count=${n}`, provenance: 'per-SD/per-day consult quota breaches this cycle', red_flag: n > 1 };
  },
  D4_judgment_quality: () => ({ score: null, provenance: 'requires reading the verdict object -- inconclusive, not fabricated' }),
  D5_systemic_handoff_accuracy: () => ({ score: null, provenance: 'requires Adam disposition replies -- inconclusive, not fabricated' }),
};

const SOLOMON_CONFIG = {
  role: 'solomon',
  dimensions: DIMENSIONS,
  scorers: SCORERS,
  actionHints: ACTION_HINTS,
  target: 4,
  belowThresholdAt: 2,
  generatedBy: 'solomon-self-assessment-writer',
};

module.exports = { SOLOMON_CONFIG, DIMENSIONS, ACTION_HINTS, SCORERS };
