/**
 * Experiment Configuration
 *
 * Defines pricing experiment structure with variants and allocation.
 *
 * SD-PRICING-TESTING-001
 */

export interface ExperimentVariant {
  id: string;
  name: string;
  priceInCents: number;
  allocationPercent: number;
  isControl: boolean;
  metadata?: Record<string, unknown>;
}

export interface ExperimentConfig {
  id: string;
  name: string;
  hypothesis: string;
  productId: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  startDate: Date;
  endDate?: Date;
  variants: ExperimentVariant[];
  targetingRules?: TargetingRule[];
  minimumSampleSize: number;
  significanceThreshold: number;
}

export interface TargetingRule {
  field: string;
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'greater_than' | 'less_than';
  value: string | number | string[];
}

export interface CreateExperimentParams {
  name: string;
  hypothesis: string;
  productId: string;
  variants: Omit<ExperimentVariant, 'id'>[];
  durationDays?: number;
  targetingRules?: TargetingRule[];
  minimumSampleSize?: number;
  significanceThreshold?: number;
}

/**
 * ExperimentConfigService for managing pricing experiments
 */
export class ExperimentConfigService {
  private experiments: Map<string, ExperimentConfig> = new Map();

  /**
   * Create a new pricing experiment
   */
  async createExperiment(params: CreateExperimentParams): Promise<ExperimentConfig> {
    // Validate variants
    this.validateVariants(params.variants);

    const id = `exp_${generateId()}`;
    const now = new Date();
    const endDate = params.durationDays
      ? new Date(now.getTime() + params.durationDays * 24 * 60 * 60 * 1000)
      : undefined;

    const experiment: ExperimentConfig = {
      id,
      name: params.name,
      hypothesis: params.hypothesis,
      productId: params.productId,
      status: 'draft',
      startDate: now,
      endDate,
      variants: params.variants.map((v, i) => ({
        ...v,
        id: `var_${generateId()}`,
      })),
      targetingRules: params.targetingRules,
      minimumSampleSize: params.minimumSampleSize || 1000,
      significanceThreshold: params.significanceThreshold || 0.05,
    };

    // Ensure exactly one control
    const controls = experiment.variants.filter(v => v.isControl);
    if (controls.length !== 1) {
      throw new Error('Experiment must have exactly one control variant');
    }

    this.experiments.set(id, experiment);
    return experiment;
  }

  private validateVariants(variants: Omit<ExperimentVariant, 'id'>[]): void {
    if (variants.length < 2) {
      throw new Error('Experiment must have at least 2 variants (1 control + 1 treatment)');
    }

    if (variants.length > 5) {
      throw new Error('Experiment cannot have more than 5 variants');
    }

    const totalAllocation = variants.reduce((sum, v) => sum + v.allocationPercent, 0);
    if (Math.abs(totalAllocation - 100) > 0.01) {
      throw new Error(`Variant allocation must sum to 100% (got ${totalAllocation}%)`);
    }

    const controls = variants.filter(v => v.isControl);
    if (controls.length !== 1) {
      throw new Error('Experiment must have exactly one control variant');
    }
  }

  /**
   * Activate an experiment
   */
  async activateExperiment(experimentId: string): Promise<ExperimentConfig> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== 'draft' && experiment.status !== 'paused') {
      throw new Error(`Cannot activate experiment with status ${experiment.status}`);
    }

    experiment.status = 'active';
    experiment.startDate = new Date();
    return experiment;
  }

  /**
   * Pause an experiment
   */
  async pauseExperiment(experimentId: string): Promise<ExperimentConfig> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== 'active') {
      throw new Error(`Cannot pause experiment with status ${experiment.status}`);
    }

    experiment.status = 'paused';
    return experiment;
  }

  /**
   * Complete an experiment
   */
  async completeExperiment(experimentId: string): Promise<ExperimentConfig> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    experiment.status = 'completed';
    experiment.endDate = new Date();
    return experiment;
  }

  /**
   * Get experiment by ID
   */
  async getExperiment(experimentId: string): Promise<ExperimentConfig | null> {
    return this.experiments.get(experimentId) || null;
  }

  /**
   * Get all active experiments for a product
   */
  async getActiveExperiments(productId: string): Promise<ExperimentConfig[]> {
    return Array.from(this.experiments.values())
      .filter(e => e.productId === productId && e.status === 'active');
  }

  /**
   * Check if user matches targeting rules
   */
  matchesTargeting(experiment: ExperimentConfig, userContext: Record<string, unknown>): boolean {
    if (!experiment.targetingRules || experiment.targetingRules.length === 0) {
      return true;
    }

    return experiment.targetingRules.every(rule => {
      const userValue = userContext[rule.field];

      switch (rule.operator) {
        case 'equals':
          return userValue === rule.value;
        case 'not_equals':
          return userValue !== rule.value;
        case 'in':
          return Array.isArray(rule.value) && rule.value.includes(userValue as string);
        case 'not_in':
          return Array.isArray(rule.value) && !rule.value.includes(userValue as string);
        case 'greater_than':
          return typeof userValue === 'number' && userValue > (rule.value as number);
        case 'less_than':
          return typeof userValue === 'number' && userValue < (rule.value as number);
        default:
          return true;
      }
    });
  }
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export default ExperimentConfigService;
