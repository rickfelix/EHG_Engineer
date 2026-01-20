/**
 * Preflight Checks for Implementation Fidelity Validation
 * Part of SD-LEO-REFACTOR-IMPL-FIDELITY-001
 *
 * Non-negotiable blockers that must pass before Phase 2 scoring.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { getSDSearchTerms, gitLogForSD, detectImplementationRepo, EHG_ENGINEER_ROOT, EHG_ROOT } from '../utils/index.js';

const execAsync = promisify(exec);

/**
 * Run all preflight checks
 *
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} validation - Validation object to populate
 * @param {Object} supabase - Supabase client
 * @returns {Promise<boolean>} - true if all preflight checks pass
 */
export async function runPreflightChecks(sd_id, validation, supabase) {
  console.log('\n[PHASE 1] Non-Negotiable Blockers...');
  console.log('-'.repeat(60));

  // Check 1: App Directory
  if (!await checkAppDirectory(validation)) {
    return false;
  }

  // Check 2: Ambiguity Resolution
  if (!await checkAmbiguityResolution(sd_id, validation, supabase)) {
    return false;
  }

  // Check 3: Server Restart (skip for bugfix/cosmetic)
  if (!validation.details.bugfix_mode && !validation.details.cosmetic_refactor_mode) {
    if (!await checkServerRestart(sd_id, validation, supabase)) {
      return false;
    }
  } else {
    const skipReason = validation.details.bugfix_mode ? 'Bugfix SD' : 'Cosmetic Refactor SD';
    console.log(`   ℹ️  ${skipReason} - TESTING sub-agent verification SKIPPED`);
    validation.warnings.push(`[PREFLIGHT] TESTING verification skipped for ${skipReason.toLowerCase()}`);
  }

  // Check 4: Stubbed Code (skip for cosmetic)
  if (!validation.details.cosmetic_refactor_mode) {
    if (!await checkStubbedCode(sd_id, validation, supabase)) {
      return false;
    }
  } else {
    console.log('   ℹ️  Cosmetic Refactor SD - Stub detection SKIPPED');
    validation.warnings.push('[PREFLIGHT] Stub detection skipped for cosmetic refactor SD');
  }

  console.log('   ✅ All Phase 1 blockers passed - proceeding to Phase 2 scoring');
  return true;
}

/**
 * Check application directory (NON-NEGOTIABLE #10)
 */
async function checkAppDirectory(validation) {
  console.log('\n[PHASE 1-A] Verifying application directory...');

  try {
    const { stdout: gitRoot } = await execAsync('git rev-parse --show-toplevel');
    const workingDirectory = gitRoot.trim();

    if (workingDirectory === EHG_ROOT) {
      validation.issues.push('[PREFLIGHT] CRITICAL: EXEC worked in wrong codebase (ehg instead of EHG_Engineer)');
      validation.failed_gates.push('APP_DIR_VERIFICATION');
      console.log(`   ❌ Wrong codebase detected: ${workingDirectory}`);
      console.log(`   ⚠️  Expected: ${EHG_ENGINEER_ROOT}`);
      console.log('   ⚠️  NON-NEGOTIABLE: EXEC must work in correct application directory');
      validation.passed = false;
      return false;
    } else if (workingDirectory === EHG_ENGINEER_ROOT) {
      console.log(`   ✅ Correct application directory verified: ${workingDirectory}`);
    } else {
      validation.warnings.push(`[PREFLIGHT] Unexpected working directory: ${workingDirectory}`);
      console.log(`   ⚠️  Unexpected directory: ${workingDirectory}`);
    }
    return true;
  } catch (error) {
    validation.warnings.push(`[PREFLIGHT] Cannot verify application directory: ${error.message}`);
    console.log(`   ⚠️  Cannot verify directory: ${error.message}`);
    return true; // Don't block on verification failure
  }
}

/**
 * Check ambiguity resolution (NON-NEGOTIABLE #11)
 */
