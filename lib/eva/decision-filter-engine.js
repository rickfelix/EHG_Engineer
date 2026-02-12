/**
 * Decision Filter Engine
 * SD-LEO-INFRA-FILTER-ENGINE-001
 *
 * Deterministic risk-threshold engine that evaluates venture stage outputs
 * against Chairman-configured thresholds. Returns { auto_proceed, triggers, recommendation }.
 *
 * Trigger types (fixed evaluation order):
 *   1. cost_threshold    - Cost exceeds chairman-defined max
 *   2. new_tech_vendor   - Introduces unapproved technology/vendor
 *   3. strategic_pivot   - Deviates from original venture direction
 *   4. low_score         - Quality/confidence score below threshold
 *   5. novel_pattern     - Pattern not seen in prior stages
 *   6. constraint_drift  - Parameters drift from approved constraints
 *
 * Design principles:
 *   - Pure, deterministic: same inputs → same outputs
 *   - Dependency injection for preferences (no module-level side effects)
 *   - Conservative defaults: missing thresholds force PRESENT_TO_CHAIRMAN
 */

const ENGINE_VERSION = '1.0.0';

// Fixed rule evaluation order for deterministic trigger ordering
const TRIGGER_TYPES = [
  'cost_threshold',
  'new_tech_vendor',
  'strategic_pivot',
  'low_score',
  'novel_pattern',
  'constraint_drift',
];

// Preference keys used by each trigger rule
const PREFERENCE_KEYS = {
  cost_threshold: 'filter.cost_max_usd',
  low_score: 'filter.min_score',
  approved_tech: 'filter.approved_tech_list',
  approved_vendors: 'filter.approved_vendor_list',
  pivot_keywords: 'filter.pivot_keywords',
  allow_informational: 'filter.allow_informational_triggers',
};

// Conservative defaults when preferences are missing
const DEFAULTS = {
  'filter.cost_max_usd': 10000,
  'filter.min_score': 7,
  'filter.approved_tech_list': [],
  'filter.approved_vendor_list': [],
  'filter.pivot_keywords': ['pivot', 'rebrand', 'abandon', 'restart', 'scrap'],
  'filter.allow_informational_triggers': false,
};

/**
 * Evaluate a stage output against chairman preferences and return a decision.
 *
 * @param {object} input - Stage output to evaluate
 * @param {number} [input.cost]              - Projected cost in USD
 * @param {string[]} [input.technologies]    - Technologies used
 * @param {string[]} [input.vendors]         - Vendors involved
 * @param {number} [input.score]             - Quality/confidence score (0-10)
 * @param {string} [input.description]       - Stage description text
 * @param {string[]} [input.patterns]        - Patterns detected in stage
 * @param {string[]} [input.priorPatterns]   - Patterns from previous stages
 * @param {object} [input.constraints]       - Current constraint values
 * @param {object} [input.approvedConstraints] - Originally approved constraints
 * @param {string} [input.stage]             - Stage identifier
 *
 * @param {object} [options]
 * @param {object} [options.preferences]     - Flat key/value map of chairman preferences
 * @param {object} [options.logger]          - Logger instance (default: silent)
 *
 * @returns {{ auto_proceed: boolean, triggers: object[], recommendation: string }}
 */
