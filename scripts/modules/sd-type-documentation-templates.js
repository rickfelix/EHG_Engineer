/**
 * SD Type Documentation Templates
 * SD-LEO-PROTOCOL-V435-001 US-006: Type-specific documentation requirements
 *
 * Provides documentation templates and checklists for each SD type.
 * Used during PRD generation and PLAN phase validation.
 *
 * @module sd-type-documentation-templates
 * @version 1.0.0
 */

/**
 * Documentation templates by SD type
 * Each type has:
 * - required_sections: Sections that must be in the PRD
 * - prd_emphasis: What the PRD should focus on
 * - retrospective_focus: Key metrics for retrospective
 * - documentation_checklist: Items to verify before EXEC
 */
export const SD_TYPE_DOCUMENTATION_TEMPLATES = {
  feature: {
    required_sections: ['PRD', 'User Stories', 'Test Plan', 'Architecture', 'Release Notes'],
    prd_emphasis: 'Full PRD with functional requirements, acceptance criteria, and test scenarios',
    retrospective_focus: 'Feature delivery metrics, user impact, lessons learned',
    documentation_checklist: [
      'PRD approved and complete',
      'User stories in database with acceptance criteria',
      'E2E test coverage documented',
      'Architecture decisions recorded',
      'Release notes prepared'
    ],
    prd_template: {
      min_functional_requirements: 5,
      min_acceptance_criteria: 5,
      min_test_scenarios: 5,
      requires_architecture: true,
      requires_risks: true
    }
  },

  infrastructure: {
    required_sections: ['Configuration Spec', 'Implementation Notes', 'Validation Checklist'],
    prd_emphasis: 'Configuration specification with infrastructure requirements',
    retrospective_focus: 'Implementation efficiency, infrastructure stability',
    documentation_checklist: [
      'Infrastructure requirements documented',
      'Configuration changes listed',
      'No E2E tests required (infra type)',
      'Validation checklist complete'
    ],
    prd_template: {
      min_functional_requirements: 2,
      min_acceptance_criteria: 2,
      min_test_scenarios: 0, // No E2E for infrastructure
      requires_architecture: false,
      requires_risks: false
    }
  },

  database: {
    required_sections: ['Migration Script', 'Schema Changes', 'Rollback Plan', 'RLS Policies'],
    prd_emphasis: 'Schema design, migration plan, and data impact analysis',
    retrospective_focus: 'Migration success, data integrity, performance impact',
    documentation_checklist: [
      'Migration script tested',
      'Schema changes documented',
      'Rollback plan verified',
      'RLS policies reviewed'
    ],
    prd_template: {
      min_functional_requirements: 3,
      min_acceptance_criteria: 3,
      min_test_scenarios: 2,
      requires_architecture: true,
      requires_risks: true
    }
  },

  security: {
    required_sections: ['Threat Model', 'Security Controls', 'Audit Trail', 'Compliance Check'],
    prd_emphasis: 'Security requirements with threat analysis and control measures',
    retrospective_focus: 'Security posture improvement, vulnerability remediation',
    documentation_checklist: [
      'Threat model documented',
      'Security controls implemented',
      'Audit trail enabled',
      'Compliance requirements met'
    ],
    prd_template: {
      min_functional_requirements: 5,
      min_acceptance_criteria: 5,
      min_test_scenarios: 5,
      requires_architecture: true,
      requires_risks: true
    }
  },

  bugfix: {
    required_sections: ['Root Cause Analysis', 'Fix Implementation', 'Regression Tests'],
    prd_emphasis: 'Root cause identification and targeted fix approach',
    retrospective_focus: 'Bug prevention insights, regression testing effectiveness',
    documentation_checklist: [
      'Root cause documented',
      'Fix implementation verified',
      'Regression tests added',
      'Original issue resolved'
    ],
    prd_template: {
      min_functional_requirements: 2,
      min_acceptance_criteria: 3,
      min_test_scenarios: 2,
      requires_architecture: false,
      requires_risks: false
    }
  },

  refactor: {
    required_sections: ['Refactoring Scope', 'Before/After Analysis', 'Test Coverage'],
    prd_emphasis: 'Code improvement goals with backward compatibility notes',
    retrospective_focus: 'Code quality improvement, technical debt reduction',
    documentation_checklist: [
      'Refactoring scope defined',
      'Backward compatibility verified',
      'Test coverage maintained',
      'No functionality changes'
    ],
    prd_template: {
      min_functional_requirements: 2,
      min_acceptance_criteria: 3,
      min_test_scenarios: 3,
      requires_architecture: false,
      requires_risks: true
    },
    intensity_requirements: {
      cosmetic: { min_functional_requirements: 1, min_test_scenarios: 0 },
      structural: { min_functional_requirements: 2, min_test_scenarios: 2 },
      architectural: { min_functional_requirements: 4, min_test_scenarios: 4 }
    }
  },

  performance: {
    required_sections: ['Baseline Metrics', 'Optimization Targets', 'Benchmark Results'],
    prd_emphasis: 'Performance baseline and optimization targets with measurement approach',
    retrospective_focus: 'Performance improvements achieved, bottlenecks resolved',
    documentation_checklist: [
      'Baseline metrics captured',
      'Optimization targets set',
      'Benchmark results documented',
      'Performance gains validated'
    ],
    prd_template: {
      min_functional_requirements: 3,
      min_acceptance_criteria: 4,
      min_test_scenarios: 3,
      requires_architecture: false,
      requires_risks: true
    }
  },

  documentation: {
    required_sections: ['Content Outline', 'Target Audience', 'Review Checklist'],
    prd_emphasis: 'Documentation scope with target audience and format requirements',
    retrospective_focus: 'Documentation quality, coverage improvement',
    documentation_checklist: [
      'Content outline complete',
      'Target audience defined',
      'Format consistency verified',
      'Review completed'
    ],
    prd_template: {
      min_functional_requirements: 2,
      min_acceptance_criteria: 2,
      min_test_scenarios: 0,
      requires_architecture: false,
      requires_risks: false
    }
  },

  orchestrator: {
    required_sections: ['Child SD Summary', 'Completion Criteria', 'Coordination Notes'],
    prd_emphasis: 'High-level overview with child SD coordination requirements',
    retrospective_focus: 'Orchestration effectiveness, child SD coordination',
    documentation_checklist: [
      'Child SDs defined',
      'Completion criteria clear',
      'Dependencies documented',
      'Coordination approach noted'
    ],
    prd_template: {
      min_functional_requirements: 1,
      min_acceptance_criteria: 2,
      min_test_scenarios: 0,
      requires_architecture: false,
      requires_risks: false
    }
  }
};

