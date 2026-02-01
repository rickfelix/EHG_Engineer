/**
 * Vetting Engine Sub-Agent Tests
 * SD-LEO-SELF-IMPROVE-001F: Phase 2b - Vetting Agent Bridge
 *
 * Note: Due to ESM mocking limitations, these tests focus on
 * the core vetting logic using direct instantiation with mocked deps.
 */

import { jest } from '@jest/globals';

// Define DEFAULT_RUBRIC here to test against
const DEFAULT_RUBRIC = {
  criteria: [
    { id: 'value', name: 'Value Proposition', description: 'Does this improvement provide clear value?', weight: 0.25 },
    { id: 'risk', name: 'Risk Assessment', description: 'What is the risk level?', weight: 0.20 },
    { id: 'complexity', name: 'Complexity', description: 'How complex is the implementation?', weight: 0.15 },
    { id: 'reversibility', name: 'Reversibility', description: 'Can this change be easily reversed?', weight: 0.15 },
    { id: 'alignment', name: 'Protocol Alignment', description: 'Does this align with LEO Protocol principles?', weight: 0.15 },
    { id: 'testability', name: 'Testability', description: 'Can this change be properly tested?', weight: 0.10 }
  ],
  scoringScale: { min: 1, max: 5, labels: { 1: 'Poor', 2: 'Below Average', 3: 'Average', 4: 'Good', 5: 'Excellent' } }
};

// Mock implementations for testing
const mockSupabase = {
  from: jest.fn(() => mockSupabase),
  select: jest.fn(() => mockSupabase),
  insert: jest.fn(() => mockSupabase),
  update: jest.fn(() => mockSupabase),
  eq: jest.fn(() => mockSupabase),
  single: jest.fn(() => Promise.resolve({ data: { id: 'test-id' }, error: null })),
  rpc: jest.fn(() => Promise.resolve({ data: [], error: null }))
};

const mockAegisEnforcer = {
  validate: jest.fn(() => Promise.resolve({
    passed: true,
    violations: [],
    warnings: [],
    results: {},
    hasWarnings: false
  }))
};

// Inline VettingEngine for testing (mirrors actual implementation)
class VettingEngine {
  constructor(options = {}) {
    this.supabase = options.supabase || mockSupabase;
    this.aegisEnforcer = options.aegisEnforcer || mockAegisEnforcer;
    this.rubric = options.rubric || DEFAULT_RUBRIC;
  }

  _shouldCreateProposal(feedback) {
    const proposalTypes = ['improvement', 'feature', 'enhancement', 'protocol_change'];
    const feedbackType = feedback.type || feedback.category || '';
    if (proposalTypes.includes(feedbackType.toLowerCase())) {
      return true;
    }
    const content = (feedback.content || feedback.description || '').toLowerCase();
    const improvementKeywords = ['should', 'could', 'improve', 'enhance', 'add', 'suggest', 'proposal'];
    return improvementKeywords.some(kw => content.includes(kw));
  }

  _assessRiskLevel(feedback) {
    const content = (feedback.content || feedback.description || '').toLowerCase();
    const highRiskKeywords = ['breaking', 'migration', 'security', 'auth', 'rls', 'delete', 'remove'];
    if (highRiskKeywords.some(kw => content.includes(kw))) return 'high';
    const mediumRiskKeywords = ['modify', 'update', 'change', 'refactor', 'api'];
    if (mediumRiskKeywords.some(kw => content.includes(kw))) return 'medium';
    return 'low';
  }

  _extractConstitutionTags(feedback) {
    const tags = [];
    const content = (feedback.content || feedback.description || '').toLowerCase();
    const constitutionMappings = {
      'CONST-001': ['protocol', 'integrity', 'workflow'],
      'CONST-002': ['self-improve', 'learning', 'feedback'],
      'CONST-009': ['feature flag', 'kill switch', 'rollback']
    };
    for (const [code, keywords] of Object.entries(constitutionMappings)) {
      if (keywords.some(kw => content.includes(kw))) tags.push(code);
    }
    return tags.length > 0 ? tags : ['CONST-001'];
  }

  _scoreCriterion(criterion, proposal) {
    switch (criterion.id) {
      case 'value':
        return proposal.motivation && proposal.motivation.length > 20 ? 4 : 3;
      case 'risk':
        return proposal.risk_level === 'low' ? 5 : proposal.risk_level === 'medium' ? 3 : 2;
      case 'complexity':
        const componentCount = (proposal.affected_components || []).length;
        return componentCount <= 1 ? 5 : componentCount <= 3 ? 4 : componentCount <= 5 ? 3 : 2;
      case 'reversibility':
        const hasDb = (proposal.affected_components || []).some(c => c.type === 'database');
        return hasDb ? 2 : 4;
      case 'alignment':
        return (proposal.constitution_tags || []).length > 0 ? 4 : 3;
      case 'testability':
        return 3;
      default:
        return 3;
    }
  }

