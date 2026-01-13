/**
 * DESIGN→DATABASE Validation Gates - Gate 2 (EXEC→PLAN)
 *
 * Validates that EXEC actually implemented the DESIGN and DATABASE recommendations
 * before PLAN verification begins.
 *
 * Integration: unified-handoff-system.js (EXEC→PLAN handoff)
 * Created: 2025-10-28
 * Part of: SD-DESIGN-DATABASE-VALIDATION-001
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculateAdaptiveThreshold } from './adaptive-threshold-calculator.js';
import { getPatternStats } from './pattern-tracking.js';
import {
  shouldSkipCodeValidation,
  getValidationRequirements
} from '../../lib/utils/sd-type-validation.js';

const execAsync = promisify(exec);

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EHG_ENGINEER_ROOT = path.resolve(__dirname, '../..');
const EHG_ROOT = path.resolve(__dirname, '../../../ehg');

// Cache for SD search terms to avoid repeated database queries
const searchTermsCache = new Map();

/**
 * Get search terms for an SD (UUID + legacy_id)
 * SD-VENTURE-STAGE0-UI-001: Commits use legacy_id, not UUID
 *
 * @param {string} sd_id - Strategic Directive UUID
 * @param {Object} supabase - Supabase client
 * @returns {Promise<string[]>} - Array of search terms [uuid, legacy_id]
 */
async function getSDSearchTerms(sd_id, supabase) {
  // Check cache first
  if (searchTermsCache.has(sd_id)) {
    return searchTermsCache.get(sd_id);
  }

  const searchTerms = [sd_id];

  try {
    if (supabase) {
      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .select('legacy_id')
        .eq('id', sd_id)
        .single();
      if (sd?.legacy_id) {
        searchTerms.push(sd.legacy_id);
      }
    }
  } catch (_e) {
    // Continue with UUID only if can't get legacy_id
  }

  // Cache the result
  searchTermsCache.set(sd_id, searchTerms);
  return searchTerms;
}

/**
 * Execute git log search for any of the SD search terms
 * Returns the combined results for UUID and legacy_id
 *
 * @param {string} cmd - Git command template with ${TERM} placeholder
 * @param {string[]} searchTerms - Array of search terms
 * @param {Object} options - execAsync options
 * @returns {Promise<string>} - Combined stdout from all searches
 */
async function gitLogForSD(cmdTemplate, searchTerms, options = {}) {
  const results = [];

  for (const term of searchTerms) {
    try {
      const cmd = cmdTemplate.replace(/\$\{TERM\}/g, term);
      const { stdout } = await execAsync(cmd, options);
      if (stdout.trim()) {
        results.push(stdout.trim());
      }
    } catch (_e) {
      // Continue to next term
    }
  }

  // Return unique lines combined from all searches
  const allLines = results.join('\n').split('\n').filter(Boolean);
  return [...new Set(allLines)].join('\n');
}

/**
 * Detect which repository contains the implementation for this SD
 * Returns the root path of the implementation repository
 *
 * Strategy:
 * 1. Check if SD has commits in EHG (application repo)
 * 2. If not found, default to EHG_Engineer (governance repo)
 *
 * @param {string} sd_id - Strategic Directive ID
 * @returns {Promise<string>} - Root path of implementation repository
 */
async function detectImplementationRepo(sd_id, supabase) {
  const repos = [
    EHG_ROOT,           // Application repo (priority)
    EHG_ENGINEER_ROOT   // Governance repo (fallback)
  ];

  // SD-VENTURE-STAGE0-UI-001: Also search by legacy_id (SD-XXX-001 format)
  // since commits often use legacy_id instead of UUID
  const searchTerms = await getSDSearchTerms(sd_id, supabase);
  if (searchTerms.length > 1) {
    console.log(`   📋 Also searching for legacy_id: ${searchTerms[1]}`);
  }

  for (const repo of repos) {
    for (const term of searchTerms) {
      try {
        // Check if this repo has commits for this SD
        const { stdout } = await execAsync(`git -C "${repo}" log --all --grep="${term}" --format="%H" -n 1 2>/dev/null || echo ""`);
        if (stdout.trim()) {
          console.log(`   💡 Implementation detected in: ${repo} (matched: ${term})`);
          return repo;
        }
      } catch (_error) {
        // Repo might not exist or not accessible, continue to next
        continue;
      }
    }
  }

  // Default to current working directory if no commits found
  const cwd = process.cwd();
  console.log(`   ⚠️  No SD commits found in known repos, using current directory: ${cwd}`);
  return cwd;
}

/**
 * Validate implementation fidelity for EXEC→PLAN handoff
 * Phase-Aware Weighting System (Correctness Focus)
 *
 * Checks:
 * A. Design Implementation Fidelity (20 points) - MAJOR
 * B. Database Implementation Fidelity (35 points) - CRITICAL
 *    - B1: Migration execution (20 pts) - CRITICAL
 *    - B2-B3: RLS + complexity (10 pts) - MINOR
 * C. Data Flow Alignment (20 points) - MAJOR
 * D. Enhanced Testing (25 points) - CRITICAL
 *    - D1: E2E tests (20 pts) - CRITICAL
 *    - D2-D3: Other tests (5 pts) - MINOR
 *
 * Total: 100 points
 * Philosophy: Heavy penalty for missing critical items (migrations, E2E tests)
 *
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} Validation result
 */
