/**
 * Unit tests for Phase 0 Intent Discovery Engine
 *
 * Tests:
 * - Session creation and state management
 * - One-question-at-a-time flow
 * - STAGED_CHECKPOINT pattern
 * - UN_DONE_PROPOSAL pattern
 * - Crystallization score calculation
 * - EHG stage-aware signals
 * - Phase 0 gating for feature/enhancement SDs
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  createSession,
  getNextQuestion,
  processAnswer,
  shouldTriggerCheckpoint,
  generateIntentSummary,
  setIntentSummary,
  shouldTriggerUnDoneProposal,
  generateOutOfScopeSuggestions,
  setOutOfScope,
  calculateCrystallizationScore,
  isComplete,
  validateCompletion,
  requiresPhase0,
  getArtifacts,
  saveSession,
  loadSession,
  clearSession,
  Phase0State,
  EHGStage,
  PHASE_0_REQUIRED_TYPES,
  MIN_QUESTIONS,
  MIN_OUT_OF_SCOPE_ITEMS,
  MAX_INTENT_SUMMARY_LENGTH,
  CRYSTALLIZATION_THRESHOLD
} from '../../../scripts/modules/phase-0/engine.js';

describe('Phase 0 Intent Discovery Engine', () => {
  beforeEach(() => {
    // Clear any existing session state
    clearSession();
  });

  afterEach(() => {
    clearSession();
  });

  describe('Constants', () => {
    it('should have correct threshold values', () => {
      expect(CRYSTALLIZATION_THRESHOLD).toBe(0.7);
      expect(MIN_QUESTIONS).toBe(3);
      expect(MIN_OUT_OF_SCOPE_ITEMS).toBe(3);
      expect(MAX_INTENT_SUMMARY_LENGTH).toBe(500);
    });

    it('should require Phase 0 for feature and enhancement types', () => {
      expect(PHASE_0_REQUIRED_TYPES).toContain('feature');
      expect(PHASE_0_REQUIRED_TYPES).toContain('enhancement');
      expect(PHASE_0_REQUIRED_TYPES).not.toContain('fix');
      expect(PHASE_0_REQUIRED_TYPES).not.toContain('infrastructure');
    });
  });

  describe('requiresPhase0()', () => {
    it('should return true for feature type', () => {
      expect(requiresPhase0('feature')).toBe(true);
    });

    it('should return true for enhancement type', () => {
      expect(requiresPhase0('enhancement')).toBe(true);
    });

    it('should return false for fix type', () => {
      expect(requiresPhase0('fix')).toBe(false);
    });

    it('should return false for infrastructure type', () => {
      expect(requiresPhase0('infrastructure')).toBe(false);
    });

    it('should return false for documentation type', () => {
      expect(requiresPhase0('documentation')).toBe(false);
    });
  });

  describe('createSession()', () => {
    it('should create session for feature SD requiring Phase 0', () => {
      const session = createSession('feature', 'Initial context');

      expect(session.version).toBe('1.0.0');
      expect(session.sdType).toBe('feature');
      expect(session.requiresPhase0).toBe(true);
      expect(session.state).toBe(Phase0State.DISCOVERY_QUESTIONS);
      expect(session.questionsAsked).toBe(0);
      expect(session.questionsAnswered).toBe(0);
      expect(session.initialContext).toBe('Initial context');
    });

    it('should create bypassed session for fix SD', () => {
      const session = createSession('fix');

      expect(session.requiresPhase0).toBe(false);
      expect(session.state).toBe(Phase0State.BYPASSED);
    });

    it('should initialize empty answers object', () => {
      const session = createSession('feature');

      expect(session.answers).toEqual({});
      expect(session.outOfScope).toEqual([]);
      expect(session.intentSummary).toBeNull();
    });
  });

  describe('getNextQuestion()', () => {
    it('should ask EHG stage first if not set', () => {
      const session = createSession('feature');
      const question = getNextQuestion(session);

      expect(question.id).toBe('_ehg_stage');
      expect(question.type).toBe('stage_selection');
      expect(question.options).toHaveLength(5); // 5 EHG stages
    });

    it('should ask stage-specific questions after stage is set', () => {
      const session = createSession('feature');
      session.ehgStage = EHGStage.MVP;

      const question = getNextQuestion(session);

      expect(question.id).not.toBe('_ehg_stage');
      expect(question.type).toBe('open_ended');
      expect(question.required).toBe(true);
    });

    it('should increment questionsAsked counter', () => {
      const session = createSession('feature');
      session.ehgStage = EHGStage.MVP;

      expect(session.questionsAsked).toBe(0);
      getNextQuestion(session);
      expect(session.questionsAsked).toBe(1);
    });
  });

  describe('processAnswer()', () => {
    it('should set EHG stage when answering stage question', () => {
      const session = createSession('feature');
      processAnswer(session, '_ehg_stage', EHGStage.GROWTH);

      expect(session.ehgStage).toBe(EHGStage.GROWTH);
      expect(session.stageSignal).toBeDefined();
      expect(session.stageSignal.stage).toBe(EHGStage.GROWTH);
      expect(session.stageSignal.method).toBe('user_selection');
    });

    it('should store regular answers in answers object', () => {
      const session = createSession('feature');
      session.ehgStage = EHGStage.MVP;

      processAnswer(session, 'user_value', 'Better user experience');

      expect(session.answers['user_value']).toBeDefined();
      expect(session.answers['user_value'].answer).toBe('Better user experience');
      expect(session.questionsAnswered).toBe(1);
    });

    it('should store success metric separately', () => {
      const session = createSession('feature');
      processAnswer(session, '_success_metric', '50% reduction in support tickets');

      expect(session.explicitSuccessMetric).toBe('50% reduction in support tickets');
    });
  });

  describe('STAGED_CHECKPOINT Pattern', () => {
    it('should trigger checkpoint after minimum questions', () => {
      const session = createSession('feature');
      session.ehgStage = EHGStage.MVP;
      session.questionsAnswered = MIN_QUESTIONS;

      expect(shouldTriggerCheckpoint(session)).toBe(true);
    });

    it('should not trigger checkpoint before minimum questions', () => {
      const session = createSession('feature');
      session.ehgStage = EHGStage.MVP;
      session.questionsAnswered = MIN_QUESTIONS - 1;

      expect(shouldTriggerCheckpoint(session)).toBe(false);
    });

    it('should not trigger checkpoint if already completed', () => {
      const session = createSession('feature');
      session.ehgStage = EHGStage.MVP;
      session.questionsAnswered = MIN_QUESTIONS;
      session.intentSummary = 'Already set';

      expect(shouldTriggerCheckpoint(session)).toBe(false);
    });

    it('should generate intent summary within max length', () => {
      const session = createSession('feature');
      session.ehgStage = EHGStage.MVP;
      session.answers = {
        question1: { answer: 'Answer 1' },
        question2: { answer: 'Answer 2' },
        question3: { answer: 'Answer 3' }
      };

      const summary = generateIntentSummary(session);

      expect(summary.length).toBeLessThanOrEqual(MAX_INTENT_SUMMARY_LENGTH);
      expect(summary.toLowerCase()).toContain('mvp');
    });

    it('should truncate long summaries', () => {
      const session = createSession('feature');
      session.ehgStage = EHGStage.MVP;
      session.initialContext = 'A'.repeat(600); // Very long context

      const summary = generateIntentSummary(session);

      expect(summary.length).toBeLessThanOrEqual(MAX_INTENT_SUMMARY_LENGTH);
      expect(summary.endsWith('...')).toBe(true);
    });

    it('should transition to UN_DONE_PROPOSAL state after checkpoint', () => {
      const session = createSession('feature');
      session.state = Phase0State.DISCOVERY_QUESTIONS;

      setIntentSummary(session, 'Test intent summary');

      expect(session.state).toBe(Phase0State.UN_DONE_PROPOSAL);
      expect(session.intentSummary).toBe('Test intent summary');
    });
  });

  describe('UN_DONE_PROPOSAL Pattern', () => {
    it('should trigger after checkpoint with no out-of-scope items', () => {
      const session = createSession('feature');
      session.state = Phase0State.UN_DONE_PROPOSAL;
      session.intentSummary = 'Test summary';
      session.outOfScope = [];

      expect(shouldTriggerUnDoneProposal(session)).toBe(true);
    });

    it('should not trigger before checkpoint', () => {
      const session = createSession('feature');
      session.state = Phase0State.DISCOVERY_QUESTIONS;

      expect(shouldTriggerUnDoneProposal(session)).toBe(false);
    });

    it('should generate at least MIN_OUT_OF_SCOPE_ITEMS suggestions', () => {
      const session = createSession('feature');
      const suggestions = generateOutOfScopeSuggestions(session);

      expect(suggestions.length).toBeGreaterThanOrEqual(MIN_OUT_OF_SCOPE_ITEMS);
    });

    it('should calculate score after setting out-of-scope', () => {
      const session = createSession('feature');
      session.ehgStage = EHGStage.MVP;
      session.questionsAnswered = MIN_QUESTIONS;
      session.intentSummary = 'Test summary';
      session.stageSignal = { stage: EHGStage.MVP };
      session.explicitSuccessMetric = 'Test metric';

      setOutOfScope(session, ['Item 1', 'Item 2', 'Item 3']);

      expect(session.crystallizationScore).toBeGreaterThan(0);
    });
  });

  describe('Crystallization Score', () => {
    it('should score 0 for empty session', () => {
      const session = createSession('feature');
      const score = calculateCrystallizationScore(session);

      expect(score).toBe(0);
    });

    it('should add 0.2 for meeting minimum questions', () => {
      const session = createSession('feature');
      session.questionsAnswered = MIN_QUESTIONS;

      const score = calculateCrystallizationScore(session);

      expect(score).toBeGreaterThanOrEqual(0.2);
    });

    it('should add 0.2 for intent summary', () => {
      const session = createSession('feature');
      session.intentSummary = 'Test summary';

      const score = calculateCrystallizationScore(session);

      expect(score).toBeGreaterThanOrEqual(0.2);
    });

    it('should add 0.2 for sufficient out-of-scope items', () => {
      const session = createSession('feature');
      session.outOfScope = ['Item 1', 'Item 2', 'Item 3'];

      const score = calculateCrystallizationScore(session);

      expect(score).toBeGreaterThanOrEqual(0.2);
    });

    it('should add 0.2 for EHG stage signal', () => {
      const session = createSession('feature');
      session.ehgStage = EHGStage.MVP;
      session.stageSignal = { stage: EHGStage.MVP };

      const score = calculateCrystallizationScore(session);

      expect(score).toBeGreaterThanOrEqual(0.2);
    });

    it('should add 0.2 for explicit success metric', () => {
      const session = createSession('feature');
      session.explicitSuccessMetric = 'Reduce errors by 50%';

      const score = calculateCrystallizationScore(session);

      expect(score).toBeGreaterThanOrEqual(0.2);
    });

    it('should reach 1.0 with all criteria met', () => {
      const session = createSession('feature');
      session.questionsAnswered = MIN_QUESTIONS;
      session.intentSummary = 'Test summary';
      session.outOfScope = ['Item 1', 'Item 2', 'Item 3'];
      session.ehgStage = EHGStage.MVP;
      session.stageSignal = { stage: EHGStage.MVP };
      session.explicitSuccessMetric = 'Test metric';

      const score = calculateCrystallizationScore(session);

      expect(score).toBe(1.0);
    });

    it('should not exceed 1.0', () => {
      const session = createSession('feature');
      session.questionsAnswered = 10; // More than minimum
      session.intentSummary = 'Test summary';
      session.outOfScope = ['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5']; // More than minimum
      session.ehgStage = EHGStage.MVP;
      session.stageSignal = { stage: EHGStage.MVP };
      session.explicitSuccessMetric = 'Test metric';

      const score = calculateCrystallizationScore(session);

      expect(score).toBeLessThanOrEqual(1.0);
    });
  });

  describe('Completion Validation', () => {
    it('should pass for bypassed sessions', () => {
      const session = createSession('fix');
      const validation = validateCompletion(session);

      expect(validation.valid).toBe(true);
      expect(validation.message).toContain('bypassed');
    });

    it('should fail for incomplete sessions', () => {
      const session = createSession('feature');
      const validation = validateCompletion(session);

      expect(validation.valid).toBe(false);
      expect(validation.issues.length).toBeGreaterThan(0);
    });

    it('should pass for fully completed sessions', () => {
      const session = createSession('feature');
      session.questionsAnswered = MIN_QUESTIONS;
      session.intentSummary = 'Test summary';
      session.outOfScope = ['Item 1', 'Item 2', 'Item 3'];
      session.ehgStage = EHGStage.MVP;
      session.stageSignal = { stage: EHGStage.MVP };
      session.explicitSuccessMetric = 'Test metric';
      session.crystallizationScore = calculateCrystallizationScore(session);

      const validation = validateCompletion(session);

      expect(validation.valid).toBe(true);
      expect(validation.score).toBeGreaterThanOrEqual(CRYSTALLIZATION_THRESHOLD);
    });

    it('should list specific issues for incomplete sessions', () => {
      const session = createSession('feature');
      session.questionsAnswered = 1; // Below minimum
      session.intentSummary = null; // No summary
      session.outOfScope = []; // No out-of-scope

      const validation = validateCompletion(session);

      expect(validation.issues).toContain(`Minimum questions not met: 1/${MIN_QUESTIONS}`);
      expect(validation.issues).toContain('STAGED_CHECKPOINT not completed: no intent_summary');
      expect(validation.issues).toContain(`UN_DONE_PROPOSAL not satisfied: 0/${MIN_OUT_OF_SCOPE_ITEMS} out-of-scope items`);
    });
  });

  describe('Session Completion States', () => {
    it('should be complete when state is COMPLETED', () => {
      const session = createSession('feature');
      session.state = Phase0State.COMPLETED;

      expect(isComplete(session)).toBe(true);
    });

    it('should be complete when state is BYPASSED', () => {
      const session = createSession('fix');

      expect(isComplete(session)).toBe(true);
    });

    it('should not be complete during discovery', () => {
      const session = createSession('feature');

      expect(isComplete(session)).toBe(false);
    });
  });

  describe('Artifacts Export', () => {
    it('should export all required artifacts', () => {
      const session = createSession('feature');
      session.ehgStage = EHGStage.MVP;
      session.questionsAsked = 4;
      session.questionsAnswered = 3;
      session.intentSummary = 'Test summary';
      session.outOfScope = ['Item 1', 'Item 2', 'Item 3'];
      session.explicitSuccessMetric = 'Test metric';
      session.crystallizationScore = 0.8;
      session.state = Phase0State.COMPLETED;
      session.completedAt = new Date().toISOString();

      const artifacts = getArtifacts(session);

      expect(artifacts.phase_0_completed).toBe(true);
      expect(artifacts.phase_0_bypassed).toBe(false);
      expect(artifacts.intent_summary).toBe('Test summary');
      expect(artifacts.out_of_scope).toHaveLength(3);
      expect(artifacts.ehg_stage).toBe(EHGStage.MVP);
      expect(artifacts.crystallization_score).toBe(0.8);
      expect(artifacts.explicit_success_metric).toBe('Test metric');
      expect(artifacts.questions_asked).toBe(4);
      expect(artifacts.questions_answered).toBe(3);
    });

    it('should indicate bypassed status for non-required types', () => {
      const session = createSession('fix');
      const artifacts = getArtifacts(session);

      expect(artifacts.phase_0_completed).toBe(true);
      expect(artifacts.phase_0_bypassed).toBe(true);
    });
  });

  describe('State Persistence', () => {
    it('should save and load session', () => {
      const session = createSession('feature');
      session.ehgStage = EHGStage.MVP;
      session.questionsAnswered = 2;

      saveSession(session);
      const loaded = loadSession();

      expect(loaded).toBeDefined();
      expect(loaded.sdType).toBe('feature');
      expect(loaded.ehgStage).toBe(EHGStage.MVP);
      expect(loaded.questionsAnswered).toBe(2);
    });

    it('should return null for non-existent session', () => {
      clearSession();
      const loaded = loadSession();

      expect(loaded).toBeNull();
    });

    it('should clear session', () => {
      const session = createSession('feature');
      saveSession(session);

      clearSession();
      const loaded = loadSession();

      expect(loaded).toBeNull();
    });
  });

  describe('EHG Stage-Aware Signals', () => {
    it('should have questions for all EHG stages', () => {
      const stages = Object.values(EHGStage);

      for (const stage of stages) {
        const session = createSession('feature');
        session.ehgStage = stage;

        const question = getNextQuestion(session);

        expect(question).toBeDefined();
        expect(question.type).toBe('open_ended');
      }
    });

    it('should capture stage signal on selection', () => {
      const session = createSession('feature');
      processAnswer(session, '_ehg_stage', EHGStage.VALIDATION);

      expect(session.stageSignal).toBeDefined();
      expect(session.stageSignal.stage).toBe(EHGStage.VALIDATION);
      expect(session.stageSignal.detectedAt).toBeDefined();
    });

    it('should have different questions for different stages', () => {
      const mvpSession = createSession('feature');
      mvpSession.ehgStage = EHGStage.MVP;
      const mvpQuestion = getNextQuestion(mvpSession);

      const growthSession = createSession('feature');
      growthSession.ehgStage = EHGStage.GROWTH;
      const growthQuestion = getNextQuestion(growthSession);

      // Different stages should have different first questions
      expect(mvpQuestion.id).not.toBe(growthQuestion.id);
    });
  });

  describe('One-Question-At-A-Time Compliance', () => {
    it('should return only one question at a time', () => {
      const session = createSession('feature');

      // First question should be stage selection
      const q1 = getNextQuestion(session);
      expect(q1).toBeDefined();

      // Process stage answer
      processAnswer(session, '_ehg_stage', EHGStage.MVP);

      // Next question should be a single question
      const q2 = getNextQuestion(session);
      expect(q2).toBeDefined();

      // Both should be single objects, not arrays
      expect(Array.isArray(q1)).toBe(false);
      expect(Array.isArray(q2)).toBe(false);
    });

    it('should track question history', () => {
      const session = createSession('feature');
      session.ehgStage = EHGStage.MVP;

      getNextQuestion(session);

      expect(session.questionHistory.length).toBe(1);
      expect(session.questionHistory[0].questionId).toBeDefined();
      expect(session.questionHistory[0].askedAt).toBeDefined();
    });
  });
});
