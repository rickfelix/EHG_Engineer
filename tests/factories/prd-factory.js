/**
 * PRD Factory - Builder for product requirements
 *
 * Part of Phase 1 Testing Infrastructure (B1.2)
 * Fluent API for creating test PRDs
 */

import { BaseFactory, DataGenerators } from './base-factory.js';

/**
 * PRD Factory with fluent API
 *
 * Usage:
 *   const prd = await PRDFactory.create()
 *     .forDirective(directiveId)
 *     .withTitle('My PRD')
 *     .withObjective('Improve user experience')
 *     .build();
 */
export class PRDFactory extends BaseFactory {
  constructor() {
    super();

    // Default attributes
    this.attributes = {
      title: DataGenerators.title('PRD'),
      overview: DataGenerators.description(3),
      objectives: [
        'Improve user experience',
        'Increase system efficiency',
        'Reduce operational costs',
      ],
      technical_requirements: DataGenerators.jsonObject('requirements'),
      success_criteria: [
        'All acceptance tests pass',
        'Performance metrics met',
        'User feedback positive',
      ],
      assumptions: [
        'Database schema supports required queries',
        'API rate limits sufficient',
      ],
      constraints: [
        'Must complete within 2 weeks',
        'Budget limit: $10,000',
      ],
      risks: [
        'Third-party API availability',
        'Data migration complexity',
      ],
      metadata: {},
    };
  }

  /**
   * Associate with directive
   * @param {string} directiveId - Strategic directive ID
   * @returns {this}
   */
  forDirective(directiveId) {
    return this.set('strategic_directive_id', directiveId);
  }

  /**
   * Set title
   * @param {string} title - PRD title
   * @returns {this}
   */
  withTitle(title) {
    return this.set('title', title);
  }

  /**
   * Set overview
   * @param {string} overview - PRD overview
   * @returns {this}
   */
  withOverview(overview) {
    return this.set('overview', overview);
  }

  /**
   * Add objective
   * @param {string} objective - Objective to add
   * @returns {this}
   */
  withObjective(objective) {
    const objectives = this.get('objectives') || [];
    return this.set('objectives', [...objectives, objective]);
  }

  /**
   * Set all objectives
   * @param {Array<string>} objectives - Array of objectives
   * @returns {this}
   */
  withObjectives(objectives) {
    return this.set('objectives', objectives);
  }

  /**
   * Add success criterion
   * @param {string} criterion - Success criterion
   * @returns {this}
   */
  withSuccessCriterion(criterion) {
    const criteria = this.get('success_criteria') || [];
    return this.set('success_criteria', [...criteria, criterion]);
  }

  /**
   * Set all success criteria
   * @param {Array<string>} criteria - Array of success criteria
   * @returns {this}
   */
  withSuccessCriteria(criteria) {
    return this.set('success_criteria', criteria);
  }

  /**
   * Set technical requirements
   * @param {Object} requirements - Technical requirements object
   * @returns {this}
   */
  withTechnicalRequirements(requirements) {
    return this.set('technical_requirements', {
      ...this.get('technical_requirements'),
      ...requirements,
    });
  }

  /**
   * Add assumption
   * @param {string} assumption - Assumption to add
   * @returns {this}
   */
  withAssumption(assumption) {
    const assumptions = this.get('assumptions') || [];
    return this.set('assumptions', [...assumptions, assumption]);
  }

  /**
   * Add constraint
   * @param {string} constraint - Constraint to add
   * @returns {this}
   */
  withConstraint(constraint) {
    const constraints = this.get('constraints') || [];
    return this.set('constraints', [...constraints, constraint]);
  }

  /**
   * Add risk
   * @param {string} risk - Risk to add
   * @returns {this}
   */
  withRisk(risk) {
    const risks = this.get('risks') || [];
    return this.set('risks', [...risks, risk]);
  }

  /**
   * Set target completion date
   * @param {Date|string} date - Target date
   * @returns {this}
   */
  withTargetDate(date) {
    return this.set('target_completion_date', date instanceof Date ? date.toISOString() : date);
  }

