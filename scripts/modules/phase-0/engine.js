/**
 * Phase 0 Intent Discovery Engine
 *
 * Part of SD-LEO-INFRA-PHASE-INTENT-DISCOVERY-001
 *
 * Implements Obra brainstorming patterns for strategic directive creation:
 * - One-question-at-a-time flow (maxQuestionsPerMessage=1)
 * - Minimum 3 discovery questions before completion
 * - STAGED_CHECKPOINT pattern (produces intent_summary ≤500 chars)
 * - UN_DONE_PROPOSAL pattern (produces out_of_scope array ≥3 items)
 * - intent_crystallization_score calculation (0.0-1.0, threshold 0.7)
 * - EHG stage-aware signal identification
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// State file for persisting discovery session
const STATE_FILE = path.join(__dirname, '../../../.claude/phase-0-state.json');

/**
 * Phase 0 Engine States
 */
export const Phase0State = {
  NOT_STARTED: 'not_started',
  DISCOVERY_QUESTIONS: 'discovery_questions',
  STAGED_CHECKPOINT: 'staged_checkpoint',
  UN_DONE_PROPOSAL: 'un_done_proposal',
  COMPLETED: 'completed',
  BYPASSED: 'bypassed' // For non-feature/enhancement SDs
};

/**
 * EHG Venture Lifecycle Stages
 */
export const EHGStage = {
  IDEATION: 'ideation',
  VALIDATION: 'validation',
  MVP: 'mvp',
  GROWTH: 'growth',
  SCALE: 'scale'
};

/**
 * SD Types that require Phase 0
 */
export const PHASE_0_REQUIRED_TYPES = ['feature', 'enhancement'];

/**
 * Minimum questions required before Phase 0 can complete
 */
export const MIN_QUESTIONS = 3;

/**
 * Minimum out-of-scope items required
 */
export const MIN_OUT_OF_SCOPE_ITEMS = 3;

/**
 * Intent summary maximum character length
 */
export const MAX_INTENT_SUMMARY_LENGTH = 500;

/**
 * Score threshold for Phase 0 completion
 */
export const CRYSTALLIZATION_THRESHOLD = 0.7;

/**
 * Maximum questions per message (one-question-at-a-time mandate)
 */
export const MAX_QUESTIONS_PER_MESSAGE = 1;

/**
 * Discovery question templates based on EHG stage
 */
export const DISCOVERY_QUESTIONS = {
  [EHGStage.IDEATION]: [
    { id: 'problem', question: 'What specific problem are you trying to solve?', required: true },
    { id: 'user', question: 'Who is the primary user affected by this problem?', required: true },
    { id: 'outcome', question: 'What outcome would success look like for this feature?', required: true },
    { id: 'validation', question: 'How would you validate that this solves the problem?', required: false },
    { id: 'risk', question: 'What is the biggest risk or unknown for this work?', required: false }
  ],
  [EHGStage.VALIDATION]: [
    { id: 'hypothesis', question: 'What hypothesis are you testing with this feature?', required: true },
    { id: 'metric', question: 'What metric will prove/disprove the hypothesis?', required: true },
    { id: 'mvp', question: 'What is the minimum implementation to test this?', required: true },
    { id: 'pivot', question: 'What would trigger a pivot or change in direction?', required: false }
  ],
  [EHGStage.MVP]: [
    { id: 'user_value', question: 'What user value does this feature provide?', required: true },
    { id: 'integration', question: 'How does this integrate with existing features?', required: true },
    { id: 'success_metric', question: 'What metric defines success for this feature?', required: true },
    { id: 'dependencies', question: 'What dependencies or blockers exist?', required: false }
  ],
  [EHGStage.GROWTH]: [
    { id: 'retention', question: 'How does this improve user retention or engagement?', required: true },
    { id: 'scalability', question: 'What scalability considerations are there?', required: true },
    { id: 'measurement', question: 'How will you measure impact?', required: true },
    { id: 'iteration', question: 'What iteration plan exists after launch?', required: false }
  ],
  [EHGStage.SCALE]: [
    { id: 'efficiency', question: 'How does this improve operational efficiency?', required: true },
    { id: 'automation', question: 'What can be automated in this feature?', required: true },
    { id: 'enterprise', question: 'How does this support enterprise requirements?', required: true },
    { id: 'maintenance', question: 'What is the long-term maintenance burden?', required: false }
  ]
};

/**
 * Create initial Phase 0 session state
 * @param {string} sdType - The SD type being created
 * @param {string} initialContext - Initial context from conversation
 * @returns {object} Initial session state
 */
