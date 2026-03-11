/**
 * Bayesian Analyzer - Beta-Binomial model for experiment analysis
 *
 * Computes posterior distributions, credible intervals, probability of improvement,
 * and stopping rules for A/B experiments.
 *
 * SD-STAGE-ZERO-EXPERIMENTATION-FRAMEWORK-ORCH-001-C
 */

// Default stopping rule config
const DEFAULT_CONFIG = {
  minSamples: 20,
  maxSamples: 200,
  credibleLevel: 0.95,
  requiredProbability: 0.95,
  monteCarloSamples: 10000,
};

/**
 * Analyze experiment outcomes using Beta-Binomial model.
 *
 * @param {Object} deps - { logger }
 * @param {Object} params
 * @param {Object} params.experiment - Experiment record
 * @param {Array} params.outcomes - Outcome records from experiment_outcomes
 * @param {Object} [params.config] - Override stopping rule config
 * @returns {Object} Analysis result
 */
export function analyzeExperiment(_deps, params) {
  const { outcomes, config: userConfig = {} } = params;
  const config = { ...DEFAULT_CONFIG, ...userConfig };

  // Group outcomes by variant
  const byVariant = groupByVariant(outcomes);
  const variantKeys = Object.keys(byVariant);

  if (variantKeys.length < 2) {
    return {
      status: 'insufficient_variants',
      message: `Need at least 2 variants with data, found ${variantKeys.length}`,
      recommendation: 'CONTINUE',
    };
  }

  // Compute posteriors for each variant
  const posteriors = {};
  for (const [key, variantOutcomes] of Object.entries(byVariant)) {
    posteriors[key] = computePosterior(variantOutcomes);
  }

  // Compute pairwise probability of improvement (first variant vs others)
  const comparisons = [];
  const keys = Object.keys(posteriors);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const prob = probabilityOfImprovement(
        posteriors[keys[i]],
        posteriors[keys[j]],
        config.monteCarloSamples
      );
      comparisons.push({
        variantA: keys[i],
        variantB: keys[j],
        probABetterThanB: prob,
        probBBetterThanA: 1 - prob,
      });
    }
  }

  // Compute credible intervals
  const intervals = {};
  for (const [key, posterior] of Object.entries(posteriors)) {
    intervals[key] = computeCredibleInterval(posterior, config.credibleLevel);
  }

  // Check stopping rules
  const totalSamples = outcomes.length;
  const stopping = checkStoppingRules(comparisons, totalSamples, config);

  return {
    status: stopping.shouldStop ? 'conclusive' : 'running',
    total_samples: totalSamples,
    per_variant: Object.fromEntries(
      Object.entries(byVariant).map(([k, v]) => [k, {
        count: v.length,
        mean_score: posteriors[k].meanScore,
        posterior: { alpha: posteriors[k].alpha, beta: posteriors[k].beta },
        credible_interval: intervals[k],
      }])
    ),
    comparisons,
    stopping,
    recommendation: stopping.shouldStop
      ? `STOP: ${stopping.reason}`
      : `CONTINUE: ${totalSamples} samples collected, need ${config.minSamples} minimum`,
  };
}

/**
 * Compute Beta posterior from variant outcomes.
 * Treats venture_score > 50 as "success" (binary conversion for Beta model).
 *
 * @param {Array} outcomes - Outcome records for one variant
 * @returns {Object} { alpha, beta, meanScore, successRate }
 */
export function computePosterior(outcomes) {
  // Uniform prior: Beta(1, 1)
  let alpha = 1;
  let beta = 1;

  let totalScore = 0;
  for (const outcome of outcomes) {
    const score = outcome.scores?.venture_score || 0;
    totalScore += score;
    // Binary: score > 50 = success
    if (score > 50) {
      alpha++;
    } else {
      beta++;
    }
  }

  return {
    alpha,
    beta,
    meanScore: outcomes.length > 0 ? totalScore / outcomes.length : 0,
    successRate: alpha / (alpha + beta),
    n: outcomes.length,
  };
}

/**
 * Compute credible interval for a Beta distribution.
 * Uses inverse Beta CDF approximation.
 *
 * @param {Object} posterior - { alpha, beta }
 * @param {number} level - Credible level (e.g., 0.95)
 * @returns {Object} { lower, upper, level }
 */
export function computeCredibleInterval(posterior, level = 0.95) {
  const tail = (1 - level) / 2;
  return {
    lower: betaQuantile(tail, posterior.alpha, posterior.beta),
    upper: betaQuantile(1 - tail, posterior.alpha, posterior.beta),
    level,
  };
}

/**
 * Compute P(A > B) using Monte Carlo sampling from Beta posteriors.
 *
 * @param {Object} posteriorA - { alpha, beta }
 * @param {Object} posteriorB - { alpha, beta }
 * @param {number} numSamples - Number of MC samples
 * @returns {number} Probability that A > B
 */
export function probabilityOfImprovement(posteriorA, posteriorB, numSamples = 10000) {
  let aWins = 0;

  for (let i = 0; i < numSamples; i++) {
    const sampleA = betaSample(posteriorA.alpha, posteriorA.beta);
    const sampleB = betaSample(posteriorB.alpha, posteriorB.beta);
    if (sampleA > sampleB) aWins++;
  }

  return aWins / numSamples;
}

