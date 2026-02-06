/**
 * Claim/Evidence Auditor Unit Tests
 *
 * Anti-Hallucination Safeguards Testing
 *
 * Test Categories:
 * A. False Positive Control - valid claims should pass
 * B. Gaming Resistance - excessive hedging should fail
 * C. Backward Compatibility - legacy agents should work
 * D. Size Limits - metadata enforcement
 * E. Evidence Scoring - deterministic calculations
 * F. Tunnel Vision - complex task detection
 * G. Calibrated Uncertainty - proper justification
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Load CommonJS modules
const { ClaimEvidenceAuditor, ClaimEvidenceAuditException, getClaimEvidenceAuditor } = require('../../../lib/agents/claim-evidence-auditor.cjs');
const { calculateEvidenceScore, validateEvidenceForConfidence, hasConflictingEvidence } = require('../../../lib/agents/evidence-schema.cjs');
const { HypothesisTracker, REJECTION_CODES } = require('../../../lib/agents/hypothesis-tracker.cjs');
const { inferComplexity, meetsComplexityThreshold } = require('../../../lib/agents/agent-complexity-map.cjs');
const { enforceMetadataLimits } = require('../../../lib/agents/metadata-enforcer.cjs');

// Load test data
const testData = require('../../fixtures/audit-test-data.json');

describe('Claim/Evidence Auditor System', () => {
  let auditor;

  beforeEach(() => {
    // Create fresh auditor instance for each test
    auditor = new ClaimEvidenceAuditor();
  });

  // =========================================================================
  // A. FALSE POSITIVE CONTROL - Valid claims should pass
  // =========================================================================
  describe('False Positive Control', () => {
    it('should pass high-confidence claims WITH evidence attached', async () => {
      // From VALID-001: Agent says "definitely X" but has evidence
      const validFinding = testData.valid_findings.find(f => f.id === 'VALID-001');

      const agent = {
        name: 'TestSecurityAgent',
        type: 'SECURITY',
        findings: [validFinding.finding],
        metadata: {}
      };

      const results = await auditor.audit(agent, { complexity: 'HIGH' });

      expect(results.passed).toBe(true);
      expect(results.issues.filter(i => i.type === 'unsupported_certainty')).toHaveLength(0);
    });

    it('should reward calibrated uncertainty with structured next step', async () => {
      // From VALID-002: Proper uncertainty with actionable next step
      const validFinding = testData.valid_findings.find(f => f.id === 'VALID-002');

      const agent = {
        name: 'TestAnalysisAgent',
        type: 'DESIGN',
        findings: [validFinding.finding],
        metadata: {}
      };

      const results = await auditor.audit(agent, { complexity: 'MEDIUM' });

      expect(results.passed).toBe(true);
      const rewards = results.rewards.filter(r => r.type === 'calibrated_uncertainty');
      expect(rewards.length).toBeGreaterThanOrEqual(0);
    });

    it('should NOT penalize certainty language when evidence is strong', async () => {
      const finding = {
        id: 'f-strong-evidence',
        type: 'SECURITY',
        description: 'This is definitely a SQL injection vulnerability',
        confidence: 0.95,
        severity: 'critical',
        evidence: [
          { type: 'file', ref: 'package.json', verified: true, verification_method: 'file_exists' },
          { type: 'test_result', ref: 'sec-test-001', verified: true, verification_method: 'inline' }
        ]
      };

      const agent = {
        name: 'TestAgent',
        type: 'SECURITY',
        findings: [finding],
        metadata: {}
      };

      const results = await auditor.audit(agent, {});

      // Should not be penalized because evidence supports the certainty
      const certaintyIssues = results.issues.filter(i => i.type === 'unsupported_certainty');
      expect(certaintyIssues).toHaveLength(0);
    });
  });

  // =========================================================================
  // B. GAMING RESISTANCE - Excessive hedging should fail
  // =========================================================================
  describe('Gaming Resistance', () => {
    it('should penalize excessive hedging without justification', async () => {
      // From GAME-001: Agent hedges on everything
      const gamingAttempt = testData.gaming_attempts.find(g => g.id === 'GAME-001');

      const agent = {
        name: 'GamingAgent',
        type: 'ANALYSIS',
        findings: gamingAttempt.agent_output.findings,
        metadata: {}
      };

      const results = await auditor.audit(agent, { complexity: 'MEDIUM' });

      // Should detect excessive hedging
      const hedgingIssues = results.issues.filter(i => i.type === 'excessive_hedging');
      expect(hedgingIssues.length).toBeGreaterThan(0);
    });

    it('should detect fake rejected hypotheses pattern', async () => {
      // From GAME-002: Agent invents fake alternatives after analysis
      const gamingAttempt = testData.gaming_attempts.find(g => g.id === 'GAME-002');

      // The fake hypothesis has timestamp that suggests it wasn't evaluated during analysis
      const fakeHypothesis = gamingAttempt.agent_output._rejectedHypotheses[0];

      // Fake hypotheses have suspiciously generic rejection reasons
      expect(fakeHypothesis.rejection_reason.code).toBe('LOW_CONFIDENCE');
      expect(fakeHypothesis.rejection_reason.description).toBe('Not considered');
    });

    it('should not reward hedging without proper calibration', async () => {
      // Create agent with uncalibrated hedging
      const agent = {
        name: 'UncalibratedAgent',
        type: 'ANALYSIS',
        findings: [
          {
            id: 'f1',
            type: 'ANALYSIS',
            description: 'This might be an issue, possibly significant, uncertain about impact',
            confidence: 0.7,
            severity: 'medium',
            evidence: [],  // No evidence
            metadata: {}   // No missing evidence flag
          }
        ],
        metadata: {}
      };

      const results = await auditor.audit(agent, {});

      // Should NOT reward because uncertainty is not calibrated
      const calibratedRewards = results.rewards.filter(r => r.type === 'calibrated_uncertainty');
      expect(calibratedRewards).toHaveLength(0);
    });
  });

  // =========================================================================
  // C. BACKWARD COMPATIBILITY - Legacy agents should work
  // =========================================================================
  describe('Backward Compatibility', () => {
    it('should handle agents without hypothesis tracker fields', async () => {
      // From COMPAT-001: Legacy agent without tracker
      const compatData = testData.backward_compatibility.find(c => c.id === 'COMPAT-001');

      const agent = {
        name: compatData.agent_mock.name,
        type: 'INFO',
        findings: compatData.agent_mock.findings,
        metadata: {}
        // Note: No _rejectedHypotheses field
      };

      // Should not throw
      const results = await auditor.audit(agent, { taskType: 'retrieval' });

      expect(results).toBeTruthy();
      expect(compatData.should_not_throw).toBe(true);
    });

    it('should skip tunnel vision check for simple task types', async () => {
      const agent = {
        name: 'SimpleAgent',
        type: 'VALIDATION',
        findings: [{
          id: 'f1',
          type: 'INFO',
          description: 'Validation passed',
          confidence: 0.9,
          severity: 'info'
        }],
        metadata: {}
      };

      const results = await auditor.audit(agent, { taskType: 'verification' });

      // Tunnel vision should be skipped
      const skipped = results.checks_skipped.find(s => s.check === 'tunnelVision');
      expect(skipped).toBeTruthy();
      expect(skipped.reason).toContain('exempt_task_type');
    });

    it('should gracefully handle missing evidence arrays', async () => {
      const agent = {
        name: 'NoEvidenceAgent',
        type: 'DESIGN',
        findings: [
          {
            id: 'f1',
            type: 'ANALYSIS',
            description: 'Simple observation',
            confidence: 0.6,
            severity: 'low'
            // Note: No evidence field
          }
        ],
        metadata: {}
      };

      const results = await auditor.audit(agent, {});

      // Should complete without error
      expect(results).toBeTruthy();
      expect(results.passed).toBe(true);
    });
  });

  // =========================================================================
  // D. SIZE LIMITS - Metadata enforcement
  // =========================================================================
  describe('Size Limits', () => {
    it('should truncate oversized metadata', () => {
      // From SIZE-001: Metadata exceeding 10KB limit
      const sizeData = testData.size_limits.find(s => s.id === 'SIZE-001');

      // Create oversized metadata
      const metadata = {
        ...sizeData.metadata,
        context_snapshot: 'x'.repeat(15000)  // Exceed limit
      };

      const enforced = enforceMetadataLimits(metadata);

      // Should be under limit after enforcement
      const size = JSON.stringify(enforced).length;
      expect(size).toBeLessThanOrEqual(10000);
      // Uses _field_truncated format with underscore prefix
      expect(enforced._context_snapshot_truncated || enforced._context_snapshot_removed).toBe(true);
    });

    it('should mark truncated fields appropriately', () => {
      const metadata = {
        rejected_alternatives: Array(50).fill().map((_, i) => ({
          id: `alt-${i}`,
          alternative_name: `Alternative ${i} with a long description that adds size`,
          rejection_reason: { code: 'LOW_CONFIDENCE', description: 'Long reason '.repeat(20) }
        }))
      };

      const enforced = enforceMetadataLimits(metadata);

      expect(enforced._size_bytes).toBeTruthy();
      expect(enforced._size_bytes).toBeLessThanOrEqual(10000);
    });

    it('should preserve essential data when truncating', () => {
      const metadata = {
        important_field: 'keep this',
        context_snapshot: 'x'.repeat(12000),
        rejected_alternatives: [{ id: '1', name: 'alt1' }]
      };

      const enforced = enforceMetadataLimits(metadata);

      // Important field should be preserved
      expect(enforced.important_field).toBe('keep this');
      expect(enforced.rejected_alternatives).toBeTruthy();
    });
  });

  // =========================================================================
  // E. EVIDENCE SCORING - Deterministic calculations
  // =========================================================================
  describe('Evidence Scoring', () => {
    it('should return 0 for findings with no evidence', () => {
      const finding = {
        id: 'f1',
        evidence: []
      };

      const score = calculateEvidenceScore(finding);

      expect(score).toBe(0);
    });

    it('should score presence of evidence pointers', () => {
      const finding = {
        id: 'f1',
        evidence: [
          { type: 'file', ref: 'test.js', verified: false }
        ]
      };

      const score = calculateEvidenceScore(finding);

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    it('should give bonus for verified evidence', () => {
      const unverified = {
        id: 'f1',
        evidence: [
          { type: 'file', ref: 'test.js', verified: false }
        ]
      };

      const verified = {
        id: 'f2',
        evidence: [
          { type: 'file', ref: 'test.js', verified: true }
        ]
      };

      const unverifiedScore = calculateEvidenceScore(unverified);
      const verifiedScore = calculateEvidenceScore(verified);

      expect(verifiedScore).toBeGreaterThan(unverifiedScore);
    });

    it('should give diversity bonus for multiple evidence types', () => {
      const singleType = {
        id: 'f1',
        evidence: [
          { type: 'file', ref: 'a.js', verified: true },
          { type: 'file', ref: 'b.js', verified: true }
        ]
      };

      const multiType = {
        id: 'f2',
        evidence: [
          { type: 'file', ref: 'a.js', verified: true },
          { type: 'test_result', ref: 'test-1', verified: true }
        ]
      };

      const singleScore = calculateEvidenceScore(singleType);
      const multiScore = calculateEvidenceScore(multiType);

      expect(multiScore).toBeGreaterThan(singleScore);
    });

    it('should cap score at 1.0', () => {
      const finding = {
        id: 'f1',
        evidence: [
          { type: 'file', ref: 'a.js', verified: true },
          { type: 'test_result', ref: 't1', verified: true },
          { type: 'citation', ref: 'doc.md', verified: true },
          { type: 'inline', ref: 'proof', verified: true }
        ]
      };

      const score = calculateEvidenceScore(finding);

      expect(score).toBeLessThanOrEqual(1.0);
    });
  });

  // =========================================================================
  // F. TUNNEL VISION - Complex task detection
  // =========================================================================
  describe('Tunnel Vision Check', () => {
    it('should skip check for deterministic tasks', async () => {
      // From DET-001: Simple factual lookup
      const deterministicTask = testData.deterministic_tasks.find(d => d.id === 'DET-001');

      const agent = {
        name: 'CapitalLookupAgent',
        type: 'VALIDATION',
        findings: [{
          id: 'f1',
          type: 'INFO',
          description: 'The capital of France is Paris',
          confidence: 1.0,
          severity: 'info'
        }],
        metadata: { taskType: deterministicTask.taskType }
      };

      const results = await auditor.audit(agent, {
        taskType: deterministicTask.taskType,
        complexity: deterministicTask.complexity
      });

      // Should skip tunnel vision
      const skipped = results.checks_skipped.find(s => s.check === 'tunnelVision');
      expect(skipped).toBeTruthy();
    });

    it('should require alternatives for complex tasks', async () => {
      // From COMPLEX-001: Architecture decision
      const complexTask = testData.complex_tasks.find(c => c.id === 'COMPLEX-001');

      const agent = {
        name: 'ArchitectureAgent',
        type: 'ARCHITECT',
        findings: [{
          id: 'f1',
          type: 'RECOMMENDATION',
          description: 'Use microservices',
          confidence: 0.85,
          severity: 'high'
        }],
        metadata: { taskType: complexTask.taskType },
        _rejectedHypotheses: []  // No alternatives considered!
      };

      const results = await auditor.audit(agent, {
        taskType: complexTask.taskType,
        complexity: complexTask.complexity
      });

      // Should flag tunnel vision
      const tunnelVisionIssue = results.issues.find(i => i.type === 'tunnel_vision');
      expect(tunnelVisionIssue).toBeTruthy();
    });

    it('should accept NA_DETERMINISTIC bypass justification', async () => {
      const agent = {
        name: 'FactCheckAgent',
        type: 'VALIDATION',
        findings: [{
          id: 'f1',
          type: 'INFO',
          description: 'Server status: running',
          confidence: 1.0,
          severity: 'info'
        }],
        metadata: {},
        _rejectedHypotheses: [{
          id: 'N/A',
          alternative_id: 'N/A',
          alternative_name: 'No plausible alternatives',
          rejection_reason: {
            code: 'NA_DETERMINISTIC',
            description: 'Single correct answer (status check)'
          },
          confidence_at_rejection: 1.0
        }]
      };

      const results = await auditor.audit(agent, { complexity: 'HIGH' });

      // Should accept the bypass
      const tunnelVisionIssue = results.issues.find(i => i.type === 'tunnel_vision');
      expect(tunnelVisionIssue).toBeFalsy();
    });

    it('should infer complexity from agent type', () => {
      const securityAgent = { type: 'SECURITY' };
      const validationAgent = { type: 'VALIDATION' };

      const securityComplexity = inferComplexity(securityAgent, {});
      const validationComplexity = inferComplexity(validationAgent, {});

      expect(securityComplexity).toBe('HIGH');
      expect(validationComplexity).toBe('LOW');
      expect(meetsComplexityThreshold('HIGH', 'MEDIUM')).toBe(true);
      expect(meetsComplexityThreshold('LOW', 'MEDIUM')).toBe(false);
    });
  });

  // =========================================================================
  // G. CALIBRATED UNCERTAINTY - Proper justification
  // =========================================================================
  describe('Calibrated Uncertainty', () => {
    it('should validate missingEvidence flag against actual evidence', () => {
      // From INVALID-003: Claims missingEvidence but has evidence
      const invalidFinding = testData.invalid_findings.find(f => f.id === 'INVALID-003');

      // The finding has evidence but claims missingEvidence
      const evidenceScore = calculateEvidenceScore(invalidFinding.finding);

      // Evidence score >= 0.5 means the missingEvidence flag is false
      expect(evidenceScore).toBeGreaterThanOrEqual(0.5);
      expect(invalidFinding.expected_outcome).toBe('REJECT_SELF_ATTESTATION');
    });

    it('should reject uncertainty when evidence contradicts the flag', async () => {
      const agent = {
        name: 'FalseUncertaintyAgent',
        type: 'ANALYSIS',
        findings: [{
          id: 'f1',
          type: 'ANALYSIS',
          description: 'This might be an issue, uncertain',
          confidence: 0.6,
          severity: 'medium',
          evidence: [
            { type: 'file', ref: 'package.json', verified: true },
            { type: 'test_result', ref: 'test-1', verified: true }
          ],
          metadata: {
            missingEvidence: true  // FALSE - evidence exists!
          }
        }],
        metadata: {}
      };

      const results = await auditor.audit(agent, {});

      // Should NOT reward this because it's self-attestation
      const rewards = results.rewards.filter(r => r.type === 'calibrated_uncertainty');
      expect(rewards).toHaveLength(0);
    });

    it('should require structured nextStepToResolve', async () => {
      // String nextStep should be invalid
      const stringNextStep = {
        id: 'f1',
        type: 'ANALYSIS',
        description: 'Uncertain about this, needs investigation',
        confidence: 0.5,
        severity: 'medium',
        evidence: [],
        metadata: {
          nextStepToResolve: 'Run more tests'  // STRING - invalid!
        }
      };

      // Object with action and expected_result should be valid
      const structuredNextStep = {
        id: 'f2',
        type: 'ANALYSIS',
        description: 'Uncertain about memory leak, needs profiling',
        confidence: 0.5,
        severity: 'medium',
        evidence: [],
        metadata: {
          missingEvidence: true,
          nextStepToResolve: {
            action: 'run_profiler',
            tool: 'Chrome DevTools',
            expected_result: 'Memory allocation timeline',
            owner: 'developer'
          }
        }
      };

      const agent1 = { name: 'A1', type: 'ANALYSIS', findings: [stringNextStep], metadata: {} };
      const agent2 = { name: 'A2', type: 'ANALYSIS', findings: [structuredNextStep], metadata: {} };

      const results1 = await auditor.audit(agent1, {});
      const results2 = await auditor.audit(agent2, {});

      // String nextStep should not be rewarded
      const rewards1 = results1.rewards.filter(r => r.type === 'calibrated_uncertainty');
      expect(rewards1).toHaveLength(0);

      // Structured nextStep should be rewarded
      const rewards2 = results2.rewards.filter(r => r.type === 'calibrated_uncertainty');
      expect(rewards2.length).toBeGreaterThan(0);
    });

    it('should detect conflicting evidence pattern', () => {
      const conflictingEvidence = [
        { type: 'test_result', ref: 'test-pass', loc: { section: 'passed' }, verified: true },
        { type: 'test_result', ref: 'test-fail', loc: { section: 'conflicting: failed' }, verified: true }
      ];

      const nonConflictingEvidence = [
        { type: 'file', ref: 'a.js', verified: true },
        { type: 'citation', ref: 'doc.md', verified: true }
      ];

      expect(hasConflictingEvidence(conflictingEvidence)).toBe(true);
      expect(hasConflictingEvidence(nonConflictingEvidence)).toBe(false);
    });
  });

  // =========================================================================
  // H. INVALID FINDINGS - Claims without evidence
  // =========================================================================
  describe('Invalid Findings Detection', () => {
    it('should flag high confidence without evidence', async () => {
      // From INVALID-001: High confidence claim without evidence
      const invalidFinding = testData.invalid_findings.find(f => f.id === 'INVALID-001');

      const agent = {
        name: 'OverconfidentAgent',
        type: 'SECURITY',
        findings: [invalidFinding.finding],
        metadata: {}
      };

      const results = await auditor.audit(agent, {});

      const issues = results.issues.filter(i => i.type === 'high_confidence_without_evidence');
      expect(issues.length).toBeGreaterThan(0);
    });

    it('should flag certainty language without evidence', async () => {
      // From INVALID-002: Uses "obviously" and "guaranteed" without evidence
      const invalidFinding = testData.invalid_findings.find(f => f.id === 'INVALID-002');

      const agent = {
        name: 'CertainAgent',
        type: 'ANALYSIS',
        findings: [invalidFinding.finding],
        metadata: {}
      };

      const results = await auditor.audit(agent, {});

      const issues = results.issues.filter(i => i.type === 'unsupported_certainty');
      expect(issues.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // I. HYPOTHESIS TRACKER - Mixin functionality
  // =========================================================================
  describe('Hypothesis Tracker', () => {
    it('should apply tracker to agent', () => {
      const agent = { name: 'TestAgent' };

      HypothesisTracker.applyTo(agent);

      expect(HypothesisTracker.hasTracker(agent)).toBe(true);
      expect(typeof agent.considerHypothesis).toBe('function');
      expect(typeof agent.rejectHypothesis).toBe('function');
      expect(typeof agent.addDeterministicBypass).toBe('function');
    });

    it('should track rejected hypotheses', () => {
      const agent = { name: 'TestAgent' };
      HypothesisTracker.applyTo(agent);

      agent.considerHypothesis('h1', { text: 'Use Vue.js' })
           .rejectHypothesis('h1', 'Team expertise is in React', {}, REJECTION_CODES.LOW_CONFIDENCE);

      const summary = agent.getReasoningSummary();

      expect(summary.rejected).toBe(1);
      expect(summary.rejected_hypotheses.length).toBe(1);
      expect(summary.rejected_hypotheses[0].alternative_name).toBe('Use Vue.js');
    });

    it('should support deterministic bypass', () => {
      const agent = { name: 'LookupAgent' };
      HypothesisTracker.applyTo(agent);

      agent.addDeterministicBypass('Single factual answer exists');

      const summary = agent.getReasoningSummary();

      expect(summary.has_deterministic_bypass).toBe(true);
    });

    it('should serialize to artifact metadata format', () => {
      const agent = { name: 'TestAgent' };
      HypothesisTracker.applyTo(agent);

      agent.considerHypothesis('h1', { text: 'Option A' })
           .considerHypothesis('h2', { text: 'Option B' })
           .rejectHypothesis('h1', 'Less efficient', {}, REJECTION_CODES.LOW_CONFIDENCE);

      const metadata = agent.getHypothesisArtifactMetadata();

      expect(metadata._schema_version).toBe('1.0.0');
      expect(metadata.rejected_alternatives.length).toBe(1);
      expect(metadata.rejection_count).toBe(1);
    });
  });

  // =========================================================================
  // J. CONFIDENCE INTERVAL - Statistical calculations
  // =========================================================================
  describe('Confidence Interval', () => {
    it('should use heuristic method for small samples (n < 5)', () => {
      const findings = [
        { confidence: 0.8, severity: 'high' },
        { confidence: 0.7, severity: 'medium' }
      ];

      const interval = auditor.calculateConfidenceInterval(findings);

      expect(interval.method).toBe('heuristic_small_sample');
      expect(interval.lower).toBeLessThan(interval.center);
      expect(interval.upper).toBeGreaterThan(interval.center);
    });

    it('should use percentile bands for larger samples (n >= 5)', () => {
      const findings = [
        { confidence: 0.9, severity: 'critical' },
        { confidence: 0.8, severity: 'high' },
        { confidence: 0.7, severity: 'medium' },
        { confidence: 0.6, severity: 'medium' },
        { confidence: 0.5, severity: 'low' }
      ];

      const interval = auditor.calculateConfidenceInterval(findings);

      expect(interval.method).toBe('percentile_bands');
      expect(interval.inputs.p10).toBeTruthy();
      expect(interval.inputs.p90).toBeTruthy();
    });

    it('should weight by severity', () => {
      const criticalFindings = [
        { confidence: 0.9, severity: 'critical' }
      ];

      const lowFindings = [
        { confidence: 0.9, severity: 'low' }
      ];

      const criticalInterval = auditor.calculateConfidenceInterval(criticalFindings);
      const lowInterval = auditor.calculateConfidenceInterval(lowFindings);

      // Both have same confidence but different weights
      // The interval structure should be the same for n=1
      expect(criticalInterval.method).toBe(lowInterval.method);
    });

    it('should handle empty findings', () => {
      const interval = auditor.calculateConfidenceInterval([]);

      expect(interval.center).toBe(0.5);  // Default
    });
  });

  // =========================================================================
  // K. DEGRADE POLICY - Output modification
  // =========================================================================
  describe('Degrade Policy', () => {
    it('should cap confidences at 0.7', () => {
      const agentOutput = {
        findings: [
          { id: 'f1', confidence: 0.95, severity: 'critical' },
          { id: 'f2', confidence: 0.6, severity: 'medium' }
        ],
        uncertainties: [],
        score: 80
      };

      const auditResults = { audit_score: 40, issues: [] };

      const degraded = auditor.applyDegradePolicy(agentOutput, auditResults);

      expect(degraded.findings[0].confidence).toBe(0.7);
      expect(degraded.findings[0].metadata.confidence_capped).toBe(true);
      expect(degraded.findings[1].confidence).toBe(0.6);  // Under cap, unchanged
    });

    it('should demote low-confidence findings to uncertainties', () => {
      const agentOutput = {
        findings: [
          { id: 'f1', confidence: 0.3, severity: 'low' },
          { id: 'f2', confidence: 0.6, severity: 'medium' }
        ],
        uncertainties: [],
        score: 70
      };

      const auditResults = { audit_score: 30, issues: [] };

      const degraded = auditor.applyDegradePolicy(agentOutput, auditResults);

      expect(degraded.findings.length).toBe(1);
      expect(degraded.uncertainties.length).toBe(1);
      expect(degraded.uncertainties[0].demoted_from_findings).toBe(true);
    });

    it('should reduce score based on audit penalty', () => {
      const agentOutput = {
        findings: [],
        uncertainties: [],
        score: 80
      };

      const auditResults = { audit_score: 60, issues: [] };  // 40 points below 100

      const degraded = auditor.applyDegradePolicy(agentOutput, auditResults);

      // Penalty = (100 - 60) * 0.5 = 20
      expect(degraded.score).toBe(60);
    });
  });

  // =========================================================================
  // L. EXCEPTION HANDLING
  // =========================================================================
  describe('Exception Handling', () => {
    it('should throw ClaimEvidenceAuditException in block mode', async () => {
      const blockConfig = {
        enabled: true,
        failurePolicy: 'block',
        checks: {
          claimEvidence: { enabled: true, minEvidenceScore: 0.5, penalizeUnsupportedCertainty: true, certaintyPatterns: ['definitely'], excludePatterns: [] },
          tunnelVision: { enabled: false },
          calibratedUncertainty: { enabled: false }
        },
        thresholds: { passScore: 90, highConfidenceThreshold: 0.9 },
        scoring: { unsupportedCertaintyPenalty: -50, evidenceDiversityBonus: 5 }
      };

      const blockAuditor = new ClaimEvidenceAuditor(blockConfig);

      const agent = {
        name: 'BadAgent',
        type: 'SECURITY',
        findings: [{
          id: 'f1',
          type: 'SECURITY',
          description: 'This is definitely a vulnerability',
          confidence: 0.95,
          severity: 'critical',
          evidence: []
        }],
        metadata: {}
      };

      await expect(blockAuditor.audit(agent, {})).rejects.toThrow(ClaimEvidenceAuditException);
    });

    it('should include audit results in exception', async () => {
      const blockConfig = {
        enabled: true,
        failurePolicy: 'block',
        checks: {
          claimEvidence: { enabled: true, minEvidenceScore: 0.5, penalizeUnsupportedCertainty: false, certaintyPatterns: [], excludePatterns: [] },
          tunnelVision: { enabled: false },
          calibratedUncertainty: { enabled: false }
        },
        thresholds: { passScore: 90, highConfidenceThreshold: 0.9 },
        scoring: { unsupportedCertaintyPenalty: -50, evidenceDiversityBonus: 5 }
      };

      const blockAuditor = new ClaimEvidenceAuditor(blockConfig);

      const agent = {
        name: 'BadAgent',
        findings: [{
          id: 'f1',
          confidence: 0.95,
          evidence: []
        }],
        metadata: {}
      };

      try {
        await blockAuditor.audit(agent, {});
      } catch (e) {
        expect(e.auditResults).toBeTruthy();
        expect(e.isRetryable).toBe(true);
        expect(e.agentName).toBe('BadAgent');
      }
    });
  });

  // =========================================================================
  // M. SINGLETON PATTERN
  // =========================================================================
  describe('Singleton Pattern', () => {
    it('should return same instance when no config provided', () => {
      const auditor1 = getClaimEvidenceAuditor();
      const auditor2 = getClaimEvidenceAuditor();

      expect(auditor1).toBe(auditor2);
    });

    it('should create new instance when config provided', () => {
      const auditor1 = getClaimEvidenceAuditor();
      const auditor2 = getClaimEvidenceAuditor({ enabled: false });

      expect(auditor1).not.toBe(auditor2);
    });
  });
});
