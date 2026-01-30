/**
 * Phase 0 LEO Integration Module
 *
 * Part of SD-LEO-INFRA-PHASE-INTENT-DISCOVERY-001
 *
 * Provides integration points for the `/leo create` command workflow:
 * - Gates feature/enhancement SDs with mandatory Phase 0
 * - Generates one-question-at-a-time prompts for Claude
 * - Validates Phase 0 completion before SD creation
 * - Enriches SD metadata with Phase 0 artifacts
 */

import {
  createSession,
  loadSession,
  saveSession,
  clearSession,
  getNextQuestion,
  processAnswer,
  shouldTriggerCheckpoint,
  generateIntentSummary,
  setIntentSummary,
  shouldTriggerUnDoneProposal,
  generateOutOfScopeSuggestions,
  setOutOfScope,
  isComplete,
  validateCompletion,
  requiresPhase0,
  getArtifacts,
  CRYSTALLIZATION_THRESHOLD,
  MIN_QUESTIONS,
  MIN_OUT_OF_SCOPE_ITEMS,
  MAX_QUESTIONS_PER_MESSAGE
} from './engine.js';

/**
 * Start Phase 0 for SD creation
 * Returns the first question to ask (one-question-at-a-time)
 *
 * @param {string} sdType - The SD type being created
 * @param {string} initialContext - Initial context from conversation
 * @returns {object} Result with session and first question (or bypass info)
 */
export function startPhase0(sdType, initialContext = '') {
  // Check if Phase 0 is required
  if (!requiresPhase0(sdType)) {
    const session = createSession(sdType, initialContext);
    saveSession(session);
    return {
      required: false,
      bypassed: true,
      session,
      message: `Phase 0 not required for SD type: ${sdType}. Proceeding to SD creation.`
    };
  }

  // Create new session
  const session = createSession(sdType, initialContext);
  saveSession(session);

  // Get first question
  const question = getNextQuestion(session);

  return {
    required: true,
    bypassed: false,
    session,
    question,
    message: `Phase 0 Intent Discovery started for ${sdType} SD.`
  };
}

/**
 * Continue Phase 0 with user's answer
 * Returns the next question or completion status
 *
 * @param {string} questionId - ID of the question being answered
 * @param {string|string[]} answer - User's answer
 * @returns {object} Result with next question or completion info
 */
export function continuePhase0(questionId, answer) {
  // Load existing session
  let session = loadSession();

  if (!session) {
    return {
      error: true,
      message: 'No Phase 0 session found. Run startPhase0 first.'
    };
  }

  if (isComplete(session)) {
    return {
      complete: true,
      session,
      artifacts: getArtifacts(session),
      message: 'Phase 0 already complete.'
    };
  }

  // Process the answer
  session = processAnswer(session, questionId, answer);
  saveSession(session);

  // Check for STAGED_CHECKPOINT trigger
  if (shouldTriggerCheckpoint(session)) {
    const summary = generateIntentSummary(session);
    return {
      checkpoint: true,
      pattern: 'STAGED_CHECKPOINT',
      suggestedSummary: summary,
      session,
      instruction: `STAGED_CHECKPOINT: Review and confirm the intent summary below (max 500 chars):\n\n"${summary}"\n\nConfirm this summary or provide a revised version.`
    };
  }

  // Check for UN_DONE_PROPOSAL trigger
  if (shouldTriggerUnDoneProposal(session)) {
    const suggestions = generateOutOfScopeSuggestions(session);
    return {
      proposal: true,
      pattern: 'UN_DONE_PROPOSAL',
      suggestedItems: suggestions,
      session,
      instruction: `UN_DONE_PROPOSAL: Define what is explicitly OUT OF SCOPE for this SD.\n\nSuggested items (select at least ${MIN_OUT_OF_SCOPE_ITEMS}):\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nConfirm these items or provide your own list.`
    };
  }

  // Get next question
  const nextQuestion = getNextQuestion(session);

  if (!nextQuestion && !session.intentSummary) {
    // Ready for STAGED_CHECKPOINT
    const summary = generateIntentSummary(session);
    return {
      checkpoint: true,
      pattern: 'STAGED_CHECKPOINT',
      suggestedSummary: summary,
      session,
      instruction: `STAGED_CHECKPOINT: Review and confirm the intent summary below (max 500 chars):\n\n"${summary}"\n\nConfirm this summary or provide a revised version.`
    };
  }

  if (!nextQuestion && session.intentSummary && session.outOfScope.length === 0) {
    // Ready for UN_DONE_PROPOSAL
    const suggestions = generateOutOfScopeSuggestions(session);
    return {
      proposal: true,
      pattern: 'UN_DONE_PROPOSAL',
      suggestedItems: suggestions,
      session,
      instruction: `UN_DONE_PROPOSAL: Define what is explicitly OUT OF SCOPE for this SD.\n\nSuggested items (select at least ${MIN_OUT_OF_SCOPE_ITEMS}):\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nConfirm these items or provide your own list.`
    };
  }

  if (nextQuestion) {
    return {
      question: nextQuestion,
      session,
      progress: {
        questionsAnswered: session.questionsAnswered,
        minQuestions: MIN_QUESTIONS,
        state: session.state
      }
    };
  }

  // Check completion
  const validation = validateCompletion(session);

  if (validation.valid) {
    return {
      complete: true,
      session,
      artifacts: getArtifacts(session),
      message: validation.message
    };
  }

  return {
    incomplete: true,
    session,
    validation,
    message: validation.message
  };
}