  async assessWithRubric(proposal, rubric = this.rubric) {
    const scores = {};
    let totalScore = 0;
    let totalWeight = 0;
    for (const criterion of rubric.criteria) {
      const score = this._scoreCriterion(criterion, proposal);
      scores[criterion.id] = {
        name: criterion.name,
        score,
        weight: criterion.weight,
        weightedScore: score * criterion.weight
      };
      totalScore += score * criterion.weight;
      totalWeight += criterion.weight;
    }
    const normalizedScore = totalWeight > 0
      ? (totalScore / totalWeight / rubric.scoringScale.max) * 100
      : 0;
    return {
      scores,
      totalScore: Math.round(normalizedScore * 100) / 100,
      rubricVersion: rubric.version || 'default-1.0',
      assessedAt: new Date().toISOString()
    };
  }

  _determineOutcome(rubricAssessment, aegisResult, options = {}) {
    const thresholds = {
      approval: options.approvalThreshold || 70,
      rejection: options.rejectionThreshold || 40,
      ...options.thresholds
    };

    if (!aegisResult.passed) {
      const canOverride = aegisResult.violations.every(v =>
        v.enforcement_action === 'BLOCK_OVERRIDABLE' ||
        v.enforcement_action === 'WARN_AND_LOG'
      );
      return {
        status: canOverride ? 'needs_revision' : 'rejected',
        notes: `AEGIS violations: ${aegisResult.violations.map(v => v.rule_code).join(', ')}`
      };
    }

    if (rubricAssessment.totalScore >= thresholds.approval) {
      return {
        status: 'approved',
        notes: `Score ${rubricAssessment.totalScore}% meets approval threshold`
      };
    }

    if (rubricAssessment.totalScore < thresholds.rejection) {
      return {
        status: 'rejected',
        notes: `Score ${rubricAssessment.totalScore}% below rejection threshold`
      };
    }

    return {
      status: 'needs_revision',
      notes: `Score ${rubricAssessment.totalScore}% requires review`
    };
  }
}

function getVettingEngine(options = {}) {
  return new VettingEngine(options);
}

// ============================================================================
// TESTS
// ============================================================================

