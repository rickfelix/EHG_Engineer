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
    },
    // NEW: Final documentation deliverables (post-EXEC, after testing)
    final_documentation: {
      required: [
        { type: 'user_guide', description: 'End-user documentation explaining the feature' },
        { type: 'release_notes', description: 'Summary of changes for release communication' },
        { type: 'technical_doc', description: 'Architecture and implementation details' }
      ],
      optional: [
        { type: 'api_reference', description: 'API documentation if new endpoints added' },
        { type: 'faq', description: 'Frequently asked questions for support' }
      ],
      auto_generate: true,  // DOCMON auto-generates
      requires_review: true  // Must be reviewed before SD completion
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
    },
    final_documentation: {
      required: [
        { type: 'ops_guide', description: 'Operations guide for setup and maintenance' },
        { type: 'configuration_reference', description: 'Configuration options and defaults' }
      ],
      optional: [
        { type: 'runbook', description: 'Operational runbook for common tasks' },
        { type: 'troubleshooting', description: 'Troubleshooting guide for common issues' }
      ],
      auto_generate: true,
      requires_review: false  // Less critical for internal tooling
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
    },
    final_documentation: {
      required: [
        { type: 'schema_reference', description: 'Updated schema documentation with table descriptions' },
        { type: 'migration_log', description: 'Migration execution log and verification' }
      ],
      optional: [
        { type: 'data_dictionary', description: 'Full data dictionary update' },
        { type: 'query_examples', description: 'Common query patterns for new schema' }
      ],
      auto_generate: true,
      requires_review: true  // Schema changes are critical
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
    },
    final_documentation: {
      required: [
        { type: 'security_assessment', description: 'Security assessment and controls verification' },
        { type: 'auth_flow_doc', description: 'Authentication/authorization flow documentation' },
        { type: 'compliance_report', description: 'Compliance verification report' }
      ],
      optional: [
        { type: 'penetration_test_results', description: 'Penetration testing results if performed' },
        { type: 'security_runbook', description: 'Security incident response procedures' }
      ],
      auto_generate: false,  // Security docs often need manual review
      requires_review: true  // Must be reviewed by security-aware personnel
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
    },
    final_documentation: {
      required: [
        { type: 'root_cause_analysis', description: 'Detailed root cause analysis and fix explanation' },
        { type: 'fix_verification', description: 'Verification that bug is resolved with evidence' }
      ],
      optional: [
        { type: 'prevention_guide', description: 'How to prevent similar bugs in future' }
      ],
      auto_generate: true,
      requires_review: false  // Bug fixes are typically straightforward
    }
  },

  enhancement: {
    required_sections: ['Enhancement Spec', 'User Impact', 'Test Updates'],
    prd_emphasis: 'Enhancement scope with impact on existing features',
    retrospective_focus: 'Feature improvement metrics, user adoption impact',
    documentation_checklist: [
      'Enhancement scope defined',
      'Backward compatibility verified',
      'Existing tests updated',
      'User impact documented'
    ],
    prd_template: {
      min_functional_requirements: 3,
      min_acceptance_criteria: 3,
      min_test_scenarios: 3,
      requires_architecture: false,
      requires_risks: false
    },
    final_documentation: {
      required: [
        { type: 'feature_update', description: 'Updated feature documentation reflecting changes' },
        { type: 'changelog_entry', description: 'Changelog entry for the enhancement' }
      ],
      optional: [
        { type: 'migration_notes', description: 'Notes for users migrating from old behavior' }
      ],
      auto_generate: true,
      requires_review: false  // Enhancements are incremental
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
    },
    final_documentation: {
      required: [
        { type: 'refactor_summary', description: 'Summary of refactoring changes and rationale' },
        { type: 'regression_verification', description: 'Verification that no behavior changed' }
      ],
      optional: [
        { type: 'architecture_update', description: 'Updated architecture docs if structural changes' },
        { type: 'code_patterns', description: 'New code patterns introduced' }
      ],
      auto_generate: true,
      requires_review: false  // Internal code changes
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
    },
    final_documentation: {
      required: [
        { type: 'benchmark_report', description: 'Before/after benchmark comparison with metrics' },
        { type: 'optimization_summary', description: 'Summary of optimizations implemented' }
      ],
      optional: [
        { type: 'performance_guide', description: 'Performance best practices from this work' },
        { type: 'monitoring_setup', description: 'Monitoring dashboards or alerts configured' }
      ],
      auto_generate: true,
      requires_review: true  // Performance claims should be verified
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
    },
    final_documentation: {
      required: [
        { type: 'documentation_itself', description: 'The documentation deliverable itself (the SD output IS documentation)' }
      ],
      optional: [
        { type: 'style_guide_updates', description: 'Updates to documentation style guide if patterns established' }
      ],
      auto_generate: false,  // The SD produces docs manually
      requires_review: true  // Documentation should be reviewed for accuracy
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
    },
    final_documentation: {
      required: [
        { type: 'completion_summary', description: 'Summary of all child SD completions' }
      ],
      optional: [
        { type: 'architecture_overview', description: 'High-level architecture documentation' },
        { type: 'lessons_learned', description: 'Lessons learned from orchestrating multiple SDs' }
      ],
      auto_generate: true,  // Aggregates child SD documentation
      requires_review: false  // Children handle detailed review
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

/**
 * Get final documentation requirements for an SD type (post-EXEC deliverables)
 *
 * @param {string} sdType - SD type
 * @returns {Object} Final documentation requirements
 */
export function getFinalDocumentationRequirements(sdType) {
  const template = getDocumentationTemplate(sdType);
  return template.final_documentation || {
    required: [],
    optional: [],
    auto_generate: true,
    requires_review: false
  };
}

/**
 * Get list of required final documentation types for an SD
 *
 * @param {string} sdType - SD type
 * @returns {string[]} List of required documentation types
 */
export function getRequiredFinalDocTypes(sdType) {
  const finalDocs = getFinalDocumentationRequirements(sdType);
  return finalDocs.required.map(doc => doc.type);
}

/**
 * Validate final documentation completeness for an SD
 *
 * @param {Object} sd - Strategic Directive
 * @param {Object[]} generatedDocs - List of generated documents
 * @returns {Object} Validation result { passed: boolean, missing: [], present: [] }
 */
export function validateFinalDocumentation(sd, generatedDocs = []) {
  const finalDocs = getFinalDocumentationRequirements(sd.sd_type);
  const generatedTypes = new Set(generatedDocs.map(d => d.type || d.doc_type));

  const missing = [];
  const present = [];

  for (const req of finalDocs.required) {
    if (generatedTypes.has(req.type)) {
      present.push(req);
    } else {
      missing.push(req);
    }
  }

  return {
    passed: missing.length === 0,
    missing,
    present,
    requires_review: finalDocs.requires_review,
    auto_generate: finalDocs.auto_generate,
    optional: finalDocs.optional
  };
}

/**
 * Generate documentation deliverable records for an SD based on its type
 * These are inserted into sd_scope_deliverables at SD creation time
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {string} sdType - SD type (feature, infrastructure, etc.)
 * @param {Object} options - Options { includeOptional: boolean }
 * @returns {Object[]} Array of deliverable records ready for database insert
 */
export function generateDocumentationDeliverables(sdId, sdType, options = {}) {
  const { includeOptional = false } = options;
  const finalDocs = getFinalDocumentationRequirements(sdType);
  const deliverables = [];

  // Add required documentation deliverables
  for (const doc of finalDocs.required) {
    deliverables.push({
      sd_id: sdId,
      deliverable_type: 'documentation',
      deliverable_name: `${doc.type}: ${doc.description}`,
      description: `Required final documentation: ${doc.description}`,
      extracted_from: 'sd_type_template',
      priority: 'required',
      completion_status: 'pending',
      metadata: {
        doc_type: doc.type,
        auto_generate: finalDocs.auto_generate,
        requires_review: finalDocs.requires_review,
        source: 'sd-type-documentation-templates'
      }
    });
  }

  // Optionally add optional documentation deliverables
  if (includeOptional && finalDocs.optional) {
    for (const doc of finalDocs.optional) {
      deliverables.push({
        sd_id: sdId,
        deliverable_type: 'documentation',
        deliverable_name: `${doc.type}: ${doc.description}`,
        description: `Optional final documentation: ${doc.description}`,
        extracted_from: 'sd_type_template',
        priority: 'optional',
        completion_status: 'pending',
        metadata: {
          doc_type: doc.type,
          auto_generate: finalDocs.auto_generate,
          requires_review: finalDocs.requires_review,
          source: 'sd-type-documentation-templates'
        }
      });
    }
  }

  return deliverables;
}

/**
 * Get a summary of documentation requirements for display
 *
 * @param {string} sdType - SD type
 * @returns {Object} Summary with counts and flags
 */
export function getDocumentationSummary(sdType) {
  const finalDocs = getFinalDocumentationRequirements(sdType);
  const prdReqs = getPRDRequirements(sdType);

  return {
    sdType,
    prdPhase: {
      minFunctionalRequirements: prdReqs.min_functional_requirements,
      minAcceptanceCriteria: prdReqs.min_acceptance_criteria,
      minTestScenarios: prdReqs.min_test_scenarios,
      requiresArchitecture: prdReqs.requires_architecture,
      requiresRisks: prdReqs.requires_risks
    },
    finalPhase: {
      requiredDocs: finalDocs.required.map(d => d.type),
      optionalDocs: finalDocs.optional.map(d => d.type),
      autoGenerate: finalDocs.auto_generate,
      requiresReview: finalDocs.requires_review
    }
  };
}

/**
 * Mark documentation deliverables as complete in sd_scope_deliverables
 * Called by DOCMON when documentation is generated
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 * @param {string[]} completedDocTypes - List of doc types that were generated (e.g., ['user_guide', 'release_notes'])
 * @param {Object} options - Options { evidence, verifiedBy }
 * @returns {Promise<Object>} Result with { updated, failed, skipped }
 */
export async function markDocumentationDeliverablesComplete(supabase, sdId, completedDocTypes, options = {}) {
  const {
    evidence = 'Generated by DOCMON sub-agent',
    verifiedBy = 'DOCMON'
  } = options;

  const results = {
    updated: [],
    failed: [],
    skipped: [],
    notFound: []
  };

  try {
    // Find documentation deliverables for this SD that match the completed types
    const { data: deliverables, error: fetchError } = await supabase
      .from('sd_scope_deliverables')
      .select('id, deliverable_name, deliverable_type, completion_status, metadata')
      .eq('sd_id', sdId)
      .eq('deliverable_type', 'documentation');

    if (fetchError) {
      console.error(`Error fetching deliverables: ${fetchError.message}`);
      return { ...results, error: fetchError.message };
    }

    if (!deliverables || deliverables.length === 0) {
      console.log(`No documentation deliverables found for ${sdId}`);
      return results;
    }

    for (const deliverable of deliverables) {
      // Extract doc_type from metadata
      const docType = deliverable.metadata?.doc_type;

      if (!docType) {
        results.skipped.push({
          id: deliverable.id,
          name: deliverable.deliverable_name,
          reason: 'No doc_type in metadata'
        });
        continue;
      }

      // Check if this doc type was completed
      if (!completedDocTypes.includes(docType)) {
        results.skipped.push({
          id: deliverable.id,
          name: deliverable.deliverable_name,
          reason: `doc_type '${docType}' not in completed list`
        });
        continue;
      }

      // Skip if already completed
      if (deliverable.completion_status === 'completed') {
        results.skipped.push({
          id: deliverable.id,
          name: deliverable.deliverable_name,
          reason: 'Already completed'
        });
        continue;
      }

      // Update the deliverable as completed
      const { error: updateError } = await supabase
        .from('sd_scope_deliverables')
        .update({
          completion_status: 'completed',
          completion_evidence: evidence,
          verified_by: verifiedBy,
          verified_at: new Date().toISOString(),
          completion_notes: `Auto-completed by DOCMON after generating ${docType} documentation`,
          updated_at: new Date().toISOString()
        })
        .eq('id', deliverable.id);

      if (updateError) {
        results.failed.push({
          id: deliverable.id,
          name: deliverable.deliverable_name,
          error: updateError.message
        });
      } else {
        results.updated.push({
          id: deliverable.id,
          name: deliverable.deliverable_name,
          docType
        });
      }
    }

    // Check if any requested types weren't found
    for (const docType of completedDocTypes) {
      const found = deliverables.some(d => d.metadata?.doc_type === docType);
      if (!found) {
        results.notFound.push(docType);
      }
    }

    return results;

  } catch (error) {
    console.error(`Error marking documentation complete: ${error.message}`);
    return { ...results, error: error.message };
  }
}

/**
 * Get pending documentation deliverables for an SD
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Object[]>} List of pending documentation deliverables
 */
export async function getPendingDocumentationDeliverables(supabase, sdId) {
  const { data, error } = await supabase
    .from('sd_scope_deliverables')
    .select('id, deliverable_name, priority, metadata')
    .eq('sd_id', sdId)
    .eq('deliverable_type', 'documentation')
    .neq('completion_status', 'completed');

  if (error) {
    console.error(`Error fetching pending docs: ${error.message}`);
    return [];
  }

  return data || [];
}

export default {
  SD_TYPE_DOCUMENTATION_TEMPLATES,
  getDocumentationTemplate,
  getPRDRequirements,
  validateDocumentation,
  getFinalDocumentationRequirements,
  getRequiredFinalDocTypes,
  validateFinalDocumentation,
  generateDocumentationDeliverables,
  getDocumentationSummary,
  markDocumentationDeliverablesComplete,
  getPendingDocumentationDeliverables
};
