/**
 * User Story Factory - Builder for user stories
 *
 * Part of Phase 1 Testing Infrastructure (B1.2)
 * Fluent API for creating test user stories
 */

import { BaseFactory, DataGenerators, Sequence } from './base-factory.js';

const storySequence = new Sequence('Story', 1);

/**
 * User Story Factory with fluent API
 *
 * Usage:
 *   const story = await UserStoryFactory.create()
 *     .forDirective(directiveId)
 *     .withTitle('User Story Title')
 *     .withStoryPoints(5)
 *     .asInProgress()
 *     .build();
 */
export class UserStoryFactory extends BaseFactory {
  constructor() {
    super();

    // Default attributes
    this.attributes = {
      title: `As a user, I want to ${this.randomAction()}`,
      description: DataGenerators.description(2),
      acceptance_criteria: this.defaultAcceptanceCriteria(),
      story_points: this.randomInt(1, 8),
      priority: 'medium',
      status: 'pending',
      assigned_to: null,
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
   * @param {string} title - Story title
   * @returns {this}
   */
  withTitle(title) {
    return this.set('title', title);
  }

  /**
   * Set description
   * @param {string} description - Story description
   * @returns {this}
   */
  withDescription(description) {
    return this.set('description', description);
  }

  /**
   * Set acceptance criteria
   * @param {string} criteria - Acceptance criteria
   * @returns {this}
   */
  withAcceptanceCriteria(criteria) {
    return this.set('acceptance_criteria', criteria);
  }

  /**
   * Set story points
   * @param {number} points - Story points (1-13)
   * @returns {this}
   */
  withStoryPoints(points) {
    return this.set('story_points', points);
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
   * Set status
   * @param {string} status - Story status
   * @returns {this}
   */
  withStatus(status) {
    return this.set('status', status);
  }

  /**
   * Assign to user
   * @param {string} userId - User ID
   * @returns {this}
   */
  assignedTo(userId) {
    return this.set('assigned_to', userId);
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

  /** Set to pending status */
  asPending() {
    return this.withStatus('pending');
  }

  /** Set to in_progress status */
  asInProgress() {
    return this.withStatus('in_progress');
  }

  /** Set to completed status */
  asCompleted() {
    return this.withStatus('completed');
  }

  /** Set to blocked status */
  asBlocked() {
    return this.withStatus('blocked');
  }

  /**
   * Create small story (1-3 points)
   * @returns {this}
   */
  small() {
    return this.withStoryPoints(this.randomInt(1, 3));
  }

  /**
   * Create medium story (5-8 points)
   * @returns {this}
   */
  medium() {
    return this.withStoryPoints(this.randomInt(5, 8));
  }

  /**
   * Create large story (13 points)
   * @returns {this}
   */
  large() {
    return this.withStoryPoints(13);
  }

  /**
   * Create user story with Given-When-Then format
   * @param {string} given - Given context
   * @param {string} when - When action
   * @param {string} then - Then outcome
   * @returns {this}
   */
  withGivenWhenThen(given, when, then) {
    const criteria = `
**Given** ${given}
**When** ${when}
**Then** ${then}
`.trim();

    return this.withAcceptanceCriteria(criteria);
  }

  /**
   * Use sequential title
   * @returns {this}
   */
  withSequentialTitle() {
    return this.withTitle(`User Story: ${storySequence.next()}`);
  }

  /**
   * Build and create story in database
   * @returns {Promise<Object>} Created story
   */
  async build() {
    if (!this.get('strategic_directive_id')) {
      throw new Error('User story must be associated with a directive. Use forDirective()');
    }

    const { data, error } = await this.supabase
      .from('user_stories')
      .insert([this.attributes])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create user story: ${error.message}`);
    }

    this.trackRecord('user_stories', data.id);
    return data;
  }

  /**
   * Build multiple stories
   * @param {number} count - Number of stories
   * @returns {Promise<Array>} Created stories
   */
  async buildMany(count) {
    const stories = [];

    for (let i = 0; i < count; i++) {
      const factory = this.clone();
      // Make each story unique
      factory.withTitle(`${this.attributes.title} - Part ${i + 1}`);
      const story = await factory.build();
      stories.push(story);
      // Transfer tracking to parent factory
      this.createdRecords.push(...factory.createdRecords);
    }

    return stories;
  }

  /**
   * Create factory instance (static helper)
   * @returns {UserStoryFactory}
   */
  static create() {
    return new UserStoryFactory();
  }

  // Helper methods

  /**
   * Get random action for story title
   * @private
   */
  randomAction() {
    const actions = [
      'view my dashboard',
      'create a new report',
      'export data to CSV',
      'filter results by date',
      'sort items by priority',
      'search for records',
      'update my profile',
      'receive notifications',
    ];
    return this.pickRandom(actions);
  }

  /**
   * Generate default acceptance criteria
   * @private
   */
  defaultAcceptanceCriteria() {
    return `
**Acceptance Criteria:**
- Feature is accessible to authorized users
- UI is responsive and user-friendly
- All data is validated before submission
- Error messages are clear and helpful
- Feature works across all supported browsers
`.trim();
  }
}

// Export traits for common scenarios
export const UserStoryTraits = {
  // Small quick win story
  quickWin: {
    title: 'As a user, I want quick access to recent items',
    story_points: 2,
    priority: 'medium',
    status: 'pending',
  },

  // Critical bug fix story
  criticalBugFix: {
    title: 'As a user, I need the login issue fixed immediately',
    story_points: 5,
    priority: 'critical',
    status: 'in_progress',
    metadata: {
      bug: true,
      severity: 'critical',
      affects_production: true,
    },
  },

  // Large epic story
  epic: {
    title: 'As a user, I want a complete reporting system',
    story_points: 13,
    priority: 'high',
    status: 'pending',
    metadata: {
      epic: true,
      requires_breakdown: true,
    },
  },

  // Enhancement story
  enhancement: {
    title: 'As a user, I want improved search functionality',
    story_points: 5,
    priority: 'medium',
    status: 'pending',
    metadata: {
      enhancement: true,
      user_requested: true,
    },
  },

  // Technical debt story
  technicalDebt: {
    title: 'As a developer, I need to refactor the authentication module',
    story_points: 8,
    priority: 'low',
    status: 'pending',
    metadata: {
      technical_debt: true,
      code_quality: true,
    },
  },

  // Blocked story
  blocked: {
    title: 'As a user, I want integration with third-party service',
    story_points: 8,
    priority: 'high',
    status: 'blocked',
    metadata: {
      blocked_by: 'Waiting for API access',
      blocked_since: new Date().toISOString(),
    },
  },
};