export async function validateGate2ExecToPlan(sd_id, supabase) {
  console.log('\n🚪 GATE 2: Implementation Fidelity Validation (EXEC→PLAN)');
  console.log('='.repeat(60));

  const validation = {
    passed: true,
    score: 0,
    max_score: 100,
    issues: [],
    warnings: [],
    details: {},
    failed_gates: [],
    gate_scores: {}
  };

  // SD-TECH-DEBT-DOCS-001: Check if this is a documentation-only SD
  // Documentation-only SDs skip implementation fidelity validation
  try {
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, sd_type, scope, category')
      .eq('id', sd_id)
      .single();

    if (sd && shouldSkipCodeValidation(sd)) {
      const validationReqs = getValidationRequirements(sd);
      console.log(`\n   ✅ DOCUMENTATION-ONLY SD DETECTED (sd_type=${sd.sd_type || 'detected'})`);
      console.log(`      Reason: ${validationReqs.reason}`);
      console.log('      SKIPPING implementation fidelity validation');
      console.log('      (No code changes to validate)\n');

      // Return passing validation for documentation-only SDs
      validation.passed = true;
      validation.score = 100;
      validation.details.sd_type_bypass = {
        sd_type: sd.sd_type,
        reason: 'Documentation-only SD - no code implementation to validate',
        skipped_checks: ['testing', 'server_restart', 'code_quality', 'design_fidelity', 'database_fidelity']
      };
      validation.warnings.push('Gate 2 validation skipped for documentation-only SD');

      return validation;
    }
  } catch (error) {
    console.log(`   ⚠️  Could not check sd_type: ${error.message}`);
    // Continue with standard validation if we can't check sd_type
  }

  // SD-NAV-CMD-001 lesson: Bugfix SDs skip sub-agent orchestration, so they need relaxed TESTING requirements
  // Bugfix SDs validate via git commit evidence instead of TESTING sub-agent results
  // LEO Protocol v4.3.3: Cosmetic refactoring also skips TESTING - low risk, unit tests sufficient
  // LEO Protocol v4.3.3: Resolve sd_id to UUID for consistent database queries
  let resolvedSdUuid = sd_id; // Default to original if lookup fails

  try {
    // Support both UUID and legacy_id/sd_key lookups
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sd_id);
    let sd, sdError;

    if (isUUID) {
      resolvedSdUuid = sd_id; // Already a UUID
      const result = await supabase
        .from('strategic_directives_v2')
        .select('id, title, sd_type, scope, category, intensity_level')
        .eq('id', sd_id)
        .single();
      sd = result.data;
      sdError = result.error;
    } else {
      const result = await supabase
        .from('strategic_directives_v2')
        .select('id, title, sd_type, scope, category, intensity_level')
        .or(`legacy_id.eq.${sd_id},sd_key.eq.${sd_id}`)
        .single();
      sd = result.data;
      sdError = result.error;
      if (sd?.id) {
        resolvedSdUuid = sd.id; // Use the resolved UUID for subsequent queries
      }
    }

    if (sdError) {
      console.log(`   ⚠️  SD query error: ${sdError.message}`);
    }

    const sdType = (sd?.sd_type || '').toLowerCase();
    const intensityLevel = (sd?.intensity_level || '').toLowerCase();

    console.log(`   🔍 SD Type check: sd_type=${sdType}, intensity_level=${intensityLevel}`);

    // Fetch Gate 2 exempt sections for this SD type
    try {
      const { data: typeProfile } = await supabase
        .from('sd_type_validation_profiles')
        .select('gate2_exempt_sections')
        .eq('sd_type', sdType)
        .single();

      if (typeProfile?.gate2_exempt_sections?.length > 0) {
        validation.details.gate2_exempt_sections = typeProfile.gate2_exempt_sections;
        console.log(`   📋 Gate 2 exempt sections for ${sdType}: ${typeProfile.gate2_exempt_sections.join(', ')}`);
      }
    } catch (_e) {
      // No exemptions configured - continue with standard validation
    }

    // Frontend SD type - pure UI work without database requirements
    if (sdType === 'frontend') {
      console.log(`\n   ℹ️  FRONTEND SD DETECTED (sd_type=${sdType})`);
      console.log('      Pure UI/component work - database sections exempt');
      console.log('      Focus on component implementation and E2E tests\n');
      validation.details.frontend_mode = true;
    }

    if (sdType === 'bugfix' || sdType === 'bug_fix') {
      console.log(`\n   ℹ️  BUGFIX SD DETECTED (sd_type=${sdType})`);
      console.log('      Bugfix SDs skip sub-agent orchestration, using git commit evidence instead');
      console.log('      Relaxing TESTING sub-agent requirements\n');

      // For bugfix SDs, we still validate git commits, but don't require TESTING sub-agent
      validation.details.bugfix_mode = true;
      validation.details.testing_requirement = 'relaxed';
    } else if (sdType === 'refactor' && intensityLevel === 'cosmetic') {
      console.log(`\n   ℹ️  COSMETIC REFACTOR SD DETECTED (intensity=${intensityLevel})`);
      console.log('      Cosmetic refactoring (renames, module extraction) is low-risk');
      console.log('      Unit tests sufficient - E2E/TESTING sub-agent not required\n');

      // LEO Protocol v4.3.3: Cosmetic refactoring uses unit tests, not E2E
      validation.details.cosmetic_refactor_mode = true;
      validation.details.testing_requirement = 'unit_tests_only';
    }
  } catch (_error) {
    // Continue with standard validation
  }

  // ===================================================================
  // PHASE 1: NON-NEGOTIABLE BLOCKERS (Preflight Checks)
  // ===================================================================
  console.log('\n[PHASE 1] Non-Negotiable Blockers...');
  console.log('-'.repeat(60));

  // [PHASE 1-A] Application Directory Verification (NON-NEGOTIABLE #10)
  console.log('\n[PHASE 1-A] Verifying application directory...');

  try {
    const { stdout: gitRoot } = await execAsync('git rev-parse --show-toplevel');
    const workingDirectory = gitRoot.trim();

    // Expected directory: EHG_Engineer root
    const expectedDir = EHG_ENGINEER_ROOT;
    const wrongDir = EHG_ROOT;

    if (workingDirectory === wrongDir) {
      validation.issues.push('[PREFLIGHT] CRITICAL: EXEC worked in wrong codebase (ehg instead of EHG_Engineer)');
      validation.failed_gates.push('APP_DIR_VERIFICATION');
      console.log(`   ❌ Wrong codebase detected: ${workingDirectory}`);
      console.log(`   ⚠️  Expected: ${expectedDir}`);
      console.log('   ⚠️  NON-NEGOTIABLE: EXEC must work in correct application directory');
      validation.passed = false;
      return validation; // Block immediately - no point validating wrong codebase
    } else if (workingDirectory === expectedDir) {
      console.log(`   ✅ Correct application directory verified: ${workingDirectory}`);
    } else {
      validation.warnings.push(`[PREFLIGHT] Unexpected working directory: ${workingDirectory}`);
      console.log(`   ⚠️  Unexpected directory: ${workingDirectory}`);
    }
  } catch (error) {
    validation.warnings.push(`[PREFLIGHT] Cannot verify application directory: ${error.message}`);
    console.log(`   ⚠️  Cannot verify directory: ${error.message}`);
  }

  // ===================================================================
  // PREFLIGHT: Ambiguity Resolution Verification (NON-NEGOTIABLE #11)
  // ===================================================================
  console.log('\n[PREFLIGHT] Checking for unresolved ambiguities...');

  // SD-VENTURE-STAGE0-UI-001: Search by both UUID and legacy_id
  try {
    // Get all changes for this SD
    const searchTerms = await getSDSearchTerms(sd_id, supabase);
    const implementationRepo = await detectImplementationRepo(sd_id, supabase);
    const gitLog = await gitLogForSD(
      `git -C "${implementationRepo}" log --all --grep="\${TERM}" --format="%H" -n 1`,
      searchTerms,
      { timeout: 10000 }
    );
    const commitHash = gitLog.trim().split('\n')[0]; // Take first commit if multiple

    if (commitHash) {
      // Get diff of the commit to check for problematic comments
      // SD-CAPITAL-FLOW-001: Use -C to run git in the correct repository
      const { stdout: diff } = await execAsync(`git -C "${implementationRepo}" show ${commitHash}`);

      // Patterns indicating unresolved ambiguity
      const ambiguityPatterns = [
        /TODO:.*\?/gi,           // TODO with question marks
        /FIXME/gi,               // FIXME comments
        /HACK/gi,                // HACK comments
        /not sure/gi,            // "not sure" comments
        /unclear/gi,             // "unclear" comments
        /ambiguous/gi,           // "ambiguous" comments
        /\?\?\?/g,               // Multiple question marks
        /need to ask/gi,         // "need to ask"
        /don't know/gi           // "don't know"
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
        return validation; // Block immediately
      } else {
        console.log('   ✅ No unresolved ambiguity markers found in implementation');
      }
    } else {
      validation.warnings.push('[PREFLIGHT] Cannot find commit for SD - skipping ambiguity check');
      console.log('   ⚠️  Cannot find commit for ambiguity verification');
    }
  } catch (error) {
    validation.warnings.push(`[PREFLIGHT] Cannot verify ambiguity resolution: ${error.message}`);
    console.log(`   ⚠️  Cannot verify ambiguity resolution: ${error.message}`);
  }

  // ===================================================================
  // PREFLIGHT: Server Restart Verification (NON-NEGOTIABLE #14)
  // ===================================================================
  console.log('\n[PREFLIGHT] Verifying server restart and manual testing...');

  // SD-NAV-CMD-001 lesson: Bugfix SDs skip sub-agent orchestration
  // They validate via git commits instead of TESTING sub-agent
  if (validation.details.bugfix_mode) {
    console.log('   ℹ️  Bugfix SD - TESTING sub-agent verification SKIPPED');
    console.log('   ℹ️  Bugfix SDs use git commit evidence for validation');
    validation.warnings.push('[PREFLIGHT] TESTING verification skipped for bugfix SD');
  } else if (validation.details.cosmetic_refactor_mode) {
    // LEO Protocol v4.3.3: Cosmetic refactoring skips E2E testing
    console.log('   ℹ️  Cosmetic Refactor SD - TESTING sub-agent verification SKIPPED');
    console.log('   ℹ️  Cosmetic refactoring uses unit tests (run npx vitest for verification)');
    console.log('   ℹ️  Git commit evidence validates implementation completeness');
    validation.warnings.push('[PREFLIGHT] TESTING verification skipped for cosmetic refactor SD');
  } else {
    try {
      // Query TESTING sub-agent to verify server was operational
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
        return validation; // Block immediately
      } else {
        const testingResult = testingResults[0];

        // If TESTING passed, server must have been running
        if (testingResult.verdict === 'PASS') {
          console.log('   ✅ Server verified operational (TESTING sub-agent passed)');
          console.log(`   ✅ Tests executed at: ${testingResult.created_at}`);
        } else if (testingResult.verdict === 'BLOCKED') {
          validation.issues.push('[PREFLIGHT] CRITICAL: TESTING failed - server may not be working correctly');
          validation.failed_gates.push('SERVER_RESTART_VERIFICATION');
          console.log('   ❌ TESTING failed - implementation not verified as working');
          console.log('   ⚠️  NON-NEGOTIABLE: EXEC must ensure server restarts cleanly and tests pass');
          validation.passed = false;
          return validation; // Block immediately
        } else {
          validation.warnings.push('[PREFLIGHT] TESTING verdict is CONDITIONAL_PASS - server verification incomplete');
          console.log('   ⚠️  TESTING inconclusive - server restart verification unclear');
        }
      }
    } catch (error) {
      validation.warnings.push(`[PREFLIGHT] Cannot verify server restart: ${error.message}`);
      console.log(`   ⚠️  Cannot verify server restart: ${error.message}`);
    }
  }

  // ===================================================================
  // PREFLIGHT: Stubbed Code Detection (NON-NEGOTIABLE #20)
  // ===================================================================
  console.log('\n[PREFLIGHT] Checking for stubbed/incomplete code...');

  // LEO Protocol v4.3.3: Skip strict stub detection for cosmetic refactoring
  // Cosmetic changes (module extraction, renames) don't introduce new stubs
  if (validation.details.cosmetic_refactor_mode) {
    console.log('   ℹ️  Cosmetic Refactor SD - Stub detection SKIPPED');
    console.log('   ℹ️  Module extraction/rename work preserves existing functionality');
    validation.warnings.push('[PREFLIGHT] Stub detection skipped for cosmetic refactor SD');
  } else {
  // SD-VENTURE-STAGE0-UI-001: Search by both UUID and legacy_id
  try {
    // Get all changes for this SD (reuse cached searchTerms)
    const searchTermsStub = await getSDSearchTerms(sd_id, supabase);
    const implementationRepoStub = await detectImplementationRepo(sd_id, supabase);
    const gitLogStub = await gitLogForSD(
      `git -C "${implementationRepoStub}" log --all --grep="\${TERM}" --format="%H" -n 1`,
      searchTermsStub,
      { timeout: 10000 }
    );
    const commitHash = gitLogStub.trim().split('\n')[0]; // Take first commit if multiple

    if (commitHash) {
      // Get diff of the commit to check for stubbed code
      // SD-CAPITAL-FLOW-001: Use -C to run git in the correct repository
      const { stdout: diff } = await execAsync(`git -C "${implementationRepoStub}" show ${commitHash}`);

      // Patterns indicating stubbed/incomplete code
      const stubbedCodePatterns = [
        /throw new Error\(['"]not implemented/gi,
        /throw new Error\(['"]TODO/gi,
        /return null;?\s*\/\/\s*TODO/gi,
        /return undefined;?\s*\/\/\s*TODO/gi,
        /TODO:\s*implement/gi,
        /stub(bed)?Function/gi,
        /(?<!=["'])\bplaceholder\b(?:\s+(?:function|implementation|code|data|value)|$)/gi,  // Match "placeholder function", not HTML placeholder=""
        /temporary implementation/gi,
        /console\.log\(['"]TODO/gi,
        /\/\/\s*STUB:/gi,
        /\/\*\s*STUB\s*\*\//gi,
        /function\s+\w+\([^)]*\)\s*\{\s*\}/g,  // Empty functions
        /const\s+\w+\s*=\s*\([^)]*\)\s*=>\s*\{\s*\}/g,  // Empty arrow functions
        /return\s*\{\s*\};?\s*\/\/\s*(stub|todo|placeholder)/gi
      ];

      const foundStubs = [];
      const foundLines = new Set(); // Avoid duplicates

      // Check each pattern
      for (const pattern of stubbedCodePatterns) {
        const matches = diff.match(pattern);
        if (matches) {
          for (const match of matches) {
            // Only include added lines (starting with +)
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
        return validation; // Block immediately
      } else {
        console.log('   ✅ No stubbed or incomplete code patterns detected');
      }
    } else {
      validation.warnings.push('[PREFLIGHT] Cannot find commit for SD - skipping stub detection');
      console.log('   ⚠️  Cannot find commit for stub detection');
    }
  } catch (error) {
    validation.warnings.push(`[PHASE 1] Cannot detect stubbed code: ${error.message}`);
    console.log(`   ⚠️  Cannot detect stubbed code: ${error.message}`);
  }
  } // End of else block for cosmetic_refactor_mode skip

  console.log('   ✅ All Phase 1 blockers passed - proceeding to Phase 2 scoring');

  // ===================================================================
  // PHASE 2: WEIGHTED SCORING (Negotiable Checks)
  // ===================================================================
  console.log('\n[PHASE 2] Weighted Scoring...');
  console.log('-'.repeat(60));

  try {
    // Fetch PRD metadata with DESIGN and DATABASE analyses
    // LEO Protocol v4.3.3: Use resolved UUID for PRD lookup (directive_id is a UUID)
    const { data: prdData, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('metadata, directive_id, title')
      .eq('directive_id', resolvedSdUuid)
      .single();

    if (prdError) {
      console.log(`   ⚠️  PRD fetch error: ${prdError.message}`);
      validation.issues.push(`Failed to fetch PRD: ${prdError.message}`);
      validation.failed_gates.push('PRD_FETCH');
      validation.passed = false; // Explicitly mark as failed
      return validation;
    }

    const designAnalysis = prdData?.metadata?.design_analysis;
    const databaseAnalysis = prdData?.metadata?.database_analysis;

    if (!designAnalysis && !databaseAnalysis) {
      validation.warnings.push('No DESIGN or DATABASE analysis found - skipping Gate 2');
      validation.score = 100; // Pass by default if not applicable
      validation.passed = true;
      return validation;
    }

    // ===================================================================
    // SECTION A: Design Implementation Fidelity (25 points)
    // ===================================================================
    console.log('\n[A] Design Implementation Fidelity');
    console.log('-'.repeat(60));

    await validateDesignFidelity(sd_id, designAnalysis, validation, supabase);

    // ===================================================================
    // SECTION B: Database Implementation Fidelity (25 points)
    // ===================================================================
    console.log('\n[B] Database Implementation Fidelity');
    console.log('-'.repeat(60));

    await validateDatabaseFidelity(sd_id, databaseAnalysis, validation, supabase);

    // ===================================================================
    // SECTION C: Data Flow Alignment (25 points)
    // ===================================================================
    console.log('\n[C] Data Flow Alignment');
    console.log('-'.repeat(60));

    await validateDataFlowAlignment(sd_id, designAnalysis, databaseAnalysis, validation, supabase);

    // ===================================================================
    // SECTION D: Enhanced Testing (25 points)
    // ===================================================================
    console.log('\n[D] Enhanced Testing');
    console.log('-'.repeat(60));

    await validateEnhancedTesting(sd_id, designAnalysis, databaseAnalysis, validation, supabase);

    // ===================================================================
    // FINAL VALIDATION RESULT (with Adaptive Threshold)
    // ===================================================================
    console.log('\n' + '='.repeat(60));
    console.log(`GATE 2 SCORE: ${validation.score}/${validation.max_score} points`);

    // Calculate adaptive threshold based on SD context and Gate 1 performance
    const { data: gate1Handoff } = await supabase
      .from('sd_phase_handoffs')
      .select('metadata')
      .eq('sd_id', sd_id)
      .eq('handoff_type', 'PLAN-TO-EXEC')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const priorGateScores = gate1Handoff?.metadata?.gate1_validation?.score
      ? [gate1Handoff.metadata.gate1_validation.score]
      : [];

    // Fetch SD data for pattern tracking
    const { data: sdData } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sd_id)
      .single();

    // Fetch pattern statistics for maturity bonus
    const patternStats = await getPatternStats(sdData, supabase);

    const thresholdResult = calculateAdaptiveThreshold({
      sd: sdData,
      priorGateScores,
      patternStats,
      gateNumber: 2
    });

    validation.details.adaptive_threshold = thresholdResult;
    const requiredThreshold = thresholdResult.finalThreshold;

    console.log(`\nAdaptive Threshold: ${requiredThreshold.toFixed(1)}%`);
    console.log(`Reasoning: ${thresholdResult.reasoning}`);

    if (validation.score >= requiredThreshold) {
      validation.passed = true;
      console.log(`✅ GATE 2: PASSED (${validation.score} ≥ ${requiredThreshold.toFixed(1)} points)`);
    } else {
      validation.passed = false;
      console.log(`❌ GATE 2: FAILED (${validation.score} < ${requiredThreshold.toFixed(1)} points)`);
    }

    if (validation.issues.length > 0) {
      console.log(`\nBlocking Issues (${validation.issues.length}):`);
      validation.issues.forEach(issue => console.log(`  ❌ ${issue}`));
    }

    if (validation.warnings.length > 0) {
      console.log(`\nWarnings (${validation.warnings.length}):`);
      validation.warnings.forEach(warning => console.log(`  ⚠️  ${warning}`));
    }

    console.log('='.repeat(60));

    return validation;

  } catch (error) {
    console.error('\n❌ GATE 2 Validation Error:', error.message);
    validation.passed = false;
    validation.issues.push(`Validation error: ${error.message}`);
    validation.details.error = error.message;
    return validation;
  }
}

/**
 * Validate Design Implementation Fidelity (Section A - 20 points)
 * Phase-aware weighting: Reduced from 25 to make room for critical database checks
 */
async function validateDesignFidelity(sd_id, designAnalysis, validation, supabase) {
  // SD-CAPITAL-FLOW-001: Check if this is a database SD without UI requirements
  // Database SDs that only create migrations should get full credit for Section A
  try {
    // Try UUID first, then legacy_id
    let sd = null;
    const { data: sdById } = await supabase
      .from('strategic_directives_v2')
      .select('sd_type, scope')
      .eq('id', sd_id)
      .single();

    if (sdById) {
      sd = sdById;
    } else {
      const { data: sdByLegacy } = await supabase
        .from('strategic_directives_v2')
        .select('sd_type, scope')
        .eq('legacy_id', sd_id)
        .single();
      sd = sdByLegacy;
    }

    if (sd?.sd_type === 'database') {
      // Check if scope INCLUDED section mentions UI/component work
      // Only check the 'included' part, not 'excluded' (SD-CAPITAL-FLOW-001 fix)
      let scopeToCheck = '';
      if (typeof sd.scope === 'object' && sd.scope?.included) {
        // JSON scope - only check included items
        scopeToCheck = Array.isArray(sd.scope.included)
          ? sd.scope.included.join(' ')
          : String(sd.scope.included);
      } else if (typeof sd.scope === 'string') {
        try {
          const parsed = JSON.parse(sd.scope);
          if (parsed?.included) {
            scopeToCheck = Array.isArray(parsed.included)
              ? parsed.included.join(' ')
              : String(parsed.included);
          }
        } catch {
          scopeToCheck = sd.scope;
        }
      }

      const hasUIScope = /component|ui\s|frontend|form|page|view/i.test(scopeToCheck);

      if (!hasUIScope) {
        console.log('   ✅ Database SD without UI requirements - Section A not applicable (25/25)');
        validation.score += 25; // Full credit for N/A
        validation.gate_scores.design_fidelity = 25;
        validation.details.design_fidelity = {
          skipped: true,
          reason: 'Database SD without UI requirements - design fidelity not applicable'
        };
        return;
      }
    }
  } catch (_e) {
    // Continue with normal validation if SD type check fails
  }

  if (!designAnalysis) {
    validation.warnings.push('[A] No DESIGN analysis found - skipping design fidelity check');
    validation.score += 13; // Partial credit if not applicable
    validation.gate_scores.design_fidelity = 13;
    console.log('   ⚠️  No DESIGN analysis - partial credit (13/25)');
    return;
  }

  let sectionScore = 0;
  const sectionDetails = {};

  // A1: Check for UI component implementation (10 points)
  console.log('\n   [A1] UI Components Implementation...');

  // Look for component files in git commits (use detected repo)
  // SD-VENTURE-STAGE0-UI-001: Search by both UUID and legacy_id
  try {
    const implementationRepo = await detectImplementationRepo(sd_id, supabase);
    const searchTerms = await getSDSearchTerms(sd_id, supabase);
    const gitLog = await gitLogForSD(
      `git -C "${implementationRepo}" log --all --grep="\${TERM}" --name-only --pretty=format:""`,
      searchTerms,
      { timeout: 10000 }
    );

    const componentFiles = gitLog.split('\n')
      .filter(f => f.match(/\.(tsx?|jsx?)$/) && (f.includes('component') || f.includes('Component') || f.includes('src/')))
      .filter(Boolean);

    if (componentFiles.length > 0) {
      sectionScore += 10;
      sectionDetails.components_implemented = componentFiles.length;
      sectionDetails.component_files = componentFiles.slice(0, 5); // First 5
      console.log(`   ✅ Found ${componentFiles.length} component files`);
    } else {
      validation.warnings.push('[A1] No component files found in git commits');
      sectionScore += 5; // Partial credit
      console.log('   ⚠️  No component files found (5/10)');
    }
  } catch (error) {
    validation.warnings.push(`[A1] Git log check failed: ${error.message}`);
    sectionScore += 5; // Partial credit on error
    console.log('   ⚠️  Cannot verify components (5/10)');
  }

  // A2: Check for workflow implementation (10 points)
  console.log('\n   [A2] User Workflows Implementation...');

  // Check if handoff mentions workflow implementation
  const { data: handoffData } = await supabase
    .from('sd_phase_handoffs')
    .select('deliverables, metadata')
    .eq('sd_id', sd_id)
    .eq('handoff_type', 'EXEC-TO-PLAN')
    .order('created_at', { ascending: false })
    .limit(1);

  if (handoffData?.[0]?.deliverables) {
    const deliverables = JSON.stringify(handoffData[0].deliverables).toLowerCase();
    const hasWorkflowMention = deliverables.includes('workflow') ||
                                deliverables.includes('user flow') ||
                                deliverables.includes('user action');

    if (hasWorkflowMention) {
      sectionScore += 10;
      sectionDetails.workflows_mentioned = true;
      console.log('   ✅ Workflows mentioned in EXEC deliverables');
    } else {
      validation.warnings.push('[A2] Workflows not explicitly mentioned in deliverables');
      sectionScore += 5; // Partial credit
      console.log('   ⚠️  Workflows not mentioned (5/10)');
    }
  } else {
    validation.warnings.push('[A2] No EXEC→PLAN handoff found');
    sectionScore += 5; // Partial credit
    console.log('   ⚠️  No handoff found (5/10)');
  }

  // A3: Check for user action support (5 points)
  console.log('\n   [A3] User Actions Support...');

  // Look for CRUD-related code changes
  // SD-VENTURE-STAGE0-UI-001: Search by both UUID and legacy_id
  try {
    const searchTerms = await getSDSearchTerms(sd_id, supabase);
    const implementationRepo = await detectImplementationRepo(sd_id, supabase);
    const gitDiff = await gitLogForSD(
      `git -C "${implementationRepo}" log --all --grep="\${TERM}" --pretty=format:"" --patch`,
      searchTerms,
      { timeout: 15000 }
    );

    const hasCRUD = gitDiff.toLowerCase().includes('create') ||
                    gitDiff.toLowerCase().includes('update') ||
                    gitDiff.toLowerCase().includes('delete') ||
                    gitDiff.toLowerCase().includes('insert');

    if (hasCRUD) {
      sectionScore += 5;
      sectionDetails.crud_operations_found = true;
      console.log('   ✅ CRUD operations found in code changes');
    } else {
      validation.warnings.push('[A3] No CRUD operations detected in code changes');
      sectionScore += 3; // Partial credit
      console.log('   ⚠️  No CRUD operations detected (3/5)');
    }
  } catch (_error) {
    sectionScore += 3; // Partial credit on error
    console.log('   ⚠️  Cannot verify CRUD operations (3/5)');
  }

  validation.score += sectionScore;
  validation.gate_scores.design_fidelity = sectionScore;
  validation.details.design_fidelity = sectionDetails;
  console.log(`\n   Section A Score: ${sectionScore}/25`);
}

/**
 * Validate Database Implementation Fidelity (Section B - 35 points)
 * Phase-aware weighting: Migration execution is CRITICAL (20 pts)
 */
async function validateDatabaseFidelity(sd_id, databaseAnalysis, validation, supabase) {
  // Check for exempt sections
  const exemptSections = validation.details.gate2_exempt_sections || [];
  const isB1Exempt = exemptSections.includes('B1_migrations');
  const isB2Exempt = exemptSections.includes('B2_rls');
  const isB3Exempt = exemptSections.includes('B3_complexity');

  // If all B sections are exempt, award full points
  if (isB1Exempt && isB2Exempt && isB3Exempt) {
    validation.score += 35;
    validation.gate_scores.database_fidelity = 35;
    validation.details.database_fidelity = {
      exempt: true,
      reason: 'All Section B checks exempt for this SD type'
    };
    console.log('   ✅ Section B fully exempt for this SD type (35/35)');
    return;
  }

  if (!databaseAnalysis) {
    validation.warnings.push('[B] No DATABASE analysis found - skipping database fidelity check');
    validation.score += 18; // Partial credit if not applicable (50% of 35)
    validation.gate_scores.database_fidelity = 18;
    console.log('   ⚠️  No DATABASE analysis - partial credit (18/35)');
    return;
  }

  let sectionScore = 0;
  const sectionDetails = {};
  sectionDetails.exemptions = { B1: isB1Exempt, B2: isB2Exempt, B3: isB3Exempt };

  // B1: Check for migration files AND execution (25 points)
  // 5 points: Migration files created
  // 20 points: Migrations actually executed (CRITICAL - phase-aware weight)
  console.log('\n   [B1] Schema Change Migrations (Creation + Execution)...');

  if (isB1Exempt) {
    sectionScore += 25;
    sectionDetails.B1_exempt = true;
    console.log('   ✅ B1 exempt for this SD type - full credit (25/25)');
  } else {
  try {
    // SD-CAPITAL-FLOW-001: Detect the correct implementation repo for migration search
    const implementationRepo = await detectImplementationRepo(sd_id, supabase);
    console.log(`   📂 Searching for migrations in: ${implementationRepo}`);

    const migrationDirs = [
      'database/migrations',
      'supabase/migrations',
      'migrations'
    ];

    let migrationFiles = [];
    // Move sdIdLower outside for loop so it's available throughout the function scope
    const sdIdLower = sd_id.replace('SD-', '').toLowerCase();
    for (const dir of migrationDirs) {
      // SD-CAPITAL-FLOW-001: Use implementation repo, not process.cwd()
      const fullPath = path.join(implementationRepo, dir);
      if (existsSync(fullPath)) {
        const files = await readdir(fullPath);
        // SD-VENTURE-STAGE0-UI-001: Improved migration detection
        // Only match by SD ID, not by today's date (which could match unrelated migrations)
        // The date-based matching was causing false positives for UI-only SDs
        const sdMigrations = files.filter(f => {
          const fileLower = f.toLowerCase();
          // Must contain part of the SD ID (UUID or SD number)
          return fileLower.includes(sdIdLower) ||
                 fileLower.includes(sdIdLower.split('-')[0]); // First UUID segment
        });
        migrationFiles.push(...sdMigrations.map(f => ({ dir, file: f })));
      }
    }

    if (migrationFiles.length > 0) {
      sectionScore += 5; // Award 5 points for files existing
      sectionDetails.migration_files = migrationFiles.map(m => `${m.dir}/${m.file}`);
      sectionDetails.migration_count = migrationFiles.length;
      // SD-CAPITAL-FLOW-001: Store implementation repo for later file reading
      sectionDetails.implementation_repo = implementationRepo;
      console.log(`   ✅ Found ${migrationFiles.length} migration file(s) (5/25)`);

      // B1.2: Verify migrations were executed (20 points - CRITICAL)
      console.log('   [B1.2] Verifying migration execution...');

      try {
        // Query Supabase schema_migrations table to check execution
        // Try with common column names first, fall back to * if schema differs
        let executedMigrations = null;
        let migrationError = null;

        // Try standard Supabase migration schema first
        const { data: data1, error: error1 } = await supabase
          .from('schema_migrations')
          .select('version, name');

        if (error1 && error1.message.includes('column') && error1.message.includes('does not exist')) {
          // Schema differs - try selecting all columns instead
          const { data: data2, error: error2 } = await supabase
            .from('schema_migrations')
            .select('*');
          executedMigrations = data2;
          migrationError = error2;
        } else {
          executedMigrations = data1;
          migrationError = error1;
        }

        if (migrationError) {
          // SD-VENTURE-STAGE0-UI-001: Handle non-existent schema_migrations table gracefully
          // If table doesn't exist, this is likely a project without migration tracking
          // Don't block - give partial credit and warn instead
          const tableNotExistsMsg = "Could not find the table 'public.schema_migrations'";
          const columnNotExistsMsg = 'column';
          if (migrationError.message.includes(tableNotExistsMsg)) {
            console.log('   ⚠️  schema_migrations table does not exist - cannot verify (13/20)');
            sectionScore += 13; // Partial credit - can't verify but not a blocking issue
            sectionDetails.migration_execution_verified = null; // Unknown
            sectionDetails.migration_execution_note = 'No schema_migrations table - manual verification required';
            validation.warnings.push('[B1.2] Migration execution could not be auto-verified - no schema_migrations table');
          } else if (migrationError.message.includes(columnNotExistsMsg)) {
            // Schema mismatch - table exists but has different columns
            console.log('   ⚠️  schema_migrations has non-standard schema - cannot auto-verify (13/20)');
            sectionScore += 13; // Partial credit - schema differs
            sectionDetails.migration_execution_verified = null;
            sectionDetails.migration_execution_note = 'Non-standard schema_migrations schema - manual verification required';
            validation.warnings.push('[B1.2] Migration execution could not be auto-verified - schema mismatch');
          } else {
            console.log(`   ⚠️  Cannot query schema_migrations: ${migrationError.message} (0/20)`);
            sectionScore += 0; // No points if can't verify (critical check)
            sectionDetails.migration_execution_verified = false;
            sectionDetails.migration_execution_error = migrationError.message;
            validation.issues.push('[B1.2] Cannot verify migration execution - database query failed');
          }
        } else if (executedMigrations && executedMigrations.length > 0) {
          // Extract version/timestamp from migration filenames
          // Typical format: YYYYMMDDHHMMSS_description.sql or similar
          const migrationVersions = migrationFiles.map(m => {
            const filename = m.file;
            // Extract timestamp/version from start of filename
            const versionMatch = filename.match(/^(\d{14}|\d{8}_\d{6})/);
            return versionMatch ? versionMatch[1].replace('_', '') : null;
          }).filter(Boolean);

          // Check if any of our migrations are in the executed list
          const executedVersions = executedMigrations.map(m => m.version || m.name);
          const ourExecutedMigrations = migrationVersions.filter(v =>
            executedVersions.some(ev => ev.includes(v) || v.includes(ev))
          );

          if (ourExecutedMigrations.length > 0) {
            sectionScore += 20;
            sectionDetails.migration_execution_verified = true;
            sectionDetails.executed_migration_count = ourExecutedMigrations.length;
            console.log(`   ✅ Verified ${ourExecutedMigrations.length}/${migrationFiles.length} migration(s) executed (20/20)`);
          } else {
            // Migration files exist but weren't executed - CRITICAL FAILURE
            validation.issues.push('[B1.2] CRITICAL: Migration files created but NOT EXECUTED in database');
            sectionScore += 0; // Zero points - this is a critical failure
            sectionDetails.migration_execution_verified = false;
            sectionDetails.executed_migration_count = 0;
            console.log('   ❌ Migration files exist but NOT EXECUTED (0/20)');
            console.log('   ⚠️  CRITICAL FAILURE: Run migrations before EXEC→PLAN handoff');
          }
        } else {
          // SD-VISION-V2-006: Empty schema_migrations table suggests migrations weren't run
          // But for UI-only SDs, there may be no migrations to run - give partial credit
          // Only block if migration files contain the full SD ID (indicating SD-specific migrations)
          const hasSDSpecificMigrations = migrationFiles.some(m =>
            m.file.toLowerCase().includes(sdIdLower)
          );

          if (hasSDSpecificMigrations) {
            // SD-specific migrations exist but weren't executed - blocking
            sectionScore += 0;
            sectionDetails.migration_execution_verified = false;
            validation.issues.push('[B1.2] No migration execution history found - cannot verify');
            console.log('   ❌ No migration history found (0/20)');
          } else {
            // Migration files found aren't specific to this SD - partial credit
            sectionScore += 13;
            sectionDetails.migration_execution_verified = null;
            sectionDetails.migration_execution_note = 'No SD-specific migrations to verify';
            validation.warnings.push('[B1.2] Migration history empty but no SD-specific migrations detected');
            console.log('   ⚠️  No SD-specific migrations to verify (13/20)');
          }
        }
      } catch (execCheckError) {
        sectionScore += 0; // No points on error (critical check)
        validation.issues.push(`[B1.2] Migration execution check error: ${execCheckError.message}`);
        console.log(`   ❌ Error checking migration execution: ${execCheckError.message} (0/20)`);
      }
    } else {
      validation.warnings.push('[B1] No migration files found for this SD');
      sectionScore += 13; // Partial credit (might not need migrations) - 13/25 for N/A
      sectionDetails.migration_execution_verified = null; // Not applicable
      console.log('   ⚠️  No migration files found - partial credit if N/A (13/25)');
    }
  } catch (error) {
    validation.warnings.push(`[B1] Migration check failed: ${error.message}`);
    sectionScore += 0; // No points on error - cannot verify critical check
    console.log('   ❌ Cannot verify migrations - error (0/25)');
  }
  } // End B1 else block

  // B2: Check for RLS policies (5 points)
  console.log('\n   [B2] RLS Policies...');

  if (isB2Exempt) {
    sectionScore += 5;
    sectionDetails.B2_exempt = true;
    console.log('   ✅ B2 exempt for this SD type - full credit (5/5)');
  } else {
    // SD-VENTURE-STAGE0-UI-001: Search by both UUID and legacy_id
    try {
      const searchTerms = await getSDSearchTerms(sd_id, supabase);
      const implementationRepo = await detectImplementationRepo(sd_id, supabase);
      const gitDiff = await gitLogForSD(
        `git -C "${implementationRepo}" log --all --grep="\${TERM}" --pretty=format:"" --patch`,
        searchTerms,
        { timeout: 15000 }
      );

      const hasRLS = gitDiff.includes('CREATE POLICY') ||
                     gitDiff.includes('ALTER POLICY') ||
                     gitDiff.toLowerCase().includes('rls');

      if (hasRLS) {
        sectionScore += 5;
        sectionDetails.rls_policies_found = true;
        console.log('   ✅ RLS policies found in migrations');
      } else {
        validation.warnings.push('[B2] No RLS policies detected');
        sectionScore += 3; // Partial credit (might not need RLS)
        console.log('   ⚠️  No RLS policies detected (3/5)');
      }
    } catch (_error) {
      sectionScore += 3; // Partial credit on error
      console.log('   ⚠️  Cannot verify RLS policies (3/5)');
    }
  }

  // B3: Migration complexity check (5 points)
  console.log('\n   [B3] Migration Complexity Alignment...');

  if (isB3Exempt) {
    sectionScore += 5;
    sectionDetails.B3_exempt = true;
    console.log('   ✅ B3 exempt for this SD type - full credit (5/5)');
  } else if (sectionDetails.migration_files && sectionDetails.migration_files.length > 0) {
    try {
      // Read first migration file to estimate complexity
      // SD-CAPITAL-FLOW-001: Use stored implementation repo, not process.cwd()
      const firstMigration = sectionDetails.migration_files[0];
      const repoPath = sectionDetails.implementation_repo || process.cwd();
      const fullPath = path.join(repoPath, firstMigration);
      const content = await readFile(fullPath, 'utf-8');
      const lineCount = content.split('\n').length;

      sectionDetails.migration_line_count = lineCount;

      // Always give credit for having a migration
      sectionScore += 5;
      console.log(`   ✅ Migration file has ${lineCount} lines`);
    } catch (_error) {
      sectionScore += 3; // Partial credit
      console.log('   ⚠️  Cannot read migration file (3/5)');
    }
  } else {
    sectionScore += 3; // Partial credit (no migration to check)
    console.log('   ⚠️  No migration to check complexity (3/5)');
  }

  validation.score += sectionScore;
  validation.gate_scores.database_fidelity = sectionScore;
  validation.details.database_fidelity = sectionDetails;
  console.log(`\n   Section B Score: ${sectionScore}/35`);
}

/**
 * Validate Data Flow Alignment (Section C - 25 points)
 */
async function validateDataFlowAlignment(sd_id, designAnalysis, databaseAnalysis, validation, supabase) {
  // SD-CAPITAL-FLOW-001: Check if this is a database SD without UI/form requirements
  // Database SDs that only create migrations should get full credit for Section C
  try {
    // Try UUID first, then legacy_id
    let sd = null;
    const { data: sdById } = await supabase
      .from('strategic_directives_v2')
      .select('sd_type, scope')
      .eq('id', sd_id)
      .single();

    if (sdById) {
      sd = sdById;
    } else {
      const { data: sdByLegacy } = await supabase
        .from('strategic_directives_v2')
        .select('sd_type, scope')
        .eq('legacy_id', sd_id)
        .single();
      sd = sdByLegacy;
    }

    if (sd?.sd_type === 'database') {
      // Check if scope INCLUDED section mentions UI/form/frontend work
      // Only check the 'included' part, not 'excluded' (SD-CAPITAL-FLOW-001 fix)
      let scopeToCheck = '';
      if (typeof sd.scope === 'object' && sd.scope?.included) {
        // JSON scope - only check included items
        scopeToCheck = Array.isArray(sd.scope.included)
          ? sd.scope.included.join(' ')
          : String(sd.scope.included);
      } else if (typeof sd.scope === 'string') {
        try {
          const parsed = JSON.parse(sd.scope);
          if (parsed?.included) {
            scopeToCheck = Array.isArray(parsed.included)
              ? parsed.included.join(' ')
              : String(parsed.included);
          }
        } catch {
          scopeToCheck = sd.scope;
        }
      }

      const hasUIScope = /component|ui\s|frontend|form|page|view/i.test(scopeToCheck);

      if (!hasUIScope) {
        console.log('   ✅ Database SD without UI/form requirements - Section C not applicable (25/25)');
        validation.score += 25; // Full credit for N/A
        validation.gate_scores.data_flow_alignment = 25;
        validation.details.data_flow_alignment = {
          skipped: true,
          reason: 'Database SD without UI/form requirements - data flow alignment not applicable'
        };
        return;
      }
    }
  } catch (_e) {
    // Continue with normal validation if SD type check fails
  }

  // Check for exempt sections
  const exemptSections = validation.details.gate2_exempt_sections || [];
  const isC1Exempt = exemptSections.includes('C1_queries');
  const isC2Exempt = exemptSections.includes('C2_form_integration');

  let sectionScore = 0;
  const sectionDetails = {};
  sectionDetails.exemptions = { C1: isC1Exempt, C2: isC2Exempt };

  console.log('\n   [C] Data Flow Alignment...');

  // This is hard to validate without running the app
  // We'll use heuristics based on code changes

  // C1: Check for database query code (10 points)
  console.log('\n   [C1] Database Query Integration...');

  if (isC1Exempt) {
    sectionScore += 10;
    sectionDetails.C1_exempt = true;
    console.log('   ✅ C1 exempt for this SD type - full credit (10/10)');
  } else {
    // SD-VENTURE-STAGE0-UI-001: Search by both UUID and legacy_id, and get patch data once for all C checks
    let gitDiff = '';
    try {
      const searchTerms = await getSDSearchTerms(sd_id, supabase);
      const implementationRepo = await detectImplementationRepo(sd_id, supabase);
      gitDiff = await gitLogForSD(
        `git -C "${implementationRepo}" log --all --grep="\${TERM}" --pretty=format:"" --patch`,
        searchTerms,
        { timeout: 15000 }
      );
    } catch (_e) {
      gitDiff = '';
    }

    const hasQueries = gitDiff.includes('.select(') ||
                       gitDiff.includes('.insert(') ||
                       gitDiff.includes('.update(') ||
                       gitDiff.includes('.from(');

    if (hasQueries) {
      sectionScore += 10;
      sectionDetails.database_queries_found = true;
      console.log('   ✅ Database queries found in code changes');
    } else {
      validation.warnings.push('[C1] No database queries detected in code');
      sectionScore += 5; // Partial credit
      console.log('   ⚠️  No database queries detected (5/10)');
    }
  }

  // Get gitDiff for C2 and C3 checks
  let gitDiffForC2C3 = '';
  try {
    const searchTerms = await getSDSearchTerms(sd_id, supabase);
    const implementationRepo = await detectImplementationRepo(sd_id, supabase);
    gitDiffForC2C3 = await gitLogForSD(
      `git -C "${implementationRepo}" log --all --grep="\${TERM}" --pretty=format:"" --patch`,
      searchTerms,
      { timeout: 15000 }
    );
  } catch (_e) {
    gitDiffForC2C3 = '';
  }

  // C2: Check for form/UI integration (10 points)
  console.log('\n   [C2] Form/UI Integration...');

  if (isC2Exempt) {
    sectionScore += 10;
    sectionDetails.C2_exempt = true;
    console.log('   ✅ C2 exempt for this SD type - full credit (10/10)');
  } else {
    const hasFormIntegration = gitDiffForC2C3.includes('useState') ||
                                gitDiffForC2C3.includes('useForm') ||
                                gitDiffForC2C3.includes('onSubmit') ||
                                gitDiffForC2C3.includes('<form') ||
                                gitDiffForC2C3.includes('Input') ||
                                gitDiffForC2C3.includes('Button');

    if (hasFormIntegration) {
      sectionScore += 10;
      sectionDetails.form_integration_found = true;
      console.log('   ✅ Form/UI integration found');
    } else {
      validation.warnings.push('[C2] No form/UI integration detected');
      sectionScore += 5; // Partial credit
      console.log('   ⚠️  No form/UI integration detected (5/10)');
    }
  }

  // C3: Check for data validation (5 points)
  console.log('\n   [C3] Data Validation...');

  const hasValidation = gitDiffForC2C3.includes('zod') ||
                        gitDiffForC2C3.includes('validate') ||
                        gitDiffForC2C3.includes('schema') ||
                        gitDiffForC2C3.includes('.required()');

  if (hasValidation) {
    sectionScore += 5;
    sectionDetails.data_validation_found = true;
    console.log('   ✅ Data validation found');
  } else {
    validation.warnings.push('[C3] No data validation detected');
    sectionScore += 3; // Partial credit
    console.log('   ⚠️  No data validation detected (3/5)');
  }

  validation.score += sectionScore;
  validation.gate_scores.data_flow_alignment = sectionScore;
  validation.details.data_flow_alignment = sectionDetails;
  console.log(`\n   Section C Score: ${sectionScore}/25`);
}

/**
 * Validate Enhanced Testing (Section D - 25 points)
 * Phase-aware weighting: E2E tests are CRITICAL (20 pts increased from 15)
 */
async function validateEnhancedTesting(sd_id, designAnalysis, databaseAnalysis, validation, supabase) {
  let sectionScore = 0;
  const sectionDetails = {};

  console.log('\n   [D] Enhanced Testing...');

  // D1: Check for E2E tests (20 points - CRITICAL)
  console.log('\n   [D1] E2E Test Coverage & Execution (CRITICAL)...');

  try {
    // Detect which repository contains the implementation
    const implementationRepo = await detectImplementationRepo(sd_id, supabase);

    const testDirs = [
      'tests/e2e',
      'tests/integration',
      'tests/unit',        // Also check unit tests
      'e2e',
      'playwright/tests'
    ];

    let testFiles = [];
    for (const dir of testDirs) {
      const fullPath = path.join(implementationRepo, dir);
      if (existsSync(fullPath)) {
        const files = await readdir(fullPath, { recursive: true });
        const sdTests = files.filter(f =>
          typeof f === 'string' &&
          (f.includes(sd_id.toLowerCase()) ||
           f.includes(sd_id.replace('SD-', '').toLowerCase()) ||
           f.endsWith('.test.ts') ||
           f.endsWith('.test.js') ||
           f.endsWith('.spec.ts') ||
           f.endsWith('.spec.js'))
        );
        testFiles.push(...sdTests.map(f => path.join(dir, f)));
      }
    }

    if (testFiles.length > 0) {
      sectionScore += 20;
      sectionDetails.e2e_tests = testFiles;
      sectionDetails.e2e_test_count = testFiles.length;
      console.log(`   ✅ Found ${testFiles.length} E2E test file(s) (20/20)`);
    } else {
      validation.issues.push('[D1] CRITICAL: No E2E tests found for this SD');
      sectionScore += 0; // No points - E2E is MANDATORY
      console.log('   ❌ No E2E tests found - MANDATORY requirement (0/20)');
    }
  } catch (_error) {
    validation.issues.push('[D1] E2E test check failed - cannot verify');
    sectionScore += 0; // No points on error - critical check
    console.log('   ❌ Cannot verify E2E tests - error (0/20)');
  }

  // D1b: Check TESTING sub-agent for unit test execution & pass status (NON-NEGOTIABLE #9)
  console.log('\n   [D1b] Unit Tests Executed & Passing (NON-NEGOTIABLE)...');

  // SD-NAV-CMD-001 lesson: Bugfix SDs skip TESTING sub-agent validation
  // They use git commit evidence instead
  if (validation.details.bugfix_mode) {
    console.log('   ℹ️  Bugfix SD - TESTING sub-agent check SKIPPED');
    console.log('   ℹ️  Bugfix SDs validated via git commit evidence');
    sectionDetails.unit_tests_verified = true;
    sectionDetails.testing_verdict = 'SKIPPED_BUGFIX';
    sectionScore += 15; // Give partial score for bugfix SDs
  } else {
    try {
      // Query TESTING sub-agent results
      const { data: testingResults, error: testingError } = await supabase
        .from('sub_agent_execution_results')
        .select('verdict, metadata')
        .eq('sd_id', sd_id)
        .eq('sub_agent_code', 'TESTING')
        .order('created_at', { ascending: false })
        .limit(1);

      if (testingError) {
        validation.issues.push('[D1b] Cannot query TESTING sub-agent results');
        console.log('   ❌ Cannot query TESTING results (NON-NEGOTIABLE not verified)');
      } else if (!testingResults || testingResults.length === 0) {
        validation.warnings.push('[D1b] TESTING sub-agent has not been executed');
        console.log('   ⚠️  TESTING sub-agent not executed - cannot verify unit tests');
      } else {
        const testingResult = testingResults[0];

        // Check verdict (should be PASS, not CONDITIONAL_PASS or BLOCKED)
        if (testingResult.verdict === 'PASS') {
          sectionDetails.unit_tests_verified = true;
          sectionDetails.testing_verdict = 'PASS';
          console.log('   ✅ TESTING sub-agent verdict: PASS (unit tests passed)');
        } else if (testingResult.verdict === 'BLOCKED') {
          validation.issues.push('[D1b] CRITICAL: TESTING sub-agent verdict is BLOCKED (tests failed or did not run)');
          sectionDetails.unit_tests_verified = false;
          sectionDetails.testing_verdict = 'BLOCKED';
          console.log('   ❌ TESTING verdict: BLOCKED - unit/E2E tests failed (NON-NEGOTIABLE)');
        } else if (testingResult.verdict === 'CONDITIONAL_PASS') {
          validation.warnings.push('[D1b] TESTING sub-agent verdict is CONDITIONAL_PASS (tests may not have fully passed)');
          sectionDetails.unit_tests_verified = false;
          sectionDetails.testing_verdict = 'CONDITIONAL_PASS';
          console.log('   ⚠️  TESTING verdict: CONDITIONAL_PASS - review test results');
        } else {
          validation.warnings.push(`[D1b] Unexpected TESTING verdict: ${testingResult.verdict}`);
          console.log(`   ⚠️  TESTING verdict: ${testingResult.verdict}`);
        }
      }
    } catch (error) {
      validation.warnings.push(`[D1b] Error checking unit tests: ${error.message}`);
      console.log(`   ⚠️  Error checking unit tests: ${error.message}`);
    }
  }

  // D2: Check for database migration tests (2 points - MINOR)
  console.log('\n   [D2] Database Migration Tests...');

  // Check for exemption
  const exemptSections = validation.details.gate2_exempt_sections || [];
  const isD2Exempt = exemptSections.includes('D2_migration_tests');

  if (isD2Exempt) {
    sectionScore += 2;
    sectionDetails.D2_exempt = true;
    console.log('   ✅ D2 exempt for this SD type - full credit (2/2)');
  } else {
    // SD-VENTURE-STAGE0-UI-001: Search by both UUID and legacy_id
    try {
      const searchTerms = await getSDSearchTerms(sd_id, supabase);
      const implementationRepo = await detectImplementationRepo(sd_id, supabase);
      const gitLog = await gitLogForSD(
        `git -C "${implementationRepo}" log --all --grep="\${TERM}" --name-only --pretty=format:""`,
        searchTerms,
        { timeout: 10000 }
      );

      const hasMigrationTests = gitLog.includes('migration') && gitLog.includes('test');

      if (hasMigrationTests) {
        sectionScore += 2;
        sectionDetails.migration_tests_found = true;
        console.log('   ✅ Migration tests found (2/2)');
      } else {
        validation.warnings.push('[D2] No migration tests detected');
        sectionScore += 1; // Partial credit
        console.log('   ⚠️  No migration tests detected (1/2)');
      }
    } catch (_error) {
      sectionScore += 1; // Partial credit on error
      console.log('   ⚠️  Cannot verify migration tests (1/2)');
    }
  }

  // D3: Check for test coverage metadata (3 points - MINOR)
  console.log('\n   [D3] Test Coverage Documentation...');

  // Check if EXEC→PLAN handoff mentions test coverage
  const { data: handoffData } = await supabase
    .from('sd_phase_handoffs')
    .select('metadata')
    .eq('sd_id', sd_id)
    .eq('handoff_type', 'EXEC-TO-PLAN')
    .order('created_at', { ascending: false })
    .limit(1);

  if (handoffData?.[0]?.metadata) {
    const metadataStr = JSON.stringify(handoffData[0].metadata).toLowerCase();
    const hasCoverage = metadataStr.includes('test') ||
                        metadataStr.includes('coverage') ||
                        metadataStr.includes('e2e');

    if (hasCoverage) {
      sectionScore += 3;
      sectionDetails.test_coverage_documented = true;
      console.log('   ✅ Test coverage documented in handoff (3/3)');
    } else {
      validation.warnings.push('[D3] Test coverage not documented in handoff');
      sectionScore += 2; // Partial credit
      console.log('   ⚠️  Test coverage not documented (2/3)');
    }
  } else {
    sectionScore += 2; // Partial credit
    console.log('   ⚠️  No handoff metadata found (2/3)');
  }

  validation.score += sectionScore;
  validation.gate_scores.enhanced_testing = sectionScore;
  validation.details.enhanced_testing = sectionDetails;
  console.log(`\n   Section D Score: ${sectionScore}/25`);
}
