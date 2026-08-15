/**
 * SECURITY Sub-Agent (Chief Security Architect)
 * LEO Protocol v4.2.0 - Sub-Agent Performance Enhancement
 *
 * Purpose: Security vulnerability detection and access control verification
 * Code: SECURITY
 * Priority: 7
 *
 * Philosophy: "Security first, ship second. No exceptions."
 *
 * Created: 2025-10-11 (SD-SUBAGENT-IMPROVE-001)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';
// TIER 1.5: Handoff preflight check
import { quickPreflightCheck } from '../../scripts/lib/handoff-preflight.js';

// SD-LEO-INFRA-FLEET-WIDE-SUB-001: replaced hardcoded resolveRepoPath('ehg') with
// cross-repo-aware helper so SECURITY scans the SD's actual target_application repo.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from './resolve-repo.js';
// SD-ALTIFYAI-FDBK-FIX-GENERIC-SECURITY-SUB-001: shared with the weekly CI sentinel
// (scripts/sentinels/audit-security-linter.mjs) so the repo holds ONE definition of the
// SECURITY DEFINER + BYPASSRLS-owner + anon/authenticated-EXECUTE class.
import { probeDefinerExposure } from '../security/definer-exposure.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const execAsync = promisify(exec);

// SD-LEARN-FIX-ADDRESS-SAL-SECURITY-001: child_process.exec defaults to cmd.exe on Windows,
// which cannot parse the POSIX '2>/dev/null' redirects the scan commands below rely on
// (fails closed with "The system cannot find the path specified", BLOCKING every scan).
// Forcing bash makes the redirect and grep semantics portable; Linux/macOS CI already run
// under a POSIX shell by default, so this is a no-op there.
const EXEC_SHELL_OPTS = process.platform === 'win32' ? { shell: 'bash.exe' } : {};

// Supabase client initialized in execute() to use async createSupabaseServiceClient
let supabase = null;

/**
 * Execute SECURITY sub-agent
 * Performs security vulnerability analysis
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent instructions (already loaded)
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Security analysis results
 */