async function checkAmbiguityResolution(sd_id, validation, supabase) {
  console.log('\n[PREFLIGHT] Checking for unresolved ambiguities...');

  try {
    const searchTerms = await getSDSearchTerms(sd_id, supabase);
    const implementationRepo = await detectImplementationRepo(sd_id, supabase);
    const gitLog = await gitLogForSD(
      `git -C "${implementationRepo}" log --all --grep="\${TERM}" --format="%H" -n 1`,
      searchTerms,
      { timeout: 10000 }
    );
    const commitHash = gitLog.trim().split('\n')[0];

    if (commitHash) {
      const { stdout: diff } = await execAsync(`git -C "${implementationRepo}" show ${commitHash}`);

      const ambiguityPatterns = [
        /TODO:.*\?/gi,
        /FIXME/gi,
        /HACK/gi,
        /not sure/gi,
        /unclear/gi,
        /ambiguous/gi,
        /\?\?\?/g,
        /need to ask/gi,
        /don't know/gi
      ];

      const foundAmbiguities = [];
      for (const pattern of ambiguityPatterns) {
        const matches = diff.match(pattern);
        if (matches) {
          foundAmbiguities.push(...matches);
        }
      }

      if (foundAmbiguities.length > 0) {
        validation.issues.push(`[PREFLIGHT] CRITICAL: Unresolved ambiguities found in code (${foundAmbiguities.length} instances)`);
        validation.failed_gates.push('AMBIGUITY_RESOLUTION');
        validation.details.unresolved_ambiguities = foundAmbiguities;
        console.log(`   ❌ Found ${foundAmbiguities.length} unresolved ambiguity marker(s)`);
        console.log(`   Examples: ${foundAmbiguities.slice(0, 3).join(', ')}`);
        console.log('   ⚠️  NON-NEGOTIABLE: All ambiguities must be resolved before handoff');
        validation.passed = false;
        return false;
      } else {
        console.log('   ✅ No unresolved ambiguity markers found in implementation');
      }
    } else {
      validation.warnings.push('[PREFLIGHT] Cannot find commit for SD - skipping ambiguity check');
      console.log('   ⚠️  Cannot find commit for ambiguity verification');
    }
    return true;
  } catch (error) {
    validation.warnings.push(`[PREFLIGHT] Cannot verify ambiguity resolution: ${error.message}`);
    console.log(`   ⚠️  Cannot verify ambiguity resolution: ${error.message}`);
    return true;
  }
}

/**
 * Check server restart verification (NON-NEGOTIABLE #14)
 */
async function checkServerRestart(sd_id, validation, supabase) {
  console.log('\n[PREFLIGHT] Verifying server restart and manual testing...');

  try {
    const { data: testingResults, error: testingError } = await supabase
      .from('sub_agent_execution_results')
      .select('verdict, metadata, created_at')
      .eq('sd_id', sd_id)
      .eq('sub_agent_code', 'TESTING')
      .order('created_at', { ascending: false })
      .limit(1);

    if (testingError) {
      validation.warnings.push('[PREFLIGHT] Cannot query TESTING sub-agent for server verification');
      console.log('   ⚠️  Cannot verify server restart (TESTING query failed)');
    } else if (!testingResults || testingResults.length === 0) {
      validation.issues.push('[PREFLIGHT] CRITICAL: No TESTING execution found - cannot verify server was restarted and working');
      validation.failed_gates.push('SERVER_RESTART_VERIFICATION');
      console.log('   ❌ TESTING sub-agent not executed - server restart not verified');
      console.log('   ⚠️  NON-NEGOTIABLE: EXEC must restart server, run tests, and verify implementation works');
      validation.passed = false;
      return false;
    } else {
      const testingResult = testingResults[0];

      if (testingResult.verdict === 'PASS') {
        console.log('   ✅ Server verified operational (TESTING sub-agent passed)');
        console.log(`   ✅ Tests executed at: ${testingResult.created_at}`);
      } else if (testingResult.verdict === 'BLOCKED') {
        validation.issues.push('[PREFLIGHT] CRITICAL: TESTING failed - server may not be working correctly');
        validation.failed_gates.push('SERVER_RESTART_VERIFICATION');
        console.log('   ❌ TESTING failed - implementation not verified as working');
        console.log('   ⚠️  NON-NEGOTIABLE: EXEC must ensure server restarts cleanly and tests pass');
        validation.passed = false;
        return false;
      } else {
        validation.warnings.push('[PREFLIGHT] TESTING verdict is CONDITIONAL_PASS - server verification incomplete');
        console.log('   ⚠️  TESTING inconclusive - server restart verification unclear');
      }
    }
    return true;
  } catch (error) {
    validation.warnings.push(`[PREFLIGHT] Cannot verify server restart: ${error.message}`);
    console.log(`   ⚠️  Cannot verify server restart: ${error.message}`);
    return true;
  }
}