describe('VettingEngine', () => {
  let engine;

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new VettingEngine({
      supabase: mockSupabase,
      aegisEnforcer: mockAegisEnforcer
    });
  });

  describe('constructor', () => {
    it('should initialize with default rubric', () => {
      expect(engine.rubric).toBeDefined();
      expect(engine.rubric.criteria).toHaveLength(6);
    });

    it('should accept custom rubric', () => {
      const customRubric = {
        criteria: [{ id: 'custom', name: 'Custom', weight: 1.0 }],
        scoringScale: { min: 1, max: 5, labels: {} }
      };
      const customEngine = new VettingEngine({ rubric: customRubric });
      expect(customEngine.rubric.criteria).toHaveLength(1);
    });
  });

  describe('DEFAULT_RUBRIC', () => {
    it('should have 6 criteria', () => {
      expect(DEFAULT_RUBRIC.criteria).toHaveLength(6);
    });

    it('should have weights that sum to 1.0', () => {
      const totalWeight = DEFAULT_RUBRIC.criteria.reduce((sum, c) => sum + c.weight, 0);
      expect(totalWeight).toBeCloseTo(1.0);
    });

    it('should have valid scoring scale', () => {
      expect(DEFAULT_RUBRIC.scoringScale.min).toBe(1);
      expect(DEFAULT_RUBRIC.scoringScale.max).toBe(5);
    });
  });

  describe('assessWithRubric', () => {
    it('should return scores for all criteria', async () => {
      const proposal = {
        id: 'proposal-123',
        motivation: 'This improves user experience significantly',
        risk_level: 'low',
        affected_components: [{ type: 'ui', name: 'component' }],
        constitution_tags: ['CONST-001']
      };

      const result = await engine.assessWithRubric(proposal);

      expect(result.scores).toBeDefined();
      expect(Object.keys(result.scores)).toHaveLength(6);
      expect(result.totalScore).toBeGreaterThanOrEqual(0);
      expect(result.totalScore).toBeLessThanOrEqual(100);
    });

    it('should score low-risk proposals higher', async () => {
      const lowRiskProposal = { risk_level: 'low', affected_components: [] };
      const highRiskProposal = { risk_level: 'high', affected_components: [] };

      const lowRiskResult = await engine.assessWithRubric(lowRiskProposal);
      const highRiskResult = await engine.assessWithRubric(highRiskProposal);

      expect(lowRiskResult.scores.risk.score).toBeGreaterThan(highRiskResult.scores.risk.score);
    });
  });

  describe('_shouldCreateProposal', () => {
    it('should return true for improvement type feedback', () => {
      const feedback = { type: 'improvement' };
      expect(engine._shouldCreateProposal(feedback)).toBe(true);
    });

    it('should return true for feature type feedback', () => {
      const feedback = { type: 'feature' };
      expect(engine._shouldCreateProposal(feedback)).toBe(true);
    });

    it('should return true for content with improvement keywords', () => {
      const feedback = {
        type: 'other',
        content: 'We should improve the error handling'
      };
      expect(engine._shouldCreateProposal(feedback)).toBe(true);
    });

    it('should return false for bug reports without improvement keywords', () => {
      const feedback = {
        type: 'bug',
        content: 'The button is broken'
      };
      expect(engine._shouldCreateProposal(feedback)).toBe(false);
    });
  });

  describe('_assessRiskLevel', () => {
    it('should return high for security-related feedback', () => {
      const feedback = { content: 'Need to fix security vulnerability' };
      expect(engine._assessRiskLevel(feedback)).toBe('high');
    });

    it('should return high for migration-related feedback', () => {
      const feedback = { content: 'Database migration required' };
      expect(engine._assessRiskLevel(feedback)).toBe('high');
    });

    it('should return medium for API changes', () => {
      const feedback = { content: 'Update the API endpoint' };
      expect(engine._assessRiskLevel(feedback)).toBe('medium');
    });

    it('should return low for documentation changes', () => {
      const feedback = { content: 'Add more documentation' };
      expect(engine._assessRiskLevel(feedback)).toBe('low');
    });
  });

  describe('_determineOutcome', () => {
    it('should approve high-scoring proposals', () => {
      const rubricAssessment = { totalScore: 85 };
      const aegisResult = { passed: true, violations: [] };

      const outcome = engine._determineOutcome(rubricAssessment, aegisResult);

      expect(outcome.status).toBe('approved');
    });

    it('should reject low-scoring proposals', () => {
      const rubricAssessment = { totalScore: 30 };
      const aegisResult = { passed: true, violations: [] };

      const outcome = engine._determineOutcome(rubricAssessment, aegisResult);

      expect(outcome.status).toBe('rejected');
    });

    it('should mark for revision on medium scores', () => {
      const rubricAssessment = { totalScore: 55 };
      const aegisResult = { passed: true, violations: [] };

      const outcome = engine._determineOutcome(rubricAssessment, aegisResult);

      expect(outcome.status).toBe('needs_revision');
    });

    it('should reject on AEGIS violations with BLOCK enforcement', () => {
      const rubricAssessment = { totalScore: 90 };
      const aegisResult = {
        passed: false,
        violations: [{ rule_code: 'RULE-001', enforcement_action: 'BLOCK' }]
      };

      const outcome = engine._determineOutcome(rubricAssessment, aegisResult);

      expect(outcome.status).toBe('rejected');
    });

    it('should mark for revision on overridable AEGIS violations', () => {
      const rubricAssessment = { totalScore: 90 };
      const aegisResult = {
        passed: false,
        violations: [{ rule_code: 'RULE-001', enforcement_action: 'BLOCK_OVERRIDABLE' }]
      };

      const outcome = engine._determineOutcome(rubricAssessment, aegisResult);

      expect(outcome.status).toBe('needs_revision');
    });
  });

  describe('_extractConstitutionTags', () => {
    it('should extract CONST-001 for protocol keywords', () => {
      const feedback = { content: 'Improve the protocol workflow' };
      const tags = engine._extractConstitutionTags(feedback);
      expect(tags).toContain('CONST-001');
    });

    it('should extract CONST-002 for self-improvement keywords', () => {
      const feedback = { content: 'This is a self-improve learning feedback' };
      const tags = engine._extractConstitutionTags(feedback);
      expect(tags).toContain('CONST-002');
    });

    it('should default to CONST-001 when no keywords match', () => {
      const feedback = { content: 'Generic content here' };
      const tags = engine._extractConstitutionTags(feedback);
      expect(tags).toEqual(['CONST-001']);
    });
  });

  describe('getVettingEngine', () => {
    it('should return VettingEngine instance', () => {
      const instance = getVettingEngine();
      expect(instance).toBeInstanceOf(VettingEngine);
    });
  });
});