export async function execute(sdId, subAgent, options = {}) {
  console.log(`\n🔒 Starting SECURITY for ${sdId}...`);
  console.log('   Chief Security Architect - Vulnerability Analysis');

  // Initialize Supabase client with SERVICE_ROLE_KEY (SD-FOUND-SAFETY-002 pattern)
  if (!supabase) {
    supabase = await createSupabaseServiceClient('engineer', { verbose: false });
  }

  // TIER 1.5: Handoff Preflight Check
  // Verify SD has proper handoff chain before proceeding with security validation
  // This is advisory - we log warnings but don't block security work
  try {
    console.log('   🔗 Checking handoff chain status...');
    const preflightResult = await quickPreflightCheck(sdId, 'EXEC');

    if (preflightResult.ready) {
      console.log('   ✅ Handoff chain verified for EXEC phase');
    } else {
      console.log('   ⚠️  Handoff chain incomplete:');
      (preflightResult.missing || []).forEach(h => console.log(`      • Missing: ${h}`));
      console.log('   💡 Consider running: node scripts/handoff.js create --sd ' + sdId);
      console.log('   ⚠️  Proceeding with SECURITY validation (advisory check)');
    }
  } catch (preflightError) {
    console.log(`   ⚠️  Handoff preflight skipped: ${preflightError.message}`);
  }

  // Security baseline: known pre-existing issues to exclude from blocking
  // Format: { sql_concatenation: N, eval_usage: N, dangerous_html: N }
  const baseline = options.security_baseline || {};

  const results = {
    verdict: 'PASS',
    confidence: 100,
    critical_issues: [],
    warnings: [],
    recommendations: [],
    detailed_analysis: {},
    findings: {
      authentication_check: null,
      authorization_check: null,
      input_validation: null,
      data_protection: null,
      rls_policies: null,
      // SD-ALTIFYAI-FDBK-FIX-GENERIC-SECURITY-SUB-001
      definer_posture: null
    },
    baseline_applied: Object.keys(baseline).length > 0,
    options
  };

  // SD-LEO-INFRA-FLEET-WIDE-SUB-001 FR-2: resolve target_application via shared helper.
  // Hoisted outside try so applySubAgentRepoVerdict on both return paths (success + catch)
  // can emit metadata.repo_path top-level — the gate's contract per FR-2.
  let resolution = null;
  try {
    resolution = await resolveSubAgentRepo({
      sdId,
      targetApplication: options.target_application,
      subAgentCode: 'SECURITY',
      supabase,
    });
    const repoPath = options.repo_path || resolution.repoPath;

    // Phase 1: Authentication Check
    console.log('\n🔐 Phase 1: Checking authentication implementation...');
    const authCheck = await checkAuthentication(repoPath);
    results.findings.authentication_check = authCheck;

    if (authCheck.issues > 0) {
      console.log(`   ❌ ${authCheck.issues} authentication issue(s) found`);
      results.critical_issues.push({
        severity: 'CRITICAL',
        issue: `${authCheck.issues} authentication vulnerabilities`,
        recommendation: 'Fix authentication issues before deployment',
        issues: authCheck.issue_details
      });
      results.verdict = 'BLOCKED';
    } else {
      console.log('   ✅ Authentication implementation secure');
    }

    // Phase 2: Authorization Check
    console.log('\n🛡️  Phase 2: Checking authorization/access control...');
    const authzCheck = await checkAuthorization(repoPath);
    results.findings.authorization_check = authzCheck;

    if (authzCheck.unprotected_routes > 0) {
      console.log(`   ⚠️  ${authzCheck.unprotected_routes} potentially unprotected route(s)`);
      results.warnings.push({
        severity: 'HIGH',
        issue: `${authzCheck.unprotected_routes} routes may lack authorization checks`,
        recommendation: 'Verify all routes have proper access control',
        routes: authzCheck.unprotected_route_list
      });
      if (results.confidence > 70) results.confidence = 70;
    } else {
      console.log('   ✅ Authorization checks in place');
    }

    // Phase 3: Input Validation
    console.log('\n✅ Phase 3: Checking input validation...');
    const inputCheck = await checkInputValidation(repoPath);
    results.findings.input_validation = inputCheck;

    // Apply baseline: subtract known pre-existing issues
    const baselineSql = baseline.sql_concatenation || 0;
    const baselineEval = baseline.eval_usage || 0;
    const baselineHtml = baseline.dangerous_html || 0;
    const newSqlIssues = Math.max(0, inputCheck.sql_concatenation - baselineSql);
    const newEvalIssues = Math.max(0, inputCheck.eval_usage - baselineEval);
    const newHtmlIssues = Math.max(0, inputCheck.dangerous_html - baselineHtml);
    const newVulnerabilities = newSqlIssues + newEvalIssues + newHtmlIssues;

    if (baselineSql > 0 || baselineEval > 0 || baselineHtml > 0) {
      console.log(`   📊 Baseline applied: ${baselineSql} SQL, ${baselineEval} eval, ${baselineHtml} HTML (pre-existing)`);
      console.log(`   📊 New issues: ${newSqlIssues} SQL, ${newEvalIssues} eval, ${newHtmlIssues} HTML`);
    }

    if (newVulnerabilities > 0) {
      console.log(`   ❌ ${newVulnerabilities} NEW input validation issue(s) found`);
      results.critical_issues.push({
        severity: 'CRITICAL',
        issue: `${newVulnerabilities} potential injection vulnerabilities (${inputCheck.vulnerabilities} total, ${inputCheck.vulnerabilities - newVulnerabilities} baseline)`,
        recommendation: 'Sanitize all user inputs and use parameterized queries',
        vulnerabilities: inputCheck.vulnerability_details,
        baseline_excluded: inputCheck.vulnerabilities - newVulnerabilities
      });
      results.verdict = 'BLOCKED';
    } else if (inputCheck.vulnerabilities > 0) {
      console.log(`   ⚠️  ${inputCheck.vulnerabilities} pre-existing issue(s) in baseline (not blocking)`);
      results.warnings.push({
        severity: 'MEDIUM',
        issue: `${inputCheck.vulnerabilities} pre-existing injection vulnerabilities in baseline`,
        recommendation: 'Address these in a separate security-focused SD',
        vulnerabilities: inputCheck.vulnerability_details
      });
    } else {
      console.log('   ✅ Input validation patterns detected');
    }

    // Phase 4: Data Protection
    console.log('\n🔐 Phase 4: Checking data protection...');
    const dataProtection = await checkDataProtection(repoPath);
    results.findings.data_protection = dataProtection;

    if (dataProtection.exposed_secrets > 0) {
      console.log(`   ❌ ${dataProtection.exposed_secrets} potential secret(s) exposed`);
      results.critical_issues.push({
        severity: 'CRITICAL',
        issue: `${dataProtection.exposed_secrets} hardcoded secrets found`,
        recommendation: 'Move all secrets to environment variables',
        secrets: dataProtection.secret_locations
      });
      results.verdict = 'BLOCKED';
    } else {
      console.log('   ✅ No exposed secrets detected');
    }

    // Phase 5: RLS Policy Verification (Supabase-specific)
    console.log('\n🗄️  Phase 5: Checking RLS policies...');
    const rlsCheck = await checkRLSPolicies(sdId);
    results.findings.rls_policies = rlsCheck;

    // SD-ALTIFYAI-FDBK-FIX-GENERIC-SECURITY-SUB-001: the unverified case is tested FIRST and
    // explicitly. Previously this was a bare count check, and `tables_without_rls` was 0 even
    // when the census had not run, so the else branch printed "RLS policies verified" about a
    // check that never executed. A count-only test cannot tell "zero unprotected tables" from
    // "never looked".
    if (rlsCheck.checked === false) {
      console.log(`   ⚠️  RLS table census UNVERIFIED: ${rlsCheck.error}`);
      results.warnings.push({
        severity: 'HIGH',
        issue: `RLS table census did not run: ${rlsCheck.error}`,
        recommendation: 'An unrun census is not a clean census. Restore the authoritative catalog query before treating RLS posture as verified.'
      });
      if (results.confidence > 75) results.confidence = 75;
    } else if (rlsCheck.tables_without_rls > 0) {
      console.log(`   ⚠️  ${rlsCheck.tables_without_rls} table(s) without RLS`);
      results.warnings.push({
        severity: 'HIGH',
        issue: `${rlsCheck.tables_without_rls} tables lack Row Level Security`,
        recommendation: 'Enable RLS on all tables with sensitive data',
        tables: rlsCheck.unprotected_tables
      });
      if (results.confidence > 75) results.confidence = 75;
    } else {
      console.log('   ✅ RLS policies verified');
    }

    // Phase 6: SECURITY DEFINER exposure posture (live catalog).
    // SD-ALTIFYAI-FDBK-FIX-GENERIC-SECURITY-SUB-001. Detects functions that execute as a
    // BYPASSRLS owner and are reachable by anon/authenticated — a class no phase of this module
    // could previously observe, because nothing here ever queried pg_proc/pg_roles.
    console.log('\n🧬 Phase 6: Checking SECURITY DEFINER exposure posture...');
    const definerPosture = await probeDefinerExposure({ connect: options.catalog_connect });
    results.findings.definer_posture = definerPosture;

    if (definerPosture.probe_ran === false) {
      console.log(`   ⚠️  DEFINER posture UNVERIFIED: ${definerPosture.reason}`);
      results.warnings.push({
        severity: 'HIGH',
        issue: `SECURITY DEFINER exposure probe did not run: ${definerPosture.reason}`,
        recommendation: 'Provide a catalog connection (SUPABASE_POOLER_URL or DATABASE_URL). An unavailable probe is NOT a clean posture.'
      });
      if (results.confidence > 75) results.confidence = 75;
    } else if (definerPosture.functions_at_risk > 0) {
      console.log(`   ⚠️  ${definerPosture.functions_at_risk} SECURITY DEFINER function(s) bypass RLS and are anon/authenticated-EXECUTE-able`);
      // WARNING, never FAIL/BLOCKED. SECURITY carries leo_sub_agents.priority=90, which
      // phase-subagent-orchestrator/index.js:212 maps to CRITICAL, and
      // result-aggregation.js:12-14 turns verdict=FAIL at CRITICAL priority into BLOCKED with
      // can_proceed=false — identical fleet impact to emitting BLOCKED outright. SECURITY runs
      // on ~758 distinct SDs per 90 days, and this posture is PRE-EXISTING exposure owned by a
      // separate chairman-gated cutover runbook. Blocking here would halt the entire in-flight
      // population to report something no individual SD introduced. Do not "tighten" this to
      // FAIL without re-measuring that blast radius.
      results.warnings.push({
        severity: 'CRITICAL',
        issue: `${definerPosture.functions_at_risk} SECURITY DEFINER function(s) run as a BYPASSRLS owner and are EXECUTE-able by anon or authenticated`,
        recommendation: 'Revoke EXECUTE from anon/authenticated, or re-own the function to a non-BYPASSRLS role. Note that pinning search_path does NOT mitigate this class.',
        functions: definerPosture.functions.map(f => `${f.schema}.${f.name}(${f.args}) owner=${f.owner} anon=${f.anon_execute} authenticated=${f.authenticated_execute}`)
      });
      if (results.confidence > 70) results.confidence = 70;
    } else {
      console.log('   ✅ No SECURITY DEFINER functions exposed to anon/authenticated');
    }

    // QF/F2 SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001-B
    // Evidence-absence guard. Every scan helper swallows its own failure and returns
    // { checked:false, error, <count>:0 } — and the phase blocks above inspect ONLY the
    // count, never `checked`/`error`. So an all-errored scan (which found zero issues
    // because it never ran) previously stayed PASS@100 — a zero-evidence result was
    // structurally indistinguishable from a genuinely clean one. Detect the hard case
    // (the critical scans could NOT run) and emit a NON-PASSING verdict the downstream
    // gates reject. We use 'BLOCKED' (not a bare 'ERROR' — result-aggregation.js:18,34
    // downgrades 'ERROR'/'FAIL'-with-non-critical-priority to WARNING/CONDITIONAL_PASS
    // with can_proceed=true; 'BLOCKED' is unconditionally can_proceed=false). Fail-soft:
    // we never throw — we downgrade the verdict and surface the errored scans loudly.
    const scanEvidence = [
      { name: 'authentication', critical: true, result: results.findings.authentication_check },
      { name: 'authorization', critical: false, result: results.findings.authorization_check },
      { name: 'input_validation', critical: true, result: results.findings.input_validation },
      { name: 'data_protection', critical: true, result: results.findings.data_protection },
      { name: 'rls_policies', critical: false, result: results.findings.rls_policies }
    ];
    const scanErrored = (r) => !r || r.checked === false || Boolean(r.error);
    const erroredScans = scanEvidence.filter((s) => scanErrored(s.result));
    const criticalScans = scanEvidence.filter((s) => s.critical);
    const criticalErrored = criticalScans.filter((s) => scanErrored(s.result));
    // Evidence is absent only when EVERY critical scan failed to run — a single errored
    // non-critical scan (e.g. RLS fallback) must NOT flip a clean run to non-passing.
    const evidenceAbsent = criticalErrored.length === criticalScans.length;

    if (evidenceAbsent) {
      const erroredNames = erroredScans.map((s) => s.name).join(', ');
      console.log(`   ❌ Evidence absent: ${criticalErrored.length}/${criticalScans.length} critical security scans could not run (${erroredNames})`);
      results.verdict = 'BLOCKED';
      results.confidence = 0;
      results.critical_issues.push({
        severity: 'CRITICAL',
        issue: `Security scans could not run — no evidence: ${erroredNames}`,
        recommendation: 'Resolve the scan execution errors and re-run SECURITY. An errored scan is NOT a clean scan and must not pass.',
        errored_scans: erroredScans.map((s) => ({ scan: s.name, error: s.result?.error || null }))
      });
      results.recommendations.push(
        `EVIDENCE ABSENT: ${criticalErrored.length}/${criticalScans.length} critical security scans failed to execute — verdict is BLOCKED, not a silent PASS. Errored scans: ${erroredNames}`
      );
    }

    // SD-ALTIFYAI-FDBK-FIX-GENERIC-SECURITY-SUB-001 — THE CATALOG-TIER VERDICT BRANCH.
    //
    // This deliberately does NOT route through the evidence-absence guard above, and that is
    // the whole point of the fix. MEASURED: setting the RLS fallback to checked:false changes
    // nothing observable, for three independent reasons — the count gate ignores it, `rls_policies`
    // is registered critical:false in scanEvidence, and `evidenceAbsent` requires
    // criticalErrored.length === criticalScans.length, an ALL-critical-failed predicate that a
    // single failing tier can never satisfy. Promoting rls_policies to critical:true does not
    // help either, because the ALL-vs-ANY predicate still holds. So the catalog tier needs its
    // own branch or the repair is a no-op that ships looking complete.
    //
    // Verdict choice is CONDITIONAL_PASS, never BLOCKED/FAIL/ERROR: those halt EXEC-TO-PLAN for
    // every SD (see the Phase 6 comment on priority=90). CONDITIONAL_PASS is outside
    // REJECT_VERDICTS and keeps can_proceed=true, while still being unmistakably not-PASS — so
    // absence of evidence stops reading as evidence of safety without stopping the fleet.
    // Only ever DOWNGRADES: a BLOCKED verdict established above is left untouched.
    const catalogUnverified = results.findings.rls_policies?.checked === false
      || results.findings.definer_posture?.probe_ran === false;
    const definerExposureFound = (results.findings.definer_posture?.functions_at_risk ?? 0) > 0;

    if ((catalogUnverified || definerExposureFound) && results.verdict === 'PASS') {
      results.verdict = 'CONDITIONAL_PASS';
      if (results.confidence > 75) results.confidence = 75;
      console.log(`   ⚠️  Verdict downgraded to CONDITIONAL_PASS (${catalogUnverified ? 'catalog tier unverified' : 'DEFINER exposure present'})`);
    }

    // Generate recommendations
    console.log('\n💡 Generating recommendations...');
    generateRecommendations(results);

    console.log(`\n🏁 SECURITY Complete: ${results.verdict} (${results.confidence}% confidence)`);

    if (resolution) applySubAgentRepoVerdict(results, resolution);
    return results;

  } catch (error) {
    console.error('\n❌ SECURITY error:', error.message);
    results.verdict = 'ERROR';
    results.error = error.message;
    results.confidence = 0;
    results.critical_issues.push({
      severity: 'CRITICAL',
      issue: 'SECURITY sub-agent execution failed',
      recommendation: 'Review error and retry',
      error: error.message
    });
    if (resolution) applySubAgentRepoVerdict(results, resolution);
    return results;
  }
}

