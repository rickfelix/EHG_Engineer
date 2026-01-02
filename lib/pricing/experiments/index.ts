/**
 * Pricing Experiments Module
 *
 * Exports all experimentation framework components.
 *
 * SD-PRICING-TESTING-001
 */

export {
  ExperimentConfigService,
  type ExperimentConfig,
  type ExperimentVariant,
  type CreateExperimentParams,
  type TargetingRule,
} from './config';

export {
  VariantAllocator,
  type AllocationResult,
  type AllocatorOptions,
} from './allocator';

export {
  MetricCollector,
  type MetricEvent,
  type VariantMetrics,
  type ExperimentMetrics,
} from './metrics';

export {
  StatisticalAnalyzer,
  type SignificanceResult,
  type AnalysisResult,
} from './analyzer';

// Re-export for convenience
import { ExperimentConfigService } from './config';
import { VariantAllocator } from './allocator';
import { MetricCollector } from './metrics';
import { StatisticalAnalyzer } from './analyzer';

/**
 * Create a complete experimentation framework instance
 */
export function createExperimentationFramework(options?: {
  salt?: string;
  significanceThreshold?: number;
}) {
  return {
    config: new ExperimentConfigService(),
    allocator: new VariantAllocator({ salt: options?.salt }),
    metrics: new MetricCollector(),
    analyzer: new StatisticalAnalyzer(options?.significanceThreshold),
  };
}
