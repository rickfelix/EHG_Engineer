/**
 * Chairman Report Generator — Transforms experiment analysis results
 * into a Chairman-readable format with statistical confidence metrics,
 * effect sizes, and actionable recommendations.
 *
 * SD-MAN-ORCH-STAGE-ZERO-COLD-001-F
 *
 * @module lib/eva/experiments/chairman-report
 */

/**
 * Generate a Chairman-level experiment report from analysis results.
 *
 * @param {Object} analysis - Output from analyzeExperiment()
 * @param {Object} [options]
 * @param {string} [options.experimentName] - Experiment name for header
 * @param {number} [options.confidenceThreshold=0.90] - Confidence threshold for recommendations
 * @returns {Object} { sections, recommendation, promotionCandidate, formatted }
 */
export function generateChairmanReport(analysis, options = {}) {
  if (!analysis) {
    throw new Error('analysis is required');
  }

  const {
    experimentName = 'Stage Zero A/B Experiment',
    confidenceThreshold = 0.90,
  } = options;

  const sections = [];

  // Section 1: Executive Summary
  sections.push(buildExecutiveSummary(analysis, experimentName));

  // Section 2: Variant Performance
  sections.push(buildVariantPerformance(analysis));

  // Section 3: Statistical Confidence
  sections.push(buildStatisticalConfidence(analysis));

  // Section 4: Effect Size Analysis
  sections.push(buildEffectSizeAnalysis(analysis));

  // Section 5: Recommendation
  const recommendation = buildRecommendation(analysis, confidenceThreshold);
  sections.push(recommendation.section);

  // Determine promotion candidate
  const promotionCandidate = determinePromotionCandidate(analysis, confidenceThreshold);

  // Format full report
  const formatted = formatReport(sections);

  return {
    sections,
    recommendation: recommendation.decision,
    promotionCandidate,
    formatted,
  };
}

/**
 * Build executive summary section.
 */
function buildExecutiveSummary(analysis, experimentName) {
  const statusLabel = analysis.status === 'conclusive' ? 'CONCLUSIVE' : 'IN PROGRESS';
  return {
    title: 'Executive Summary',
    content: {
      experiment: experimentName,
      status: statusLabel,
      total_samples: analysis.total_samples || 0,
      variants_tested: Object.keys(analysis.per_variant || {}).length,
      conclusion: analysis.recommendation || 'No recommendation available',
    },
  };
}

/**
 * Build variant performance comparison section.
 */
function buildVariantPerformance(analysis) {
  const variants = [];
  for (const [key, data] of Object.entries(analysis.per_variant || {})) {
    variants.push({
      name: key,
      samples: data.count,
      mean_score: round2(data.mean_score),
      success_rate: round2(data.posterior.alpha / (data.posterior.alpha + data.posterior.beta) * 100),
      credible_interval: data.credible_interval
        ? {
            lower: round4(data.credible_interval.lower),
            upper: round4(data.credible_interval.upper),
            level: data.credible_interval.level,
          }
        : null,
    });
  }

  return {
    title: 'Variant Performance',
    content: { variants },
  };
}

/**
 * Build statistical confidence section from pairwise comparisons.
 */
function buildStatisticalConfidence(analysis) {
  const comparisons = (analysis.comparisons || []).map(comp => ({
    pair: `${comp.variantA} vs ${comp.variantB}`,
    prob_a_better: round4(comp.probABetterThanB),
    prob_b_better: round4(comp.probBBetterThanA),
    confidence_pct: round2(Math.max(comp.probABetterThanB, comp.probBBetterThanA) * 100),
    favored: comp.probABetterThanB > comp.probBBetterThanA ? comp.variantA : comp.variantB,
  }));

  return {
    title: 'Statistical Confidence',
    content: {
      comparisons,
      stopping_status: analysis.stopping?.shouldStop ? 'REACHED' : 'NOT_REACHED',
      stopping_reason: analysis.stopping?.reason || 'N/A',
    },
  };
}

/**
 * Build effect size analysis section.
 */
