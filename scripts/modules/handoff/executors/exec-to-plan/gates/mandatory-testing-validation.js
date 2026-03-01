/**
 * Mandatory Testing Validation Gate for EXEC-TO-PLAN
 * Part of SD-LEO-REFACTOR-EXECTOPLAN-001
 *
 * LEO v4.4.2: Enforce TESTING sub-agent execution
 * Evidence: 14.6% of SDs completed without TESTING validation
 *
 * SD-LEO-HARDEN-VALIDATION-001: Narrowed exemptions to documentation-only
 * - Infrastructure, orchestrator, database now use ADVISORY mode
 * - Only documentation types skip TESTING entirely
 *
 * SD-LEO-TESTING-ENFORCEMENT-001: Type-aware dynamic validation
 * - Uses getValidationRequirements() instead of hardcoded type lists
 * - Git diff detection to detect actual code changes
 * - Infrastructure SDs that produce code now require TESTING (ADVISORY mode)
 */

import { getValidationRequirements } from '../../../../../../lib/utils/sd-type-validation.js';
// SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-044: Import centralized policy for advisory mode override
import { getValidatorRequirement } from '../../../validation/sd-type-applicability-policy.js';
import { execSync } from 'child_process';

/**
 * Detect code file changes in the current branch/working directory
 * Checks git diff for common code file extensions
 *
 * @returns {Object} { hasCodeFiles: boolean, codeFileCount: number, codeFiles: string[] }
 */
