#!/usr/bin/env node
/**
 * 📦 DEPENDENCY Sub-Agent - Dependency Management & Security Review
 *
 * Purpose:
 * - Scan for security vulnerabilities (npm audit, CVEs)
 * - Detect outdated packages and deprecated dependencies
 * - Identify version conflicts and peer dependency issues
 * - Assess supply chain security and package health
 *
 * Evaluation Areas:
 * 1. Security - CVE detection, vulnerability severity
 * 2. Maintenance - Outdated/deprecated packages
 * 3. Compatibility - Version conflicts, peer dependencies
 * 4. Performance - Bundle size, tree-shaking support
 *
 * Activation: Conditional (dependency-related keywords detected)
 * Blocking: FAIL verdict (critical CVEs) blocks PLAN→EXEC handoff
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

/**
 * Execute Dependency Management Review
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent configuration
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Review results
 */
export async function execute(sdId, subAgent, options = {}) {
  console.log(`\n📦 DEPENDENCY MANAGEMENT REVIEW - Executing for ${sdId}\n`);

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const results = {
    sd_id: sdId,
    sub_agent_code: 'DEPENDENCY',
    timestamp: new Date().toISOString(),
    verdict: 'PASS',
    confidence_score: 0,
    summary: '',
    findings: {
      security_score: 0,
      maintenance_score: 0,
      compatibility_score: 0,
      performance_score: 0,
      vulnerabilities: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      }
    },
    recommendations: [],
    blockers: [],
    warnings: []
  };

  try {
    // ============================================
    // 1. FETCH SD AND PRD
    // ============================================
    console.log('📋 Step 1: Fetching SD and PRD...');

    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (sdError || !sd) {
      throw new Error(`Failed to fetch SD: ${sdError?.message || 'Not found'}`);
    }

    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('sd_id', sdId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    console.log(`   ✓ SD: ${sd.title}`);
    if (prd) {
      console.log(`   ✓ PRD: ${prd.title}`);
    }

    // ============================================
    // 2. DETECT DEPENDENCY CHANGES
    // ============================================
    console.log('\n🔍 Step 2: Detecting dependency changes...');
    const depInfo = detectDependencyChanges(sd, prd);

    if (!depInfo.hasDependencyChanges) {
      console.log('   ℹ️  No dependency changes detected - running baseline audit');
    } else {
      console.log(`   ✓ Dependency changes detected: ${depInfo.changes.join(', ')}`);
    }

    // ============================================
    // 3. LOCATE PACKAGE.JSON FILES
    // ============================================
    console.log('\n📂 Step 3: Locating package.json files...');
    const packageJsonPaths = findPackageJsonFiles();
    console.log(`   ✓ Found ${packageJsonPaths.length} package.json file(s)`);

    if (packageJsonPaths.length === 0) {
      console.log('   ⚠️  No package.json files found - skipping dependency review');
      results.verdict = 'PASS';
      results.confidence_score = 100;
      results.summary = 'No package.json files found - dependency review not applicable';
      return results;
    }

    // ============================================
    // 4. RUN NPM AUDIT (Security Vulnerabilities)
    // ============================================
    console.log('\n🔒 Step 4: Running npm audit for security vulnerabilities...');
    const securityScore = await runNpmAudit(packageJsonPaths);
    results.findings.security_score = securityScore.score;
    results.findings.vulnerabilities = securityScore.vulnerabilities;
    results.recommendations.push(...securityScore.recommendations);
    results.blockers.push(...securityScore.blockers);
    results.warnings.push(...securityScore.warnings);
    console.log(`   Security Score: ${securityScore.score}/10`);

    // ============================================
    // 5. CHECK FOR OUTDATED PACKAGES
    // ============================================
    console.log('\n📅 Step 5: Checking for outdated packages...');
    const maintenanceScore = await checkOutdatedPackages(packageJsonPaths);
    results.findings.maintenance_score = maintenanceScore.score;
    results.recommendations.push(...maintenanceScore.recommendations);
    results.warnings.push(...maintenanceScore.warnings);
    console.log(`   Maintenance Score: ${maintenanceScore.score}/10`);

    // ============================================
    // 6. ANALYZE COMPATIBILITY
    // ============================================
    console.log('\n🔗 Step 6: Analyzing dependency compatibility...');
    const compatibilityScore = await analyzeDependencyCompatibility(packageJsonPaths);
    results.findings.compatibility_score = compatibilityScore.score;
    results.recommendations.push(...compatibilityScore.recommendations);
    results.warnings.push(...compatibilityScore.warnings);
    console.log(`   Compatibility Score: ${compatibilityScore.score}/10`);

    // ============================================
    // 7. ASSESS PERFORMANCE IMPACT
    // ============================================
    console.log('\n⚡ Step 7: Assessing performance impact...');
    const performanceScore = await assessPerformanceImpact(packageJsonPaths);
    results.findings.performance_score = performanceScore.score;
    results.recommendations.push(...performanceScore.recommendations);
    console.log(`   Performance Score: ${performanceScore.score}/10`);

    // ============================================
    // 8. CALCULATE VERDICT
    // ============================================
    console.log('\n📊 Step 8: Calculating final verdict...');

    const avgScore = (
      securityScore.score +
      maintenanceScore.score +
      compatibilityScore.score +
      performanceScore.score
    ) / 4;

    results.confidence_score = Math.round(avgScore * 10); // Convert to 0-100

    // Security is paramount - critical vulnerabilities block
    if (results.findings.vulnerabilities.critical > 0) {
      results.verdict = 'FAIL';
      results.summary = `CRITICAL: ${results.findings.vulnerabilities.critical} critical vulnerabilities detected. Must be patched before proceeding.`;
      results.blockers.unshift(`${results.findings.vulnerabilities.critical} critical CVE(s) found - immediate action required`);
    } else if (results.findings.vulnerabilities.high >= 5) {
      results.verdict = 'FAIL';
      results.summary = `${results.findings.vulnerabilities.high} high-severity vulnerabilities detected. Recommend patching before proceeding.`;
      results.blockers.unshift(`${results.findings.vulnerabilities.high} high-severity CVE(s) found - should be addressed`);
    } else if (results.blockers.length > 0) {
      results.verdict = 'FAIL';
      results.summary = `Dependency review FAILED with ${results.blockers.length} critical issue(s). Average score: ${avgScore.toFixed(1)}/10`;
    } else if (avgScore >= 8.0) {
      results.verdict = 'PASS';
      results.summary = `Dependencies are healthy and secure. Average score: ${avgScore.toFixed(1)}/10`;
    } else if (avgScore >= 6.0) {
      results.verdict = 'CONDITIONAL_PASS';
      results.summary = `Dependencies acceptable with improvements needed. Average score: ${avgScore.toFixed(1)}/10`;
    } else {
      results.verdict = 'CONDITIONAL_PASS';
      results.summary = `Dependencies need attention. Average score: ${avgScore.toFixed(1)}/10`;
    }

    console.log(`   Verdict: ${results.verdict}`);
    console.log(`   Confidence: ${results.confidence_score}%`);

  } catch (error) {
    console.error(`❌ Dependency review error: ${error.message}`);
    results.verdict = 'FAIL';
    results.confidence_score = 0;
    results.summary = `Dependency review failed: ${error.message}`;
    results.blockers.push(error.message);
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('DEPENDENCY REVIEW SUMMARY');
  console.log('='.repeat(60));
  console.log(`Verdict: ${results.verdict}`);
  console.log(`Confidence: ${results.confidence_score}%`);
  console.log(`\nScores:`);
  console.log(`  Security: ${results.findings.security_score}/10`);
  console.log(`  Maintenance: ${results.findings.maintenance_score}/10`);
  console.log(`  Compatibility: ${results.findings.compatibility_score}/10`);
  console.log(`  Performance: ${results.findings.performance_score}/10`);

  console.log(`\nVulnerabilities:`);
  console.log(`  Critical: ${results.findings.vulnerabilities.critical}`);
  console.log(`  High: ${results.findings.vulnerabilities.high}`);
  console.log(`  Medium: ${results.findings.vulnerabilities.medium}`);
  console.log(`  Low: ${results.findings.vulnerabilities.low}`);

  if (results.blockers.length > 0) {
    console.log(`\n🚨 Blockers (${results.blockers.length}):`);
    results.blockers.forEach(b => console.log(`   - ${b}`));
  }

  if (results.recommendations.length > 0) {
    console.log(`\n💡 Recommendations (${results.recommendations.length}):`);
    results.recommendations.slice(0, 5).forEach(r => console.log(`   - ${r}`));
    if (results.recommendations.length > 5) {
      console.log(`   ... and ${results.recommendations.length - 5} more`);
    }
  }

  console.log('='.repeat(60) + '\n');

  return results;
}

/**
 * Detect dependency changes from SD/PRD
 */
function detectDependencyChanges(sd, prd) {
  const content = `${sd.title} ${sd.scope || ''} ${sd.description || ''} ${prd?.technical_requirements || ''}`.toLowerCase();

  const hasDependencyChanges = /\b(dependency|dependencies|npm|package|upgrade|update|vulnerability|cve)\b/i.test(content);

  const changes = [];
  if (content.includes('upgrade') || content.includes('update')) changes.push('package updates');
  if (content.includes('vulnerability') || content.includes('cve')) changes.push('security fixes');
  if (content.includes('add') && content.includes('package')) changes.push('new packages');
  if (content.includes('remove') && content.includes('dependency')) changes.push('dependency removal');

  return { hasDependencyChanges, changes };
}

/**
 * Find all package.json files in the project
 */
function findPackageJsonFiles() {
  const paths = [];
  const searchPaths = [
    '/mnt/c/_EHG/ehg/package.json',
    '/mnt/c/_EHG/EHG_Engineer/package.json'
  ];

  for (const path of searchPaths) {
    if (existsSync(path)) {
      paths.push(path);
    }
  }

  return paths;
}

/**
 * Run npm audit to detect security vulnerabilities
 */
async function runNpmAudit(packageJsonPaths) {
  const score = { score: 10, vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 }, recommendations: [], blockers: [], warnings: [] };

  for (const packagePath of packageJsonPaths) {
    const dir = dirname(packagePath);
    console.log(`   Auditing: ${packagePath}`);

    try {
      // Run npm audit --json
      const { stdout } = await execAsync('npm audit --json', { cwd: dir, timeout: 30000 });
      const auditResult = JSON.parse(stdout);

      if (auditResult.metadata) {
        const { vulnerabilities } = auditResult.metadata;
        score.vulnerabilities.critical += vulnerabilities.critical || 0;
        score.vulnerabilities.high += vulnerabilities.high || 0;
        score.vulnerabilities.medium += vulnerabilities.medium || 0;
        score.vulnerabilities.low += vulnerabilities.low || 0;
      }
    } catch (error) {
      // npm audit exits with non-zero if vulnerabilities found
      if (error.stdout) {
        try {
          const auditResult = JSON.parse(error.stdout);
          if (auditResult.metadata) {
            const { vulnerabilities } = auditResult.metadata;
            score.vulnerabilities.critical += vulnerabilities.critical || 0;
            score.vulnerabilities.high += vulnerabilities.high || 0;
            score.vulnerabilities.medium += vulnerabilities.medium || 0;
            score.vulnerabilities.low += vulnerabilities.low || 0;
          }
        } catch (parseError) {
          console.log(`   ⚠️  Could not parse audit results: ${parseError.message}`);
        }
      } else {
        console.log(`   ⚠️  npm audit failed: ${error.message}`);
      }
    }
  }

  // Calculate score based on vulnerabilities
  if (score.vulnerabilities.critical > 0) {
    score.score = 0;
    score.blockers.push(`${score.vulnerabilities.critical} critical vulnerability(ies) - immediate patch required`);
  } else if (score.vulnerabilities.high > 0) {
    score.score = Math.max(0, 7 - score.vulnerabilities.high * 0.5);
    score.warnings.push(`${score.vulnerabilities.high} high-severity vulnerability(ies) detected`);
  } else if (score.vulnerabilities.medium > 0) {
    score.score = Math.max(7, 10 - score.vulnerabilities.medium * 0.2);
    score.recommendations.push(`${score.vulnerabilities.medium} medium-severity vulnerability(ies) - consider patching`);
  } else if (score.vulnerabilities.low > 0) {
    score.score = Math.max(8, 10 - score.vulnerabilities.low * 0.1);
  }

  console.log(`   Found: ${score.vulnerabilities.critical} critical, ${score.vulnerabilities.high} high, ${score.vulnerabilities.medium} medium, ${score.vulnerabilities.low} low`);

  if (score.vulnerabilities.critical + score.vulnerabilities.high + score.vulnerabilities.medium + score.vulnerabilities.low === 0) {
    console.log(`   ✓ No vulnerabilities detected`);
  }

  return score;
}

