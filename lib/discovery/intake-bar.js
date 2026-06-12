/**
 * 7-Point Stage-1 Intake Bar — OBSERVE-FIRST (advisory, never blocks)
 * SD-MAN-INFRA-STAGE-REVIVAL-PLUMBING-001 (FR-3)
 *
 * Reconstructed from the DQ themes; the source detail doc was uncommitted in
 * another session tree, so these 7 points are flagged for Adam/chairman
 * ratify-or-amend review (completion flag filed with the SD).
 *
 * Calibration framing: evaluateIntakeBar RECORDS how an idea measures against
 * the bar — it never blocks intake. Blocking semantics (if ever) are a
 * separate chairman-sequenced decision once the cohort calibrates the bar.
 */

const CHECKS = [
  {
    id: 'external_demand_signal',
    label: 'External demand signal with provenance (not self-generated)',
    test: (idea) => {
      const src = idea?.source_type || idea?.source_key || '';
      const evidence = idea?.customer_evidence || idea?.gap_analysis || idea?.competitive_gaps;
      return {
        pass: Boolean(evidence) && src !== 'manual',
        rationale: evidence
          ? `Evidence present (source: ${src || 'unknown'})`
          : 'No customer_evidence / gap_analysis provenance attached',
      };
    },
  },
  {
    id: 'falsifiable_kill_assumption',
    label: 'Pre-registered falsifiable kill-assumption',
    test: (idea) => {
      const k = idea?.kill_assumption || idea?.metadata?.kill_assumption;
      return {
        pass: typeof k === 'string' && k.length >= 20,
        rationale: k ? 'Kill-assumption declared' : 'No kill_assumption field — nothing pre-registered to falsify',
      };
    },
  },
  {
    id: 'pessimistic_band_viability',
    label: 'Pessimistic-band viability (survives the pessimistic estimate)',
    test: (idea) => {
      const score = Number(idea?.confidence_score ?? idea?.opportunity_score ?? NaN);
      return {
        pass: Number.isFinite(score) && score >= 60,
        rationale: Number.isFinite(score)
          ? `Confidence/opportunity score ${score} ${score >= 60 ? 'clears' : 'falls below'} the 60 pessimistic floor`
          : 'No confidence_score/opportunity_score to band',
      };
    },
  },
  {
    id: 'named_spof_assumption',
    label: 'Named single-point-of-failure assumption',
    test: (idea) => {
      const s = idea?.spof_assumption || idea?.metadata?.spof_assumption;
      return {
        pass: typeof s === 'string' && s.length >= 10,
        rationale: s ? 'SPOF assumption named' : 'No spof_assumption — the one thing that sinks it is unnamed',
      };
    },
  },
  {
    id: 'capability_lift_declared',
    label: 'Explicit capability-lift declaration (what existing capability it leverages)',
    test: (idea) => {
      const c = idea?.capability_lift || idea?.metadata?.capability_lift || idea?.differentiation;
      return {
        pass: typeof c === 'string' && c.length >= 10,
        rationale: c ? 'Capability leverage stated' : 'No capability_lift/differentiation — greenfield build implied',
      };
    },
  },
  {
    id: 'mission_anchor',
    label: 'Mission anchor (which discovery source / mission thread it serves)',
    test: (idea) => {
      const m = idea?.source_key || idea?.metadata?.mission_anchor || idea?.source_type;
      return {
        pass: Boolean(m) && m !== 'manual',
        rationale: m ? `Anchored to '${m}'` : 'No source_key/mission_anchor — orphan idea',
      };
    },
  },
  {
    id: 'solo_operator_feasible',
    label: 'Solo-operator feasibility (chairman Phase-1 constraint)',
    test: (idea) => {
      const d = String(idea?.difficulty_level || '').toLowerCase();
      const pass = ['low', 'easy', 'medium', 'moderate'].includes(d);
      return {
        pass,
        rationale: d
          ? `difficulty_level='${d}' ${pass ? 'is' : 'is NOT'} solo-operator feasible`
          : 'No difficulty_level declared',
      };
    },
  },
];

/**
 * Evaluate an idea/blueprint against the 7-point bar.
 * @param {Object} idea - blueprint-shaped object
 * @returns {{score:number, max:number, advisory:true, checks:Array, failures:string[]}}
 */
export function evaluateIntakeBar(idea = {}) {
  const checks = CHECKS.map((c) => {
    let r;
    try {
      r = c.test(idea);
    } catch (e) {
      r = { pass: false, rationale: `check errored: ${e.message}` };
    }
    return { id: c.id, label: c.label, pass: Boolean(r.pass), rationale: r.rationale };
  });
  const failures = checks.filter((c) => !c.pass).map((c) => c.id);
  return {
    score: checks.length - failures.length,
    max: checks.length,
    advisory: true, // observe-first: records, never blocks
    checks,
    failures,
    evaluated_at: new Date().toISOString(),
    bar_version: 'v1-unratified (Adam/chairman review pending)',
  };
}

export default evaluateIntakeBar;
