/**
 * Test Fixtures - Pre-configured common scenarios
 *
 * Part of Phase 1 Testing Infrastructure (B1.2)
 * Ready-to-use test data for common testing scenarios
 */

import { DirectiveFactory } from './directive-factory.js';
import { PRDFactory } from './prd-factory.js';
import { UserStoryFactory } from './user-story-factory.js';

/**
 * Test Fixtures - Pre-configured scenarios
 */
export const Fixtures = {
  /**
   * Create a basic draft directive in LEAD phase
   * @returns {Promise<Object>}
   */
  async draftDirective() {
    return DirectiveFactory.create()
      .withTitle('Draft Test Directive')
      .inLeadPhase()
      .asDraft()
      .withMediumPriority()
      .build();
  },

  /**
   * Create an active directive in EXEC phase with PRD
   * @returns {Promise<Object>} Directive with PRD
   */
  async activeDirectiveWithPRD() {
    return DirectiveFactory.create()
      .withTitle('Active Test Directive')
      .inExecPhase()
      .asActive()
      .withHighPriority()
      .withPRD({
        title: 'Associated PRD',
        overview: 'PRD for active directive',
      });
  },

  /**
   * Create complete workflow (directive + PRD + 5 user stories)
   * @returns {Promise<Object>} Complete workflow data
   */
  async completeWorkflow() {
    return DirectiveFactory.create()
      .withTitle('Complete Workflow Test')
      .inPlanPhase()
      .asActive()
      .withCompleteWorkflow({
        storyCount: 5,
        prdAttributes: {
          title: 'Complete PRD',
          objectives: [
            'Implement core features',
            'Ensure quality',
            'Meet deadlines',
          ],
        },
        storyAttributes: {
          priority: 'high',
        },
      });
  },

  /**
   * Create directive with mixed priority user stories
   * @returns {Promise<Object>} Directive with stories
   */
  async directiveWithMixedStories() {
    const directive = await DirectiveFactory.create()
      .withTitle('Mixed Stories Directive')
      .inPlanPhase()
      .asActive()
      .build();

    const stories = await Promise.all([
      // Critical bug fix
      UserStoryFactory.create()
        .forDirective(directive.id)
        .withTitle('Critical Bug Fix')
        .withCriticalPriority()
        .withStoryPoints(5)
        .asInProgress()
        .build(),

      // High priority feature
      UserStoryFactory.create()
        .forDirective(directive.id)
        .withTitle('High Priority Feature')
        .withHighPriority()
        .withStoryPoints(8)
        .asPending()
        .build(),

      // Medium priority enhancement
      UserStoryFactory.create()
        .forDirective(directive.id)
        .withTitle('Enhancement')
        .withMediumPriority()
        .withStoryPoints(3)
        .asPending()
        .build(),

      // Low priority technical debt
      UserStoryFactory.create()
        .forDirective(directive.id)
        .withTitle('Technical Debt')
        .withLowPriority()
        .withStoryPoints(5)
        .asPending()
        .build(),
    ]);

    return {
      ...directive,
      user_stories: stories,
    };
  },

  /**
   * Create directive at each LEO Protocol phase
   * @returns {Promise<Array>} Array of directives (LEAD, PLAN, EXEC, VERIFY)
   */
  async directivesAtAllPhases() {
    return Promise.all([
      DirectiveFactory.create()
        .withTitle('LEAD Phase Directive')
        .inLeadPhase()
        .asDraft()
        .build(),

      DirectiveFactory.create()
        .withTitle('PLAN Phase Directive')
        .inPlanPhase()
        .asActive()
        .build(),

      DirectiveFactory.create()
        .withTitle('EXEC Phase Directive')
        .inExecPhase()
        .asActive()
        .build(),

      DirectiveFactory.create()
        .withTitle('VERIFY Phase Directive')
        .inVerifyPhase()
        .asCompleted()
        .build(),
    ]);
  },

  /**
   * Create sprint-sized workload (1 directive with 20 story points)
   * @returns {Promise<Object>} Directive with stories totaling ~20 points
   */
  async sprintWorkload() {
    const directive = await DirectiveFactory.create()
      .withTitle('Sprint Test Workload')
      .inExecPhase()
      .asActive()
      .build();

    // Create stories totaling ~20 points (typical sprint capacity)
    const stories = await Promise.all([
      UserStoryFactory.create()
        .forDirective(directive.id)
        .small()
        .withTitle('Quick Win 1')
        .withStoryPoints(2)
        .build(),

      UserStoryFactory.create()
        .forDirective(directive.id)
        .small()
        .withTitle('Quick Win 2')
        .withStoryPoints(3)
        .build(),

      UserStoryFactory.create()
        .forDirective(directive.id)
        .medium()
        .withTitle('Medium Feature')
        .withStoryPoints(5)
        .build(),

      UserStoryFactory.create()
        .forDirective(directive.id)
        .medium()
        .withTitle('Complex Feature')
        .withStoryPoints(8)
        .build(),

      UserStoryFactory.create()
        .forDirective(directive.id)
        .small()
        .withTitle('Polish')
        .withStoryPoints(2)
        .build(),
    ]);

    return {
      ...directive,
      user_stories: stories,
      total_story_points: stories.reduce((sum, s) => sum + s.story_points, 0),
    };
  },

  /**
   * Create performance-focused PRD
   * @param {string} directiveId - Directive ID
   * @returns {Promise<Object>}
   */
  async performancePRD(directiveId) {
    return PRDFactory.create()
      .forDirective(directiveId)
      .withTitle('Performance Optimization PRD')
      .withObjectives([
        'Reduce page load time to <2s',
        'Optimize database queries',
        'Implement caching strategy',
        'Reduce bundle size by 30%',
      ])
      .withTechnicalRequirements({
        performance: {
          pageLoadTime: '<2s',
          timeToInteractive: '<3s',
          bundleSize: '<500KB',
          databaseQueryTime: '<100ms',
        },
        optimization: {
          caching: 'Redis',
          cdn: 'CloudFront',
          compression: 'gzip',
        },
      })
      .withSuccessCriteria([
        'Lighthouse score >90',
        'All pages load in <2s',
        'Database queries optimized',
        'Bundle size reduced',
      ])
      .build();
  },

  /**
   * Create security-focused PRD
   * @param {string} directiveId - Directive ID
   * @returns {Promise<Object>}
   */
  async securityPRD(directiveId) {
    return PRDFactory.create()
      .forDirective(directiveId)
      .withTitle('Security Enhancement PRD')
      .withObjectives([
        'Implement OAuth 2.0 authentication',
        'Add role-based access control',
        'Encrypt sensitive data',
        'Pass security audit',
      ])
      .withTechnicalRequirements({
        security: {
          authentication: 'OAuth 2.0',
          authorization: 'RBAC',
          encryption: 'AES-256',
          sessionManagement: 'JWT',
        },
        compliance: {
          standards: ['OWASP Top 10', 'GDPR'],
          auditing: 'Quarterly',
        },
      })
      .withSuccessCriteria([
        'Security audit passes',
        'Penetration testing complete',
        'All sensitive data encrypted',
        'OWASP Top 10 mitigated',
      ])
      .build();
  },

  /**
   * Create user stories for complete user journey
   * @param {string} directiveId - Directive ID
   * @returns {Promise<Array>} Array of stories forming complete journey
   */
  async userJourneyStories(directiveId) {
    return Promise.all([
      UserStoryFactory.create()
        .forDirective(directiveId)
        .withTitle('As a new user, I want to register an account')
        .withStoryPoints(5)
        .withGivenWhenThen(
          'I am on the registration page',
          'I fill in my details and submit',
          'I receive a confirmation email and can log in'
        )
        .build(),

      UserStoryFactory.create()
        .forDirective(directiveId)
        .withTitle('As a user, I want to log in to my account')
        .withStoryPoints(3)
        .withGivenWhenThen(
          'I have a registered account',
          'I enter my credentials and click login',
          'I am redirected to my dashboard'
        )
        .build(),

      UserStoryFactory.create()
        .forDirective(directiveId)
        .withTitle('As a user, I want to view my dashboard')
        .withStoryPoints(5)
        .withGivenWhenThen(
          'I am logged in',
          'I navigate to the dashboard',
          'I see my personalized data and recent activity'
        )
        .build(),

      UserStoryFactory.create()
        .forDirective(directiveId)
        .withTitle('As a user, I want to update my profile')
        .withStoryPoints(3)
        .withGivenWhenThen(
          'I am on my profile page',
          'I edit my information and save',
          'My profile is updated and I see a success message'
        )
        .build(),

      UserStoryFactory.create()
        .forDirective(directiveId)
        .withTitle('As a user, I want to log out securely')
        .withStoryPoints(2)
        .withGivenWhenThen(
          'I am logged in',
          'I click the logout button',
          'I am logged out and redirected to the home page'
        )
        .build(),
    ]);
  },

  /**
   * Create blocked directive (simulates real-world blocker scenarios)
   * @returns {Promise<Object>}
   */
  async blockedDirective() {
    const directive = await DirectiveFactory.create()
      .withTitle('Blocked Directive')
      .inExecPhase()
      .asActive()
      .withMetadata({
        blocked: true,
        blocker_reason: 'Waiting for third-party API access',
        blocked_since: new Date().toISOString(),
      })
      .build();

    const stories = await Promise.all([
      UserStoryFactory.create()
        .forDirective(directive.id)
        .withTitle('Blocked Story - API Integration')
        .asBlocked()
        .withMetadata({
          blocked_by: 'API access not yet granted',
        })
        .build(),

      UserStoryFactory.create()
        .forDirective(directive.id)
        .withTitle('Unblocked Story - UI Work')
        .asInProgress()
        .build(),
    ]);

    return {
      ...directive,
      user_stories: stories,
    };
  },

  /**
   * Create minimal test data (smallest valid dataset)
   * @returns {Promise<Object>}
   */
  async minimalData() {
    return DirectiveFactory.create()
      .withTitle('Minimal Test')
      .asDraft()
      .withDescription('Minimal test description')
      .build();
  },

  /**
   * Create comprehensive test data (all fields populated)
   * @returns {Promise<Object>}
   */
  async comprehensiveData() {
    const directive = await DirectiveFactory.create()
      .withTitle('Comprehensive Test Data')
      .inExecPhase()
      .asActive()
      .withHighPriority()
      .withDescription('Comprehensive test description with all fields populated')
      .withMetadata({
        tags: ['test', 'comprehensive', 'all-fields'],
        created_by: 'test-user',
        environment: 'test',
      })
      .build();

    const prd = await PRDFactory.create()
      .forDirective(directive.id)
      .comprehensive()
      .build();

    const stories = await UserStoryFactory.create()
      .forDirective(directive.id)
      .buildMany(5);

    return {
      ...directive,
      prd,
      user_stories: stories,
    };
  },
};

/**
 * Cleanup helper for fixtures
 */
export class FixtureCleanup {
  constructor() {
    this.directives = [];
  }

  /**
   * Track directive for cleanup
   * @param {Object|Array} directiveOrArray - Directive or array of directives
   */
  track(directiveOrArray) {
    if (Array.isArray(directiveOrArray)) {
      this.directives.push(...directiveOrArray.map(d => d.id));
    } else {
      this.directives.push(directiveOrArray.id);
    }
  }

  /**
   * Clean up all tracked directives
   */
  async cleanup() {
    const { deleteTestDirective } = await import('../helpers/database-helpers.js');

    for (const id of this.directives) {
      try {
        await deleteTestDirective(id);
      } catch (error) {
        console.warn(`Failed to cleanup directive ${id}:`, error.message);
      }
    }

    this.directives = [];
  }
}
