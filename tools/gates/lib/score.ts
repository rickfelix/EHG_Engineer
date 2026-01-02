/**
 * Scoring engine for gate validation
 */

export type Check = () => Promise<boolean>;

export interface ValidationRule {
  rule_name: string;
  weight: number;
  criteria?: Record<string, unknown>;
  required?: boolean;
}

export interface GateResult {
  score: number;
  results: Record<string, boolean>;
  details?: Record<string, unknown>;
}

/**
 * Calculate weighted gate score
 * Monotonic: each rule contributes full weight or 0
 */
export async function scoreGate(
  rules: ValidationRule[],
  checks: Record<string, Check>,
): Promise<GateResult> {
  const results: Record<string, boolean> = {};
  const _details: Record<string, unknown> = {};
  let totalScore = 0;

  // Execute all checks in parallel for performance
  const checkPromises = rules.map(async (rule) => {
    const checkFn = checks[rule.rule_name];
    if (!checkFn) {
      console.warn(`⚠️  No check defined for rule: ${rule.rule_name}`);
      return { rule: rule.rule_name, passed: false, weight: rule.weight };
    }

    try {
      const passed = await checkFn();
      return { rule: rule.rule_name, passed, weight: rule.weight };
    } catch (error) {
      console.error(`❌ Check failed for ${rule.rule_name}:`, error);
      return { rule: rule.rule_name, passed: false, weight: rule.weight };
    }
  });

  const checkResults = await Promise.all(checkPromises);

  // Calculate score
  for (const result of checkResults) {
    results[result.rule] = result.passed;
    if (result.passed) {
      totalScore += result.weight * 100;
    }
  }

  // Round to 2 decimal places
  const score = Math.round(totalScore * 100) / 100;

  return { score, results, details: _details };
}

/**
 * SD type-specific gate pass thresholds
 * Different SD types have different validation requirements
 */
const SD_TYPE_THRESHOLDS: Record<string, number> = {
  feature: 85,
  database: 75,
  infrastructure: 80,
  security: 90,
  documentation: 60,
  docs: 60,
  bugfix: 80,
  refactor: 80,
  orchestrator: 70,
  performance: 85
};

/**
 * Get the threshold for a given SD type
 */
export function getThreshold(sdType?: string): number {
  if (!sdType) return 85;
  return SD_TYPE_THRESHOLDS[sdType.toLowerCase()] ?? 85;
}

/**
 * Check if gate passes based on SD type threshold
 * @param score - The gate score (0-100)
 * @param sdType - Optional SD type for type-specific thresholds
 */
export function gatePass(score: number, sdType?: string): boolean {
  const threshold = getThreshold(sdType);
  return score >= threshold;
}

/**
 * Format gate results for console output
 * @param gate - Gate name
 * @param result - Gate result
 * @param sdType - Optional SD type for threshold display
 */
export function formatGateResults(gate: string, result: GateResult, sdType?: string): string {
  const lines: string[] = [];
  const threshold = getThreshold(sdType);
  const passIcon = result.score >= threshold ? '✅' : '❌';
  
  lines.push(`\n${'='.repeat(50)}`);
  lines.push(`Gate ${gate} Results`);
  lines.push('='.repeat(50));
  lines.push(`Score: ${result.score}% (threshold: ${threshold}%) ${passIcon}`);
  lines.push('\nRule Results:');
  
  for (const [rule, passed] of Object.entries(result.results)) {
    const icon = passed ? '✓' : '✗';
    lines.push(`  ${icon} ${rule}: ${passed ? 'PASS' : 'FAIL'}`);
  }
  
  lines.push('='.repeat(50));
  
  return lines.join('\n');
}