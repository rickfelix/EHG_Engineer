/**
 * Follow-up Question Generator - Context-Aware Clarification
 *
 * Generates targeted follow-up questions based on detected feedback mode
 * and model disagreements. Only asks when confidence is low.
 *
 * Part of: SD-LEO-FEAT-INTELLIGENT-UAT-FEEDBACK-001
 *
 * @module lib/uat/follow-up-generator
 * @version 1.0.0
 */

import { FEEDBACK_MODES } from './feedback-analyzer.js';

// Question templates by mode
const MODE_QUESTIONS = {
  [FEEDBACK_MODES.STRATEGIC]: {
    severity: 'How critical is this to the overall product direction? Is this a blocker or something to revisit later?',
    action: 'Should we pause current work to address this, or document it for the next planning cycle?',
    scope: 'Does this require rethinking the approach, or is it a matter of adjusting priorities?'
  },
  [FEEDBACK_MODES.PRODUCT]: {
    severity: 'How much does this impact the user experience? Would users notice or be confused?',
    action: 'Is this a quick UX fix, or does it need design review?',
    scope: 'Is this specific to one screen, or does it affect the overall flow?'
  },
  [FEEDBACK_MODES.TECHNICAL]: {
    severity: 'Is this a blocking bug, intermittent issue, or edge case?',
    action: 'Can this be quick-fixed (<50 lines), or does it need deeper investigation?',
    scope: 'Is this isolated to one component, or could it affect other areas?'
  },
  [FEEDBACK_MODES.POLISH]: {
    severity: 'Is this noticeable enough to fix before shipping, or can it wait?',
    action: 'Quick tweak or add to the polish backlog?',
    scope: 'Just this element, or should we review similar elements?'
  }
};

// Disagreement-specific questions
const DISAGREEMENT_QUESTIONS = {
  action: {
    'quick-fix_vs_create-sd': 'The issue seems borderline. Is this small enough for a quick fix, or complex enough to warrant a full SD?',
    'create-sd_vs_backlog': 'Should we tackle this now (new SD), or is it lower priority (backlog)?',
    'quick-fix_vs_backlog': 'Quick fix now, or save it for later?'
  },
  severity: {
    'critical_vs_major': 'Is this actually blocking work, or just important to fix soon?',
    'major_vs_minor': 'Is this impacting users noticeably, or more of a quality-of-life improvement?',
    'minor_vs_enhancement': 'Is this a fix for something broken, or a new improvement?'
  }
};

/**
 * Follow-up Question Generator
 */
export class FollowUpGenerator {
  constructor() {
    this.modeQuestions = MODE_QUESTIONS;
    this.disagreementQuestions = DISAGREEMENT_QUESTIONS;
  }

  /**
   * Generate follow-up questions for an issue
   * @param {Object} issue - Issue with consensus data
   * @returns {Object} Follow-up question(s) or null if not needed
   */
  generate(issue) {
    const { consensus, detectedMode } = issue;

    if (!consensus || !consensus.needsFollowUp) {
      return null;
    }

    const questions = [];

    // Add disagreement-specific questions
    if (consensus.agreements) {
      const disagreeQuestions = this.getDisagreementQuestions(consensus.agreements);
      questions.push(...disagreeQuestions);
    }

    // Add mode-specific question if still unclear
    if (questions.length === 0 && consensus.confidenceLevel === 'low') {
      const modeQuestion = this.getModeQuestion(detectedMode, consensus);
      if (modeQuestion) {
        questions.push(modeQuestion);
      }
    }

    // Fallback generic question
    if (questions.length === 0) {
      questions.push({
        type: 'generic',
        question: 'How would you classify this issue?',
        options: [
          { label: 'Quick-fix', value: 'quick-fix', description: 'Small fix, <50 lines' },
          { label: 'New SD', value: 'create-sd', description: 'Needs planning and tracking' },
          { label: 'Backlog', value: 'backlog', description: 'Address later' },
          { label: 'Skip', value: 'skip', description: 'Not an issue' }
        ]
      });
    }

    return {
      issueId: issue.id,
      issueText: issue.text,
      mode: detectedMode,
      confidence: consensus.confidence,
      questions,
      context: {
        gptSuggestion: consensus.modelComparison?.gpt?.action,
        geminiSuggestion: consensus.modelComparison?.gemini?.action,
        reason: consensus.followUpReason
      }
    };
  }