/**
 * Get documentation template for an SD type
 *
 * @param {string} sdType - SD type (feature, infrastructure, etc.)
 * @returns {Object} Documentation template
 */
export function getDocumentationTemplate(sdType) {
  const normalizedType = (sdType || 'feature').toLowerCase();
  return SD_TYPE_DOCUMENTATION_TEMPLATES[normalizedType] || SD_TYPE_DOCUMENTATION_TEMPLATES.feature;
}

/**
 * Get PRD requirements for an SD type
 *
 * @param {string} sdType - SD type
 * @param {string} intensityLevel - Intensity level for refactor SDs
 * @returns {Object} PRD requirements
 */
export function getPRDRequirements(sdType, intensityLevel = null) {
  const template = getDocumentationTemplate(sdType);
  let requirements = { ...template.prd_template };

  // Apply intensity overrides for refactor SDs
  if (sdType === 'refactor' && intensityLevel && template.intensity_requirements) {
    const intensity = intensityLevel.toLowerCase();
    const overrides = template.intensity_requirements[intensity];
    if (overrides) {
      requirements = { ...requirements, ...overrides };
    }
  }

  return requirements;
}

/**
 * Validate documentation completeness for an SD
 *
 * @param {Object} sd - Strategic Directive
 * @param {Object} prd - Product Requirements Document
 * @returns {Object} Validation result { passed: boolean, issues: [], warnings: [] }
 */
export function validateDocumentation(sd, prd) {
  const template = getDocumentationTemplate(sd.sd_type);
  const issues = [];
  const warnings = [];

  // Check documentation checklist items
  template.documentation_checklist.forEach(item => {
    // These are informational - add as warnings for tracking
    warnings.push(`Documentation check: ${item}`);
  });

  // Validate PRD against type requirements
  const prdReqs = getPRDRequirements(sd.sd_type, sd.intensity_level);

  const funcReqs = prd?.functional_requirements?.length || 0;
  if (funcReqs < prdReqs.min_functional_requirements) {
    issues.push(`PRD needs at least ${prdReqs.min_functional_requirements} functional requirements (has ${funcReqs})`);
  }

  const accCriteria = prd?.acceptance_criteria?.length || 0;
  if (accCriteria < prdReqs.min_acceptance_criteria) {
    issues.push(`PRD needs at least ${prdReqs.min_acceptance_criteria} acceptance criteria (has ${accCriteria})`);
  }

  const testScenarios = prd?.test_scenarios?.length || 0;
  if (testScenarios < prdReqs.min_test_scenarios) {
    if (prdReqs.min_test_scenarios > 0) {
      issues.push(`PRD needs at least ${prdReqs.min_test_scenarios} test scenarios (has ${testScenarios})`);
    }
  }

  if (prdReqs.requires_architecture && !prd?.system_architecture) {
    issues.push('PRD requires system_architecture section');
  }

  if (prdReqs.requires_risks && (!prd?.risks || prd.risks.length === 0)) {
    issues.push('PRD requires risks section');
  }

  return {
    passed: issues.length === 0,
    issues,
    warnings,
    template: template.required_sections,
    prdRequirements: prdReqs
  };
}

export default {
  SD_TYPE_DOCUMENTATION_TEMPLATES,
  getDocumentationTemplate,
  getPRDRequirements,
  validateDocumentation
};
