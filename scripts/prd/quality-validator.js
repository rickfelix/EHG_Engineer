/**
 * PRD Quality Validator (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-129, FR-4)
 *
 * Heuristic post-insert scorer for PRDs created via inline mode. Checks the
 * same four rubric dimensions used by the Russian Judge (see scripts/prd/config.js
 * -> PRD_QUALITY_RUBRIC_CRITERIA) without a second LLM round-trip.
 *
 * Returns a deterministic 0-100 weighted score plus a per-dimension breakdown,
 * so the caller can log structured JSON and pick an enforcement action:
 *   - 'off'    — no-op (default, preserves legacy behavior)
 *   - 'warn'   — print the breakdown, exit 0
 *   - 'block'  — print the breakdown, exit non-zero
 *
 * The validator is pure / side-effect free. Enforcement decisions live in the
 * caller (scripts/prd/index.js).
 */

const PLACEHOLDER_RE = /\b(tbd|to be defined|to be determined|will be determined|placeholder|xxx|fixme)\b/i;
const DEFAULT_PASS_THRESHOLD = 70;

function coerceArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'object') return [value];
  return [];
}

function hasPlaceholderText(value) {
  if (!value) return false;
  const flat = typeof value === 'string' ? value : JSON.stringify(value);
  return PLACEHOLDER_RE.test(flat);
}

function scoreRequirementsDepth(prd) {
  const frs = coerceArray(prd.functional_requirements);
  const trs = coerceArray(prd.technical_requirements);
  const ac = coerceArray(prd.acceptance_criteria);

  const reasons = [];
  let score = 10;

  if (frs.length < 5) {
    score -= 4;
    reasons.push(`functional_requirements=${frs.length} (need >=5)`);
  }
  if (trs.length < 3) {
    score -= 3;
    reasons.push(`technical_requirements=${trs.length} (need >=3)`);
  }
  if (ac.length < 3) {
    score -= 2;
    reasons.push(`acceptance_criteria=${ac.length} (need >=3)`);
  }
  if (hasPlaceholderText(frs) || hasPlaceholderText(trs) || hasPlaceholderText(ac)) {
    score -= 4;
    reasons.push('placeholder text detected');
  }

  // FRs must have per-item acceptance_criteria arrays for implementation-readiness.
  const weakFr = frs.filter(fr => {
    if (!fr || typeof fr !== 'object') return true;
    const req = typeof fr.requirement === 'string' ? fr.requirement : '';
    const acs = coerceArray(fr.acceptance_criteria);
    return req.length < 20 || acs.length === 0;
  }).length;
  if (frs.length > 0 && weakFr / frs.length > 0.3) {
    score -= 2;
    reasons.push(`weak/sparse FRs=${weakFr}/${frs.length}`);
  }

  return { score: Math.max(0, score), reasons };
}

function scoreArchitectureQuality(prd) {
  const arch = prd.system_architecture;
  const impl = prd.implementation_approach;
  const reasons = [];
  let score = 10;

  if (!arch || (typeof arch === 'object' && Object.keys(arch).length === 0)) {
    score -= 6;
    reasons.push('system_architecture missing/empty');
  } else if (typeof arch === 'object') {
    const components = coerceArray(arch.components);
    if (!arch.overview || String(arch.overview).length < 40) {
      score -= 2;
      reasons.push('overview too short');
    }
    if (components.length === 0) {
      score -= 2;
      reasons.push('components missing');
    }
    if (!arch.data_flow) {
      score -= 1;
      reasons.push('data_flow missing');
    }
    if (!coerceArray(arch.integration_points).length) {
      score -= 1;
      reasons.push('integration_points missing');
    }
  }

  if (!impl || (typeof impl === 'object' && Object.keys(impl).length === 0)) {
    score -= 3;
    reasons.push('implementation_approach missing');
  }

  if (hasPlaceholderText(arch) || hasPlaceholderText(impl)) {
    score -= 2;
    reasons.push('placeholder text detected');
  }

  return { score: Math.max(0, score), reasons };
}

function scoreTestSophistication(prd) {
  const tests = coerceArray(prd.test_scenarios);
  const reasons = [];
  let score = 10;

  if (tests.length < 5) {
    score -= 5;
    reasons.push(`test_scenarios=${tests.length} (need >=5)`);
  }
  const types = new Set();
  for (const t of tests) {
    if (t && typeof t === 'object' && typeof t.test_type === 'string') {
      types.add(t.test_type.toLowerCase());
    }
  }
  if (types.size < 2) {
    score -= 2;
    reasons.push(`only ${types.size} test_type(s) represented`);
  }
  const describedCount = tests.filter(t => t && t.scenario && String(t.scenario).length > 15).length;
  if (tests.length > 0 && describedCount / tests.length < 0.8) {
    score -= 2;
    reasons.push('test scenarios lack description');
  }
  if (hasPlaceholderText(tests)) {
    score -= 2;
    reasons.push('placeholder text detected');
  }

  return { score: Math.max(0, score), reasons };
}

function scoreRiskAnalysis(prd) {
  const risks = coerceArray(prd.risks);
  const reasons = [];
  let score = 10;

  if (risks.length < 3) {
    score -= 5;
    reasons.push(`risks=${risks.length} (need >=3)`);
  }
  const missingMitigation = risks.filter(r => !r || !r.mitigation || String(r.mitigation).length < 15).length;
  if (risks.length > 0 && missingMitigation > 0) {
    score -= 3;
    reasons.push(`${missingMitigation} risk(s) missing/weak mitigation`);
  }
  const missingRollback = risks.filter(r => !r || !r.rollback_plan).length;
  if (risks.length > 0 && missingRollback / risks.length > 0.5) {
    score -= 2;
    reasons.push('majority of risks lack rollback_plan');
  }
  if (hasPlaceholderText(risks)) {
    score -= 2;
    reasons.push('placeholder text detected');
  }

  return { score: Math.max(0, score), reasons };
}

/**
 * Evaluate a PRD object against the 4-dimension rubric.
 * @param {Object} prd - PRD row from product_requirements_v2
 * @returns {{
 *   score: number,                // 0-100 weighted
 *   passed: boolean,              // true when score >= threshold
 *   threshold: number,
 *   breakdown: Array<{dimension:string, weight:number, score:number, reasons:string[]}>
 * }}
 */
function validatePRDQuality(prd, opts = {}) {
  const threshold = Number.isFinite(opts.threshold) ? opts.threshold : DEFAULT_PASS_THRESHOLD;
  const safePrd = prd && typeof prd === 'object' ? prd : {};

  const dimensions = [
    { dimension: 'requirements_depth', weight: 0.4, ...scoreRequirementsDepth(safePrd) },
    { dimension: 'architecture_quality', weight: 0.3, ...scoreArchitectureQuality(safePrd) },
    { dimension: 'test_sophistication', weight: 0.2, ...scoreTestSophistication(safePrd) },
    { dimension: 'risk_analysis', weight: 0.1, ...scoreRiskAnalysis(safePrd) }
  ];

  const weighted = dimensions.reduce((sum, d) => sum + d.score * 10 * d.weight, 0);
  const score = Math.round(weighted);

  return {
    score,
    passed: score >= threshold,
    threshold,
    breakdown: dimensions
  };
}

function resolveEnforcementMode() {
  const raw = (process.env.PRD_QUALITY_ENFORCEMENT_MODE || 'off').toLowerCase().trim();
  if (raw === 'warn' || raw === 'block' || raw === 'off') return raw;
  return 'off';
}

export {
  validatePRDQuality,
  resolveEnforcementMode,
  DEFAULT_PASS_THRESHOLD
};