/**
 * Confirm STAGED_CHECKPOINT with intent summary
 *
 * @param {string} summary - Confirmed or revised intent summary
 * @returns {object} Result with next step (UN_DONE_PROPOSAL)
 */
export function confirmCheckpoint(summary) {
  let session = loadSession();

  if (!session) {
    return {
      error: true,
      message: 'No Phase 0 session found.'
    };
  }

  session = setIntentSummary(session, summary);
  saveSession(session);

  // Trigger UN_DONE_PROPOSAL
  const suggestions = generateOutOfScopeSuggestions(session);
  return {
    checkpointComplete: true,
    proposal: true,
    pattern: 'UN_DONE_PROPOSAL',
    suggestedItems: suggestions,
    session,
    instruction: `UN_DONE_PROPOSAL: Define what is explicitly OUT OF SCOPE for this SD.\n\nSuggested items (select at least ${MIN_OUT_OF_SCOPE_ITEMS}):\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nConfirm these items or provide your own list.`
  };
}

/**
 * Confirm UN_DONE_PROPOSAL with out-of-scope items
 *
 * @param {string[]} items - Confirmed or revised out-of-scope items
 * @returns {object} Result with completion status
 */
export function confirmUnDoneProposal(items) {
  let session = loadSession();

  if (!session) {
    return {
      error: true,
      message: 'No Phase 0 session found.'
    };
  }

  session = setOutOfScope(session, items);
  saveSession(session);

  const validation = validateCompletion(session);

  if (validation.valid) {
    return {
      complete: true,
      session,
      artifacts: getArtifacts(session),
      validation,
      message: `Phase 0 complete! Crystallization score: ${session.crystallizationScore.toFixed(2)}`
    };
  }

  return {
    incomplete: true,
    session,
    validation,
    message: validation.message
  };
}

/**
 * Gate check for /leo create command
 * Determines if Phase 0 is required and returns appropriate action
 *
 * @param {string} sdType - The SD type being created
 * @returns {object} Gate result
 */
export function checkGate(sdType) {
  // Check for existing session
  const existingSession = loadSession();

  if (existingSession && !isComplete(existingSession)) {
    // Resume existing session
    return {
      action: 'resume',
      session: existingSession,
      message: 'Resuming existing Phase 0 session.'
    };
  }

  // Check if Phase 0 required
  if (!requiresPhase0(sdType)) {
    return {
      action: 'proceed',
      required: false,
      message: `Phase 0 not required for SD type: ${sdType}.`
    };
  }

  // Phase 0 required but not started
  return {
    action: 'start',
    required: true,
    message: `Phase 0 required for ${sdType} SD. Starting Intent Discovery.`
  };
}

/**
 * Get current Phase 0 status
 *
 * @returns {object} Current status
 */
