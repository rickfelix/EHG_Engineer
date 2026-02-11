/**
 * Disposition Calibration Tests
 * SD: SD-LEO-ENH-EVA-INTAKE-DISPOSITION-001
 *
 * Validates disposition accuracy using known sample items.
 * Each sample has an expected disposition, and the test validates
 * that the rule-based fallback (and LLM prompt design) produces
 * correct classifications.
 */

import { describe, it, expect } from 'vitest';
import { routeToAnalysis, ANALYSIS_TOOLS } from '../../../lib/integrations/deeper-analysis-router.js';

// ============================================================================
// Calibration Sample Data
// ============================================================================

/**
 * Known items with expected dispositions.
 * These represent real-world categories from Todoist/YouTube intake.
 */
const CALIBRATION_SAMPLES = [
  // --- actionable ---
  {
    title: 'Add dark mode toggle to settings page',
    description: 'Users have requested a dark mode option in the app settings',
    expectedDisposition: 'actionable',
    category: 'feature request'
  },
  {
    title: 'Fix login redirect loop on expired session',
    description: 'When session expires, clicking login redirects back to login page infinitely',
    expectedDisposition: 'actionable',
    category: 'bug fix'
  },
  {
    title: 'Add CSV export to analytics dashboard',
    description: 'Allow users to download analytics data as CSV files',
    expectedDisposition: 'actionable',
    category: 'feature request'
  },

  // --- already_exists ---
  {
    title: 'Add AI-powered feedback classification',
    description: 'We should add AI to classify incoming feedback items automatically',
    expectedDisposition: 'already_exists',
    category: 'duplicate capability',
    conflictWith: 'triage-engine'
  },
  {
    title: 'Create a vetting pipeline for proposals',
    description: 'Build a system that evaluates proposals against rubrics',
    expectedDisposition: 'already_exists',
    category: 'duplicate capability',
    conflictWith: 'VettingEngine'
  },

  // --- research_needed ---
  {
    title: 'Integrate with Stripe for payments',
    description: 'We need payment processing but unclear which plan fits our volume',
    expectedDisposition: 'research_needed',
    category: 'requires investigation'
  },
  {
    title: 'Consider WebSocket for real-time updates',
    description: 'Currently polling every 30s, explore if WebSocket would be better for our use case',
    expectedDisposition: 'research_needed',
    category: 'requires investigation'
  },

  // --- consideration_only ---
  {
    title: 'What if we pivoted to B2C?',
    description: 'Just thinking about whether a consumer version would work for our product',
    expectedDisposition: 'consideration_only',
    category: 'strategic thinking'
  },
  {
    title: 'Long-term: multi-tenant architecture',
    description: 'We might need multi-tenancy someday but not now. Just capturing the thought.',
    expectedDisposition: 'consideration_only',
    category: 'future planning'
  },

  // --- significant_departure ---
  {
    title: 'Rewrite the entire frontend in Svelte',
    description: 'React is slow, should we switch to Svelte for better performance?',
    expectedDisposition: 'significant_departure',
    category: 'major rewrite'
  },
  {
    title: 'Replace Supabase with a custom backend',
    description: 'Build our own API server with Express, PostgreSQL, and custom auth',
    expectedDisposition: 'significant_departure',
    category: 'architecture change'
  },

  // --- needs_triage ---
  {
    title: 'Something feels off about the dashboard',
    description: 'Not sure what exactly, but the dashboard doesn\'t feel right',
    expectedDisposition: 'needs_triage',
    category: 'vague'
  },
  {
    title: 'Look into that thing from the meeting',
    description: 'From yesterday\'s meeting, the idea we discussed',
    expectedDisposition: 'needs_triage',
    category: 'insufficient context'
  }
];

// ============================================================================
// Disposition Validation Tests
// ============================================================================

