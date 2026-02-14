/**
 * Thompson Sampling Multi-Armed Bandit
 * SD-EVA-FEAT-MARKETING-AI-001 (US-001)
 *
 * Implements Beta-distribution Thompson Sampling for content
 * variant selection. Each variant maintains a Beta(alpha, beta)
 * posterior where alpha = successes + 1, beta = failures + 1.
 */

const MIN_IMPRESSIONS_FOR_DECLARATION = 100;
const EXPLORATION_FLOOR = 0.20; // 20% traffic for under-explored variants

/**
 * Create a Thompson Sampler instance.
 *
 * @returns {ThompsonSampler}
 */
export function createSampler() {
  return {
    /**
     * Select the best variant using Thompson Sampling.
     *
     * @param {Array<{id: string, successes: number, failures: number}>} variants
     * @returns {{variantId: string, posteriorMean: number, posteriorVariance: number, sampleValue: number, selectionReason: string}}
     */
    selectVariant(variants) {
      if (!variants || variants.length === 0) {
        throw new Error('At least one variant is required');
      }

      if (variants.length === 1) {
        const v = variants[0];
        const alpha = v.successes + 1;
        const beta = v.failures + 1;
        return {
          variantId: v.id,
          posteriorMean: alpha / (alpha + beta),
          posteriorVariance: (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1)),
          sampleValue: alpha / (alpha + beta),
          selectionReason: 'single_variant'
        };
      }

      // Check for under-explored variants
      const underExplored = variants.filter(
        v => (v.successes + v.failures) < MIN_IMPRESSIONS_FOR_DECLARATION
      );

      if (underExplored.length > 0 && Math.random() < EXPLORATION_FLOOR) {
        const pick = underExplored[Math.floor(Math.random() * underExplored.length)];
        const alpha = pick.successes + 1;
        const beta = pick.failures + 1;
        return {
          variantId: pick.id,
          posteriorMean: alpha / (alpha + beta),
          posteriorVariance: (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1)),
          sampleValue: alpha / (alpha + beta),
          selectionReason: 'exploration_floor'
        };
      }

      // Thompson Sampling: draw from each variant's posterior
      let bestSample = -Infinity;
      let bestVariant = null;
      let bestMeta = null;

      for (const v of variants) {
        const alpha = v.successes + 1;
        const beta = v.failures + 1;
        const sample = sampleBeta(alpha, beta);
        const mean = alpha / (alpha + beta);
        const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));

        if (sample > bestSample) {
          bestSample = sample;
          bestVariant = v;
          bestMeta = { mean, variance };
        }
      }

      return {
        variantId: bestVariant.id,
        posteriorMean: bestMeta.mean,
        posteriorVariance: bestMeta.variance,
        sampleValue: bestSample,
        selectionReason: 'thompson_sampling'
      };
    },

    /**
     * Check if a variant has enough data to be declared champion.
     *
     * @param {{successes: number, failures: number}} variant
     * @returns {boolean}
     */
    canDeclareChampion(variant) {
      return (variant.successes + variant.failures) >= MIN_IMPRESSIONS_FOR_DECLARATION;
    }
  };
}

/**
 * Sample from a Beta(alpha, beta) distribution.
 * Uses the Gamma distribution method: Beta(a,b) = Ga/(Ga+Gb).
 *
 * @param {number} alpha
 * @param {number} beta
 * @returns {number}
 */
export function sampleBeta(alpha, beta) {
  const ga = sampleGamma(alpha);
  const gb = sampleGamma(beta);
  if (ga + gb === 0) return 0.5;
  return ga / (ga + gb);
}

/**
 * Sample from Gamma(shape, 1) using Marsaglia-Tsang method.
 *
 * @param {number} shape - Shape parameter (> 0)
 * @returns {number}
 */
function sampleGamma(shape) {
  if (shape < 1) {
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x, v;
    do {
      x = sampleNormal();
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
 *
 * @returns {number}
 */
function sampleNormal() {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export { MIN_IMPRESSIONS_FOR_DECLARATION, EXPLORATION_FLOOR };