function buildEffectSizeAnalysis(analysis) {
  const effects = [];
  const variants = Object.entries(analysis.per_variant || {});

  for (let i = 0; i < variants.length; i++) {
    for (let j = i + 1; j < variants.length; j++) {
      const [keyA, dataA] = variants[i];
      const [keyB, dataB] = variants[j];
      const diff = dataB.mean_score - dataA.mean_score;
      const relativePct = dataA.mean_score !== 0
        ? (diff / dataA.mean_score) * 100
        : 0;

      effects.push({
        baseline: keyA,
        variant: keyB,
        absolute_diff: round2(diff),
        relative_pct: round2(relativePct),
        magnitude: classifyEffectSize(Math.abs(relativePct)),
      });
    }
  }

  return {
    title: 'Effect Size Analysis',
    content: { effects },
  };
}

/**
 * Build recommendation section with promote/reject/continue decision.
 */
function buildRecommendation(analysis, confidenceThreshold) {
  let decision;

  if (analysis.status === 'conclusive' && analysis.stopping?.winner) {
    const winner = analysis.stopping.winner;
    const comp = (analysis.comparisons || []).find(
      c => c.variantA === winner || c.variantB === winner
    );
    const confidence = comp
      ? Math.max(comp.probABetterThanB, comp.probBBetterThanA)
      : 0;

    if (confidence >= confidenceThreshold) {
      decision = {
        action: 'PROMOTE',
        variant: winner,
        confidence: round4(confidence),
        rationale: `${winner} outperforms with ${(confidence * 100).toFixed(1)}% confidence (threshold: ${(confidenceThreshold * 100).toFixed(0)}%)`,
      };
    } else {
      decision = {
        action: 'REJECT',
        variant: winner,
        confidence: round4(confidence),
        rationale: `Confidence ${(confidence * 100).toFixed(1)}% below threshold ${(confidenceThreshold * 100).toFixed(0)}%`,
      };
    }
  } else {
    decision = {
      action: 'CONTINUE',
      variant: null,
      confidence: 0,
      rationale: analysis.recommendation || 'Experiment has not reached statistical significance',
    };
  }

  return {
    decision,
    section: {
      title: 'Recommendation',
      content: decision,
    },
  };
}

/**
 * Determine if any variant is a promotion candidate.
 *
 * @returns {Object|null} { variant, confidence, meetsThreshold }
 */
function determinePromotionCandidate(analysis, confidenceThreshold) {
  if (!analysis.stopping?.winner) return null;

  const winner = analysis.stopping.winner;
  const comp = (analysis.comparisons || []).find(
    c => c.variantA === winner || c.variantB === winner
  );

  if (!comp) return null;

  const confidence = Math.max(comp.probABetterThanB, comp.probBBetterThanA);

  return {
    variant: winner,
    confidence: round4(confidence),
    meetsThreshold: confidence >= confidenceThreshold,
  };
}

/**
 * Classify effect size magnitude.
 */
function classifyEffectSize(relativePct) {
  if (relativePct < 2) return 'negligible';
  if (relativePct < 5) return 'small';
  if (relativePct < 15) return 'medium';
  return 'large';
}

/**
 * Format sections into a text report.
 */
function formatReport(sections) {
  const lines = [];
  lines.push('╔═══════════════════════════════════════════════════════╗');
  lines.push('║         CHAIRMAN EXPERIMENT REPORT                   ║');
  lines.push('╚═══════════════════════════════════════════════════════╝');
  lines.push('');

  for (const section of sections) {
    lines.push(`── ${section.title} ${'─'.repeat(Math.max(0, 50 - section.title.length))}`)
    lines.push('');
    lines.push(formatContent(section.content, 3));
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════');
  return lines.join('\n');
}

/**
 * Format content object as indented key-value pairs.
 */
function formatContent(obj, indent = 0) {
  const pad = ' '.repeat(indent);
  const lines = [];

  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      lines.push(`${pad}${key}:`);
      for (const item of value) {
        if (typeof item === 'object' && item !== null) {
          lines.push(`${pad}  - ${JSON.stringify(item)}`);
        } else {
          lines.push(`${pad}  - ${item}`);
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      lines.push(`${pad}${key}: ${JSON.stringify(value)}`);
    } else {
      lines.push(`${pad}${key}: ${value}`);
    }
  }

  return lines.join('\n');
}

function round2(n) { return Math.round(n * 100) / 100; }
function round4(n) { return Math.round(n * 10000) / 10000; }
