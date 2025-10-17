/**
 * LEO Protocol Status Validator
 * Enforces recommended status best practices
 */

class StatusValidator {
  constructor() {
    // Define valid statuses for each document type
    this.validStatuses = {
      SD: {
        all: ['draft', 'active', 'in_progress', 'on_hold', 'completed', 'complete', 'approved', 'pending_approval', 'cancelled', 'deferred'],
        preferred: ['draft', 'active', 'on_hold', 'cancelled', 'completed', 'deferred'],
        deprecated: {
          'in_progress': 'active',
          'complete': 'completed',
          'approved': 'completed',
          'pending_approval': 'active'  // Added: pending_approval is a PRD status, normalize to active for SDs
        }
      },
      PRD: {
        all: ['draft', 'planning', 'ready', 'active', 'in_progress', 'development', 'testing', 'verification', 'verification_complete', 'approved', 'completed', 'complete', 'implemented', 'pending_approval', 'ready_for_implementation', 'rejected', 'on_hold', 'cancelled'],
        preferred: ['draft', 'planning', 'ready', 'in_progress', 'development', 'testing', 'verification', 'approved', 'rejected', 'on_hold', 'cancelled'],
        deprecated: {
          'active': 'in_progress',
          'completed': 'approved',
          'complete': 'approved',
          'implemented': 'completed',
          'pending_approval': 'verification',
          'ready_for_implementation': 'ready',
          'verification_complete': 'approved'
        }
      },
      EES: {
        all: ['pending', 'in_progress', 'completed', 'failed', 'blocked', 'skipped', 'cancelled'],
        preferred: ['pending', 'in_progress', 'completed', 'failed', 'blocked', 'skipped', 'cancelled'],
        deprecated: {} // All EES statuses are preferred
      }
    };

    // Define valid status transitions
    this.transitions = {
      SD: {
        'draft': ['active', 'cancelled', 'deferred'],
        'active': ['on_hold', 'cancelled', 'completed', 'deferred'],
        'on_hold': ['active', 'cancelled', 'deferred'],
        'deferred': ['active', 'cancelled'],
        'cancelled': [],
        'completed': []
      },
      PRD: {
        'draft': ['planning', 'cancelled'],
        'planning': ['ready', 'on_hold', 'cancelled'],
        'ready': ['in_progress', 'development', 'on_hold', 'cancelled'],
        'in_progress': ['development', 'testing', 'verification', 'on_hold', 'cancelled'],
        'development': ['testing', 'verification', 'on_hold', 'cancelled'],
        'testing': ['verification', 'approved', 'rejected', 'on_hold'],
        'verification': ['approved', 'rejected', 'on_hold'],
        'approved': [],
        'rejected': ['in_progress', 'development', 'cancelled'],
        'on_hold': ['planning', 'ready', 'in_progress', 'development', 'testing', 'cancelled'],
        'cancelled': []
      },
      EES: {
        'pending': ['in_progress', 'blocked', 'skipped'],
        'in_progress': ['completed', 'failed', 'blocked'],
        'completed': [],
        'failed': ['pending', 'skipped'],
        'blocked': ['pending', 'skipped'],
        'skipped': [],
        'cancelled': []
      }
    };
  }

  /**
   * Validate if a status is valid for a document type
   */
  isValidStatus(docType, status) {
    const validList = this.validStatuses[docType];
    if (!validList) {
      throw new Error(`Unknown document type: ${docType}`);
    }
    return validList.all.includes(status);
  }

  /**
   * Check if a status is preferred (recommended)
   */
  isPreferredStatus(docType, status) {
    const validList = this.validStatuses[docType];
    if (!validList) {
      throw new Error(`Unknown document type: ${docType}`);
    }
    return validList.preferred.includes(status);
  }

  /**
   * Normalize a status to its preferred equivalent
   */
  normalizeStatus(docType, status) {
    const validList = this.validStatuses[docType];
    if (!validList) {
      throw new Error(`Unknown document type: ${docType}`);
    }

    let normalizedStatus = status;

    // If deprecated, use the preferred alternative
    if (validList.deprecated[status]) {
      console.log(`📝 Normalizing ${docType} status: "${status}" → "${validList.deprecated[status]}"`);
      normalizedStatus = validList.deprecated[status];
    }

    // If valid, proceed
    if (validList.all.includes(normalizedStatus)) {
      // For SD statuses, capitalize first letter for UI consistency
      // This ensures dashboard filters work correctly
      if (docType === 'SD') {
        return normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1).toLowerCase();
      }
      return normalizedStatus;
    }