  /**
   * Get questions specific to model disagreements
   */
  getDisagreementQuestions(agreements) {
    const questions = [];

    // Action disagreement
    if (!agreements.action.agrees) {
      const key = `${agreements.action.gpt}_vs_${agreements.action.gemini}`;
      const reverseKey = `${agreements.action.gemini}_vs_${agreements.action.gpt}`;
      const template = this.disagreementQuestions.action[key] || this.disagreementQuestions.action[reverseKey];

      questions.push({
        type: 'action_clarification',
        question: template || `GPT suggests "${agreements.action.gpt}", Gemini suggests "${agreements.action.gemini}". Which feels right?`,
        options: [
          { label: this.formatAction(agreements.action.gpt), value: agreements.action.gpt, source: 'gpt' },
          { label: this.formatAction(agreements.action.gemini), value: agreements.action.gemini, source: 'gemini' }
        ],
        disagreement: { gpt: agreements.action.gpt, gemini: agreements.action.gemini }
      });
    }

    // Severity disagreement (only if significant)
    if (!agreements.severity.agrees && !agreements.severity.close) {
      const key = `${agreements.severity.gpt}_vs_${agreements.severity.gemini}`;
      const reverseKey = `${agreements.severity.gemini}_vs_${agreements.severity.gpt}`;
      const template = this.disagreementQuestions.severity[key] || this.disagreementQuestions.severity[reverseKey];

      questions.push({
        type: 'severity_clarification',
        question: template || `How severe is this? GPT says "${agreements.severity.gpt}", Gemini says "${agreements.severity.gemini}".`,
        options: [
          { label: this.formatSeverity(agreements.severity.gpt), value: agreements.severity.gpt, source: 'gpt' },
          { label: this.formatSeverity(agreements.severity.gemini), value: agreements.severity.gemini, source: 'gemini' }
        ],
        disagreement: { gpt: agreements.severity.gpt, gemini: agreements.severity.gemini }
      });
    }

    return questions;
  }

  /**
   * Get mode-specific clarification question
   */
  getModeQuestion(mode, consensus) {
    const modeTemplates = this.modeQuestions[mode] || this.modeQuestions[FEEDBACK_MODES.PRODUCT];

    // Determine which dimension needs clarification
    if (consensus.agreements && !consensus.agreements.action.agrees) {
      return {
        type: 'mode_action',
        question: modeTemplates.action,
        mode
      };
    }

    if (consensus.agreements && !consensus.agreements.severity.agrees) {
      return {
        type: 'mode_severity',
        question: modeTemplates.severity,
        mode
      };
    }

    return {
      type: 'mode_scope',
      question: modeTemplates.scope,
      mode
    };
  }

  /**
   * Format action for display
   */
  formatAction(action) {
    const labels = {
      'quick-fix': 'Quick Fix (small, do now)',
      'create-sd': 'Create SD (needs tracking)',
      'backlog': 'Add to Backlog (later)'
    };
    return labels[action] || action;
  }

  /**
   * Format severity for display
   */
  formatSeverity(severity) {
    const labels = {
      'critical': 'Critical (blocking)',
      'major': 'Major (important)',
      'minor': 'Minor (low impact)',
      'enhancement': 'Enhancement (nice to have)'
    };
    return labels[severity] || severity;
  }

  /**
   * Process user's answer to follow-up question
   * @param {Object} issue - Original issue
   * @param {Object} answer - User's answer
   * @returns {Object} Updated issue with user clarification
   */
  processAnswer(issue, answer) {
    const updated = { ...issue };

    // Update based on answer type
    if (answer.type === 'action_clarification' || answer.type === 'generic') {
      updated.finalAction = answer.value;
      updated.actionSource = 'user_clarification';
    }

    if (answer.type === 'severity_clarification') {
      updated.finalSeverity = answer.value;
      updated.severitySource = 'user_clarification';
    }

    // Increase confidence since user clarified
    if (updated.consensus) {
      updated.consensus = {
        ...updated.consensus,
        confidence: Math.min(1, updated.consensus.confidence + 0.3),
        confidenceLevel: 'high',
        userClarified: true
      };
    }

    updated.followUpAnswered = true;
    updated.followUpAnswer = answer;

    return updated;
  }

  /**
   * Generate follow-ups for batch of issues
   */
  generateBatch(issues) {
    return issues
      .map(issue => this.generate(issue))
      .filter(Boolean);
  }
}

// Export singleton instance
export const followUpGenerator = new FollowUpGenerator();

export default FollowUpGenerator;