function detectCodeChanges() {
  const CODE_EXTENSIONS = /\.(js|ts|tsx|jsx|mjs|cjs|py|rb|go|rs|java|cs|php|sql)$/i;

  try {
    // Get list of modified files (staged + unstaged + recent commits)
    // Use git diff HEAD~10 to catch recent changes, fallback to just working tree
    let diffOutput = '';
    try {
      diffOutput = execSync('git diff --name-only HEAD~10 2>nul || git diff --name-only', {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
    } catch {
      // Fallback: just check working tree changes
      diffOutput = execSync('git diff --name-only', {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
    }

    const files = diffOutput.split('\n').filter(f => f.trim());
    const codeFiles = files.filter(f => CODE_EXTENSIONS.test(f));

    return {
      hasCodeFiles: codeFiles.length > 0,
      codeFileCount: codeFiles.length,
      codeFiles: codeFiles.slice(0, 10) // Limit for logging
    };
  } catch (error) {
    // If git fails, assume there might be code changes (safer default)
    console.log(`   ⚠️  Git diff detection failed: ${error.message}`);
    return { hasCodeFiles: true, codeFileCount: 0, codeFiles: [] };
  }
}

/**
 * Create the MANDATORY_TESTING_VALIDATION gate validator
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createMandatoryTestingValidationGate(supabase) {
  return {
    name: 'MANDATORY_TESTING_VALIDATION',
    validator: async (ctx) => {
      console.log('\n🧪 MANDATORY TESTING VALIDATION (LEO v4.4.3)');
      console.log('-'.repeat(50));

      // 1. Get type-aware validation requirements (replaces hardcoded lists)
      // SD-LEO-TESTING-ENFORCEMENT-001: Dynamic validation based on sd_type
      const validationReqs = getValidationRequirements(ctx.sd);
      const sdType = validationReqs.sd_type;

      console.log(`   📋 SD Type: ${sdType}`);
      console.log(`   📋 requiresTesting (type-based): ${validationReqs.requiresTesting}`);
      console.log(`   📋 skipCodeValidation: ${validationReqs.skipCodeValidation}`);

      // 2. Detect actual code changes via git diff
      const codeEvidence = detectCodeChanges();
      console.log(`   📋 Code files detected: ${codeEvidence.hasCodeFiles} (${codeEvidence.codeFileCount} files)`);

      if (codeEvidence.codeFiles.length > 0) {
        console.log(`      Files: ${codeEvidence.codeFiles.slice(0, 5).join(', ')}${codeEvidence.codeFiles.length > 5 ? '...' : ''}`);
      }

      // 3. TIER: SKIP - truly non-code SD with no code changes
      // Only skip if type says skip AND no actual code files changed
      if (validationReqs.skipCodeValidation && !codeEvidence.hasCodeFiles) {
        console.log(`   ℹ️  ${sdType} type SD with no code changes - TESTING validation SKIPPED`);
        console.log('   → No code paths to test');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [`TESTING skipped for ${sdType} type SD (no code changes detected)`],
          details: { skipped: true, reason: sdType, tier: 'SKIP' }
        };
      }

      // 4. Determine enforcement tier based on type + code evidence
      // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-044: Check centralized policy for TESTING requirement
      // Types where policy says OPTIONAL (e.g., corrective) use advisory mode even if
      // sd-type-validation.js says requiresTesting=true (reconciles dual-system mismatch)
      const policyTestingReq = getValidatorRequirement(sdType, 'TESTING');
      const policyAllowsAdvisory = policyTestingReq === 'OPTIONAL' || policyTestingReq === 'NON_APPLICABLE';
      // REQUIRED: Type requires testing (feature, bugfix, security, etc.)
      // ADVISORY: Type doesn't require testing OR policy says OPTIONAL, BUT code changes detected
      const requiresTesting = (validationReqs.requiresTesting && !policyAllowsAdvisory) || codeEvidence.hasCodeFiles;
      const isAdvisoryMode = (!validationReqs.requiresTesting || policyAllowsAdvisory) && codeEvidence.hasCodeFiles;

      if (isAdvisoryMode) {
        console.log(`   ⚠️  ${sdType} SD type doesn't require TESTING but code changes detected`);
        console.log('   → ADVISORY mode: TESTING recommended but not blocking');
      }

      // 5. Query for TESTING sub-agent execution
      const sdUuid = ctx.sd?.id || ctx.sdId;
      const { data: testingResults, error } = await supabase
        .from('sub_agent_execution_results')
        .select('id, verdict, confidence, created_at')
        .eq('sd_id', sdUuid)
        .eq('sub_agent_code', 'TESTING')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.log(`   ⚠️  Error checking TESTING execution: ${error.message}`);
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`Failed to verify TESTING execution: ${error.message}`],
          warnings: [],
          details: { tier: requiresTesting ? 'REQUIRED' : 'ADVISORY' }
        };
      }

      // 6. Validate execution exists
      if (!testingResults?.length) {
        // TIER: ADVISORY - non-blocking for infrastructure/orchestrator/database with code changes
        // SD-LEO-TESTING-ENFORCEMENT-001: Improved warning with code evidence
        if (isAdvisoryMode) {
          console.log(`   ⚠️  TESTING not executed for ${sdType} SD with code changes (ADVISORY MODE)`);
          console.log(`   → ${codeEvidence.codeFileCount} code file(s) detected but type doesn't require TESTING`);
          console.log('   → Consider running TESTING for test coverage validation');
          console.log('   → This is a warning, not a blocker');
          return {
            passed: true,
            score: 70,
            max_score: 100,
            issues: [],
            warnings: [
              `TESTING not executed for ${sdType} SD with ${codeEvidence.codeFileCount} code file(s)`,
              'Consider running TESTING sub-agent for test coverage validation'
            ],
            details: {
              advisory: true,
              reason: `${sdType} SD with code changes missing TESTING`,
              tier: 'ADVISORY',
              codeFileCount: codeEvidence.codeFileCount,
              codeFiles: codeEvidence.codeFiles
            }
          };
        }

        // TIER: REQUIRED - blocking for feature/bugfix/security types
        console.log(`   ❌ ERR_TESTING_REQUIRED: TESTING sub-agent must complete before EXEC-TO-PLAN for ${sdType} SDs`);
        console.log('\n   REMEDIATION:');
        console.log('   1. Run TESTING sub-agent before completing EXEC phase');
        console.log('   2. Command: node scripts/orchestrate-phase-subagents.js PLAN_VERIFY ' + (ctx.sdId || sdUuid));
        console.log('   3. Ensure all E2E tests pass');
        console.log('   4. Re-run EXEC-TO-PLAN handoff');
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`ERR_TESTING_REQUIRED: TESTING sub-agent must complete before EXEC-TO-PLAN for ${sdType} SDs`],
          warnings: [],
          details: { tier: 'REQUIRED' }
        };
      }

      // 8. Validate verdict is acceptable
      const result = testingResults[0];
      console.log(`   📊 TESTING result found: ${result.verdict} (${result.confidence}% confidence)`);

      if (!['PASS', 'CONDITIONAL_PASS'].includes(result.verdict)) {
        console.log(`   ❌ TESTING verdict ${result.verdict} - must pass`);
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`TESTING verdict ${result.verdict} - must be PASS or CONDITIONAL_PASS`],
          warnings: []
        };
      }

      // 9. Validate freshness (default 24h)
      const maxAgeHours = parseInt(process.env.LEO_TESTING_MAX_AGE_HOURS || '24');
      const ageHours = (Date.now() - new Date(result.created_at)) / 3600000;

      if (ageHours > maxAgeHours) {
        console.log(`   ⚠️  TESTING results stale (${ageHours.toFixed(1)}h old, max ${maxAgeHours}h)`);
        return {
          passed: false,
          score: 50,
          max_score: 100,
          issues: [`TESTING results stale (${ageHours.toFixed(1)}h old, max ${maxAgeHours}h)`],
          warnings: [],
          details: { tier: requiresTesting ? 'REQUIRED' : 'ADVISORY' }
        };
      }

      // 10. TESTING validation passed
      console.log('   ✅ TESTING validation passed');
      console.log(`      Verdict: ${result.verdict}`);
      console.log(`      Age: ${ageHours.toFixed(1)}h (max ${maxAgeHours}h)`);
      console.log(`      Tier: ${requiresTesting ? 'REQUIRED' : 'ADVISORY'}`);

      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [],
        details: {
          verdict: result.verdict,
          confidence: result.confidence,
          age_hours: ageHours.toFixed(1),
          max_age_hours: maxAgeHours,
          tier: requiresTesting ? 'REQUIRED' : 'ADVISORY'
        }
      };
    },
    required: true
  };
}
