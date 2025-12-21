/**
 * Risk Context Evaluation Module
 *
 * Provides context-aware risk scoring for pattern detections
 * Replaces binary "PASS/FAIL" with nuanced risk assessment
 *
 * Philosophy: Not all pattern matches are equal.
 * A memory leak in a high-traffic component is more critical
 * than the same pattern in a rarely-used admin page.
 *
 * Created: 2025-01-27 (Phase 1: Pareto improvement to sub-agent detection)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

/**
 * Get comprehensive risk context for a file
 *
 * @param {string} filePath - Relative or absolute path to file
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Risk context metadata
 */
export async function getRiskContext(filePath, options = {}) {
  const repoPath = options.repo_path || '/mnt/c/_EHG/EHG';

  const context = {
    file_path: filePath,
    change_frequency: 0,
    lines_of_code: 0,
    import_count: 0,
    on_critical_path: false,
    test_coverage_pct: null,
    last_modified_days: 0,
    author_experience: 'unknown',
    risk_factors: []
  };

  try {
    // 1. Change frequency (last 90 days)
    try {
      const { stdout: gitLog } = await execAsync(
        `cd "${repoPath}" && git log --since="90 days ago" --follow --oneline "${filePath}" 2>/dev/null | wc -l`
      );
      context.change_frequency = parseInt(gitLog.trim()) || 0;
    } catch (err) {
      // File might be new or git not available
      context.change_frequency = 0;
    }

    // 2. Lines of code
    try {
      const { stdout: wcOutput } = await execAsync(
        `cd "${repoPath}" && wc -l "${filePath}" 2>/dev/null | awk '{print $1}'`
      );
      context.lines_of_code = parseInt(wcOutput.trim()) || 0;
    } catch (err) {
      context.lines_of_code = 0;
    }

    // 3. Import/usage count (how many files import this)
    try {
      const fileName = filePath.split('/').pop().replace(/\.(tsx?|jsx?)$/, '');
      const { stdout: grepOutput } = await execAsync(
        `cd "${repoPath}" && grep -r "from.*${fileName}" src 2>/dev/null | wc -l`
      );
      context.import_count = parseInt(grepOutput.trim()) || 0;
    } catch (err) {
      context.import_count = 0;
    }

    // 4. Critical path detection (heuristics)
    const criticalPathPatterns = [
      /\/Dashboard\./,
      /\/App\./,
      /\/index\./,
      /\/Layout\./,
      /\/Router\./,
      /\/Auth/,
      /\/Navigation/,
      /routes/i,
      /context/i
    ];

    context.on_critical_path = criticalPathPatterns.some(pattern =>
      pattern.test(filePath)
    );

    // 5. Last modified (days ago)
    try {
      const { stdout: lastModified } = await execAsync(
        `cd "${repoPath}" && git log -1 --format=%ct "${filePath}" 2>/dev/null`
      );
      const timestamp = parseInt(lastModified.trim());
      if (timestamp) {
        const daysAgo = Math.floor((Date.now() / 1000 - timestamp) / 86400);
        context.last_modified_days = daysAgo;
      }
    } catch (err) {
      // Ignore
    }

    // 6. Author experience (number of unique commits by different authors)
    try {
      const { stdout: authorCount } = await execAsync(
        `cd "${repoPath}" && git log --format=%an "${filePath}" 2>/dev/null | sort -u | wc -l`
      );
      const uniqueAuthors = parseInt(authorCount.trim()) || 1;

      if (uniqueAuthors >= 5) {
        context.author_experience = 'high_collaboration';
      } else if (uniqueAuthors >= 2) {
        context.author_experience = 'moderate_collaboration';
      } else {
        context.author_experience = 'single_author';
      }
    } catch (err) {
      context.author_experience = 'unknown';
    }

    // 7. Test coverage (if coverage report exists)
    // This is optional and won't block if unavailable
    const coverageFile = `${repoPath}/coverage/coverage-summary.json`;
    if (existsSync(coverageFile)) {
      try {
        const coverageData = JSON.parse(
          await execAsync(`cat "${coverageFile}"`).then(r => r.stdout)
        );

        // Try to find this file in coverage report
        const fileKey = Object.keys(coverageData).find(key =>
          key.includes(filePath) || filePath.includes(key)
        );

        if (fileKey && coverageData[fileKey]?.lines?.pct !== undefined) {
          context.test_coverage_pct = coverageData[fileKey].lines.pct;
        }
      } catch (err) {
        // Coverage not available, that's okay
      }
    }

    // Identify risk factors
    if (context.change_frequency > 10) {
      context.risk_factors.push('high_churn');
    }
    if (context.lines_of_code > 600) {
      context.risk_factors.push('large_component');
    }
    if (context.import_count > 10) {
      context.risk_factors.push('widely_used');
    }
    if (context.on_critical_path) {
      context.risk_factors.push('critical_path');
    }
    if (context.test_coverage_pct !== null && context.test_coverage_pct < 50) {
      context.risk_factors.push('low_coverage');
    }
    if (context.last_modified_days < 7) {
      context.risk_factors.push('recent_change');
    }

  } catch (error) {
    console.warn(`   ⚠️  Risk context gathering error for ${filePath}: ${error.message}`);
  }

  return context;
}

