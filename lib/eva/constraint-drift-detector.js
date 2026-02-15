/**
 * Constraint Drift Detector
 *
 * SD-LEO-FEAT-CONSTRAINT-DRIFT-001
 * Detects when later stage outputs contradict or drift from earlier
 * stage assumptions. Compares current venture stage outputs against
 * Stage 1 baseline assumptions stored in assumption_sets table.
 *
 * Integration: Results feed into Decision Filter Engine's constraint_drift
 * trigger via buildFilterEnginePayload().
 *
 * @module lib/eva/constraint-drift-detector
 */

const SEVERITY = { NONE: 'NONE', LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' };
const DRIFT_TYPE = {
  NO_CHANGE: 'NO_CHANGE',
  DRIFT: 'DRIFT',
  CONTRADICTION: 'CONTRADICTION',
  NO_BASELINE: 'NO_BASELINE',
  NO_CURRENT_DATA: 'NO_CURRENT_DATA',
  ERROR: 'ERROR',
};

/** Artifact types in priority order for constraint extraction. */
const ARTIFACT_TYPE_PRIORITY = ['stage_output', 'constraints', 'plan', 'decision'];

/** Categories compared for drift. */
const ASSUMPTION_CATEGORIES = [
  'market_assumptions',
  'competitor_assumptions',
  'product_assumptions',
  'timing_assumptions',
];

/**
 * Detect constraint drift between baseline assumptions and current stage.
 *
 * @param {Object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {number} params.currentStage - Current stage number
 * @param {number} [params.baselineStage=1] - Baseline stage (default: Stage 1)
 * @param {Object} params.supabase - Supabase client
 * @param {Object} [params.logger=console] - Logger
 * @returns {Promise<Object>} Drift result
 */
export async function detectConstraintDrift({
  ventureId,
  currentStage,
  baselineStage = 1,
  supabase,
  logger = console,
}) {
  try {
    // 1. Load baseline assumptions
    const baseline = await loadBaselineAssumptions({ ventureId, baselineStage, supabase, logger });
    if (!baseline) {
      logger.info?.(
        `[ConstraintDrift] No baseline assumption_set for venture=${ventureId} stage=${baselineStage}`
      );
      return {
        ventureId,
        baselineStage,
        currentStage,
        baselineAssumptionSetId: null,
        driftDetected: false,
        severity: SEVERITY.NONE,
        findings: [],
      };
    }

    // 2. Extract current-stage constraints from venture_artifacts
    const current = await extractCurrentConstraints({ ventureId, currentStage, supabase, logger });
    if (!current.categories || Object.keys(current.categories).length === 0) {
      return {
        ventureId,
        baselineStage,
        currentStage,
        baselineAssumptionSetId: baseline.id,
        driftDetected: false,
        severity: SEVERITY.NONE,
        findings: [
          {
            category: 'stage_output',
            baselineValue: null,
            currentValue: null,
            driftType: DRIFT_TYPE.NO_CURRENT_DATA,
            rationale: `No artifacts found for venture=${ventureId} stage=${currentStage}`,
            confidence: 1.0,
          },
        ],
      };
    }

    // 3. Compare categories
    const findings = compareCategories(baseline, current.categories, currentStage);

    // 4. Compute severity
    const driftDetected = findings.some(
      f => f.driftType === DRIFT_TYPE.DRIFT || f.driftType === DRIFT_TYPE.CONTRADICTION
    );
    const severity = computeSeverity(findings);

    return {
      ventureId,
      baselineStage,
      currentStage,
      baselineAssumptionSetId: baseline.id,
      driftDetected,
      severity,
      findings,
    };
  } catch (error) {
    logger.error?.(
      `[ConstraintDrift] Error for venture=${ventureId} stage=${currentStage}: ${error.message}`
    );
    return {
      ventureId,
      baselineStage,
      currentStage,
      baselineAssumptionSetId: null,
      driftDetected: false,
      severity: SEVERITY.NONE,
      findings: [
        {
          category: 'error',
          baselineValue: null,
          currentValue: null,
          driftType: DRIFT_TYPE.ERROR,
          rationale: `${error.constructor.name}: ${error.message}`,
          confidence: 0,
        },
      ],
    };
  }
}

/**
 * Build a payload compatible with Decision Filter Engine's constraint_drift trigger.
 *
 * @param {Object} driftResult - Output of detectConstraintDrift
 * @returns {Object|null} Filter engine payload or null if severity < MEDIUM
 */
export function buildFilterEnginePayload(driftResult) {
  if (!driftResult || !driftResult.driftDetected) return null;
  if (
    driftResult.severity === SEVERITY.NONE ||
    driftResult.severity === SEVERITY.LOW
  ) {
    return null;
  }

  const driftFindings = driftResult.findings.filter(
    f => f.driftType === DRIFT_TYPE.DRIFT || f.driftType === DRIFT_TYPE.CONTRADICTION
  );

  const categories = driftFindings.map(f => f.category).join(', ');
  let summary = `Constraint drift detected in ${driftFindings.length} categor${driftFindings.length === 1 ? 'y' : 'ies'}: ${categories}`;
  if (summary.length > 240) {
    summary = summary.slice(0, 237) + '...';
  }

  return {
    type: 'CONSTRAINT_DRIFT',
    ventureId: driftResult.ventureId,
    stage: driftResult.currentStage,
    severity: driftResult.severity,
    summary,
    findings: driftFindings.map(f => ({
      category: f.category,
      driftType: f.driftType,
      rationale: f.rationale,
    })),
  };
}

// ── Internal Helpers ────────────────────────────────────────────

/**
 * Load baseline assumptions from assumption_sets table.
 */
async function loadBaselineAssumptions({ ventureId, baselineStage, supabase }) {
  const { data, error } = await supabase
    .from('assumption_sets')
    .select('id, market_assumptions, competitor_assumptions, product_assumptions, timing_assumptions, confidence_scores')
    .eq('venture_id', ventureId)
    .eq('created_at_stage', baselineStage)
    .in('status', ['active', 'validated'])
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Extract constraint-relevant content from venture_artifacts.
 */
async function extractCurrentConstraints({ ventureId, currentStage, supabase }) {
  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('id, artifact_type, content, created_at')
    .eq('venture_id', ventureId)
    .eq('stage', currentStage)
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!data || data.length === 0) {
    return { categories: {}, sources: [] };
  }

  // Select best artifact by type priority
  let selected = null;
  for (const type of ARTIFACT_TYPE_PRIORITY) {
    const match = data.find(a => a.artifact_type === type);
    if (match) {
      selected = match;
      break;
    }
  }
  // Fallback to most recent artifact
  if (!selected) {
    selected = data[0];
  }

  const content = selected.content || {};
  const categories = {};

  // Extract assumption-like categories from artifact content
  if (content.market_assumptions || content.market) {
    categories.market_assumptions = content.market_assumptions || content.market;
  }
  if (content.competitor_assumptions || content.competitors || content.competitive) {
    categories.competitor_assumptions =
      content.competitor_assumptions || content.competitors || content.competitive;
  }
  if (content.product_assumptions || content.product) {
    categories.product_assumptions = content.product_assumptions || content.product;
  }
  if (content.timing_assumptions || content.timing || content.timeline) {
    categories.timing_assumptions =
      content.timing_assumptions || content.timing || content.timeline;
  }
  // Also check for explicit constraints block
  if (content.constraints) {
    for (const [key, val] of Object.entries(content.constraints)) {
      const catKey = ASSUMPTION_CATEGORIES.includes(key) ? key : null;
      if (catKey) {
        categories[catKey] = categories[catKey] || val;
      } else {
        categories[key] = val;
      }
    }
  }

  return {
    categories,
    sources: [
      {
        artifactId: selected.id,
        artifactType: selected.artifact_type,
        createdAt: selected.created_at,
      },
    ],
  };
}

/**
 * Compare baseline assumptions with current-stage extracted categories.
 */
function compareCategories(baseline, currentCategories, currentStage) {
  const findings = [];
  const allKeys = new Set([
    ...ASSUMPTION_CATEGORIES,
    ...Object.keys(currentCategories),
  ]);

  for (const category of allKeys) {
    const baselineVal = baseline[category];
    const currentVal = currentCategories[category];

    // Skip if neither side has this category
    if (baselineVal === undefined && currentVal === undefined) continue;

    // Stage 25 must always check vision if present in baseline
    if (currentStage === 25 && category === 'vision') {
      if (!baselineVal) {
        findings.push({
          category: 'vision',
          baselineValue: null,
          currentValue: currentVal || null,
          driftType: DRIFT_TYPE.NO_BASELINE,
          rationale: 'No vision category in baseline assumptions',
          confidence: 1.0,
        });
      } else {
        const drift = computeDrift(baselineVal, currentVal);
        findings.push({
          category: 'vision',
          baselineValue: baselineVal,
          currentValue: currentVal || null,
          driftType: drift.driftType,
          rationale: drift.rationale,
          confidence: drift.confidence,
        });
      }
      continue;
    }

    // One side has data, the other doesn't
    if (baselineVal === undefined) continue; // New category in current, no baseline to compare
    if (currentVal === undefined) continue; // Baseline category not in current, skip

    const drift = computeDrift(baselineVal, currentVal);
    if (drift.driftType !== DRIFT_TYPE.NO_CHANGE) {
      findings.push({
        category,
        baselineValue: baselineVal,
        currentValue: currentVal,
        driftType: drift.driftType,
        rationale: drift.rationale,
        confidence: drift.confidence,
      });
    }
  }

  return findings;
}

/**
 * Compare two values and determine drift type.
 */
function computeDrift(baseline, current) {
  const normalizedBaseline = normalize(baseline);
  const normalizedCurrent = normalize(current);

  if (deepEqual(normalizedBaseline, normalizedCurrent)) {
    return { driftType: DRIFT_TYPE.NO_CHANGE, rationale: 'Values match after normalization', confidence: 1.0 };
  }

  // Check for contradiction vs drift
  if (isContradiction(normalizedBaseline, normalizedCurrent)) {
    return {
      driftType: DRIFT_TYPE.CONTRADICTION,
      rationale: buildDiffRationale(normalizedBaseline, normalizedCurrent, 'contradicts'),
      confidence: 0.85,
    };
  }

  return {
    driftType: DRIFT_TYPE.DRIFT,
    rationale: buildDiffRationale(normalizedBaseline, normalizedCurrent, 'differs from'),
    confidence: 0.7,
  };
}

/**
 * Determine if current value contradicts baseline (not just differs).
 * Contradiction = direct negation or opposite category.
 */
function isContradiction(baseline, current) {
  if (typeof baseline === 'string' && typeof current === 'string') {
    const bLower = baseline.toLowerCase();
    const cLower = current.toLowerCase();
    // Direct negation patterns
    const opposites = [
      ['subscription', 'one_time'], ['subscription', 'perpetual'],
      ['b2b', 'b2c'], ['enterprise', 'consumer'],
      ['premium', 'freemium'], ['high', 'low'],
      ['domestic', 'international'], ['global', 'local'],
    ];
    for (const [a, b] of opposites) {
      if ((bLower.includes(a) && cLower.includes(b)) || (bLower.includes(b) && cLower.includes(a))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Normalize a value for comparison: trim strings, sort arrays, lowercase.
 */
function normalize(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') return val.trim().toLowerCase();
  if (Array.isArray(val)) {
    return val.map(normalize).sort((a, b) => {
      const sa = typeof a === 'string' ? a : JSON.stringify(a);
      const sb = typeof b === 'string' ? b : JSON.stringify(b);
      return sa.localeCompare(sb);
    });
  }
  if (typeof val === 'object') {
    const sorted = {};
    for (const key of Object.keys(val).sort()) {
      sorted[key] = normalize(val[key]);
    }
    return sorted;
  }
  return val;
}

/**
 * Deep equality check for normalized values.
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  if (typeof a === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(k => deepEqual(a[k], b[k]));
  }
  return false;
}

/**
 * Build a human-readable rationale for a drift finding.
 */
function buildDiffRationale(baseline, current, verb) {
  const bStr = typeof baseline === 'string' ? baseline : JSON.stringify(baseline);
  const cStr = typeof current === 'string' ? current : JSON.stringify(current);
  const bShort = bStr.length > 60 ? bStr.slice(0, 57) + '...' : bStr;
  const cShort = cStr.length > 60 ? cStr.slice(0, 57) + '...' : cStr;
  return `Current value "${cShort}" ${verb} baseline "${bShort}"`;
}

/**
 * Compute overall severity from findings.
 */
function computeSeverity(findings) {
  const hasContradiction = findings.some(f => f.driftType === DRIFT_TYPE.CONTRADICTION);
  const driftCount = findings.filter(
    f => f.driftType === DRIFT_TYPE.DRIFT || f.driftType === DRIFT_TYPE.CONTRADICTION
  ).length;

  if (hasContradiction) return SEVERITY.HIGH;
  if (driftCount >= 3) return SEVERITY.HIGH;
  if (driftCount >= 2) return SEVERITY.MEDIUM;
  if (driftCount >= 1) return SEVERITY.LOW;
  return SEVERITY.NONE;
}

// ── Exports for testing ─────────────────────────────────────────

export const _internal = {
  normalize,
  deepEqual,
  isContradiction,
  computeDrift,
  computeSeverity,
  compareCategories,
  loadBaselineAssumptions,
  extractCurrentConstraints,
  buildDiffRationale,
  SEVERITY,
  DRIFT_TYPE,
  ASSUMPTION_CATEGORIES,
  ARTIFACT_TYPE_PRIORITY,
};