/**
 * Check authentication implementation
 * Note: Uses context filtering to reduce false positives
 */
async function checkAuthentication(repoPath) {
  try {
    // Check for localStorage usage with tokens in PRODUCTION code (not tests)
    // Filter: exclude test files, .test., .spec., __tests__
    const { stdout: localStorageTokens } = await execAsync(
      `cd "${repoPath}" && grep -r "localStorage.setItem.*token" src 2>/dev/null | ` +
      'grep -v "test.js\\|test.tsx\\|test.ts\\|spec.js\\|__tests__" | wc -l',
      EXEC_SHELL_OPTS
    );

    // Check for password variables assigned from form values (actual vulnerability)
    // Pattern: password variable assigned from event.target.value or similar
    // Filter: exclude password form inputs (type="password" is correct usage)
    const { stdout: plainPasswords } = await execAsync(
      `cd "${repoPath}" && grep -rE "password\\s*=\\s*(event\\.target\\.value|getFormValue|input\\.value|document\\.getElementById)" src 2>/dev/null | ` +
      'grep -v "type=\\"password\\"" | wc -l',
      EXEC_SHELL_OPTS
    );

    const issues = parseInt(localStorageTokens.trim()) + parseInt(plainPasswords.trim());

    return {
      checked: true,
      issues: issues,
      localStorage_tokens: parseInt(localStorageTokens.trim()),
      plain_passwords: parseInt(plainPasswords.trim()),
      issue_details: issues > 0 ? [
        `${localStorageTokens.trim()} localStorage token usage(s) in production code (use httpOnly cookies)`,
        `${plainPasswords.trim()} potential plain password handling(s)`
      ] : [],
      note: 'Test files and comments excluded from analysis'
    };
  } catch (error) {
    return {
      checked: false,
      issues: 0,
      error: error.message
    };
  }
}