export function createSession(sdType, initialContext = '') {
  const requiresPhase0 = PHASE_0_REQUIRED_TYPES.includes(sdType);

  return {
    version: '1.0.0',
    sdType,
    requiresPhase0,
    state: requiresPhase0 ? Phase0State.DISCOVERY_QUESTIONS : Phase0State.BYPASSED,
    ehgStage: null, // Will be detected or asked
    questionsAsked: 0,
    questionsAnswered: 0,
    answers: {},
    intentSummary: null,
    outOfScope: [],
    explicitSuccessMetric: null,
    stageSignal: null,
    crystallizationScore: 0.0,
    startedAt: new Date().toISOString(),
    completedAt: null,
    initialContext,
    questionHistory: []
  };
}

/**
 * Get the next question to ask based on current state
 * @param {object} session - Current session state
 * @returns {object|null} Next question or null if no more questions needed
 */
export function getNextQuestion(session) {
  // First, check if we need to determine EHG stage
  if (!session.ehgStage) {
    return {
      id: '_ehg_stage',
      question: 'What stage is this venture at?',
      type: 'stage_selection',
      options: [
        { value: EHGStage.IDEATION, label: 'Ideation', description: 'Exploring problem space and solutions' },
        { value: EHGStage.VALIDATION, label: 'Validation', description: 'Testing hypotheses with real users' },
        { value: EHGStage.MVP, label: 'MVP', description: 'Building minimum viable product' },
        { value: EHGStage.GROWTH, label: 'Growth', description: 'Scaling user acquisition and engagement' },
        { value: EHGStage.SCALE, label: 'Scale', description: 'Enterprise and operational efficiency' }
      ]
    };
  }

  // Get stage-specific questions
  const stageQuestions = DISCOVERY_QUESTIONS[session.ehgStage] || DISCOVERY_QUESTIONS[EHGStage.MVP];

  // Find next unanswered required question
  for (const q of stageQuestions) {
    if (q.required && !session.answers[q.id]) {
      session.questionsAsked++;
      session.questionHistory.push({
        questionId: q.id,
        askedAt: new Date().toISOString()
      });
      return {
        id: q.id,
        question: q.question,
        type: 'open_ended',
        required: q.required
      };
    }
  }

  // If minimum questions not met, ask optional questions
  if (session.questionsAnswered < MIN_QUESTIONS) {
    for (const q of stageQuestions) {
      if (!q.required && !session.answers[q.id]) {
        session.questionsAsked++;
        session.questionHistory.push({
          questionId: q.id,
          askedAt: new Date().toISOString()
        });
        return {
          id: q.id,
          question: q.question,
          type: 'open_ended',
          required: false
        };
      }
    }
  }

  // Check if we need explicit success metric
  if (!session.explicitSuccessMetric && session.questionsAnswered >= MIN_QUESTIONS) {
    return {
      id: '_success_metric',
      question: 'What is the single most important metric that will tell you this was successful?',
      type: 'open_ended',
      required: true
    };
  }

  return null;
}

/**
 * Process an answer from the user
 * @param {object} session - Current session state
 * @param {string} questionId - ID of the question being answered
 * @param {string} answer - User's answer
 * @returns {object} Updated session state
 */
export function processAnswer(session, questionId, answer) {
  // Handle EHG stage selection
  if (questionId === '_ehg_stage') {
    session.ehgStage = answer;
    session.stageSignal = {
      stage: answer,
      detectedAt: new Date().toISOString(),
      method: 'user_selection'
    };
    return session;
  }

  // Handle success metric
  if (questionId === '_success_metric') {
    session.explicitSuccessMetric = answer;
    session.questionsAnswered++;
    return session;
  }

  // Handle regular answers
  session.answers[questionId] = {
    answer,
    answeredAt: new Date().toISOString()
  };
  session.questionsAnswered++;

  // Update question history
  const historyEntry = session.questionHistory.find(h => h.questionId === questionId);
  if (historyEntry) {
    historyEntry.answeredAt = new Date().toISOString();
  }

  return session;
}

/**
 * Check if STAGED_CHECKPOINT should be triggered
 * @param {object} session - Current session state
 * @returns {boolean} True if checkpoint should be triggered
 */
export function shouldTriggerCheckpoint(session) {
  return session.questionsAnswered >= MIN_QUESTIONS &&
         !session.intentSummary &&
         session.state === Phase0State.DISCOVERY_QUESTIONS;
}

/**
 * Generate intent summary (STAGED_CHECKPOINT)
 * @param {object} session - Current session state
 * @returns {string} Generated intent summary (≤500 chars)
 */