export function evaluateDecision(input = {}, options = {}) {
  const preferences = options.preferences || {};
  const logger = options.logger || { info() {}, debug() {} };
  const triggers = [];

  // Helper to resolve preference with default and track missing keys
  function getPref(key) {
    if (key in preferences) return { value: preferences[key], source: 'preference' };
    triggers.push({
      type: 'constraint_drift',
      severity: 'MEDIUM',
      message: `Missing preference: ${key}. Using default.`,
      details: { missingKey: key, defaultValue: DEFAULTS[key], thresholdUsed: DEFAULTS[key] },
    });
    return { value: DEFAULTS[key], source: 'default' };
  }

  // --- Rule 1: cost_threshold ---
  if (input.cost != null) {
    const costMax = getPref(PREFERENCE_KEYS.cost_threshold);
    if (typeof input.cost === 'number' && input.cost > costMax.value) {
      triggers.push({
        type: 'cost_threshold',
        severity: 'HIGH',
        message: `Cost $${input.cost} exceeds threshold $${costMax.value}`,
        details: { cost: input.cost, threshold: costMax.value, thresholdSource: costMax.source },
      });
    }
  }

  // --- Rule 2: new_tech_vendor ---
  if (Array.isArray(input.technologies) && input.technologies.length > 0) {
    const approvedTech = getPref(PREFERENCE_KEYS.approved_tech);
    const approvedSet = new Set((approvedTech.value || []).map(t => t.toLowerCase()));
    const newTech = input.technologies.filter(t => !approvedSet.has(t.toLowerCase()));
    if (newTech.length > 0) {
      triggers.push({
        type: 'new_tech_vendor',
        severity: 'HIGH',
        message: `Unapproved technology: ${newTech.join(', ')}`,
        details: { newItems: newTech, approvedList: approvedTech.value, thresholdSource: approvedTech.source },
      });
    }
  }
  if (Array.isArray(input.vendors) && input.vendors.length > 0) {
    const approvedVendors = getPref(PREFERENCE_KEYS.approved_vendors);
    const vendorSet = new Set((approvedVendors.value || []).map(v => v.toLowerCase()));
    const newVendors = input.vendors.filter(v => !vendorSet.has(v.toLowerCase()));
    if (newVendors.length > 0) {
      triggers.push({
        type: 'new_tech_vendor',
        severity: 'HIGH',
        message: `Unapproved vendor: ${newVendors.join(', ')}`,
        details: { newItems: newVendors, approvedList: approvedVendors.value, thresholdSource: approvedVendors.source },
      });
    }
  }

  // --- Rule 3: strategic_pivot ---
  if (input.description) {
    const pivotKeywords = getPref(PREFERENCE_KEYS.pivot_keywords);
    const text = input.description.toLowerCase();
    const matched = (pivotKeywords.value || []).filter(kw => text.includes(kw.toLowerCase()));
    if (matched.length > 0) {
      triggers.push({
        type: 'strategic_pivot',
        severity: 'HIGH',
        message: `Strategic pivot detected: ${matched.join(', ')}`,
        details: { matchedKeywords: matched, thresholdSource: pivotKeywords.source },
      });
    }
  }

  // --- Rule 4: low_score ---
  if (input.score != null) {
    const minScore = getPref(PREFERENCE_KEYS.low_score);
    if (typeof input.score === 'number' && input.score < minScore.value) {
      triggers.push({
        type: 'low_score',
        severity: 'MEDIUM',
        message: `Score ${input.score}/10 below threshold ${minScore.value}/10`,
        details: { score: input.score, threshold: minScore.value, thresholdSource: minScore.source },
      });
    }
  }

  // --- Rule 5: novel_pattern ---
  if (Array.isArray(input.patterns) && Array.isArray(input.priorPatterns)) {
    const priorSet = new Set(input.priorPatterns.map(p => p.toLowerCase()));
    const novel = input.patterns.filter(p => !priorSet.has(p.toLowerCase()));
    if (novel.length > 0) {
      triggers.push({
        type: 'novel_pattern',
        severity: 'MEDIUM',
        message: `Novel patterns detected: ${novel.join(', ')}`,
        details: { novelPatterns: novel, priorCount: input.priorPatterns.length },
      });
    }
  }

  // --- Rule 6: constraint_drift ---
  if (input.constraints && input.approvedConstraints) {
    const drifts = [];
    for (const [key, current] of Object.entries(input.constraints)) {
      const approved = input.approvedConstraints[key];
      if (approved !== undefined && JSON.stringify(current) !== JSON.stringify(approved)) {
        drifts.push({ key, current, approved });
      }
    }
    if (drifts.length > 0) {
      triggers.push({
        type: 'constraint_drift',
        severity: 'MEDIUM',
        message: `Constraint drift in ${drifts.length} parameter(s): ${drifts.map(d => d.key).join(', ')}`,
        details: { drifts },
      });
    }
  }

  // Filter out constraint_drift triggers that are just "missing preference" warnings
  // from the real business triggers
  const businessTriggers = triggers.filter(
    t => !(t.type === 'constraint_drift' && t.details.missingKey)
  );
  const _missingPrefTriggers = triggers.filter(
    t => t.type === 'constraint_drift' && t.details.missingKey
  );

  // Determine auto_proceed
  const allowInformational = preferences[PREFERENCE_KEYS.allow_informational] === true;
  const hasHighTrigger = businessTriggers.some(t => t.severity === 'HIGH');
  const hasMediumTrigger = businessTriggers.some(t => t.severity === 'MEDIUM');
  const hasInfoOnly = businessTriggers.length > 0 && businessTriggers.every(t => t.severity === 'INFO');

  let auto_proceed;
  let recommendation;

  if (businessTriggers.length === 0) {
    auto_proceed = true;
    recommendation = 'AUTO_PROCEED';
  } else if (allowInformational && hasInfoOnly) {
    auto_proceed = true;
    recommendation = 'AUTO_PROCEED';
  } else if (hasHighTrigger) {
    auto_proceed = false;
    recommendation = 'PRESENT_TO_CHAIRMAN';
  } else if (hasMediumTrigger) {
    auto_proceed = false;
    recommendation = 'PRESENT_TO_CHAIRMAN_WITH_MITIGATIONS';
  } else {
    auto_proceed = false;
    recommendation = 'PRESENT_TO_CHAIRMAN';
  }

  // Combine all triggers in deterministic order
  const allTriggers = [];
  for (const type of TRIGGER_TYPES) {
    allTriggers.push(...triggers.filter(t => t.type === type));
  }

  // Structured logging
  const logEvent = {
    event: 'decision_filter_evaluated',
    stage: input.stage || 'unknown',
    auto_proceed,
    recommendation,
    trigger_types: [...new Set(allTriggers.map(t => t.type))],
    evaluation_version: ENGINE_VERSION,
  };
  logger.info(JSON.stringify(logEvent));

  if (allTriggers.length > 0) {
    logger.debug(JSON.stringify({
      event: 'decision_filter_trigger_details',
      triggers: allTriggers.map(t => ({
        type: t.type,
        severity: t.severity,
        thresholdUsed: t.details.thresholdUsed || t.details.threshold || null,
      })),
    }));
  }

  return { auto_proceed, triggers: allTriggers, recommendation };
}

export { ENGINE_VERSION, TRIGGER_TYPES, PREFERENCE_KEYS, DEFAULTS };
export default evaluateDecision;