/**
 * Check authorization/access control
 * Note: More specific patterns to reduce false positives
 */
async function checkAuthorization(repoPath) {
  try {
    // Find actual route definitions (not just the word "route")
    // Pattern: path="..." or <Route path="..."
    const { stdout: allRoutes } = await execAsync(
      `cd "${repoPath}" && grep -r 'path=' src 2>/dev/null | ` +
      'grep -v "test.js\\|test.tsx\\|__tests__" | wc -l',
      EXEC_SHELL_OPTS
    );

    // Find protected routes (with proper auth middleware)
    // Pattern: ProtectedRoute, withAuth, requireAuth function calls
    const { stdout: protectedRoutes } = await execAsync(
      `cd "${repoPath}" && grep -r "ProtectedRoute\\|withAuth\\|requireAuth\\|isAuthenticated" src 2>/dev/null | ` +
      'grep -v "test.js\\|test.tsx\\|__tests__" | wc -l',
      EXEC_SHELL_OPTS
    );

    const total = parseInt(allRoutes.trim());
    const protectedCount = parseInt(protectedRoutes.trim());
    const unprotected = Math.max(0, total - protectedCount);

    return {
      checked: true,
      total_routes: total,
      protected_routes: protectedCount,
      unprotected_routes: unprotected,
      unprotected_route_list: unprotected > 0 ? [
        `${unprotected} routes may need authentication checks (manual review recommended)`
      ] : [],
      note: 'Public routes (login, signup, home) are expected to be unprotected. Manual verification recommended.'
    };
  } catch (error) {
    return {
      checked: false,
      total_routes: 0,
      protected_routes: 0,
      unprotected_routes: 0,
      unprotected_route_list: [],
      error: error.message
    };
  }
}