export function generateIntentSummary(session) {
  const answers = Object.entries(session.answers)
    .map(([id, data]) => `${id}: ${data.answer}`)
    .join('; ');

  const context = session.initialContext ? `Context: ${session.initialContext}. ` : '';
  const stage = session.ehgStage ? `Stage: ${session.ehgStage}. ` : '';
  const metric = session.explicitSuccessMetric ? `Success metric: ${session.explicitSuccessMetric}. ` : '';

  let summary = `${context}${stage}${answers}. ${metric}`;

  // Truncate to MAX_INTENT_SUMMARY_LENGTH
  if (summary.length > MAX_INTENT_SUMMARY_LENGTH) {
    summary = summary.substring(0, MAX_INTENT_SUMMARY_LENGTH - 3) + '...';
  }

  return summary;
}

/**
 * Set intent summary (STAGED_CHECKPOINT complete)
 * @param {object} session - Current session state
 * @param {string} summary - Intent summary (≤500 chars)
 * @returns {object} Updated session state
 */
export function setIntentSummary(session, summary) {
  // Enforce max length
  if (summary.length > MAX_INTENT_SUMMARY_LENGTH) {
    summary = summary.substring(0, MAX_INTENT_SUMMARY_LENGTH - 3) + '...';
  }

  session.intentSummary = summary;
  session.state = Phase0State.UN_DONE_PROPOSAL;
  return session;
}

/**
 * Check if UN_DONE_PROPOSAL should be triggered
 * @param {object} session - Current session state
 * @returns {boolean} True if UN_DONE_PROPOSAL should be triggered
 */
export function shouldTriggerUnDoneProposal(session) {
  return Boolean(
    session.intentSummary &&
    session.outOfScope.length === 0 &&
    session.state === Phase0State.UN_DONE_PROPOSAL
  );
}

/**
 * Generate out-of-scope suggestions (UN_DONE_PROPOSAL)
 * @param {object} _session - Current session state (unused but kept for API consistency)
 * @returns {string[]} Suggested out-of-scope items
 */
export function generateOutOfScopeSuggestions(_session) {
  // These are template suggestions based on common scope creep patterns
  const commonOutOfScope = [
    'Full redesign of existing UI components',
    'Performance optimization beyond functional requirements',
    'Support for legacy browser versions',
    'Internationalization and localization',
    'Advanced analytics and reporting',
    'Integration with third-party services not specified',
    'Automated testing infrastructure changes',
    'Documentation beyond inline code comments',
    'Mobile-responsive design (unless specified)',
    'Accessibility compliance beyond current baseline'
  ];

  // Return at least MIN_OUT_OF_SCOPE_ITEMS suggestions
  return commonOutOfScope.slice(0, Math.max(MIN_OUT_OF_SCOPE_ITEMS, 5));
}

/**
 * Set out-of-scope items (UN_DONE_PROPOSAL complete)
 * @param {object} session - Current session state
 * @param {string[]} items - Out-of-scope items
 * @returns {object} Updated session state
 */
export function setOutOfScope(session, items) {
  session.outOfScope = items;

  // Calculate crystallization score after UN_DONE_PROPOSAL
  session.crystallizationScore = calculateCrystallizationScore(session);

  // Check if threshold met
  if (session.crystallizationScore >= CRYSTALLIZATION_THRESHOLD) {
    session.state = Phase0State.COMPLETED;
    session.completedAt = new Date().toISOString();
  }

  return session;
}

/**
 * Calculate intent crystallization score
 *
 * Scoring heuristics:
 * - +0.2 if minQuestions >= 3 satisfied
 * - +0.2 if STAGED_CHECKPOINT completed with non-empty intent_summary
 * - +0.2 if UN_DONE_PROPOSAL completed with >= 3 out_of_scope items
 * - +0.2 if EHG stage-aware signal captured
 * - +0.2 if user provides explicit success metric
 *
 * @param {object} session - Current session state
 * @returns {number} Score between 0.0 and 1.0
 */
export function calculateCrystallizationScore(session) {
  let score = 0.0;

  // +0.2 if minQuestions >= 3 satisfied
  if (session.questionsAnswered >= MIN_QUESTIONS) {
    score += 0.2;
  }

  // +0.2 if STAGED_CHECKPOINT completed with non-empty intent_summary
  if (session.intentSummary && session.intentSummary.length > 0) {
    score += 0.2;
  }

  // +0.2 if UN_DONE_PROPOSAL completed with >= 3 out_of_scope items
  if (session.outOfScope.length >= MIN_OUT_OF_SCOPE_ITEMS) {
    score += 0.2;
  }

  // +0.2 if EHG stage-aware signal captured
  if (session.stageSignal && session.ehgStage) {
    score += 0.2;
  }

  // +0.2 if user provides explicit success metric
  if (session.explicitSuccessMetric && session.explicitSuccessMetric.length > 0) {
    score += 0.2;
  }

  return Math.min(1.0, score);
}