    // Invalid status
    throw new Error(`Invalid ${docType} status: ${status}`);
  }

  /**
   * Validate a status transition
   */
  isValidTransition(docType, fromStatus, toStatus) {
    const transitions = this.transitions[docType];
    if (!transitions) {
      throw new Error(`Unknown document type: ${docType}`);
    }

    // Normalize statuses first
    const normalizedFrom = this.normalizeStatus(docType, fromStatus);
    const normalizedTo = this.normalizeStatus(docType, toStatus);

    // Check if transition is allowed
    const allowedTransitions = transitions[normalizedFrom] || [];
    return allowedTransitions.includes(normalizedTo);
  }

  /**
   * Get recommended status for a given scenario
   */
  getRecommendedStatus(docType, scenario) {
    const recommendations = {
      SD: {
        'created': 'draft',
        'approved': 'active',
        'working': 'active',
        'paused': 'on_hold',
        'stopped': 'cancelled',
        'completed': 'completed',
        'done': 'completed',
        'postponed': 'deferred',
        'delayed': 'deferred'
      },
      PRD: {
        'created': 'draft',
        'planning': 'planning',
        'ready_for_exec': 'ready',
        'executing': 'in_progress',
        'verifying': 'testing',
        'accepted': 'approved',
        'failed': 'rejected',
        'paused': 'on_hold',
        'stopped': 'cancelled'
      },
      EES: {
        'created': 'pending',
        'started': 'in_progress',
        'working': 'in_progress',
        'done': 'completed',
        'error': 'failed',
        'waiting': 'blocked',
        'not_needed': 'skipped',
        'stopped': 'cancelled'
      }
    };

    const docRecommendations = recommendations[docType];
    if (!docRecommendations) {
      throw new Error(`Unknown document type: ${docType}`);
    }

    return docRecommendations[scenario] || null;
  }

  /**
   * Validate and normalize a status update
   */
  validateStatusUpdate(docType, currentStatus, newStatus, agent) {
    // Check if status is valid
    if (!this.isValidStatus(docType, newStatus)) {
      return {
        valid: false,
        error: `Invalid ${docType} status: ${newStatus}`,
        suggestion: this.getRecommendedStatus(docType, newStatus)
      };
    }

    // Normalize to preferred status
    const normalizedStatus = this.normalizeStatus(docType, newStatus);

    // Check if transition is valid (if current status provided)
    if (currentStatus && !this.isValidTransition(docType, currentStatus, normalizedStatus)) {
      const allowedTransitions = this.transitions[docType][currentStatus] || [];
      return {
        valid: false,
        error: `Invalid transition from "${currentStatus}" to "${newStatus}"`,
        allowedTransitions,
        normalizedStatus
      };
    }

    // Check agent permissions
    const agentPermissions = this.getAgentPermissions(docType, agent);
    if (agent && !agentPermissions.includes(normalizedStatus)) {
      return {
        valid: false,
        error: `Agent ${agent} cannot set ${docType} status to "${newStatus}"`,
        allowedStatuses: agentPermissions,
        normalizedStatus
      };
    }

    // Return success with normalized status
    return {
      valid: true,
      normalizedStatus,
      isPreferred: this.isPreferredStatus(docType, normalizedStatus),
      warning: normalizedStatus !== newStatus ? 
        `Status normalized from "${newStatus}" to "${normalizedStatus}"` : null
    };
  }

  /**
   * Get statuses an agent is allowed to set
   */
  getAgentPermissions(docType, agent) {
    const permissions = {
      SD: {
        LEAD: ['draft', 'active', 'on_hold', 'cancelled', 'completed', 'deferred'],
        PLAN: [],
        EXEC: []
      },
      PRD: {
        LEAD: ['approved'],
        PLAN: ['draft', 'planning', 'ready', 'testing', 'rejected', 'on_hold', 'cancelled'],
        EXEC: ['in_progress']
      },
      EES: {
        LEAD: [],
        PLAN: [],
        EXEC: ['pending', 'in_progress', 'completed', 'failed', 'blocked', 'skipped', 'cancelled']
      }
    };

    const docPermissions = permissions[docType];
    if (!docPermissions) {
      throw new Error(`Unknown document type: ${docType}`);
    }

    return docPermissions[agent] || [];
  }

  /**
   * Generate status report for monitoring
   */
  generateStatusReport(documents) {
    const report = {
      summary: {
        total: documents.length,
        usingPreferred: 0,
        usingDeprecated: 0,
        invalid: 0
      },
      deprecated: [],
      invalid: [],
      recommendations: []
    };

    documents.forEach(doc => {
      const docType = doc.type; // SD, PRD, or EES
      const status = doc.status;

      if (!this.isValidStatus(docType, status)) {
        report.invalid.push({
          id: doc.id,
          type: docType,
          status,
          recommendation: this.getRecommendedStatus(docType, 'working')
        });
        report.summary.invalid++;
      } else if (this.isPreferredStatus(docType, status)) {
        report.summary.usingPreferred++;
      } else {
        const normalized = this.normalizeStatus(docType, status);
        report.deprecated.push({
          id: doc.id,
          type: docType,
          currentStatus: status,
          recommendedStatus: normalized
        });
        report.summary.usingDeprecated++;
      }
    });

    // Add recommendations
    if (report.deprecated.length > 0) {
      report.recommendations.push(
        `Consider updating ${report.deprecated.length} documents using deprecated statuses`
      );
    }

    if (report.invalid.length > 0) {
      report.recommendations.push(
        `Fix ${report.invalid.length} documents with invalid statuses`
      );
    }

    return report;
  }
}

export default StatusValidator;