/**
 * Check for outdated packages
 */
async function checkOutdatedPackages(packageJsonPaths) {
  const score = { score: 8, recommendations: [], warnings: [] };

  for (const packagePath of packageJsonPaths) {
    const dir = dirname(packagePath);
    console.log(`   Checking outdated: ${packagePath}`);

    try {
      // Run npm outdated --json (non-blocking)
      const { stdout } = await execAsync('npm outdated --json', { cwd: dir, timeout: 30000 });
      if (stdout) {
        const outdated = JSON.parse(stdout);
        const outdatedCount = Object.keys(outdated).length;

        if (outdatedCount > 10) {
          score.score -= 2;
          score.recommendations.push(`${outdatedCount} packages are outdated - consider updating regularly`);
        } else if (outdatedCount > 5) {
          score.score -= 1;
          score.recommendations.push(`${outdatedCount} packages are outdated - review and update`);
        } else if (outdatedCount > 0) {
          score.score -= 0.5;
        }

        console.log(`   ℹ️  ${outdatedCount} outdated package(s)`);
      } else {
        console.log(`   ✓ All packages up to date`);
      }
    } catch (error) {
      // npm outdated returns non-zero exit code if packages are outdated, but that's expected
      if (error.stdout) {
        try {
          const outdated = JSON.parse(error.stdout);
          const outdatedCount = Object.keys(outdated).length;
          console.log(`   ℹ️  ${outdatedCount} outdated package(s)`);
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }

  return score;
}

/**
 * Analyze dependency compatibility (peer dependencies, version conflicts)
 */
async function analyzeDependencyCompatibility(packageJsonPaths) {
  const score = { score: 9, recommendations: [], warnings: [] };

  for (const packagePath of packageJsonPaths) {
    try {
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));

      // Check for peer dependency conflicts
      if (packageJson.peerDependencies) {
        const peerCount = Object.keys(packageJson.peerDependencies).length;
        if (peerCount > 0) {
          score.recommendations.push(`Review ${peerCount} peer dependency requirement(s) for compatibility`);
        }
      }

      // Check for deprecated packages (known deprecated packages)
      const deprecatedPackages = ['request', 'gulp', 'bower'];
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      for (const dep of Object.keys(deps)) {
        if (deprecatedPackages.includes(dep)) {
          score.score -= 1;
          score.warnings.push(`Package '${dep}' is deprecated - consider migration`);
        }
      }
    } catch (error) {
      console.log(`   ⚠️  Could not analyze ${packagePath}: ${error.message}`);
    }
  }

  return score;
}

/**
 * Assess performance impact (bundle size, tree-shaking)
 */
async function assessPerformanceImpact(packageJsonPaths) {
  const score = { score: 8, recommendations: [] };

  for (const packagePath of packageJsonPaths) {
    try {
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      const depCount = Object.keys(deps).length;

      // Check for heavy dependencies
      const heavyPackages = ['moment', 'lodash', 'jquery', 'axios', '@angular/core'];
      const lightAlternatives = {
        'moment': 'date-fns or dayjs',
        'lodash': 'lodash-es or individual functions',
        'jquery': 'native DOM APIs',
        'axios': 'fetch API'
      };

      for (const dep of Object.keys(deps)) {
        if (heavyPackages.includes(dep) && lightAlternatives[dep]) {
          score.recommendations.push(`Consider replacing '${dep}' with ${lightAlternatives[dep]} for better bundle size`);
          score.score -= 0.5;
        }
      }

      // Warn about too many dependencies
      if (depCount > 50) {
        score.recommendations.push(`Large dependency count (${depCount}) - consider consolidation`);
        score.score -= 0.5;
      }
    } catch (error) {
      console.log(`   ⚠️  Could not analyze ${packagePath}: ${error.message}`);
    }
  }

  return score;
}

export default { execute };