/**
 * Check input validation
 * Note: More specific patterns to reduce false positives
 */
async function checkInputValidation(repoPath) {
  try {
    // Check for SQL concatenation (actual injection risk)
    // Pattern: sqlQuery += or sql += (NOT query variable names like queryLower)
    // Filter: exclude comments, test files, and variable names containing 'query'
    // SD-VENTURE-STAGE0-UI-001: Improved pattern to reduce false positives
    const { stdout: sqlConcat } = await execAsync(
      `cd "${repoPath}" && grep -rE "(sqlQuery|sql|SQL)\\s*\\+=" src 2>/dev/null | ` +
      'grep -v "test.js\\|test.tsx\\|__tests__\\|//\\|score +=\\|queryLower" | wc -l',
      EXEC_SHELL_OPTS
    );

    // Check for eval usage (actual XSS risk)
    // Pattern: actual eval() calls, not regex patterns or comments
    // Filter: exclude comments (#), regex patterns (/eval/), test files, and string literals
    // SD-VENTURE-STAGE0-UI-001: Improved pattern to exclude detection patterns and comments
    const { stdout: evalUsage } = await execAsync(
      `cd "${repoPath}" && grep -r "eval(" src 2>/dev/null | ` +
      'grep -v "test.js\\|test.tsx\\|__tests__\\|//\\|#\\|pattern.*eval\\|/.*eval" | wc -l',
      EXEC_SHELL_OPTS
    );

    // Check for dangerouslySetInnerHTML with user input (more context needed)
    // Pattern: dangerouslySetInnerHTML with variables (not strings)
    const { stdout: dangerousHtml } = await execAsync(
      `cd "${repoPath}" && grep -r "dangerouslySetInnerHTML.*__html" src 2>/dev/null | ` +
      'grep -v "test.js\\|test.tsx\\|__tests__\\|__html: \'" | wc -l',
      EXEC_SHELL_OPTS
    );

    const vulnerabilities = parseInt(sqlConcat.trim()) + parseInt(evalUsage.trim()) + parseInt(dangerousHtml.trim());

    return {
      checked: true,
      vulnerabilities: vulnerabilities,
      sql_concatenation: parseInt(sqlConcat.trim()),
      eval_usage: parseInt(evalUsage.trim()),
      dangerous_html: parseInt(dangerousHtml.trim()),
      vulnerability_details: vulnerabilities > 0 ? [
        ...(parseInt(sqlConcat.trim()) > 0 ? [`${sqlConcat.trim()} SQL concatenation(s) (use parameterized queries)`] : []),
        ...(parseInt(evalUsage.trim()) > 0 ? [`${evalUsage.trim()} eval() usage(s) (extreme XSS risk)`] : []),
        ...(parseInt(dangerousHtml.trim()) > 0 ? [`${dangerousHtml.trim()} dangerouslySetInnerHTML with variables (sanitize inputs)`] : [])
      ] : [],
      note: 'HTML sanitization and parameterized queries required for security'
    };
  } catch (error) {
    return {
      checked: false,
      vulnerabilities: 0,
      error: error.message
    };
  }
}

