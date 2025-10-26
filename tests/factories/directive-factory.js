/**
 * Directive Factory - Builder for strategic directives
 *
 * Part of Phase 1 Testing Infrastructure (B1.2)
 * Fluent API for creating test directives with related data
 */

import { BaseFactory, DataGenerators, Sequence } from './base-factory.js';

const titleSequence = new Sequence('Directive', 1);

/**
 * Directive Factory with fluent API
 *
 * Usage:
 *   const directive = await DirectiveFactory.create()
 *     .withTitle('My Directive')
 *     .inPlanPhase()
 *     .withHighPriority()
 *     .build();
 */
export class DirectiveFactory extends BaseFactory {
  constructor() {
    super();

    // Default attributes
    this.attributes = {
      title: DataGenerators.title('Directive'),
      description: DataGenerators.description(),
      status: 'draft',
      priority: 'medium',
      phase: 'LEAD',
      metadata: {},
    };
  }

  /**
   * Set title
   * @param {string} title - Directive title
   * @returns {this}
   */
  withTitle(title) {
    return this.set('title', title);
  }

  /**
   * Set description
   * @param {string} description - Directive description
   * @returns {this}
   */
  withDescription(description) {
    return this.set('description', description);
  }

  /**
   * Set status
   * @param {string} status - Status (draft, active, completed, etc.)
   * @returns {this}
   */
  withStatus(status) {
    return this.set('status', status);
  }

  /**
   * Set priority
   * @param {string} priority - Priority level
   * @returns {this}
   */
  withPriority(priority) {
    return this.set('priority', priority);
  }

  /**
   * Set phase
   * @param {string} phase - LEO Protocol phase
   * @returns {this}
   */
  inPhase(phase) {
    return this.set('phase', phase);
  }

  // Convenience methods for common scenarios

  /** Set to LEAD phase */
  inLeadPhase() {
    return this.inPhase('LEAD');
  }

  /** Set to PLAN phase */
  inPlanPhase() {
    return this.inPhase('PLAN');
  }

  /** Set to EXEC phase */
  inExecPhase() {
    return this.inPhase('EXEC');
  }

  /** Set to VERIFY phase */
  inVerifyPhase() {
    return this.inPhase('VERIFY');
  }

  /** Set high priority */
  withHighPriority() {
    return this.withPriority('high');
  }

  /** Set medium priority */
  withMediumPriority() {
    return this.withPriority('medium');
  }

  /** Set low priority */
  withLowPriority() {
    return this.withPriority('low');
  }

  /** Set critical priority */
  withCriticalPriority() {
    return this.withPriority('critical');
  }

  /** Set to draft status */
  asDraft() {
    return this.withStatus('draft');
  }

  /** Set to active status */
  asActive() {
    return this.withStatus('active');
  }

  /** Set to completed status */
  asCompleted() {
    return this.withStatus('completed');
  }

  /** Set to archived status */
  asArchived() {
    return this.withStatus('archived');
  }

  /**
   * Add metadata
   * @param {Object} metadata - Metadata object
   * @returns {this}
   */
  withMetadata(metadata) {
    return this.set('metadata', {
      ...this.attributes.metadata,
      ...metadata,
    });
  }

  /**
   * Set created_by
   * @param {string} userId - User ID
   * @returns {this}
   */
  createdBy(userId) {
    return this.set('created_by', userId);
  }

  /**
   * Set assigned_to
   * @param {string} userId - User ID
   * @returns {this}
   */
  assignedTo(userId) {
    return this.set('assigned_to', userId);
  }

  /**
   * Use sequential title
   * @returns {this}
   */
  withSequentialTitle() {
    return this.withTitle(titleSequence.next());
  }

