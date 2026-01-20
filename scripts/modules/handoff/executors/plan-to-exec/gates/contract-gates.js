/**
 * Contract Compliance Gate
 * Part of SD-LEO-REFACTOR-PLANTOEXEC-001
 *
 * Validates PRD against parent SD data/UX contracts
 */

/**
 * Create the GATE_CONTRACT_COMPLIANCE gate validator
 *
 * @param {Object} prdRepo - PRD repository instance
 * @param {Object} sd - Strategic Directive object
 * @returns {Object} Gate configuration
 */
export function createContractComplianceGate(prdRepo, sd) {
  return {
    name: 'GATE_CONTRACT_COMPLIANCE',
    validator: async (ctx) => {
      console.log('\n📜 CONTRACT COMPLIANCE GATE: Parent Contract Validation');
      console.log('-'.repeat(50));

      // Lazy load contract validator
      const { validateContractGate } = await import('../../../../contract-validation.js');

      // Get PRD for validation
      // SD ID Schema Cleanup: Use sd.id directly (uuid_id deprecated)
      const prd = await prdRepo?.getBySdId(sd.id);

      if (!prd) {
        console.log('   ⚠️  No PRD found - skipping contract validation');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: ['No PRD found for contract validation'],
          details: { skipped: true, reason: 'No PRD' }
        };
      }

      const contractResult = await validateContractGate(ctx.sdId, prd);
      ctx._contractResult = contractResult;

      // DATA_CONTRACT violations are BLOCKERs
      // UX_CONTRACT violations are WARNINGs (allow override)
      const dataViolations = contractResult.issues.filter(i => i.includes('DATA_CONTRACT'));
      const uxWarnings = contractResult.warnings.filter(w => w.includes('UX_CONTRACT'));

      if (dataViolations.length > 0) {
        console.log(`   ❌ ${dataViolations.length} DATA_CONTRACT violation(s) - BLOCKING`);
        dataViolations.forEach(v => console.log(`      • ${v}`));
      }

      if (uxWarnings.length > 0) {
        console.log(`   ⚠️  ${uxWarnings.length} UX_CONTRACT warning(s) - overridable`);
      }

      if (contractResult.details?.cultural_design_style) {
        console.log(`   📎 Cultural style: ${contractResult.details.cultural_design_style}`);
      }

      if (contractResult.passed) {
        console.log('   ✅ Contract compliance validated');
      }

      return contractResult;
    },
    required: true
  };
}
