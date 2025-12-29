/**
 * Hypothesis Tracker
 *
 * Mixin for tracking alternative hypotheses during agent analysis.
 * Provides methods to record what was considered and rejected,
 * proving no tunnel vision occurred.
 *
 * Applied ONLY to agents with MEDIUM+ complexity tasks.
 *
 * @module lib/agents/hypothesis-tracker
 */

const crypto = require('crypto');

/**
 * Rejection reason codes
 */
const REJECTION_CODES = {
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
  CONFLICTING_EVIDENCE: 'CONFLICTING_EVIDENCE',
  SUPERSEDED: 'SUPERSEDED',
  INVALID_CONTEXT: 'INVALID_CONTEXT',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  NA_DETERMINISTIC: 'NA_DETERMINISTIC'
};

/**
 * Hypothesis status values
 */
const HYPOTHESIS_STATUS = {
  CONSIDERING: 'considering',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected'
};

/**
 * Hypothesis Tracker class
 * Tracks hypotheses considered during agent analysis
 */
class HypothesisTracker {
  /**
   * @param {string} agentName - Name of the agent using this tracker
   */
  constructor(agentName) {
    this.agentName = agentName;
    this._hypotheses = new Map();
    this._rejectedHypotheses = [];
    this._activeHypothesis = null;
    this._createdAt = new Date().toISOString();
  }

  /**
   * Register a hypothesis being considered
   *
   * @param {string} id - Unique hypothesis ID (or auto-generated)
   * @param {Object} hypothesis - The hypothesis details
   * @returns {HypothesisTracker} For chaining
   */
  considerHypothesis(id, hypothesis) {
    const hypothesisId = id || this._generateId(hypothesis);

    this._hypotheses.set(hypothesisId, {
      ...hypothesis,
      id: hypothesisId,
      considered_at: new Date().toISOString(),
      status: HYPOTHESIS_STATUS.CONSIDERING,
      confidence_range: hypothesis.confidence_range || [0.3, 0.7]
    });

    this._activeHypothesis = hypothesisId;
    return this;
  }

  /**
   * Accept a hypothesis as the working conclusion
   *
   * @param {string} id - Hypothesis ID to accept
   * @param {string} reason - Why it was accepted
   * @param {Object} evidence - Supporting evidence
   * @returns {HypothesisTracker} For chaining
   */
  acceptHypothesis(id, reason, evidence = {}) {
    const hypothesis = this._hypotheses.get(id);
    if (hypothesis) {
      hypothesis.status = HYPOTHESIS_STATUS.ACCEPTED;
      hypothesis.accepted_reason = reason;
      hypothesis.evidence = evidence;
      hypothesis.accepted_at = new Date().toISOString();
    }
    return this;
  }

  /**
   * Reject a hypothesis with reasoning
   *
   * @param {string} id - Hypothesis ID to reject
   * @param {string} reason - Why it was rejected
   * @param {Object} counter_evidence - What disproved it
   * @param {string} code - Rejection code (from REJECTION_CODES)
   * @returns {HypothesisTracker} For chaining
   */
  rejectHypothesis(id, reason, counter_evidence = {}, code = REJECTION_CODES.LOW_CONFIDENCE) {
    const hypothesis = this._hypotheses.get(id);
    if (hypothesis) {
      hypothesis.status = HYPOTHESIS_STATUS.REJECTED;
      hypothesis.rejected_reason = reason;
      hypothesis.counter_evidence = counter_evidence;
      hypothesis.rejection_code = code;
      hypothesis.rejected_at = new Date().toISOString();

      // Add to rejected list (for serialization)
      this._rejectedHypotheses.push({
        id,
        alternative_id: hypothesis.id,
        alternative_name: hypothesis.text || hypothesis.description || hypothesis.name || id,
        rejection_reason: {
          code: code,
          description: this._truncateString(reason, 200)
        },
        confidence_at_rejection: hypothesis.confidence_range?.[1] || 0.5,
        evaluated_at: hypothesis.rejected_at
      });
    }
    return this;
  }

  /**
   * Mark current hypothesis as uncertain
   *
   * @param {string} id - Hypothesis ID
   * @param {Array<string>} uncertainties - List of uncertain factors
   * @returns {HypothesisTracker} For chaining
   */
  markUncertain(id, uncertainties) {
    const hypothesis = this._hypotheses.get(id);
    if (hypothesis) {
      hypothesis.uncertainties = uncertainties;
      hypothesis.confidence_range = this._adjustConfidenceForUncertainty(
        hypothesis.confidence_range,
        uncertainties.length
      );
    }
    return this;
  }