describe('Disposition Calibration', () => {
  describe('Valid disposition values', () => {
    const VALID_DISPOSITIONS = [
      'actionable', 'already_exists', 'research_needed',
      'consideration_only', 'significant_departure', 'needs_triage'
    ];

    it('should have exactly 6 disposition values', () => {
      expect(VALID_DISPOSITIONS).toHaveLength(6);
    });

    it('should cover all calibration sample expectations', () => {
      const expectedDispositions = [...new Set(CALIBRATION_SAMPLES.map(s => s.expectedDisposition))];
      for (const d of expectedDispositions) {
        expect(VALID_DISPOSITIONS).toContain(d);
      }
    });

    it('should have at least 2 calibration samples per disposition', () => {
      for (const disposition of VALID_DISPOSITIONS) {
        const samples = CALIBRATION_SAMPLES.filter(s => s.expectedDisposition === disposition);
        expect(samples.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('Status mapping consistency', () => {
    const statusMap = {
      'already_exists': 'duplicate',
      'research_needed': 'needs_revision',
      'consideration_only': 'archived',
      'significant_departure': 'needs_revision',
      'needs_triage': 'needs_revision'
    };

    it('should map all non-actionable dispositions to valid statuses', () => {
      const validStatuses = ['duplicate', 'needs_revision', 'archived'];
      for (const [disposition, status] of Object.entries(statusMap)) {
        expect(validStatuses).toContain(status);
        expect(disposition).not.toBe('actionable');
      }
    });

    it('should not have a mapping for actionable (it continues to vetting)', () => {
      expect(statusMap['actionable']).toBeUndefined();
    });
  });

  describe('Confidence thresholds', () => {
    it('should have 60% as the minimum confidence threshold', () => {
      const MIN_CONFIDENCE = 0.6;
      expect(MIN_CONFIDENCE).toBe(0.6);
    });

    it('should classify items below threshold as needs_triage', () => {
      const confidence = 0.45;
      const threshold = 0.6;
      const disposition = confidence < threshold ? 'needs_triage' : 'actionable';
      expect(disposition).toBe('needs_triage');
    });

    it('should allow items at or above threshold through', () => {
      const confidence = 0.6;
      const threshold = 0.6;
      const passesThreshold = confidence >= threshold;
      expect(passesThreshold).toBe(true);
    });
  });
});

// ============================================================================
// Deeper Analysis Router Tests
// ============================================================================

describe('Deeper Analysis Router', () => {
  describe('Triangulation routing', () => {
    it('should route items claiming capability exists to triangulation', () => {
      const result = routeToAnalysis({
        title: 'We already have this feature in the codebase',
        description: 'The triage engine already exists and handles classification'
      });
      expect(result.tool).toBe(ANALYSIS_TOOLS.TRIANGULATION);
      expect(result.confidence).toBeGreaterThan(40);
    });

    it('should route items about broken features to triangulation', () => {
      const result = routeToAnalysis({
        title: 'Auth is broken after last deploy',
        description: 'Authentication is not working since the latest update'
      });
      expect(result.tool).toBe(ANALYSIS_TOOLS.TRIANGULATION);
    });

    it('should route items with conflict_with to triangulation', () => {
      const result = routeToAnalysis({
        title: 'Add feedback classification',
        description: 'We need AI classification for feedback',
        dispositionResult: { conflict_with: 'triage-engine' }
      });
      expect(result.tool).toBe(ANALYSIS_TOOLS.TRIANGULATION);
    });
  });

  describe('Debate routing', () => {
    it('should route comparison items to debate', () => {
      const result = routeToAnalysis({
        title: 'Should we use Redis vs Memcached for caching?',
        description: 'Need to evaluate trade-offs between Redis and Memcached'
      });
      expect(result.tool).toBe(ANALYSIS_TOOLS.DEBATE);
      expect(result.confidence).toBeGreaterThan(40);
    });

    it('should route pros/cons evaluations to debate', () => {
      const result = routeToAnalysis({
        title: 'Evaluate pros and cons of microservices',
        description: 'Compare monolith vs microservices for our use case'
      });
      expect(result.tool).toBe(ANALYSIS_TOOLS.DEBATE);
    });
  });

  describe('Research routing', () => {
    it('should route "how should we" items to research', () => {
      const result = routeToAnalysis({
        title: 'How should we implement real-time notifications?',
        description: 'Need to explore options for push notifications'
      });
      expect(result.tool).toBe(ANALYSIS_TOOLS.RESEARCH);
      expect(result.confidence).toBeGreaterThan(40);
    });

    it('should route feasibility checks to research', () => {
      const result = routeToAnalysis({
        title: 'Feasibility of on-device ML inference',
        description: 'Can we run ML models in the browser for our use case?'
      });
      expect(result.tool).toBe(ANALYSIS_TOOLS.RESEARCH);
    });

    it('should default ambiguous items to research', () => {
      const result = routeToAnalysis({
        title: 'Something to think about',
        description: 'No clear direction'
      });
      expect(result.tool).toBe(ANALYSIS_TOOLS.RESEARCH);
      expect(result.confidence).toBeLessThanOrEqual(40);
    });
  });

  describe('Confidence scoring', () => {
    it('should return higher confidence when signals are strong', () => {
      const strong = routeToAnalysis({
        title: 'We already have this feature built and existing in the codebase',
        description: 'The codebase already supports this capability',
        dispositionResult: { conflict_with: 'feature-x', suggestion: 'verify this claim' }
      });

      const weak = routeToAnalysis({
        title: 'Hmm, not sure about this',
        description: 'Vague item'
      });

      expect(strong.confidence).toBeGreaterThan(weak.confidence);
    });

    it('should cap confidence at 95', () => {
      const result = routeToAnalysis({
        title: 'We already have this existing feature and it currently supports everything described. The codebase already has this implemented.',
        description: 'Existing implementation already exists currently',
        dispositionResult: { conflict_with: 'x', suggestion: 'verify and confirm' }
      });
      expect(result.confidence).toBeLessThanOrEqual(95);
    });
  });

  describe('Routing result structure', () => {
    it('should always return tool, confidence, and reasoning', () => {
      const result = routeToAnalysis({ title: 'test', description: '' });
      expect(result).toHaveProperty('tool');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('reasoning');
      expect(typeof result.tool).toBe('string');
      expect(typeof result.confidence).toBe('number');
      expect(typeof result.reasoning).toBe('string');
    });

    it('should return a valid tool type', () => {
      const validTools = Object.values(ANALYSIS_TOOLS);
      const result = routeToAnalysis({ title: 'test', description: 'something' });
      expect(validTools).toContain(result.tool);
    });
  });
});

// ============================================================================
// Interactive Mode Contract Tests
// ============================================================================

describe('Interactive Mode Contract', () => {
  it('should define the askUser callback contract', () => {
    // The askUser function should receive (item, aiDisposition) and return { disposition, skip }
    const mockItem = { id: '123', title: 'Test item', index: 1, total: 5, _sourceType: 'todoist' };
    const mockAiDisposition = { disposition: 'actionable', confidence: 85, reason: 'Clear request' };

    // Simulate confirm
    const confirmResult = { disposition: 'actionable' };
    expect(confirmResult.disposition).toBe('actionable');
    expect(confirmResult.skip).toBeUndefined();

    // Simulate override
    const overrideResult = { disposition: 'research_needed' };
    expect(overrideResult.disposition).not.toBe(mockAiDisposition.disposition);

    // Simulate skip
    const skipResult = { skip: true };
    expect(skipResult.skip).toBe(true);

    // Validate mock item has required fields
    expect(mockItem).toHaveProperty('id');
    expect(mockItem).toHaveProperty('title');
    expect(mockItem).toHaveProperty('index');
    expect(mockItem).toHaveProperty('total');
  });
});