/**
 * Check if Phase 0 is complete
 * @param {object} session - Current session state
 * @returns {boolean} True if Phase 0 is complete
 */
export function isComplete(session) {
  return session.state === Phase0State.COMPLETED ||
         session.state === Phase0State.BYPASSED;
}

/**
 * Check if Phase 0 requirements are met
 * @param {object} session - Current session state
 * @returns {object} Validation result with details
 */
export function validateCompletion(session) {
  const issues = [];

  if (session.state === Phase0State.BYPASSED) {
    return { valid: true, issues: [], message: 'Phase 0 bypassed (not required for this SD type)' };
  }

  if (session.questionsAnswered < MIN_QUESTIONS) {
    issues.push(`Minimum questions not met: ${session.questionsAnswered}/${MIN_QUESTIONS}`);
  }

  if (!session.intentSummary) {
    issues.push('STAGED_CHECKPOINT not completed: no intent_summary');
  }

  if (session.outOfScope.length < MIN_OUT_OF_SCOPE_ITEMS) {
    issues.push(`UN_DONE_PROPOSAL not satisfied: ${session.outOfScope.length}/${MIN_OUT_OF_SCOPE_ITEMS} out-of-scope items`);
  }

  if (session.crystallizationScore < CRYSTALLIZATION_THRESHOLD) {
    issues.push(`Crystallization score below threshold: ${session.crystallizationScore.toFixed(2)}/${CRYSTALLIZATION_THRESHOLD}`);
  }

  return {
    valid: issues.length === 0,
    issues,
    score: session.crystallizationScore,
    threshold: CRYSTALLIZATION_THRESHOLD,
    message: issues.length === 0
      ? `Phase 0 complete (score: ${session.crystallizationScore.toFixed(2)})`
      : `Phase 0 incomplete: ${issues.join('; ')}`
  };
}

/**
 * Get Phase 0 artifacts for SD metadata enrichment
 * @param {object} session - Current session state
 * @returns {object} Artifacts to store in SD metadata
 */
export function getArtifacts(session) {
  return {
    phase_0_completed: isComplete(session),
    phase_0_bypassed: session.state === Phase0State.BYPASSED,
    intent_summary: session.intentSummary,
    out_of_scope: session.outOfScope,
    ehg_stage: session.ehgStage,
    crystallization_score: session.crystallizationScore,
    explicit_success_metric: session.explicitSuccessMetric,
    questions_asked: session.questionsAsked,
    questions_answered: session.questionsAnswered,
    discovery_answers: session.answers,
    started_at: session.startedAt,
    completed_at: session.completedAt
  };
}

// === State Persistence ===

/**
 * Save session state to file
 * @param {object} session - Session state to save
 */
export function saveSession(session) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(session, null, 2), 'utf8');
}

/**
 * Load session state from file
 * @returns {object|null} Session state or null if not found
 */
export function loadSession() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      let content = fs.readFileSync(STATE_FILE, 'utf8');
      // Remove BOM if present
      if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
      }
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn(`[phase-0] Error loading session: ${err.message}`);
  }
  return null;
}

/**
 * Clear session state file
 */
export function clearSession() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      fs.unlinkSync(STATE_FILE);
    }
  } catch (err) {
    console.warn(`[phase-0] Error clearing session: ${err.message}`);
  }
}

/**
 * Check if SD type requires Phase 0
 * @param {string} sdType - The SD type
 * @returns {boolean} True if Phase 0 is required
 */
export function requiresPhase0(sdType) {
  return PHASE_0_REQUIRED_TYPES.includes(sdType);
}

export default {
  // State constants
  Phase0State,
  EHGStage,
  PHASE_0_REQUIRED_TYPES,
  MIN_QUESTIONS,
  MIN_OUT_OF_SCOPE_ITEMS,
  MAX_INTENT_SUMMARY_LENGTH,
  CRYSTALLIZATION_THRESHOLD,
  MAX_QUESTIONS_PER_MESSAGE,
  DISCOVERY_QUESTIONS,

  // Session management
  createSession,
  saveSession,
  loadSession,
  clearSession,

  // Discovery flow
  getNextQuestion,
  processAnswer,

  // STAGED_CHECKPOINT
  shouldTriggerCheckpoint,
  generateIntentSummary,
  setIntentSummary,

  // UN_DONE_PROPOSAL
  shouldTriggerUnDoneProposal,
  generateOutOfScopeSuggestions,
  setOutOfScope,

  // Scoring and validation
  calculateCrystallizationScore,
  isComplete,
  validateCompletion,
  requiresPhase0,

  // Artifacts
  getArtifacts
};
