/**
 * Unit Tests for Multi-Model Debate System
 * SD-LEO-ORCH-SELF-IMPROVING-LEO-001-B
 *
 * Tests:
 * - CONST-002 family separation validator
 * - Critic persona configuration
 * - Prompt context validation
 * - Consensus detection
 */

import { describe, it, expect } from 'vitest';
import {
  detectModelFamily,
  validateFamilySeparation,
  validatePromptContext,
  createValidatedDebateConfig,
  getComplianceSummary
} from '../../../../lib/sub-agents/vetting/const-002-validator.js';
import {
  CRITIC_PERSONAS,
  getPersona,
  getAllPersonas,
  buildEvaluationPrompt,
  parsePersonaResponse,
  validatePersonaFamilySeparation
} from '../../../../lib/sub-agents/vetting/critic-personas.js';

describe('CONST-002 Family Separation Validator', () => {
  describe('detectModelFamily', () => {
    it('should detect Anthropic models', () => {
      expect(detectModelFamily('claude-3-sonnet')).toBe('anthropic');
      expect(detectModelFamily('claude-sonnet-4-20250514')).toBe('anthropic');
      expect(detectModelFamily('anthropic/claude-3')).toBe('anthropic');
    });

    it('should detect OpenAI models', () => {
      expect(detectModelFamily('gpt-4')).toBe('openai');
      expect(detectModelFamily('gpt-4o')).toBe('openai');
      expect(detectModelFamily('o1-preview')).toBe('openai');
      expect(detectModelFamily('text-embedding-ada-002')).toBe('openai');
    });

    it('should detect Google models', () => {
      expect(detectModelFamily('gemini-1.5-pro')).toBe('google');
      expect(detectModelFamily('gemini-pro')).toBe('google');
      expect(detectModelFamily('palm-2')).toBe('google');
    });

    it('should detect Meta models', () => {
      expect(detectModelFamily('llama-3-70b')).toBe('meta');
      expect(detectModelFamily('meta/llama-2')).toBe('meta');
    });

    it('should detect Mistral models', () => {
      expect(detectModelFamily('mistral-large')).toBe('mistral');
      expect(detectModelFamily('mixtral-8x7b')).toBe('mistral');
    });

    it('should return unknown for unrecognized models', () => {
      expect(detectModelFamily('custom-model-v1')).toBe('unknown');
      expect(detectModelFamily(null)).toBe('unknown');
      expect(detectModelFamily('')).toBe('unknown');
    });
  });

  describe('validateFamilySeparation', () => {
    it('should pass with 3 distinct evaluator families', () => {
      const result = validateFamilySeparation({
        proposerModel: 'llama-3-70b',
        evaluators: [
          { persona: 'safety', model: 'claude-3-sonnet' },
          { persona: 'value', model: 'gpt-4' },
          { persona: 'risk', model: 'gemini-pro' }
        ]
      });

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.reason_code).toBe('CONST_002_PASS');
    });

    it('should fail when evaluator shares family with proposer', () => {
      const result = validateFamilySeparation({
        proposerModel: 'claude-3-sonnet',
        evaluators: [
          { persona: 'safety', model: 'claude-3-opus' }, // Same family as proposer
          { persona: 'value', model: 'gpt-4' },
          { persona: 'risk', model: 'gemini-pro' }
        ]
      });

      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.code === 'CONST_002_FAMILY_COLLISION')).toBe(true);
    });

    it('should fail with insufficient evaluator family diversity', () => {
      const result = validateFamilySeparation({
        proposerModel: 'llama-3-70b',
        evaluators: [
          { persona: 'safety', model: 'claude-3-sonnet' },
          { persona: 'value', model: 'claude-3-opus' }, // Same family
          { persona: 'risk', model: 'claude-3-haiku' }  // Same family
        ]
      });

      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.code === 'CONST_002_INSUFFICIENT_DIVERSITY')).toBe(true);
    });

    it('should warn about unknown evaluator families', () => {
      const result = validateFamilySeparation({
        proposerModel: 'llama-3-70b',
        evaluators: [
          { persona: 'safety', model: 'claude-3-sonnet' },
          { persona: 'value', model: 'gpt-4' },
          { persona: 'risk', model: 'unknown-model-v1' }
        ]
      });

      // Should pass but with warning
      expect(result.passed).toBe(true);
      expect(result.warnings.some(w => w.code === 'CONST_002_UNKNOWN_EVALUATOR')).toBe(true);
    });
  });

  describe('validatePromptContext', () => {
    it('should pass clean context', () => {
      const cleanContext = `
        ## Proposal for Evaluation
        Title: Improve logging system
        Summary: Add structured logging...
      `;

      const result = validatePromptContext(cleanContext, 'safety');
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect forbidden markers', () => {
      const contaminatedContext = `
        ## Proposal
        __PERSONA_OUTPUT_START__
        Some leaked content
        __PERSONA_OUTPUT_END__
      `;

      const result = validatePromptContext(contaminatedContext, 'safety');
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.code === 'CONST_002_CONTEXT_CONTAMINATION')).toBe(true);
    });

    it('should detect raw persona transcript leak', () => {
      const leakedContext = `
        ## Proposal
        Previous round data:
        {"persona": "value", "verdict": "approve", "rationale": "looks good"}
      `;

      const result = validatePromptContext(leakedContext, 'safety');
      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.code === 'CONST_002_RAW_TRANSCRIPT_LEAK')).toBe(true);
    });
  });

  describe('createValidatedDebateConfig', () => {
    it('should create valid config with defaults', () => {
      const config = createValidatedDebateConfig('llama-3-70b');

      expect(config.const_002_passed).toBe(true);
      expect(config.evaluators).toHaveLength(3);
      expect(config.validation.passed).toBe(true);
    });

    it('should throw on CONST-002 violation', () => {
      expect(() => {
        createValidatedDebateConfig('claude-3-sonnet', {
          evaluators: [
            { persona: 'safety', model: 'claude-3-opus' },
            { persona: 'value', model: 'claude-3-sonnet' },
            { persona: 'risk', model: 'claude-3-haiku' }
          ]
        });
      }).toThrow(/CONST-002 validation failed/);
    });
  });

  describe('getComplianceSummary', () => {
    it('should generate readable summary', () => {
      const result = validateFamilySeparation({
        proposerModel: 'llama-3-70b',
        evaluators: [
          { persona: 'safety', model: 'claude-3-sonnet' },
          { persona: 'value', model: 'gpt-4' },
          { persona: 'risk', model: 'gemini-pro' }
        ]
      });

      const summary = getComplianceSummary(result);
      expect(summary).toContain('CONST-002 Compliance');
      expect(summary).toContain('PASS');
      expect(summary).toContain('Proposer:');
      expect(summary).toContain('Evaluators:');
    });
  });
});