/**
 * Check stopping rules for an experiment.
 */
export function checkStoppingRules(comparisons, totalSamples, config) {
  // Rule 1: Max samples reached
  if (totalSamples >= config.maxSamples) {
    return { shouldStop: true, reason: `Maximum samples reached (${config.maxSamples})` };
  }

  // Rule 2: Below minimum samples
  if (totalSamples < config.minSamples) {
    return { shouldStop: false, reason: `Below minimum samples (${totalSamples}/${config.minSamples})` };
  }

  // Rule 3: Clear winner with high probability
  for (const comp of comparisons) {
    if (comp.probABetterThanB >= config.requiredProbability) {
      return {
        shouldStop: true,
        reason: `'${comp.variantA}' beats '${comp.variantB}' with P=${comp.probABetterThanB.toFixed(3)}`,
        winner: comp.variantA,
      };
    }
    if (comp.probBBetterThanA >= config.requiredProbability) {
      return {
        shouldStop: true,
        reason: `'${comp.variantB}' beats '${comp.variantA}' with P=${comp.probBBetterThanA.toFixed(3)}`,
        winner: comp.variantB,
      };
    }
  }

  return { shouldStop: false, reason: 'No clear winner yet' };
}

/**
 * Generate a human-readable report from analysis results.
 */
export function generateReport(analysis) {
  const lines = [];
  lines.push('═══════════════════════════════════════════════');
  lines.push('   EXPERIMENT ANALYSIS REPORT');
  lines.push('═══════════════════════════════════════════════');
  lines.push(`   Status: ${analysis.status.toUpperCase()}`);
  lines.push(`   Total Samples: ${analysis.total_samples}`);
  lines.push('');

  for (const [key, data] of Object.entries(analysis.per_variant || {})) {
    lines.push(`   Variant: ${key}`);
    lines.push(`      Samples: ${data.count}`);
    lines.push(`      Mean Score: ${data.mean_score.toFixed(1)}`);
    lines.push(`      Success Rate: ${(data.posterior.alpha / (data.posterior.alpha + data.posterior.beta) * 100).toFixed(1)}%`);
    lines.push(`      ${(data.credible_interval.level * 100).toFixed(0)}% CI: [${data.credible_interval.lower.toFixed(3)}, ${data.credible_interval.upper.toFixed(3)}]`);
    lines.push('');
  }

  if (analysis.comparisons?.length) {
    lines.push('   Comparisons:');
    for (const comp of analysis.comparisons) {
      lines.push(`      P(${comp.variantA} > ${comp.variantB}) = ${comp.probABetterThanB.toFixed(3)}`);
    }
    lines.push('');
  }

  lines.push(`   Recommendation: ${analysis.recommendation}`);
  if (analysis.stopping?.winner) {
    lines.push(`   Winner: ${analysis.stopping.winner}`);
  }
  lines.push('═══════════════════════════════════════════════');

  return lines.join('\n');
}

// --- Statistical utility functions ---

/**
 * Sample from Beta distribution using Jöhnk's algorithm.
 */
function betaSample(alpha, beta) {
  const gammaA = gammaSample(alpha);
  const gammaB = gammaSample(beta);
  return gammaA / (gammaA + gammaB);
}

/**
 * Sample from Gamma distribution using Marsaglia & Tsang's method.
 */
function gammaSample(shape) {
  if (shape < 1) {
    return gammaSample(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x, v;
    do {
      x = normalSample();
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/**
 * Sample from standard normal using Box-Muller transform.
 */
function normalSample() {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Approximate Beta quantile using normal approximation for large alpha+beta,
 * or bisection for small parameters.
 */
function betaQuantile(p, alpha, beta) {
  // Simple bisection on regularized incomplete beta
  let lo = 0, hi = 1;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (regularizedBeta(mid, alpha, beta) < p) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Regularized incomplete beta function via continued fraction.
 */
function regularizedBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use symmetry relation if needed for convergence
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - regularizedBeta(1 - x, b, a);
  }

  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;

  // Lentz's continued fraction
  let f = 1, c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  f = d;

  for (let m = 1; m <= 200; m++) {
    // Even step
    let numerator = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    f *= d * c;

    // Odd step
    numerator = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = d * c;
    f *= delta;

    if (Math.abs(delta - 1) < 1e-10) break;
  }

  return front * f;
}

/**
 * Log-gamma function (Stirling's approximation for large values, Lanczos for small).
 */
function lnGamma(z) {
  // Lanczos approximation
  const g = 7;
  const coefs = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }

  z -= 1;
  let x = coefs[0];
  for (let i = 1; i < g + 2; i++) {
    x += coefs[i] / (z + i);
  }

  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Group outcomes by variant key.
 */
function groupByVariant(outcomes) {
  const groups = {};
  for (const outcome of outcomes) {
    const key = outcome.variant_key;
    if (!groups[key]) groups[key] = [];
    groups[key].push(outcome);
  }
  return groups;
}