/**
 * Calculate contextual confidence score
 *
 * Takes base confidence (from pattern detection) and adjusts
 * based on risk context to produce a nuanced severity
 *
 * @param {number} baseConfidence - Original confidence (0-100)
 * @param {Object} riskContext - Context from getRiskContext()
 * @param {Object} options - Tuning weights
 * @returns {Object} Enhanced confidence with risk scoring
 */
export function calculateContextualConfidence(baseConfidence, riskContext, options = {}) {
  // Default weights (can be tuned via feedback loop later)
  const weights = {
    change_frequency: options.change_frequency_weight || 0.25,
    lines_of_code: options.loc_weight || 0.15,
    import_count: options.usage_weight || 0.30,
    critical_path: options.critical_path_weight || 0.20,
    test_coverage: options.coverage_weight || 0.10
  };

  // Normalize factors to 0-10 scale
  const factors = {
    change_frequency: Math.min(riskContext.change_frequency / 5, 10), // 25+ changes = max risk
    lines_of_code: Math.min(riskContext.lines_of_code / 100, 10),     // 1000+ LOC = max risk
    import_count: Math.min(riskContext.import_count / 3, 10),         // 30+ imports = max risk
    critical_path: riskContext.on_critical_path ? 10 : 2,             // Binary but high impact
    test_coverage: riskContext.test_coverage_pct !== null
      ? (100 - riskContext.test_coverage_pct) / 10  // Lower coverage = higher risk
      : 5  // Unknown = moderate risk
  };

  // Calculate weighted risk score (0-10)
  const riskScore = (
    factors.change_frequency * weights.change_frequency +
    factors.lines_of_code * weights.lines_of_code +
    factors.import_count * weights.import_count +
    factors.critical_path * weights.critical_path +
    factors.test_coverage * weights.test_coverage
  );

  // Adjust confidence based on risk
  // High risk + pattern detected = higher confidence it matters
  // Low risk + pattern detected = lower confidence it matters
  const riskMultiplier = riskScore / 10; // 0.0 to 1.0
  const adjustedConfidence = Math.round(baseConfidence * (0.5 + riskMultiplier * 0.5));

  // Determine severity based on risk score
  let severity = 'LOW';
  if (riskScore >= 7.5) {
    severity = 'CRITICAL';
  } else if (riskScore >= 5.0) {
    severity = 'HIGH';
  } else if (riskScore >= 3.0) {
    severity = 'MEDIUM';
  }

  return {
    adjusted_confidence: adjustedConfidence,
    risk_score: Math.round(riskScore * 10) / 10, // Round to 1 decimal
    contextual_severity: severity,
    risk_factors: riskContext.risk_factors,
    explanation: generateRiskExplanation(riskContext, riskScore, factors)
  };
}

/**
 * Generate human-readable explanation of risk scoring
 */
function generateRiskExplanation(context, riskScore, factors) {
  const explanations = [];
  const fileName = context.file_path ? context.file_path.split('/').pop() : 'file';

  if (factors.critical_path >= 8) {
    explanations.push(`On critical path (${fileName})`);
  }

  if (factors.import_count >= 5) {
    explanations.push(`Widely used (${context.import_count} imports)`);
  }

  if (factors.change_frequency >= 5) {
    explanations.push(`Frequent changes (${context.change_frequency} commits in 90 days)`);
  }

  if (factors.lines_of_code >= 6) {
    explanations.push(`Large file (${context.lines_of_code} LOC)`);
  }

  if (context.test_coverage_pct !== null && context.test_coverage_pct < 50) {
    explanations.push(`Low test coverage (${context.test_coverage_pct}%)`);
  }

  if (explanations.length === 0) {
    explanations.push('Low-risk context (infrequent use, stable, small)');
  }

  return explanations.join('; ');
}

/**
 * Batch risk context gathering for multiple files
 * More efficient than calling getRiskContext individually
 */
export async function getBatchRiskContext(filePaths, options = {}) {
  const contexts = {};

  // Process in parallel (but limit concurrency to avoid overwhelming shell)
  const batchSize = 5;
  for (let i = 0; i < filePaths.length; i += batchSize) {
    const batch = filePaths.slice(i, i + batchSize);
    const promises = batch.map(path => getRiskContext(path, options));
    const results = await Promise.all(promises);

    batch.forEach((path, idx) => {
      contexts[path] = results[idx];
    });
  }

  return contexts;
}

/**
 * Get aggregated risk statistics for a set of findings
 * Useful for reporting overall risk profile
 */
export function getAggregateRiskStats(contextualFindings) {
  const stats = {
    total: contextualFindings.length,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    avg_risk_score: 0,
    top_risk_factors: {}
  };

  let totalRisk = 0;

  contextualFindings.forEach(finding => {
    // Count by severity
    const severity = finding.contextual_severity || 'LOW';
    stats[severity.toLowerCase()] = (stats[severity.toLowerCase()] || 0) + 1;

    // Sum risk scores
    totalRisk += finding.risk_score || 0;

    // Aggregate risk factors
    if (finding.risk_factors) {
      finding.risk_factors.forEach(factor => {
        stats.top_risk_factors[factor] = (stats.top_risk_factors[factor] || 0) + 1;
      });
    }
  });

  stats.avg_risk_score = contextualFindings.length > 0
    ? Math.round((totalRisk / contextualFindings.length) * 10) / 10
    : 0;

  return stats;
}