  /**
   * Build and create directive in database
   * @returns {Promise<Object>} Created directive
   */
  async build() {
    const { data, error } = await this.supabase
      .from('strategic_directives_v2')
      .insert([this.attributes])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create directive: ${error.message}`);
    }

    this.trackRecord('strategic_directives_v2', data.id);
    return data;
  }

  /**
   * Build multiple directives
   * @param {number} count - Number of directives
   * @returns {Promise<Array>} Created directives
   */
  async buildMany(count) {
    const directives = [];

    for (let i = 0; i < count; i++) {
      const factory = this.clone();
      // Make each directive unique
      factory.withTitle(`${this.attributes.title} ${i + 1}`);
      const directive = await factory.build();
      directives.push(directive);
      // Transfer tracking to parent factory
      this.createdRecords.push(...factory.createdRecords);
    }

    return directives;
  }

  /**
   * Create directive with PRD
   * @param {Object} prdAttributes - PRD attributes (optional)
   * @returns {Promise<Object>} Directive with PRD
   */
  async withPRD(prdAttributes = {}) {
    const directive = await this.build();

    const { PRDFactory } = await import('./prd-factory.js');
    const prdFactory = PRDFactory.create().forDirective(directive.id);

    if (Object.keys(prdAttributes).length > 0) {
      prdFactory.setAttributes(prdAttributes);
    }

    const prd = await prdFactory.build();

    // Transfer tracking
    this.createdRecords.push(...prdFactory.createdRecords);

    return { ...directive, prd };
  }

  /**
   * Create directive with user stories
   * @param {number} count - Number of user stories
   * @param {Object} storyAttributes - Story attributes (optional)
   * @returns {Promise<Object>} Directive with user stories
   */
  async withUserStories(count = 3, storyAttributes = {}) {
    const directive = await this.build();

    const { UserStoryFactory } = await import('./user-story-factory.js');
    const stories = [];

    for (let i = 0; i < count; i++) {
      const storyFactory = UserStoryFactory.create()
        .forDirective(directive.id)
        .setAttributes(storyAttributes);

      const story = await storyFactory.build();
      stories.push(story);

      // Transfer tracking
      this.createdRecords.push(...storyFactory.createdRecords);
    }

    return { ...directive, user_stories: stories };
  }

  /**
   * Create complete workflow (directive + PRD + user stories)
   * @param {Object} options - Options { storyCount, prdAttributes, storyAttributes }
   * @returns {Promise<Object>} Complete workflow data
   */
  async withCompleteWorkflow(options = {}) {
    const { storyCount = 3, prdAttributes = {}, storyAttributes = {} } = options;

    const directive = await this.build();

    // Create PRD
    const { PRDFactory } = await import('./prd-factory.js');
    const prdFactory = PRDFactory.create()
      .forDirective(directive.id)
      .setAttributes(prdAttributes);
    const prd = await prdFactory.build();
    this.createdRecords.push(...prdFactory.createdRecords);

    // Create user stories
    const { UserStoryFactory } = await import('./user-story-factory.js');
    const stories = [];

    for (let i = 0; i < storyCount; i++) {
      const storyFactory = UserStoryFactory.create()
        .forDirective(directive.id)
        .setAttributes(storyAttributes);

      const story = await storyFactory.build();
      stories.push(story);
      this.createdRecords.push(...storyFactory.createdRecords);
    }

    return {
      ...directive,
      prd,
      user_stories: stories,
    };
  }

  /**
   * Create factory instance (static helper)
   * @returns {DirectiveFactory}
   */
  static create() {
    return new DirectiveFactory();
  }
}

// Export traits for common scenarios
export const DirectiveTraits = {
  // High priority active directive in EXEC phase
  activeExec: {
    status: 'active',
    phase: 'EXEC',
    priority: 'high',
  },

  // Draft directive in LEAD phase
  leadDraft: {
    status: 'draft',
    phase: 'LEAD',
    priority: 'medium',
  },

  // Completed directive in VERIFY phase
  verifyCompleted: {
    status: 'completed',
    phase: 'VERIFY',
    priority: 'medium',
  },

  // Critical priority requiring immediate attention
  critical: {
    priority: 'critical',
    status: 'active',
    metadata: {
      urgent: true,
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  },

  // Archived old directive
  archived: {
    status: 'archived',
    phase: 'VERIFY',
    metadata: {
      archived_at: new Date().toISOString(),
      archived_reason: 'Superseded by newer directive',
    },
  },
};