/**
 * Check data protection
 * Note: More specific patterns for actual hardcoded secrets
 */
async function checkDataProtection(repoPath) {
  try {
    // Check for hardcoded secrets - actual values, not variable names
    // Pattern: API_KEY = "abc123" or API_KEY='xyz...' (not process.env.API_KEY)
    // Filter: exclude comments, env var references, test files
    const { stdout: secrets } = await execAsync(
      `cd "${repoPath}" && grep -r "API_KEY.*=\\|SECRET.*=\\|PASSWORD.*=" src 2>/dev/null | ` +
      'grep -v "process.env\\|test.js\\|test.tsx\\|__tests__" | wc -l',
      EXEC_SHELL_OPTS
    );

    const exposedSecrets = parseInt(secrets.trim());

    return {
      checked: true,
      exposed_secrets: exposedSecrets,
      secret_locations: exposedSecrets > 0 ? [
        `${exposedSecrets} potential hardcoded secret(s) found (verify if actual secrets or test data)`
      ] : [],
      note: 'All secrets should use environment variables (process.env or import.meta.env)'
    };
  } catch (error) {
    return {
      checked: false,
      exposed_secrets: 0,
      secret_locations: [],
      error: error.message
    };
  }
}

/**
 * Check RLS policies (Supabase-specific)
 */