export function getStatus() {
  const session = loadSession();

  if (!session) {
    return {
      active: false,
      message: 'No Phase 0 session active.'
    };
  }

  const validation = validateCompletion(session);

  return {
    active: true,
    state: session.state,
    sdType: session.sdType,
    ehgStage: session.ehgStage,
    questionsAnswered: session.questionsAnswered,
    minQuestions: MIN_QUESTIONS,
    hasIntentSummary: !!session.intentSummary,
    outOfScopeCount: session.outOfScope.length,
    minOutOfScope: MIN_OUT_OF_SCOPE_ITEMS,
    crystallizationScore: session.crystallizationScore,
    threshold: CRYSTALLIZATION_THRESHOLD,
    complete: isComplete(session),
    validation
  };
}

/**
 * Reset/cancel Phase 0 session
 *
 * @returns {object} Result
 */
export function reset() {
  clearSession();
  return {
    reset: true,
    message: 'Phase 0 session cleared.'
  };
}

/**
 * Generate AskUserQuestion format for Claude
 * Enforces one-question-at-a-time (maxQuestionsPerMessage=1)
 *
 * @param {object} question - Question from getNextQuestion
 * @returns {object} AskUserQuestion format
 */
export function formatForAskUserQuestion(question) {
  if (!question) {
    return null;
  }

  // Stage selection question
  if (question.type === 'stage_selection') {
    return {
      questions: [{
        question: question.question,
        header: 'EHG Stage',
        multiSelect: false,
        options: question.options.map(opt => ({
          label: opt.label,
          description: opt.description
        }))
      }]
    };
  }

  // Open-ended question - use options for common patterns or free-form
  return {
    questions: [{
      question: question.question,
      header: 'Discovery',
      multiSelect: false,
      options: [
        { label: 'Provide answer', description: 'Type your response' }
      ]
    }]
  };
}

/**
 * Get integration instructions for Claude
 * Returns markdown instructions for how to use Phase 0 in /leo create
 *
 * @returns {string} Instructions
 */
export function getIntegrationInstructions() {
  return `
## Phase 0 Intent Discovery Integration

When processing \`/leo create\` for **feature** or **enhancement** SD types:

### 1. Check Gate
\`\`\`javascript
const result = checkGate(sdType);
// result.action: 'start' | 'resume' | 'proceed'
\`\`\`

### 2. If action is 'start' or 'resume'
Run the discovery flow one question at a time:

\`\`\`javascript
// Start new session
const start = startPhase0(sdType, conversationContext);
// Ask start.question using AskUserQuestion (one question only!)

// On each answer
const next = continuePhase0(questionId, userAnswer);
// If next.question → ask it
// If next.checkpoint → confirm STAGED_CHECKPOINT
// If next.proposal → confirm UN_DONE_PROPOSAL
// If next.complete → proceed to SD creation
\`\`\`

### 3. On STAGED_CHECKPOINT
Present the suggested intent summary and get confirmation:
\`\`\`javascript
const result = confirmCheckpoint(confirmedOrRevisedSummary);
\`\`\`

### 4. On UN_DONE_PROPOSAL
Present out-of-scope suggestions and get confirmation:
\`\`\`javascript
const result = confirmUnDoneProposal(confirmedItems);
\`\`\`

### 5. When Complete
Get artifacts for SD metadata:
\`\`\`javascript
const artifacts = getArtifacts(session);
// Include in SD's metadata.phase_0 field
\`\`\`

### Key Rules
- **ONE question per message** (maxQuestionsPerMessage=1)
- **Minimum 3 questions** before checkpoint
- **Minimum 3 out-of-scope items** required
- **Score threshold: 0.7** for completion
- **BLOCKED** if Phase 0 incomplete for feature/enhancement
`;
}

export default {
  startPhase0,
  continuePhase0,
  confirmCheckpoint,
  confirmUnDoneProposal,
  checkGate,
  getStatus,
  reset,
  formatForAskUserQuestion,
  getIntegrationInstructions,

  // Re-export key constants
  CRYSTALLIZATION_THRESHOLD,
  MIN_QUESTIONS,
  MIN_OUT_OF_SCOPE_ITEMS,
  MAX_QUESTIONS_PER_MESSAGE
};