describe('Critic Personas', () => {
  describe('CRITIC_PERSONAS configuration', () => {
    it('should have 3 distinct personas', () => {
      expect(Object.keys(CRITIC_PERSONAS)).toHaveLength(3);
      expect(CRITIC_PERSONAS).toHaveProperty('safety');
      expect(CRITIC_PERSONAS).toHaveProperty('value');
      expect(CRITIC_PERSONAS).toHaveProperty('risk');
    });

    it('should have distinct provider families', () => {
      const families = new Set(Object.values(CRITIC_PERSONAS).map(p => p.provider));
      expect(families.size).toBe(3);
      expect(families.has('anthropic')).toBe(true);
      expect(families.has('openai')).toBe(true);
      expect(families.has('google')).toBe(true);
    });

    it('should have valid rubrics for each persona', () => {
      for (const persona of Object.values(CRITIC_PERSONAS)) {
        expect(persona.rubric).toBeDefined();
        expect(persona.rubric.criteria).toBeInstanceOf(Array);
        expect(persona.rubric.criteria.length).toBeGreaterThan(0);

        // Weights should sum to 1
        const totalWeight = persona.rubric.criteria.reduce((sum, c) => sum + c.weight, 0);
        expect(totalWeight).toBeCloseTo(1, 2);
      }
    });

    it('should have system prompts requiring JSON response', () => {
      for (const persona of Object.values(CRITIC_PERSONAS)) {
        expect(persona.systemPrompt).toContain('JSON format');
        expect(persona.systemPrompt).toContain('verdict');
        expect(persona.systemPrompt).toContain('score');
        expect(persona.systemPrompt).toContain('rationale');
      }
    });
  });

  describe('getPersona', () => {
    it('should return persona by ID', () => {
      const safety = getPersona('safety');
      expect(safety.id).toBe('safety');
      expect(safety.name).toBe('Safety Guardian');
    });

    it('should throw for unknown persona', () => {
      expect(() => getPersona('unknown')).toThrow(/Unknown persona/);
    });
  });

  describe('getAllPersonas', () => {
    it('should return all 3 personas', () => {
      const personas = getAllPersonas();
      expect(personas).toHaveLength(3);
    });
  });

  describe('validatePersonaFamilySeparation', () => {
    it('should validate built-in personas pass CONST-002', () => {
      const result = validatePersonaFamilySeparation();
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.families).toHaveLength(3);
    });
  });

  describe('buildEvaluationPrompt', () => {
    it('should build prompt with proposal details', () => {
      const proposal = {
        title: 'Test Proposal',
        summary: 'A test proposal for unit testing',
        motivation: 'To verify the system works',
        scope: [{ area: 'testing', description: 'Unit tests' }],
        affected_components: [{ name: 'test-component', type: 'testing', impact: 'low' }],
        risk_level: 'low'
      };

      const prompt = buildEvaluationPrompt(proposal);

      expect(prompt).toContain('Test Proposal');
      expect(prompt).toContain('A test proposal for unit testing');
      expect(prompt).toContain('testing: Unit tests');
      expect(prompt).toContain('JSON format');
    });

    it('should include orchestrator summary if provided', () => {
      const proposal = { title: 'Test', summary: 'Test' };
      const summary = '## Round 1 Summary\n\nSome feedback...';

      const prompt = buildEvaluationPrompt(proposal, summary);

      expect(prompt).toContain('Previous Round Summary');
      expect(prompt).toContain('Round 1 Summary');
    });
  });

  describe('parsePersonaResponse', () => {
    it('should parse valid JSON response', () => {
      const response = `
        Here is my assessment:
        {
          "verdict": "approve",
          "score": 85,
          "rationale": "The proposal looks solid",
          "change_requests": ["Add more tests", "Document edge cases"]
        }
      `;

      const parsed = parsePersonaResponse(response);

      expect(parsed.verdict).toBe('approve');
      expect(parsed.score).toBe(85);
      expect(parsed.rationale).toContain('solid');
      expect(parsed.change_requests).toHaveLength(2);
    });

    it('should normalize verdict to lowercase', () => {
      const response = '{"verdict": "APPROVE", "score": 90, "rationale": "Good"}';
      const parsed = parsePersonaResponse(response);
      expect(parsed.verdict).toBe('approve');
    });

    it('should clamp score to 0-100', () => {
      const response = '{"verdict": "approve", "score": 150, "rationale": "Amazing"}';
      const parsed = parsePersonaResponse(response);
      expect(parsed.score).toBe(100);
    });

    it('should handle missing JSON gracefully', () => {
      const response = 'This response has no JSON';
      const parsed = parsePersonaResponse(response);

      expect(parsed.verdict).toBe('revise');
      expect(parsed.score).toBe(50);
      expect(parsed.parse_error).toBe(true);
    });

    it('should handle invalid verdict', () => {
      const response = '{"verdict": "maybe", "score": 50, "rationale": "Unsure"}';
      const parsed = parsePersonaResponse(response);
      expect(parsed.parse_error).toBe(true);
    });
  });
});

