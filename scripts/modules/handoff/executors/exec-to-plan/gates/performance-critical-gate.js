/**
 * Performance Critical Gate for EXEC-TO-PLAN
 * Part of SD-LEO-INFRA-INTEGRATE-VERCEL-REACT-001
 *
 * Validates that feature/performance SDs don't introduce
 * CRITICAL performance anti-patterns (barrel imports, waterfalls).
 *
 * SD-Type Enforcement:
 * - feature/performance/enhancement: REQUIRED (blocks)
 * - fix: ADVISORY (warns)
 * - infrastructure/documentation: SKIP
 */

// External validator (lazy loaded)
let getValidationRequirements;

/**
 * Get enforcement mode based on SD type
 * @param {string} sdType - The SD type
 * @returns {'REQUIRED'|'ADVISORY'|'SKIP'} Enforcement mode
 */
function getEnforcementMode(sdType) {
  const modes = {
    feature: 'REQUIRED',
    performance: 'REQUIRED',
    enhancement: 'REQUIRED',
    fix: 'ADVISORY',
    bugfix: 'ADVISORY',
    infrastructure: 'SKIP',
    documentation: 'SKIP',
    refactor: 'ADVISORY'
  };
  return modes[sdType] || 'REQUIRED'; // Default to required for unknown types
}

/**
 * Create the PERFORMANCE_CRITICAL gate validator
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createPerformanceCriticalGate(supabase) {
  return {
    name: 'GATE_PERFORMANCE_CRITICAL',
    validator: async (ctx) => {
      console.log('\n⚡ GATE: Performance Critical Violations');
      console.log('-'.repeat(50));

      const result = {
        pass: true,
        score: 100,
        issues: [],
        warnings: [],
        skip: false,
        skipReason: null
      };

      try {
        // Load SD type validation
        if (!getValidationRequirements) {
          const sdType = await import('../../../../../../lib/utils/sd-type-validation.js');
          getValidationRequirements = sdType.getValidationRequirements;
        }

        // Use UUID (ctx.sd.id) not legacy_id (ctx.sdId) - queries use UUID FK
        const sdUuid = ctx.sd?.id || ctx.sdId;

        // Get SD details
        const { data: sd, error: sdError } = await supabase
          .from('strategic_directives_v2')
          .select('id, sd_type, title')
          .eq('id', sdUuid)
          .single();

        if (sdError || !sd) {
          console.log('   ⚠️  Could not load SD details - skipping gate');
          result.skip = true;
          result.skipReason = 'SD not found';
          return result;
        }

        const sdType = sd.sd_type || 'feature';
        const enforcementMode = getEnforcementMode(sdType);

        console.log(`   SD Type: ${sdType}`);
        console.log(`   Enforcement Mode: ${enforcementMode}`);

        // Skip for infrastructure/documentation SDs
        if (enforcementMode === 'SKIP') {
          console.log(`   ✅ Gate skipped for ${sdType} SD type`);
          result.skip = true;
          result.skipReason = `SD type '${sdType}' does not require performance validation`;
          return result;
        }

        // SD-LEO-INFRA-PRD-FIELD-CONSUMPTION-001: Load PRD performance_requirements
        const { data: prdData } = await supabase
          .from('product_requirements_v2')
          .select('performance_requirements')
          .eq('sd_id', sdUuid)
          .single();

        const perfRequirements = prdData?.performance_requirements;
        if (perfRequirements && Object.keys(perfRequirements).length > 0) {
          console.log(`   📊 PRD performance requirements loaded`);
          result.prd_targets = perfRequirements;
        }

        // Query PERFORMANCE sub-agent results
        const { data: perfResults, error: perfError } = await supabase
          .from('sub_agent_execution_results')
          .select('verdict, findings, critical_issues, warnings')
          .eq('sd_id', sdUuid)
          .eq('sub_agent_code', 'PERFORMANCE')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (perfError || !perfResults) {
          console.log('   ⚠️  PERFORMANCE sub-agent results not found - skipping gate');
          result.skip = true;
          result.skipReason = 'PERFORMANCE sub-agent not run';
          return result;
        }

        // Check for barrel import violations
        const barrelFindings = perfResults.findings?.barrel_import_audit || {};
        const newBarrels = barrelFindings.new_barrels || 0;

        if (newBarrels > 0) {
          const violation = {
            type: 'BARREL_IMPORT',
            severity: 'CRITICAL',
            count: newBarrels,
            files: barrelFindings.critical_violations || [],
            recommendation: 'Replace barrel exports with direct imports. See .claude/skills/barrel-remediation.md'
          };

          if (enforcementMode === 'REQUIRED') {
            console.log(`   ❌ BLOCKED: ${newBarrels} new barrel import(s) detected`);
            result.pass = false;
            result.score = 0;
            result.issues.push({
              severity: 'CRITICAL',
              issue: `${newBarrels} new barrel import(s) detected`,
              recommendation: violation.recommendation,
              violations: violation.files
            });
          } else {
            console.log(`   ⚠️  ADVISORY: ${newBarrels} new barrel import(s) detected`);
            result.warnings.push({
              severity: 'MEDIUM',
              issue: `${newBarrels} new barrel import(s) detected (advisory for ${sdType} SD)`,
              recommendation: violation.recommendation
            });
            result.score = Math.max(result.score - 20, 60);
          }
        } else {
          const grandfathered = barrelFindings.grandfathered_count || 0;
          if (grandfathered > 0) {
            console.log(`   ✅ ${grandfathered} barrel import(s) detected (all grandfathered)`);
          } else {
            console.log('   ✅ No barrel imports detected');
          }
        }

        // Check for waterfall violations
        const waterfallFindings = perfResults.findings?.waterfall_detection || {};
        const waterfallCount = waterfallFindings.waterfall_count || 0;

        if (waterfallCount > 0 && enforcementMode === 'REQUIRED' && sdType === 'performance') {
          console.log(`   ⚠️  ${waterfallCount} waterfall pattern(s) detected`);
          result.warnings.push({
            severity: 'MEDIUM',
            issue: `${waterfallCount} sequential await chains detected`,
            recommendation: 'Use Promise.all() for independent async operations'
          });
          result.score = Math.max(result.score - 10, 70);
        }

        // Summary
        if (result.pass) {
          console.log(`   ✅ Performance critical gate PASSED (score: ${result.score}%)`);
        } else {
          console.log('   ❌ Performance critical gate FAILED');
          console.log('   📚 Remediation: .claude/skills/barrel-remediation.md');
        }

        return result;

      } catch (error) {
        console.error(`   ❌ Gate error: ${error.message}`);
        // Fail-open design: errors result in SKIP, not FAIL
        result.skip = true;
        result.skipReason = `Gate error: ${error.message}`;
        result.warnings.push({
          severity: 'LOW',
          issue: 'Performance critical gate encountered an error',
          recommendation: 'Review error and retry manually'
        });
        return result;
      }
    },
    required: false, // Advisory by default, enforcement depends on SD type
    priority: 35 // After sub-agent orchestration (30), before testing (40)
  };
}