  /**
   * Add a "no alternatives" justification (for deterministic tasks)
   *
   * @param {string} reason - Why no alternatives exist
   * @returns {HypothesisTracker} For chaining
   */
  addDeterministicBypass(reason) {
    this._rejectedHypotheses.push({
      id: 'N/A',
      alternative_id: 'N/A',
      alternative_name: 'No plausible alternatives',
      rejection_reason: {
        code: REJECTION_CODES.NA_DETERMINISTIC,
        description: this._truncateString(reason, 200)
      },
      confidence_at_rejection: 1.0,
      evaluated_at: new Date().toISOString()
    });
    return this;
  }

  /**
   * Get all rejected hypotheses for audit
   * @returns {Array} Rejected hypotheses list
   */
  getRejectedHypotheses() {
    return [...this._rejectedHypotheses];
  }

  /**
   * Get hypothesis tracking summary
   * @returns {Object} Summary stats
   */
  getSummary() {
    const accepted = [];
    const considering = [];

    for (const [id, h] of this._hypotheses) {
      if (h.status === HYPOTHESIS_STATUS.ACCEPTED) accepted.push(id);
      else if (h.status === HYPOTHESIS_STATUS.CONSIDERING) considering.push(id);
    }

    return {
      total_considered: this._hypotheses.size,
      accepted: accepted.length,
      rejected: this._rejectedHypotheses.length,
      still_considering: considering.length,
      rejected_hypotheses: this._rejectedHypotheses,
      has_deterministic_bypass: this._rejectedHypotheses.some(
        h => h.rejection_reason?.code === REJECTION_CODES.NA_DETERMINISTIC
      )
    };
  }

  /**
   * Serialize to format for agent_artifacts.metadata
   * @returns {Object} Serialized rejected alternatives
   */
  toArtifactMetadata() {
    return {
      _schema_version: '1.0.0',
      rejected_alternatives: this._rejectedHypotheses.slice(0, 10), // Limit to 10
      rejection_count: this._rejectedHypotheses.length,
      last_rejection: this._rejectedHypotheses.length > 0
        ? this._rejectedHypotheses[this._rejectedHypotheses.length - 1].evaluated_at
        : null
    };
  }

  /**
   * Apply tracker to an agent instance
   *
   * @param {Object} agent - Agent to enhance
   * @returns {Object} Enhanced agent
   */
  static applyTo(agent) {
    const tracker = new HypothesisTracker(agent.name);

    // Attach reference to rejected hypotheses
    Object.defineProperty(agent, '_rejectedHypotheses', {
      get: () => tracker._rejectedHypotheses,
      enumerable: true,
      configurable: true
    });

    // Attach methods
    agent.considerHypothesis = (id, hypothesis) => {
      tracker.considerHypothesis(id, hypothesis);
      return agent;
    };

    agent.acceptHypothesis = (id, reason, evidence) => {
      tracker.acceptHypothesis(id, reason, evidence);
      return agent;
    };

    agent.rejectHypothesis = (id, reason, counter_evidence, code) => {
      tracker.rejectHypothesis(id, reason, counter_evidence, code);
      return agent;
    };

    agent.markUncertain = (id, uncertainties) => {
      tracker.markUncertain(id, uncertainties);
      return agent;
    };

    agent.addDeterministicBypass = (reason) => {
      tracker.addDeterministicBypass(reason);
      return agent;
    };

    agent.getReasoningSummary = () => tracker.getSummary();

    agent.getHypothesisArtifactMetadata = () => tracker.toArtifactMetadata();

    // Store tracker reference
    agent._hypothesisTracker = tracker;

    return agent;
  }

  /**
   * Check if agent has hypothesis tracker applied
   * @param {Object} agent - Agent to check
   * @returns {boolean}
   */
  static hasTracker(agent) {
    return !!(agent._hypothesisTracker || agent._rejectedHypotheses);
  }

  // Private helper methods

  _generateId(hypothesis) {
    const content = JSON.stringify(hypothesis);
    return crypto.createHash('md5').update(content).digest('hex').substring(0, 8);
  }

  _truncateString(str, maxLength) {
    if (!str || typeof str !== 'string') return '';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }

  _adjustConfidenceForUncertainty(range, uncertaintyCount) {
    const reduction = Math.min(0.3, uncertaintyCount * 0.1);
    return [
      Math.max(0, range[0] - reduction),
      Math.max(0.1, range[1] - reduction)
    ];
  }
}

module.exports = {
  HypothesisTracker,
  REJECTION_CODES,
  HYPOTHESIS_STATUS
};