  /**
   * Set estimated effort
   * @param {number} hours - Estimated hours
   * @returns {this}
   */
  withEstimatedEffort(hours) {
    return this.set('estimated_effort_hours', hours);
  }

  /**
   * Add metadata
   * @param {Object} metadata - Metadata object
   * @returns {this}
   */
  withMetadata(metadata) {
    return this.set('metadata', {
      ...this.get('metadata'),
      ...metadata,
    });
  }

  // Convenience methods for common scenarios

  /**
   * Create minimal PRD (just required fields)
   * @returns {this}
   */
  minimal() {
    this.attributes = {
      strategic_directive_id: this.get('strategic_directive_id'),
      title: this.get('title'),
      overview: this.get('overview'),
      objectives: ['Basic objective'],
      technical_requirements: {},
      success_criteria: ['Basic success criterion'],
    };
    return this;
  }

  /**
   * Create comprehensive PRD (all fields populated)
   * @returns {this}
   */
  comprehensive() {
    return this
      .withObjectives([
        'Improve user experience by 30%',
        'Reduce page load time to <2s',
        'Increase user engagement by 20%',
        'Achieve 99.9% uptime',
      ])
      .withSuccessCriteria([
        'All E2E tests pass',
        'Performance benchmarks met',
        'User satisfaction score >4.5/5',
        'Zero critical bugs in production',
      ])
      .withTechnicalRequirements({
        frontend: { framework: 'React', version: '18.x' },
        backend: { language: 'Node.js', database: 'PostgreSQL' },
        infrastructure: { hosting: 'AWS', cdn: 'CloudFront' },
        performance: { responseTime: '<200ms', throughput: '1000 req/s' },
      })
      .withAssumption('Supabase API remains stable')
      .withAssumption('Third-party services maintain SLA')
      .withConstraint('Must use existing technology stack')
      .withConstraint('Budget: $15,000')
      .withRisk('Database migration may cause downtime')
      .withRisk('Third-party API rate limits')
      .withTargetDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
      .withEstimatedEffort(120);
  }

  /**
   * Build and create PRD in database
   * @returns {Promise<Object>} Created PRD
   */
  async build() {
    if (!this.get('strategic_directive_id')) {
      throw new Error('PRD must be associated with a directive. Use forDirective()');
    }

    const { data, error } = await this.supabase
      .from('product_requirements_v2')
      .insert([this.attributes])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create PRD: ${error.message}`);
    }

    this.trackRecord('product_requirements_v2', data.id);
    return data;
  }

  /**
   * Create factory instance (static helper)
   * @returns {PRDFactory}
   */
  static create() {
    return new PRDFactory();
  }
}

// Export traits for common scenarios
export const PRDTraits = {
  // Minimal viable PRD
  minimal: {
    objectives: ['Core functionality'],
    technical_requirements: { basic: true },
    success_criteria: ['Feature works'],
  },

  // Performance-focused PRD
  performance: {
    objectives: [
      'Optimize response time',
      'Reduce memory usage',
      'Improve scalability',
    ],
    technical_requirements: {
      performance: {
        responseTime: '<100ms',
        memoryLimit: '512MB',
        concurrency: '1000 users',
      },
    },
    success_criteria: [
      'All performance benchmarks met',
      'Load testing passes',
      'Memory leaks eliminated',
    ],
  },

  // Security-focused PRD
  security: {
    objectives: [
      'Implement authentication',
      'Add authorization layer',
      'Encrypt sensitive data',
    ],
    technical_requirements: {
      security: {
        authentication: 'OAuth 2.0',
        authorization: 'RBAC',
        encryption: 'AES-256',
      },
    },
    success_criteria: [
      'Security audit passes',
      'Penetration testing complete',
      'OWASP Top 10 mitigated',
    ],
  },

  // UI/UX focused PRD
  design: {
    objectives: [
      'Improve user interface',
      'Enhance accessibility',
      'Modernize design system',
    ],
    technical_requirements: {
      design: {
        framework: 'Tailwind CSS',
        accessibility: 'WCAG 2.1 AA',
        responsive: true,
      },
    },
    success_criteria: [
      'Accessibility audit passes',
      'User testing feedback positive',
      'Design system implemented',
    ],
  },
};