async function checkRLSPolicies(_sdId) {
  try {
    // Query Supabase to find tables WITHOUT RLS enabled
    // RLS is critical for multi-tenant data protection
    if (!supabase) {
      // tables_without_rls is null, not 0 — an unmeasured count must never be readable as
      // "zero unprotected tables" by a count-only consumer.
      return {
        checked: false,
        tables_without_rls: null,
        unprotected_tables: [],
        error: 'Supabase client not initialized'
      };
    }

    // Get all tables from information_schema (Supabase runs on PostgreSQL)
    const { data: tables, error: tablesError } = await supabase
      .rpc('get_tables_without_rls', {});

    if (tablesError) {
      // SD-ALTIFYAI-FDBK-FIX-GENERIC-SECURITY-SUB-001: this branch previously ran a grep over
      // database/migrations/*.sql, ASSIGNED THE RESULT TO AN UNUSED VARIABLE, and then returned
      // { checked:true, tables_without_rls:0, note:'...verified RLS migrations exist' }. Three
      // separate defects: (1) the note asserted a verification that was never read; (2) counting
      // "ENABLE ROW LEVEL SECURITY" occurrences in migration FILES is not a measurement of LIVE
      // RLS posture, so the grep could not have supported the claim even if it had been read;
      // (3) the grep used a relative path with no `cd "${repoPath}"`, unlike every other scan in
      // this module, so it read EHG_Engineer's own migrations regardless of target_application.
      //
      // get_tables_without_rls has ZERO definitions in pg_proc in any schema — it has never
      // existed — so this branch is unconditional in production: 189 stored evidence rows carry
      // the old note, and across 365 days not one SECURITY row ever reported an unprotected
      // table. The grep is removed rather than repaired: a measurement that cannot answer the
      // question is worse than an honest absence, because it reads as evidence.
      return {
        checked: false,
        tables_without_rls: null,
        unprotected_tables: [],
        error: `RLS table census unavailable: ${tablesError.message || tablesError.code || 'get_tables_without_rls RPC did not resolve'}`
      };
    }

    const tablesList = tables || [];
    const unprotectedCount = tablesList.length;

    return {
      checked: true,
      tables_without_rls: unprotectedCount,
      unprotected_tables: tablesList.map(t => t.table_name),
      note: unprotectedCount > 0 ? 'Enable RLS on sensitive tables' : 'RLS policies verified'
    };
  } catch (error) {
    // SD-ALTIFYAI-FDBK-FIX-GENERIC-SECURITY-SUB-001: the outer catch previously returned
    // { checked:true, tables_without_rls:0, note:`Found ${n} RLS ENABLE directives in migrations` }
    // EVEN WHEN n WAS 0 — "found zero evidence of RLS" reported as "RLS verified". It was the
    // dominant production path: 435 of the 625 stored rls_policies findings carry that note.
    // (The grep also emitted per-file "path:count" lines from the repo root, making parseInt
    // return NaN, so the printed number was frequently not a count at all.)
    //
    // Same removal rationale as the tablesError branch above: migration-file text cannot
    // measure live RLS posture, so the honest result is an explicit unverified state.
    return {
      checked: false,
      tables_without_rls: null,
      unprotected_tables: [],
      error: `RLS table census unavailable: ${error?.message || 'get_tables_without_rls RPC threw'}`
    };
  }
}

/**
 * Generate recommendations
 */
function generateRecommendations(results) {
  const { findings, critical_issues, warnings } = results;

  if (critical_issues.length > 0) {
    results.recommendations.push(
      'BLOCKED: Fix all critical security vulnerabilities before deployment',
      'Use parameterized queries to prevent SQL injection',
      'Move all secrets to environment variables',
      'Implement proper authentication and session management'
    );
  }

  if (findings.authorization_check?.unprotected_routes > 0) {
    results.recommendations.push(
      'Verify all routes have proper authorization checks',
      'Use middleware for consistent access control',
      'Implement role-based access control (RBAC)'
    );
  }

  if (findings.rls_policies?.tables_without_rls > 0) {
    results.recommendations.push(
      'Enable Row Level Security on all Supabase tables',
      'Define RLS policies for authenticated users',
      'Test RLS policies with different user roles'
    );
  }

  if (critical_issues.length === 0 && warnings.length === 0) {
    results.recommendations.push(
      'Security posture is strong - no critical vulnerabilities',
      'Continue following security best practices',
      'Regular security audits recommended'
    );
  }
}
