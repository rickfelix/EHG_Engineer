/**
 * Unit Tests: Intelligent UAT Feedback System
 *
 * Tests for SD-LEO-FEAT-INTELLIGENT-UAT-FEEDBACK-001
 *
 * @module tests/unit/uat/intelligent-feedback.test.js
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConsensusEngine } from '../../../lib/uat/consensus-engine.js';
import { FollowUpGenerator } from '../../../lib/uat/follow-up-generator.js';
import { ActionRouter } from '../../../lib/uat/action-router.js';
import { FEEDBACK_MODES, MODE_KEYWORDS } from '../../../lib/uat/feedback-analyzer.js';

// ============================================================================
// CONSENSUS ENGINE TESTS
// ============================================================================
describe('ConsensusEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new ConsensusEngine();
  });

  describe('evaluate()', () => {
    it('should return high confidence when both models fully agree', () => {
      const gpt = {
        mode: 'technical',
        severity: 'major',
        suggestedAction: 'quick-fix',
        estimatedLOC: 30,
        riskAreas: ['ui']
      };
      const gemini = {
        mode: 'technical',
        severity: 'major',
        suggestedAction: 'quick-fix',
        estimatedLOC: 35,
        riskAreas: ['ui']
      };

      const result = engine.evaluate(gpt, gemini);

      expect(result.confidence).toBeCloseTo(1.0);
      expect(result.confidenceLevel).toBe('high');
      expect(result.needsFollowUp).toBe(false);
      expect(result.finalValues.action).toBe('quick-fix');
    });

    it('should return lower confidence when models disagree on action', () => {
      const gpt = {
        mode: 'technical',
        severity: 'major',
        suggestedAction: 'quick-fix',
        estimatedLOC: 40
      };
      const gemini = {
        mode: 'technical',
        severity: 'major',
        suggestedAction: 'create-sd',
        estimatedLOC: 150
      };

      const result = engine.evaluate(gpt, gemini);

      expect(result.confidence).toBeLessThan(1.0);
      expect(result.needsFollowUp).toBe(true);
      expect(result.agreements.action.agrees).toBe(false);
    });

    it('should handle single model availability', () => {
      const gpt = {
        mode: 'product',
        severity: 'minor',
        suggestedAction: 'backlog',
        estimatedLOC: 20
      };

      const result = engine.evaluate(gpt, null);

      expect(result.singleModelOnly).toBe(true);
      expect(result.confidence).toBe(0.5);
      expect(result.needsFollowUp).toBe(true);
      expect(result.finalValues.action).toBe('backlog');
    });

    it('should handle both models failing', () => {
      const result = engine.evaluate(null, null);

      expect(result.failed).toBe(true);
      expect(result.confidence).toBe(0);
      expect(result.needsFollowUp).toBe(true);
    });

    it('should give partial credit for close severity', () => {
      const gpt = {
        mode: 'technical',
        severity: 'major',
        suggestedAction: 'quick-fix',
        estimatedLOC: 30
      };
      const gemini = {
        mode: 'technical',
        severity: 'minor', // Adjacent to major
        suggestedAction: 'quick-fix',
        estimatedLOC: 30
      };

      const result = engine.evaluate(gpt, gemini);

      // Should get partial credit for severity
      expect(result.agreements.severity.close).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('calculateAgreements()', () => {
    it('should correctly identify scope agreement within threshold', () => {
      const gpt = { estimatedLOC: 40, mode: 'technical', severity: 'minor', suggestedAction: 'quick-fix' };
      const gemini = { estimatedLOC: 50, mode: 'technical', severity: 'minor', suggestedAction: 'quick-fix' };

      const agreements = engine.calculateAgreements(gpt, gemini);

      expect(agreements.scope.agrees).toBe(true);
      expect(agreements.scope.variance).toBeLessThan(0.5);
    });

    it('should flag scope disagreement when variance is high', () => {
      const gpt = { estimatedLOC: 30, mode: 'technical', severity: 'minor', suggestedAction: 'quick-fix' };
      const gemini = { estimatedLOC: 200, mode: 'technical', severity: 'minor', suggestedAction: 'create-sd' };

      const agreements = engine.calculateAgreements(gpt, gemini);

      expect(agreements.scope.agrees).toBe(false);
    });
  });

  describe('evaluateBatch()', () => {
    it('should process multiple issues', () => {
      const issues = [
        {
          text: 'Issue 1',
          gptAnalysis: { mode: 'technical', severity: 'major', suggestedAction: 'quick-fix', estimatedLOC: 20 },
          geminiAnalysis: { mode: 'technical', severity: 'major', suggestedAction: 'quick-fix', estimatedLOC: 25 }
        },
        {
          text: 'Issue 2',
          gptAnalysis: { mode: 'product', severity: 'minor', suggestedAction: 'backlog', estimatedLOC: 10 },
          geminiAnalysis: null
        }
      ];

      const results = engine.evaluateBatch(issues);

      expect(results).toHaveLength(2);
      expect(results[0].consensus.confidenceLevel).toBe('high');
      expect(results[1].consensus.singleModelOnly).toBe(true);
    });
  });
});

// ============================================================================
// FOLLOW-UP GENERATOR TESTS
// ============================================================================
describe('FollowUpGenerator', () => {
  let generator;

  beforeEach(() => {
    generator = new FollowUpGenerator();
  });

  describe('generate()', () => {
    it('should return null when follow-up not needed', () => {
      const issue = {
        text: 'Minor styling issue',
        detectedMode: 'polish',
        consensus: {
          needsFollowUp: false,
          confidence: 0.9
        }
      };

      const result = generator.generate(issue);

      expect(result).toBeNull();
    });

    it('should generate question when action disagrees', () => {
      const issue = {
        id: 'issue-1',
        text: 'Button not working',
        detectedMode: 'technical',
        consensus: {
          needsFollowUp: true,
          confidence: 0.5,
          agreements: {
            action: { agrees: false, gpt: 'quick-fix', gemini: 'create-sd' },
            severity: { agrees: true },
            mode: { agrees: true },
            scope: { agrees: true }
          }
        }
      };

      const result = generator.generate(issue);

      expect(result).not.toBeNull();
      expect(result.questions.length).toBeGreaterThan(0);
      expect(result.questions[0].type).toBe('action_clarification');
    });

    it('should include mode-specific question when confidence is low', () => {
      const issue = {
        id: 'issue-2',
        text: 'UX feels confusing',
        detectedMode: 'product',
        consensus: {
          needsFollowUp: true,
          confidence: 0.4,
          confidenceLevel: 'low',
          agreements: {
            action: { agrees: true, gpt: 'backlog', gemini: 'backlog' },
            severity: { agrees: true },
            mode: { agrees: false, gpt: 'product', gemini: 'polish' },
            scope: { agrees: true }
          }
        }
      };

      const result = generator.generate(issue);

      expect(result).not.toBeNull();
      expect(result.mode).toBe('product');
    });

    it('should provide fallback generic question', () => {
      const issue = {
        id: 'issue-3',
        text: 'Something is wrong',
        detectedMode: 'technical',
        consensus: {
          needsFollowUp: true,
          confidence: 0.3,
          confidenceLevel: 'very_low'
        }
      };

      const result = generator.generate(issue);

      expect(result).not.toBeNull();
      expect(result.questions.some(q => q.type === 'generic')).toBe(true);
    });
  });

  describe('processAnswer()', () => {
    it('should update issue with user clarification', () => {
      const issue = {
        id: 'issue-1',
        text: 'Test issue',
        consensus: { confidence: 0.5 }
      };
      const answer = {
        type: 'action_clarification',
        value: 'quick-fix'
      };

      const updated = generator.processAnswer(issue, answer);

      expect(updated.finalAction).toBe('quick-fix');
      expect(updated.actionSource).toBe('user_clarification');
      expect(updated.consensus.confidence).toBeGreaterThan(0.5);
      expect(updated.followUpAnswered).toBe(true);
    });
  });
});

// ============================================================================
// ACTION ROUTER TESTS
// ============================================================================
describe('ActionRouter', () => {
  let router;

  beforeEach(() => {
    router = new ActionRouter();
  });

  describe('route()', () => {
    it('should use user clarification when provided', () => {
      const issue = {
        text: 'Test issue',
        finalAction: 'backlog',
        actionSource: 'user_clarification'
      };

      const decision = router.route(issue);

      expect(decision.action).toBe('backlog');
      expect(decision.source).toBe('user');
      expect(decision.confidence).toBe(1.0);
    });

    it('should route small issues to quick-fix', () => {
      const issue = {
        text: 'Small bug',
        consensus: {
          confidence: 0.9,
          finalValues: {
            action: 'quick-fix',
            severity: 'minor',
            estimatedLOC: 20,
            riskAreas: []
          }
        }
      };

      const decision = router.route(issue);

      expect(decision.action).toBe('quick-fix');
      expect(decision.reasoning.toLowerCase()).toContain('small scope');
    });

    it('should upgrade to SD for high-risk areas', () => {
      const issue = {
        text: 'Auth issue',
        consensus: {
          confidence: 0.8,
          finalValues: {
            action: 'quick-fix',
            severity: 'major',
            estimatedLOC: 30,
            riskAreas: ['auth']
          }
        }
      };

      const decision = router.route(issue);

      expect(decision.action).toBe('create-sd');
      expect(decision.source).toBe('risk_upgrade');
      expect(decision.reasoning).toContain('High-risk area');
    });

    it('should upgrade to SD when LOC exceeds threshold', () => {
      const issue = {
        text: 'Large refactor',
        consensus: {
          confidence: 0.85,
          finalValues: {
            action: 'quick-fix',
            severity: 'major',
            estimatedLOC: 100,
            riskAreas: []
          }
        }
      };

      const decision = router.route(issue);

      expect(decision.action).toBe('create-sd');
      expect(decision.reasoning).toContain('exceeds quick-fix threshold');
    });

    it('should fallback to backlog when no consensus', () => {
      const issue = {
        text: 'Unclear issue'
      };

      const decision = router.route(issue);

      expect(decision.action).toBe('backlog');
      expect(decision.source).toBe('fallback');
    });
  });

  describe('routeBatch()', () => {
    it('should route multiple issues', () => {
      const issues = [
        {
          text: 'Issue 1',
          consensus: {
            finalValues: { action: 'quick-fix', severity: 'minor', estimatedLOC: 10, riskAreas: [] }
          }
        },
        {
          text: 'Issue 2',
          consensus: {
            finalValues: { action: 'backlog', severity: 'enhancement', estimatedLOC: 50, riskAreas: [] }
          }
        }
      ];

      const decisions = router.routeBatch(issues);

      expect(decisions).toHaveLength(2);
      expect(decisions[0].action).toBe('quick-fix');
      expect(decisions[1].action).toBe('backlog');
    });
  });

  describe('override()', () => {
    it('should allow user to override routing', () => {
      const originalDecision = {
        action: 'quick-fix',
        reasoning: 'Small scope'
      };

      const overridden = router.override(originalDecision, 'create-sd', 'Actually this is complex');

      expect(overridden.action).toBe('create-sd');
      expect(overridden.originalAction).toBe('quick-fix');
      expect(overridden.source).toBe('user_override');
      expect(overridden.reasoning).toContain('[OVERRIDE]');
    });
  });
});

// ============================================================================
// FEEDBACK MODES TESTS
// ============================================================================
describe('Feedback Mode Detection', () => {
  it('should have all expected modes defined', () => {
    expect(FEEDBACK_MODES.STRATEGIC).toBe('strategic');
    expect(FEEDBACK_MODES.PRODUCT).toBe('product');
    expect(FEEDBACK_MODES.TECHNICAL).toBe('technical');
    expect(FEEDBACK_MODES.POLISH).toBe('polish');
  });

  it('should have keywords for each mode', () => {
    expect(MODE_KEYWORDS[FEEDBACK_MODES.STRATEGIC]).toBeDefined();
    expect(MODE_KEYWORDS[FEEDBACK_MODES.PRODUCT]).toBeDefined();
    expect(MODE_KEYWORDS[FEEDBACK_MODES.TECHNICAL]).toBeDefined();
    expect(MODE_KEYWORDS[FEEDBACK_MODES.POLISH]).toBeDefined();
  });

  it('should have technical keywords include error-related terms', () => {
    const technicalKeywords = MODE_KEYWORDS[FEEDBACK_MODES.TECHNICAL];
    expect(technicalKeywords).toContain('error');
    expect(technicalKeywords).toContain('bug');
    expect(technicalKeywords).toContain('crash');
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================
describe('Integration: Consensus + FollowUp + Router', () => {
  it('should flow from consensus to routing without follow-up when confident', () => {
    const engine = new ConsensusEngine();
    const generator = new FollowUpGenerator();
    const router = new ActionRouter();

    // High agreement analysis
    const gpt = { mode: 'technical', severity: 'minor', suggestedAction: 'quick-fix', estimatedLOC: 25 };
    const gemini = { mode: 'technical', severity: 'minor', suggestedAction: 'quick-fix', estimatedLOC: 30 };

    // Step 1: Consensus
    const consensus = engine.evaluate(gpt, gemini);
    expect(consensus.needsFollowUp).toBe(false);

    // Step 2: No follow-up needed
    const issue = { text: 'Test', detectedMode: 'technical', consensus };
    const followUp = generator.generate(issue);
    expect(followUp).toBeNull();

    // Step 3: Route directly
    const decision = router.route(issue);
    expect(decision.action).toBe('quick-fix');
  });

  it('should require follow-up when models disagree', () => {
    const engine = new ConsensusEngine();
    const generator = new FollowUpGenerator();

    // Disagreement on action
    const gpt = { mode: 'technical', severity: 'major', suggestedAction: 'quick-fix', estimatedLOC: 40 };
    const gemini = { mode: 'technical', severity: 'critical', suggestedAction: 'create-sd', estimatedLOC: 150 };

    const consensus = engine.evaluate(gpt, gemini);
    expect(consensus.needsFollowUp).toBe(true);

    const issue = { id: 'test', text: 'Disagreement test', detectedMode: 'technical', consensus };
    const followUp = generator.generate(issue);
    expect(followUp).not.toBeNull();
    expect(followUp.questions.length).toBeGreaterThan(0);
  });
});
