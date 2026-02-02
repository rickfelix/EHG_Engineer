/**
 * Integration Section Validation Gate
 * Part of SD-LEO-INFRA-PRD-INTEGRATION-SECTION-001
 *
 * GATE_INTEGRATION_SECTION_VALIDATION: Validates that PRDs have a complete
 * Integration & Operationalization section with all 5 required subsections.
 *
 * Behavior by SD type:
 * - feature/bugfix: BLOCKING if section missing or incomplete
 * - infrastructure: WARNING if section missing or incomplete
 * - documentation: SKIPPED (not applicable)
 *
 * Required subsections:
 * 1. consumers - Who/what consumes this functionality
 * 2. dependencies - Upstream/downstream systems
 * 3. data_contracts - Schema and API contracts
 * 4. runtime_config - Configuration and deployment concerns
 * 5. observability_rollout - Monitoring, rollout, and rollback plans
 */

/**
 * Error code prefix for log filtering (FR-6)
 */
const ERROR_CODE_PREFIX = 'INTEGRATION_SECTION';

/**
 * Required subsection keys matching PRD structure
 */
const REQUIRED_SUBSECTIONS = [
  'consumers',
  'dependencies',
  'data_contracts',
  'runtime_config',
  'observability_rollout'
];

/**
 * Human-readable names for subsections
 */
const SUBSECTION_NAMES = {
  consumers: 'Consumers & User Journeys',
  dependencies: 'Upstream/Downstream Dependencies',
  data_contracts: 'Data Contracts & Schema',
  runtime_config: 'Runtime Configuration & Environments',
  observability_rollout: 'Observability, Rollout & Rollback'
};

/**
 * SD types that require blocking validation
 */
const BLOCKING_SD_TYPES = ['feature', 'bugfix'];

/**
 * SD types that receive warnings only
 */
const WARNING_SD_TYPES = ['infrastructure'];

/**
 * SD types that skip this gate entirely
 */
const SKIP_SD_TYPES = ['documentation'];

/**
 * Check if a subsection value is considered empty
 * @param {any} value - Subsection value
 * @returns {boolean} True if empty
 */
function isSubsectionEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return true;
  return false;
}

/**
 * Validate integration_operationalization content
 * @param {Object|null} integrationData - The integration_operationalization JSONB
 * @returns {Object} Validation result with missing subsections
 */
function validateIntegrationContent(integrationData) {
  const result = {
    isNull: integrationData === null || integrationData === undefined,
    missingSubsections: [],
    emptySubsections: [],
    presentSubsections: [],
    completenessScore: 0
  };

  if (result.isNull) {
    result.missingSubsections = [...REQUIRED_SUBSECTIONS];
    return result;
  }

  for (const key of REQUIRED_SUBSECTIONS) {
    if (!(key in integrationData)) {
      result.missingSubsections.push(key);
    } else if (isSubsectionEmpty(integrationData[key])) {
      result.emptySubsections.push(key);
    } else {
      result.presentSubsections.push(key);
    }
  }

  result.completenessScore = Math.round(
    (result.presentSubsections.length / REQUIRED_SUBSECTIONS.length) * 100
  );

  return result;
}

/**
 * Generate remediation message
 * @param {Array} missing - Missing subsection keys
 * @param {Array} empty - Empty subsection keys
 * @returns {string} Human-readable remediation
 */
function generateRemediation(missing, empty) {
  const allIssues = [...missing.map(k => `missing: ${SUBSECTION_NAMES[k]}`),
                     ...empty.map(k => `empty: ${SUBSECTION_NAMES[k]}`)];

  return `To resolve:
1. Open the PRD in database or regenerate with template
2. Complete the "Integration & Operationalization" section
3. Fill in these subsections: ${allIssues.join(', ')}
4. Reference: CLAUDE_PLAN.md "Integration & Operationalization Rubric"`;
}

