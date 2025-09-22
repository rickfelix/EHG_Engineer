/**
 * Handoff Validation Module
 * Enforces LEO Protocol v4.1 handoff requirements
 */

class HandoffValidator {
  constructor() {
    this.requiredElements = [
      'executiveSummary',
      'completenessReport',
      'deliverablesManifest',
      'keyDecisions',
      'knownIssues',
      'resourceUtilization',
      'actionItems'
    ];
    
    this.maxTokens = {
      executiveSummary: 200
    };
  }

  /**
   * Validate a handoff document
   */
  validateHandoff(handoff) {
    const validation = {
      valid: true,
      errors: [],
      warnings: [],
      score: 0
    };
    
    // Check for required elements
    this.requiredElements.forEach(element => {
      if (!handoff[element]) {
        validation.valid = false;
        validation.errors.push(`Missing required element: ${element}`);
      } else {
        validation.score += 1;
      }
    });
    
    // Validate executive summary token count
    if (handoff.executiveSummary) {
      const tokenCount = this.estimateTokens(handoff.executiveSummary);
      if (tokenCount > this.maxTokens.executiveSummary) {
        validation.warnings.push(`Executive summary exceeds ${this.maxTokens.executiveSummary} tokens (${tokenCount} tokens)`);
      }
    }
    
    // Validate completeness report
    if (handoff.completenessReport) {
      if (!handoff.completenessReport.total || !handoff.completenessReport.completed) {
        validation.errors.push('Completeness report must include total and completed counts');
        validation.valid = false;
      } else {
        const completionRate = (handoff.completenessReport.completed / handoff.completenessReport.total) * 100;
        if (completionRate < 100) {
          validation.warnings.push(`Incomplete work: ${completionRate.toFixed(1)}% complete`);
        }
      }
    }
    
    // Validate deliverables
    if (handoff.deliverablesManifest) {
      if (!handoff.deliverablesManifest.primary || handoff.deliverablesManifest.primary.length === 0) {
        validation.errors.push('At least one primary deliverable required');
        validation.valid = false;
      }
    }
    
    // Calculate validation score
    validation.score = Math.round((validation.score / this.requiredElements.length) * 100);
    
    return validation;
  }
  
  /**
   * Estimate token count (rough approximation)
   */
  estimateTokens(text) {
    // Rough estimate: 1 token per 4 characters
    return Math.ceil(text.length / 4);
  }
  
  /**
   * Format validation report
   */
  formatReport(validation) {
    let report = '# Handoff Validation Report\n\n';
    
    report += `**Status**: ${validation.valid ? '✅ VALID' : '❌ INVALID'}\n`;
    report += `**Score**: ${validation.score}%\n\n`;
    
    if (validation.errors.length > 0) {
      report += '## ❌ Errors\n';
      validation.errors.forEach(error => {
        report += `- ${error}\n`;
      });
      report += '\n';
    }
    
    if (validation.warnings.length > 0) {
      report += '## ⚠️ Warnings\n';
      validation.warnings.forEach(warning => {
        report += `- ${warning}\n`;
      });
      report += '\n';
    }
    
    if (validation.valid) {
      report += '## ✅ All Requirements Met\n';
      report += 'This handoff meets LEO Protocol v4.1 standards.\n';
    } else {
      report += '## 🔧 Required Actions\n';
      report += '1. Address all errors listed above\n';
      report += '2. Resubmit handoff for validation\n';
    }
    
    return report;
  }
  
  /**
   * Parse markdown handoff document
   */
  parseHandoffDocument(markdown) {
    const handoff = {};
    
    // Extract executive summary
    const summaryMatch = markdown.match(/## (?:HANDOFF )?SUMMARY\n+([\s\S]*?)(?=\n##|\n---)/i);
    if (summaryMatch) {
      handoff.executiveSummary = summaryMatch[1].trim();
    }
    
    // Extract completion status
    const completionMatch = markdown.match(/\*\*Total Requirements\*\*:\s*(\d+)[\s\S]*?\*\*Completed\*\*:\s*(\d+)/i);
    if (completionMatch) {
      handoff.completenessReport = {
        total: parseInt(completionMatch[1]),
        completed: parseInt(completionMatch[2])
      };
    }
    
    // Extract deliverables
    const deliverablesMatch = markdown.match(/## DELIVERABLES\n+([\s\S]*?)(?=\n##|\n---)/i);
    if (deliverablesMatch) {
      handoff.deliverablesManifest = {
        primary: [],
        supporting: []
      };
      
      const lines = deliverablesMatch[1].split('\n');
      let currentSection = null;
      
      lines.forEach(line => {
        if (line.includes('Primary:')) {
          currentSection = 'primary';
        } else if (line.includes('Supporting')) {
          currentSection = 'supporting';
        } else if (line.startsWith('-') && currentSection) {
          const item = line.replace(/^-\s*/, '').trim();
          if (item) {
            handoff.deliverablesManifest[currentSection].push(item);
          }
        }
      });
    }
    
    // Extract key decisions
    const decisionsMatch = markdown.match(/## KEY DECISIONS/i);
    handoff.keyDecisions = !!decisionsMatch;
    
    // Extract known issues
    const issuesMatch = markdown.match(/## KNOWN ISSUES/i);
    handoff.knownIssues = !!issuesMatch;
    
    // Extract resource usage
    const resourceMatch = markdown.match(/## RESOURCE/i);
    handoff.resourceUtilization = !!resourceMatch;
    
    // Extract action items
    const actionMatch = markdown.match(/## ACTION/i);
    handoff.actionItems = !!actionMatch;
    
    return handoff;
  }
}

module.exports = HandoffValidator;