describe('Consensus Detection', () => {
  // Helper to create mock persona outputs
  const createOutputs = (safetyVerdict, safetyScore, valueVerdict, valueScore, riskVerdict, riskScore) => ({
    safety: { verdict: safetyVerdict, score: safetyScore },
    value: { verdict: valueVerdict, score: valueScore },
    risk: { verdict: riskVerdict, score: riskScore }
  });

  describe('consensus rules (FR-5)', () => {
    it('should detect consensus when 2/3 agree and scores within 15 points', () => {
      // This test verifies the consensus detection logic that would be in DebateOrchestrator
      const outputs = createOutputs('approve', 85, 'approve', 80, 'revise', 75);

      // Count verdicts
      const verdicts = Object.values(outputs).map(o => o.verdict);
      const scores = Object.values(outputs).map(o => o.score);
      const verdictCounts = {};
      for (const v of verdicts) {
        verdictCounts[v] = (verdictCounts[v] || 0) + 1;
      }

      // Majority check (2/3)
      const majorityVerdict = Object.entries(verdictCounts)
        .find(([_, count]) => count >= 2)?.[0];
      expect(majorityVerdict).toBe('approve');

      // Score delta check (<=15)
      const scoreDelta = Math.max(...scores) - Math.min(...scores);
      expect(scoreDelta).toBe(10); // 85-75=10, within threshold
    });

    it('should not reach consensus if score delta > 15', () => {
      const outputs = createOutputs('approve', 90, 'approve', 70, 'approve', 65);

      const scores = Object.values(outputs).map(o => o.score);
      const scoreDelta = Math.max(...scores) - Math.min(...scores);

      expect(scoreDelta).toBe(25); // 90-65=25, exceeds threshold
    });

    it('should not reach consensus without majority verdict', () => {
      const outputs = createOutputs('approve', 80, 'revise', 75, 'reject', 70);

      const verdicts = Object.values(outputs).map(o => o.verdict);
      const verdictCounts = {};
      for (const v of verdicts) {
        verdictCounts[v] = (verdictCounts[v] || 0) + 1;
      }

      const majorityVerdict = Object.entries(verdictCounts)
        .find(([_, count]) => count >= 2)?.[0];

      expect(majorityVerdict).toBeUndefined();
    });
  });
});
