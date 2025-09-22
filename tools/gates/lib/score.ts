/**
 * Scoring engine for gate validation
 */

export type Check = () => Promise<boolean>;

export interface ValidationRule {
  rule_name: string;
  weight: number;
  criteria?: Record<string, any>;
  required?: boolean;
}

export interface GateResult {
  score: number;
  results: Record<string, boolean>;
  details?: Record<string, any>;
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
  const details: Record<string, any> = {};
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

  return { score, results, details };
}

/**
 * Check if gate passes (≥85%)
 */
export function gatePass(score: number): boolean {
  return score >= 85;
}

/**
 * Format gate results for console output
 */
export function formatGateResults(gate: string, result: GateResult): string {
  const lines: string[] = [];
  const passIcon = result.score >= 85 ? '✅' : '❌';
  
  lines.push(`\n${'='.repeat(50)}`);
  lines.push(`Gate ${gate} Results`);
  lines.push('='.repeat(50));
  lines.push(`Score: ${result.score}% ${passIcon}`);
  lines.push('\nRule Results:');
  
  for (const [rule, passed] of Object.entries(result.results)) {
    const icon = passed ? '✓' : '✗';
    lines.push(`  ${icon} ${rule}: ${passed ? 'PASS' : 'FAIL'}`);
  }
  
  lines.push('='.repeat(50));
  
  return lines.join('\n');
}