/**
 * Create the GATE_INTEGRATION_SECTION_VALIDATION gate validator
 *
 * @param {Object} prdRepo - PRD repository instance
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createIntegrationSectionValidationGate(prdRepo, supabase) {
  return {
    name: 'GATE_INTEGRATION_SECTION_VALIDATION',
    validator: async (ctx) => {
      console.log('\n📋 GATE: Integration Section Validation');
      console.log('-'.repeat(50));
      console.log('   Reference: SD-LEO-INFRA-PRD-INTEGRATION-SECTION-001');

      try {
        // Get SD type from context
        const sdType = ctx.sd?.sd_type || ctx.sdType || 'feature';
        console.log(`   SD Type: ${sdType}`);

        // FR-3: Check if gate should be skipped for documentation SDs
        if (SKIP_SD_TYPES.includes(sdType)) {
          console.log(`   ℹ️  SD type '${sdType}' - integration section validation SKIPPED`);
          console.log(`   [${ERROR_CODE_PREFIX}_SKIP] SD type not applicable`);
          return {
            passed: true,
            score: 100,
            max_score: 100,
            issues: [],
            warnings: [`Integration section validation skipped for ${sdType} SD type`],
            details: {
              skipped: true,
              reason: `SD type '${sdType}' does not require integration section`,
              status: 'SKIP'
            }
          };
        }

        // Get PRD from context or repository
        const prd = ctx._prd || await prdRepo?.getBySdId(ctx.sd?.id || ctx.sdId);

        if (!prd) {
          console.log('   ℹ️  No PRD found - cannot validate integration section');
          // Don't block if no PRD - GATE_PRD_EXISTS handles that
          return {
            passed: true,
            score: 100,
            max_score: 100,
            issues: [],
            warnings: ['No PRD found for integration section validation'],
            details: { skipped: true, reason: 'No PRD' }
          };
        }

        console.log(`   PRD ID: ${prd.id}`);

        // FR-3: Query integration_operationalization from database
        let integrationData = prd.integration_operationalization;

        // If not in PRD object, fetch directly from database
        if (integrationData === undefined && supabase) {
          const { data, error } = await supabase
            .from('product_requirements_v2')
            .select('integration_operationalization')
            .eq('id', prd.id)
            .single();

          if (!error && data) {
            integrationData = data.integration_operationalization;
          }
        }

        // Validate content
        const validation = validateIntegrationContent(integrationData);

        console.log('\n   📊 Integration Section Analysis:');
        console.log(`      Data present: ${!validation.isNull}`);
        console.log(`      Completeness: ${validation.completenessScore}%`);
        console.log(`      Present: ${validation.presentSubsections.length}/${REQUIRED_SUBSECTIONS.length}`);

        if (validation.missingSubsections.length > 0) {
          console.log(`      Missing: ${validation.missingSubsections.map(k => SUBSECTION_NAMES[k]).join(', ')}`);
        }
        if (validation.emptySubsections.length > 0) {
          console.log(`      Empty: ${validation.emptySubsections.map(k => SUBSECTION_NAMES[k]).join(', ')}`);
        }

        const hasIssues = validation.missingSubsections.length > 0 || validation.emptySubsections.length > 0;
        const isBlocking = BLOCKING_SD_TYPES.includes(sdType);

        // FR-3 & FR-6: Generate appropriate response based on SD type
        if (hasIssues) {
          const issueCount = validation.missingSubsections.length + validation.emptySubsections.length;
          const statusCode = validation.isNull ? 'MISSING' : 'INCOMPLETE';

          // FR-6: Single-line summary for log filtering
          console.log(`\n   [${ERROR_CODE_PREFIX}_${statusCode}_SUBSECTIONS] Status: ${isBlocking ? 'FAIL' : 'WARN'}, SD Type: ${sdType}, Missing: ${issueCount}`);

          const remediation = generateRemediation(
            validation.missingSubsections,
            validation.emptySubsections
          );

          if (isBlocking) {
            // FR-3: BLOCKING for feature/bugfix
            console.log(`\n   ❌ GATE FAILED: Integration section ${validation.isNull ? 'missing' : 'incomplete'}`);
            console.log(`   ${remediation}`);

            return {
              passed: false,
              score: validation.completenessScore,
              max_score: 100,
              issues: [
                {
                  code: `${ERROR_CODE_PREFIX}_${statusCode}_SUBSECTIONS`,
                  message: `Integration section ${validation.isNull ? 'is missing' : 'has incomplete subsections'}`,
                  severity: 'error',
                  missingSubsections: validation.missingSubsections.map(k => SUBSECTION_NAMES[k]),
                  emptySubsections: validation.emptySubsections.map(k => SUBSECTION_NAMES[k]),
                  remediation
                }
              ],
              warnings: [],
              details: {
                prdId: prd.id,
                sdType,
                validation,
                status: 'FAIL',
                blocking: true
              }
            };
          } else {
            // FR-3: WARNING for infrastructure
            console.log(`\n   ⚠️  GATE WARNING: Integration section ${validation.isNull ? 'missing' : 'incomplete'}`);
            console.log(`   Non-blocking for ${sdType} SD type`);

            return {
              passed: true,
              score: Math.max(validation.completenessScore, 50),
              max_score: 100,
              issues: [],
              warnings: [
                `Integration section ${validation.isNull ? 'missing' : 'incomplete'} (non-blocking for ${sdType})`,
                ...validation.missingSubsections.map(k => `Missing subsection: ${SUBSECTION_NAMES[k]}`),
                ...validation.emptySubsections.map(k => `Empty subsection: ${SUBSECTION_NAMES[k]}`),
                'Consider completing integration section for better documentation'
              ],
              details: {
                prdId: prd.id,
                sdType,
                validation,
                status: 'WARN',
                blocking: false
              }
            };
          }
        }

        // All subsections present and non-empty
        console.log('\n   ✅ Integration section complete');
        console.log(`   [${ERROR_CODE_PREFIX}_PASS] Status: PASS, SD Type: ${sdType}, Missing: 0`);

        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: {
            prdId: prd.id,
            sdType,
            validation,
            status: 'PASS',
            subsections: validation.presentSubsections
          }
        };

      } catch (error) {
        console.log(`\n   ⚠️  Integration section validation error: ${error.message}`);
        console.log(`   [${ERROR_CODE_PREFIX}_ERROR] ${error.message}`);

        return {
          passed: true,  // Non-blocking on errors
          score: 50,
          max_score: 100,
          issues: [],
          warnings: [`Integration section validation error: ${error.message}`],
          details: { error: error.message }
        };
      }
    },
    required: true  // Required gate, but blocking behavior depends on SD type
  };
}

// Export constants for external use
export {
  REQUIRED_SUBSECTIONS,
  SUBSECTION_NAMES,
  BLOCKING_SD_TYPES,
  WARNING_SD_TYPES,
  SKIP_SD_TYPES,
  ERROR_CODE_PREFIX
};
