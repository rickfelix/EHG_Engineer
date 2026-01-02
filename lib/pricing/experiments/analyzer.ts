/**
 * Statistical Analyzer
 *
 * Calculates statistical significance for experiment results.
 *
 * SD-PRICING-TESTING-001
 */

import { type VariantMetrics, type ExperimentMetrics } from './metrics';

export interface SignificanceResult {
  variantId: string;
  variantName: string;
  conversionRate: number;
  conversionRateDiff: number;
  relativeLift: number;
  pValue: number;
  isSignificant: boolean;
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  sampleSize: number;
  requiredSampleSize: number;
}

export interface AnalysisResult {
  experimentId: string;
  controlVariantId: string;
  isComplete: boolean;
  hasWinner: boolean;
  winnerVariantId?: string;
  winnerVariantName?: string;
  overallLift?: number;
  results: SignificanceResult[];
  recommendation: string;
  analysisDate: Date;
}

/**
 * StatisticalAnalyzer for experiment significance calculations
 */
export class StatisticalAnalyzer {
  private significanceThreshold: number;

  constructor(significanceThreshold: number = 0.05) {
    this.significanceThreshold = significanceThreshold;
  }

  /**
   * Analyze experiment results
   */
  analyze(metrics: ExperimentMetrics, controlVariantId: string): AnalysisResult {
    const controlMetrics = metrics.variants.find(v => v.variantId === controlVariantId);
    if (!controlMetrics) {
      throw new Error(`Control variant ${controlVariantId} not found in metrics`);
    }

    const results: SignificanceResult[] = [];
    let hasWinner = false;
    let winnerVariantId: string | undefined;
    let winnerVariantName: string | undefined;
    let maxLift = 0;

    for (const variant of metrics.variants) {
      if (variant.variantId === controlVariantId) continue;

      const result = this.calculateSignificance(
        controlMetrics,
        variant,
        this.significanceThreshold
      );

      results.push(result);

      if (result.isSignificant && result.relativeLift > 0 && result.relativeLift > maxLift) {
        hasWinner = true;
        winnerVariantId = variant.variantId;
        winnerVariantName = variant.variantName;
        maxLift = result.relativeLift;
      }
    }

    const isComplete = results.every(r => r.sampleSize >= r.requiredSampleSize);

    let recommendation: string;
    if (!isComplete) {
      recommendation = 'Continue collecting data. Minimum sample size not yet reached.';
    } else if (hasWinner) {
      recommendation = `Implement ${winnerVariantName} pricing. It shows ${maxLift.toFixed(1)}% lift over control with statistical significance.`;
    } else {
      recommendation = 'No statistically significant winner found. Consider extending the experiment or trying larger price variations.';
    }

    return {
      experimentId: metrics.experimentId,
      controlVariantId,
      isComplete,
      hasWinner,
      winnerVariantId,
      winnerVariantName,
      overallLift: hasWinner ? maxLift : undefined,
      results,
      recommendation,
      analysisDate: new Date(),
    };
  }

  /**
   * Calculate significance between control and variant
   */
  private calculateSignificance(
    control: VariantMetrics,
    variant: VariantMetrics,
    threshold: number
  ): SignificanceResult {
    const controlRate = control.conversionRate / 100;
    const variantRate = variant.conversionRate / 100;
    const rateDiff = variantRate - controlRate;
    const relativeLift = controlRate > 0 ? (rateDiff / controlRate) * 100 : 0;

    // Calculate pooled proportion and standard error
    const n1 = control.visitors;
    const n2 = variant.visitors;
    const x1 = control.conversions;
    const x2 = variant.conversions;

    const pooledProp = (x1 + x2) / (n1 + n2);
    const standardError = Math.sqrt(pooledProp * (1 - pooledProp) * (1 / n1 + 1 / n2));

    // Calculate z-score
    const zScore = standardError > 0 ? rateDiff / standardError : 0;

    // Calculate p-value (two-tailed)
    const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore)));

    // Calculate confidence interval (95%)
    const zCritical = 1.96;
    const ci = {
      lower: rateDiff - zCritical * standardError,
      upper: rateDiff + zCritical * standardError,
    };

    // Calculate required sample size for 80% power
    const requiredSampleSize = this.calculateRequiredSampleSize(
      controlRate,
      0.02, // Minimum detectable effect of 2%
      0.80  // Power
    );

    return {
      variantId: variant.variantId,
      variantName: variant.variantName,
      conversionRate: variant.conversionRate,
      conversionRateDiff: rateDiff * 100,
      relativeLift,
      pValue,
      isSignificant: pValue < threshold,
      confidenceInterval: {
        lower: ci.lower * 100,
        upper: ci.upper * 100,
      },
      sampleSize: variant.visitors,
      requiredSampleSize,
    };
  }

  /**
   * Normal cumulative distribution function approximation
   */
  private normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }

  /**
   * Calculate required sample size for given effect size
   */
  calculateRequiredSampleSize(
    baseRate: number,
    minimumDetectableEffect: number,
    power: number = 0.80,
    alpha: number = 0.05
  ): number {
    // Z-scores for power and significance level
    const zAlpha = this.inverseNormalCDF(1 - alpha / 2);
    const zBeta = this.inverseNormalCDF(power);

    const p1 = baseRate;
    const p2 = baseRate + minimumDetectableEffect;
    const pBar = (p1 + p2) / 2;

    const numerator = 2 * pBar * (1 - pBar) * Math.pow(zAlpha + zBeta, 2);
    const denominator = Math.pow(p2 - p1, 2);

    return Math.ceil(numerator / denominator);
  }

  /**
   * Inverse normal CDF approximation
   */
  private inverseNormalCDF(p: number): number {
    // Rational approximation for lower region (p < 0.5)
    if (p < 0.5) {
      return -this.inverseNormalCDF(1 - p);
    }

    if (p === 0.5) return 0;

    const a = [
      -3.969683028665376e+01,
      2.209460984245205e+02,
      -2.759285104469687e+02,
      1.383577518672690e+02,
      -3.066479806614716e+01,
      2.506628277459239e+00,
    ];

    const b = [
      -5.447609879822406e+01,
      1.615858368580409e+02,
      -1.556989798598866e+02,
      6.680131188771972e+01,
      -1.328068155288572e+01,
    ];

    const c = [
      -7.784894002430293e-03,
      -3.223964580411365e-01,
      -2.400758277161838e+00,
      -2.549732539343734e+00,
      4.374664141464968e+00,
      2.938163982698783e+00,
    ];

    const d = [
      7.784695709041462e-03,
      3.224671290700398e-01,
      2.445134137142996e+00,
      3.754408661907416e+00,
    ];

    const pLow = 0.02425;
    const pHigh = 1 - pLow;

    let q: number;
    let r: number;

    if (p < pLow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    } else if (p <= pHigh) {
      q = p - 0.5;
      r = q * q;
      return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
  }
}

export default StatisticalAnalyzer;