/**
 * Check for stubbed/incomplete code (NON-NEGOTIABLE #20)
 */
async function checkStubbedCode(sd_id, validation, supabase) {
  console.log('\n[PREFLIGHT] Checking for stubbed/incomplete code...');

  try {
    const searchTerms = await getSDSearchTerms(sd_id, supabase);
    const implementationRepo = await detectImplementationRepo(sd_id, supabase);
    const gitLog = await gitLogForSD(
      `git -C "${implementationRepo}" log --all --grep="\${TERM}" --format="%H" -n 1`,
      searchTerms,
      { timeout: 10000 }
    );
    const commitHash = gitLog.trim().split('\n')[0];

    if (commitHash) {
      const { stdout: diff } = await execAsync(`git -C "${implementationRepo}" show ${commitHash}`);

      const stubbedCodePatterns = [
        /throw new Error\(['"]not implemented/gi,
        /throw new Error\(['"]TODO/gi,
        /return null;?\s*\/\/\s*TODO/gi,
        /return undefined;?\s*\/\/\s*TODO/gi,
        /TODO:\s*implement/gi,
        /stub(bed)?Function/gi,
        /(?<!=["'])\bplaceholder\b(?:\s+(?:function|implementation|code|data|value)|$)/gi,
        /temporary implementation/gi,
        /console\.log\(['"]TODO/gi,
        /\/\/\s*STUB:/gi,
        /\/\*\s*STUB\s*\*\//gi,
        /function\s+\w+\([^)]*\)\s*\{\s*\}/g,
        /const\s+\w+\s*=\s*\([^)]*\)\s*=>\s*\{\s*\}/g,
        /return\s*\{\s*\};?\s*\/\/\s*(stub|todo|placeholder)/gi
      ];

      const foundStubs = [];
      const foundLines = new Set();

      for (const pattern of stubbedCodePatterns) {
        const matches = diff.match(pattern);
        if (matches) {
          for (const match of matches) {
            const lines = diff.split('\n');
            for (const line of lines) {
              if (line.startsWith('+') && line.includes(match.trim())) {
                const cleanedLine = line.substring(1).trim();
                if (!foundLines.has(cleanedLine)) {
                  foundLines.add(cleanedLine);
                  foundStubs.push(cleanedLine);
                }
              }
            }
          }
        }
      }

      if (foundStubs.length > 0) {
        validation.issues.push(`[PREFLIGHT] CRITICAL: Stubbed/incomplete code detected (${foundStubs.length} instances)`);
        validation.failed_gates.push('STUBBED_CODE_DETECTION');
        validation.details.stubbed_code = foundStubs;
        console.log(`   ❌ Found ${foundStubs.length} stubbed/incomplete code pattern(s)`);
        console.log(`   Examples: ${foundStubs.slice(0, 3).join(' | ')}`);
        console.log('   ⚠️  NON-NEGOTIABLE: All code must be fully implemented before handoff');
        validation.passed = false;
        return false;
      } else {
        console.log('   ✅ No stubbed or incomplete code patterns detected');
      }
    } else {
      validation.warnings.push('[PREFLIGHT] Cannot find commit for SD - skipping stub detection');
      console.log('   ⚠️  Cannot find commit for stub detection');
    }
    return true;
  } catch (error) {
    validation.warnings.push(`[PHASE 1] Cannot detect stubbed code: ${error.message}`);
    console.log(`   ⚠️  Cannot detect stubbed code: ${error.message}`);
    return true;
  }
}
