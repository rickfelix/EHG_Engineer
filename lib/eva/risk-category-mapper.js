/**
 * Risk Category Mapper
 * SD-LEO-INFRA-EXTEND-RISK-SCHEMA-001
 *
 * Maps numerical risk scores to severity levels.
 * Provides consistent classification across all 6 risk categories.
 */

const SEVERITY_THRESHOLDS = [
  { min: 75, level: 'CRITICAL' },
  { min: 50, level: 'HIGH' },
  { min: 25, level: 'MEDIUM' },
  { min: 0, level: 'LOW' },
];

/**
 * Map a numerical risk score to a severity level.
 * @param {number} score - Risk score (0-100)
 * @returns {string} Severity level: CRITICAL, HIGH, MEDIUM, or LOW
 */
export function mapScore(score) {
  if (typeof score !== 'number' || isNaN(score)) return 'LOW';
  const clamped = Math.max(0, Math.min(100, score));
  for (const { min, level } of SEVERITY_THRESHOLDS) {
    if (clamped >= min) return level;
  }
  return 'LOW';
}

/**
 * Compute delta between previous and current risk levels.
 * @param {string} previous - Previous severity level
 * @param {string} current - Current severity level
 * @returns {string} Delta: 'increasing', 'decreasing', or 'stable'
 */
export function computeDelta(previous, current) {
  if (!previous || !current) return 'stable';
  const order = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const prevIdx = order.indexOf(previous);
  const currIdx = order.indexOf(current);
  if (currIdx > prevIdx) return 'increasing';
  if (currIdx < prevIdx) return 'decreasing';
  return 'stable';
}

/**
 * All 6 risk categories in the unified model.
 */
export const RISK_CATEGORIES = [
  'market_risk',
  'technical_risk',
  'financial_risk',
  'operational_risk',
  'product_risk',
  'legal_risk',
];
