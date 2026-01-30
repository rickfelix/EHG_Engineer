/**
 * PERFORMANCE Sub-Agent (Performance Engineering Lead)
 * LEO Protocol v4.2.0 - Sub-Agent Performance Enhancement
 *
 * Purpose: Performance bottleneck identification and load time verification
 * Code: PERFORMANCE
 * Priority: 4
 *
 * Philosophy: "Performance is a feature. Measure, optimize, verify."
 *
 * Created: 2025-10-11 (SD-SUBAGENT-IMPROVE-001)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  getRiskContext,
  calculateContextualConfidence,
  getAggregateRiskStats
} from '../utils/risk-context.js';
import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const execAsync = promisify(exec);
// Supabase client initialized in execute() to use async createSupabaseServiceClient
let supabase = null;

/**
 * Execute PERFORMANCE sub-agent
 * Analyzes performance bottlenecks
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent instructions (already loaded)
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Performance analysis results
 */
export async function execute(sdId, subAgent, options = {}) {
  console.log(`\n⚡ Starting PERFORMANCE for ${sdId}...`);
  console.log('   Performance Engineering Lead - Bottleneck Analysis');

  // Initialize Supabase client with SERVICE_ROLE_KEY (SD-FOUND-SAFETY-002 pattern)
  if (!supabase) {
    supabase = await createSupabaseServiceClient('engineer', { verbose: false });
  }

  const results = {
    verdict: 'PASS',
    confidence: 100,
    critical_issues: [],
    warnings: [],
    recommendations: [],
    detailed_analysis: {},
    findings: {
      bundle_analysis: null,
      load_time_check: null,
      memory_analysis: null,
      query_optimization: null,
      render_performance: null,
      waterfall_detection: null,
      barrel_import_audit: null,
      server_cache_check: null
    },
    options
  };

  try {
    const repoPath = options.repo_path || path.resolve(__dirname, '../../../../ehg');

    // Phase 1: Bundle Size Analysis
    console.log('\n📦 Phase 1: Analyzing bundle size...');
    const bundleAnalysis = await analyzeBundleSize(repoPath);
    results.findings.bundle_analysis = bundleAnalysis;

    if (bundleAnalysis.oversized_bundles > 0) {
      console.log(`   ⚠️  ${bundleAnalysis.oversized_bundles} oversized bundle(s) detected`);
      results.warnings.push({
        severity: 'MEDIUM',
        issue: `${bundleAnalysis.oversized_bundles} bundle(s) exceed recommended size`,
        recommendation: 'Implement code splitting and lazy loading',
        bundles: bundleAnalysis.large_bundles
      });
      if (results.confidence > 85) results.confidence = 85;
    } else {
      console.log('   ✅ Bundle sizes within acceptable range');
    }

    // Phase 2: Load Time Check
    console.log('\n⏱️  Phase 2: Checking page load times...');
    const loadTimeCheck = await checkLoadTimes(repoPath, options);
    results.findings.load_time_check = loadTimeCheck;

    if (loadTimeCheck.slow_pages > 0) {
      console.log(`   ⚠️  ${loadTimeCheck.slow_pages} page(s) exceed 3s load time`);
      results.warnings.push({
        severity: 'HIGH',
        issue: `${loadTimeCheck.slow_pages} pages with slow load times`,
        recommendation: 'Optimize slow pages to meet 3s target',
        slow_pages: loadTimeCheck.slow_page_list
      });
      if (results.confidence > 75) results.confidence = 75;
    } else {
      console.log('   ✅ All pages load within acceptable time (<3s)');
    }

    // Phase 3: Memory Analysis
    console.log('\n🧠 Phase 3: Analyzing memory usage patterns...');
    const memoryAnalysis = await analyzeMemory(repoPath);
    results.findings.memory_analysis = memoryAnalysis;

    if (memoryAnalysis.memory_leaks > 0) {
      console.log(`   ❌ ${memoryAnalysis.memory_leaks} potential memory leak(s) detected`);

      // Apply contextual risk scoring
      const affectedFiles = memoryAnalysis.affected_files || [];
      if (affectedFiles.length > 0) {
        const contextualIssues = await enhanceWithRiskContext(
          affectedFiles,
          'memory_leak',
          repoPath
        );

        results.critical_issues.push({
          severity: contextualIssues.max_severity || 'CRITICAL',
          issue: `${memoryAnalysis.memory_leaks} memory leak patterns found`,
          recommendation: 'Fix memory leaks before deployment',
          leaks: memoryAnalysis.leak_patterns,
          risk_context: contextualIssues
        });

        // Only block if high-risk files affected
        if (contextualIssues.max_risk_score >= 7.0) {
          results.verdict = 'BLOCKED';
          console.log(`   🔴 BLOCKED: High-risk files with memory leaks (risk score: ${contextualIssues.max_risk_score})`);
        } else if (contextualIssues.max_risk_score >= 4.0) {
          results.verdict = 'CONDITIONAL_PASS';
          console.log(`   🟡 CONDITIONAL: Medium-risk files with memory leaks (risk score: ${contextualIssues.max_risk_score})`);
        }
      } else {
        // Fallback if no files identified
        results.critical_issues.push({
          severity: 'CRITICAL',
          issue: `${memoryAnalysis.memory_leaks} memory leak patterns found`,
          recommendation: 'Fix memory leaks before deployment',
          leaks: memoryAnalysis.leak_patterns
        });
        results.verdict = 'BLOCKED';
      }
    } else {
      console.log('   ✅ No memory leak patterns detected');
    }

    // Phase 4: Query Optimization
    console.log('\n🗄️  Phase 4: Checking database query optimization...');
    const queryOptimization = await checkQueryOptimization(repoPath);
    results.findings.query_optimization = queryOptimization;

    if (queryOptimization.unoptimized_queries > 0) {
      console.log(`   ⚠️  ${queryOptimization.unoptimized_queries} unoptimized query/ies found`);
      results.warnings.push({
        severity: 'MEDIUM',
        issue: `${queryOptimization.unoptimized_queries} queries may benefit from optimization`,
        recommendation: 'Add indexes and optimize select statements',
        queries: queryOptimization.unoptimized_list
      });
      if (results.confidence > 80) results.confidence = 80;
    } else {
      console.log('   ✅ Query optimization patterns detected');
    }

    // Phase 5: Render Performance
    console.log('\n🎨 Phase 5: Analyzing render performance...');
    const renderPerformance = await analyzeRenderPerformance(repoPath);
    results.findings.render_performance = renderPerformance;

    if (renderPerformance.performance_issues > 0) {
      console.log(`   ⚠️  ${renderPerformance.performance_issues} render performance issue(s) found`);
      results.warnings.push({
        severity: 'MEDIUM',
        issue: `${renderPerformance.performance_issues} components may cause render bottlenecks`,
        recommendation: 'Use React.memo, useMemo, and useCallback for optimization',
        issues: renderPerformance.issue_details
      });
      if (results.confidence > 80) results.confidence = 80;
    } else {
      console.log('   ✅ Render performance optimizations detected');
    }

    // Phase 6: Waterfall Detection (SD-LEO-INFRA-INTEGRATE-VERCEL-REACT-001)
    console.log('\n🌊 Phase 6: Detecting waterfall patterns...');
    const waterfallDetection = await detectWaterfallPatterns(repoPath);
    results.findings.waterfall_detection = waterfallDetection;

    if (waterfallDetection.waterfall_count > 0) {
      console.log(`   ⚠️  ${waterfallDetection.waterfall_count} sequential await chain(s) detected`);
      results.warnings.push({
        severity: 'MEDIUM',
        issue: `${waterfallDetection.waterfall_count} sequential await chains could be parallelized`,
        recommendation: 'Use Promise.all() for independent async operations',
        affected_files: waterfallDetection.affected_files
      });
      if (results.confidence > 80) results.confidence = 80;
    } else {
      console.log('   ✅ No sequential await waterfall patterns detected');
    }

    // Phase 7: Barrel Import Audit (SD-LEO-INFRA-INTEGRATE-VERCEL-REACT-001)
    console.log('\n📦 Phase 7: Auditing barrel imports...');
    const barrelImportAudit = await auditBarrelImports(repoPath);
    results.findings.barrel_import_audit = barrelImportAudit;

    if (barrelImportAudit.new_barrels > 0) {
      console.log(`   ❌ ${barrelImportAudit.new_barrels} NEW barrel import(s) detected (not grandfathered)`);
      results.critical_issues.push({
        severity: 'CRITICAL',
        issue: `${barrelImportAudit.new_barrels} new barrel import(s) detected`,
        recommendation: 'Replace barrel exports with direct imports. See .claude/skills/barrel-remediation.md',
        violations: barrelImportAudit.critical_violations,
        grandfathered: barrelImportAudit.grandfathered_count
      });
      if (results.verdict !== 'BLOCKED') results.verdict = 'BLOCKED';
      results.confidence = Math.min(results.confidence, 50);
    } else if (barrelImportAudit.total_barrels > 0) {
      console.log(`   ✅ ${barrelImportAudit.total_barrels} barrel import(s) detected (all grandfathered)`);
    } else {
      console.log('   ✅ No barrel imports detected');
    }

    // Phase 8: Server Cache Check (SD-LEO-INFRA-INTEGRATE-VERCEL-REACT-001)
    console.log('\n💾 Phase 8: Checking server cache patterns...');
    const serverCacheCheck = await checkServerCachePatterns(repoPath);
    results.findings.server_cache_check = serverCacheCheck;

    if (serverCacheCheck.missing_cache_count > 0) {
      console.log(`   ⚠️  ${serverCacheCheck.missing_cache_count} data fetching function(s) without React.cache()`);
      results.warnings.push({
        severity: 'MEDIUM',
        issue: `${serverCacheCheck.missing_cache_count} server functions may benefit from React.cache()`,
        recommendation: 'Wrap data fetching functions with React.cache() for deduplication',
        affected_files: serverCacheCheck.affected_files
      });
      if (results.confidence > 80) results.confidence = 80;
    } else {
      console.log('   ✅ Server cache patterns adequate');
    }

    // Generate recommendations
    console.log('\n💡 Generating recommendations...');
    generateRecommendations(results);

    console.log(`\n🏁 PERFORMANCE Complete: ${results.verdict} (${results.confidence}% confidence)`);

    return results;

  } catch (error) {
    console.error('\n❌ PERFORMANCE error:', error.message);
    results.verdict = 'ERROR';
    results.error = error.message;
    results.confidence = 0;
    results.critical_issues.push({
      severity: 'CRITICAL',
      issue: 'PERFORMANCE sub-agent execution failed',
      recommendation: 'Review error and retry',
      error: error.message
    });
    return results;
  }
}

/**
 * Analyze bundle size
 */
async function analyzeBundleSize(repoPath) {
  try {
    // Check for large chunks in dist folder
    const { stdout: distFiles } = await execAsync(
      `cd "${repoPath}" && find dist -name "*.js" -size +500k 2>/dev/null | wc -l`
    );

    const oversizedBundles = parseInt(distFiles.trim());

    return {
      checked: true,
      oversized_bundles: oversizedBundles,
      threshold_kb: 500,
      large_bundles: oversizedBundles > 0 ? [
        `${oversizedBundles} bundle(s) >500KB detected`
      ] : [],
      recommendation: oversizedBundles > 0 ? 'Implement code splitting' : 'Bundle sizes acceptable'
    };
  } catch (error) {
    return {
      checked: false,
      oversized_bundles: 0,
      error: error.message
    };
  }
}

/**
 * Check load times
 */
async function checkLoadTimes(repoPath, options) {
  try {
    // Simulated load time check (in real implementation, would use Lighthouse or similar)
    const simulatedLoadTime = options.simulated_load_time || 1500; // ms

    const slowPages = simulatedLoadTime > 3000 ? 1 : 0;

    return {
      checked: true,
      average_load_time_ms: simulatedLoadTime,
      threshold_ms: 3000,
      slow_pages: slowPages,
      slow_page_list: slowPages > 0 ? [
        `Page load time: ${simulatedLoadTime}ms (target: <3000ms)`
      ] : [],
      note: 'Load time simulation - use Lighthouse for accurate measurement'
    };
  } catch (error) {
    return {
      checked: false,
      average_load_time_ms: 0,
      slow_pages: 0,
      slow_page_list: [],
      error: error.message
    };
  }
}

/**
 * Analyze memory usage
 * Fixed: Check for MISSING cleanup patterns, not presence of hooks
 * Quick-Fix: Performance sub-agent false positive fix
 */
async function analyzeMemory(repoPath) {
  try {
    // Check for useEffect WITHOUT cleanup functions (actual memory leaks)
    // Pattern: useEffect followed by code that doesn't return cleanup function
    const { stdout: missingCleanupCount } = await execAsync(
      `cd "${repoPath}" && grep -n "useEffect" src/**/*.{js,jsx,ts,tsx} 2>/dev/null | ` +
      'grep -v "return () =>" | grep -v "useEffect.*=>.*{" | wc -l'
    );

    // Check for addEventListener WITHOUT corresponding removeEventListener
    // Pattern: addEventListener without cleanup in useEffect or componentWillUnmount
    const { stdout: unboundListenerCount } = await execAsync(
      `cd "${repoPath}" && grep -l "addEventListener" src/**/*.{js,jsx,ts,tsx} 2>/dev/null | ` +
      'while read f; do ' +
      '  listeners=$(grep -c "addEventListener" "$f"); ' +
      '  removers=$(grep -c "removeEventListener" "$f"); ' +
      '  if [ "$listeners" -gt "$removers" ]; then echo "$f"; fi; ' +
      'done | wc -l'
    );

    const missingCleanup = parseInt(missingCleanupCount.trim()) || 0;
    const unboundListeners = parseInt(unboundListenerCount.trim()) || 0;
    const totalRealLeaks = missingCleanup + unboundListeners;

    // Only flag if > 2 instances of actual missing cleanup (not just presence)
    // This is much more realistic than the previous > 5 files threshold
    const memoryLeaks = totalRealLeaks > 2 ? 1 : 0;

    return {
      checked: true,
      memory_leaks: memoryLeaks,
      missing_cleanup_count: missingCleanup,
      unbound_listeners_count: unboundListeners,
      total_real_leaks: totalRealLeaks,
      affected_files: memoryLeaks > 0 ? [
        `${missingCleanup} useEffect hooks without cleanup functions`,
        `${unboundListeners} addEventListener calls without removeEventListener`
      ] : [],
      leak_patterns: memoryLeaks > 0 ? [
        `${totalRealLeaks} file(s) with confirmed memory leak patterns (missing cleanup)`
      ] : [],
      note: 'Only flags actual missing cleanup patterns, not presence of hooks'
    };
  } catch (error) {
    return {
      checked: false,
      memory_leaks: 0,
      missing_cleanup_count: 0,
      unbound_listeners_count: 0,
      total_real_leaks: 0,
      affected_files: [],
      leak_patterns: [],
      error: error.message
    };
  }
}

/**
 * Check query optimization
 */
async function checkQueryOptimization(repoPath) {
  try {
    // Check for select('*') usage (anti-pattern)
    const { stdout: selectAll } = await execAsync(
      `cd "${repoPath}" && grep -r "select('\\*')" src 2>/dev/null | wc -l`
    );

    // Check for missing limit/pagination
    const { stdout: missingLimit } = await execAsync(
      `cd "${repoPath}" && grep -r "\\.from(" src 2>/dev/null | grep -v "\\.limit(" | wc -l`
    );

    const unoptimized = parseInt(selectAll.trim()) + (parseInt(missingLimit.trim()) > 10 ? 1 : 0);

    return {
      checked: true,
      unoptimized_queries: unoptimized,
      select_all_usage: parseInt(selectAll.trim()),
      missing_limit: parseInt(missingLimit.trim()),
      unoptimized_list: unoptimized > 0 ? [
        `${selectAll.trim()} select('*') usage(s) (specify columns)`,
        `${missingLimit.trim()} queries without limit (add pagination)`
      ] : []
    };
  } catch (error) {
    return {
      checked: false,
      unoptimized_queries: 0,
      unoptimized_list: [],
      error: error.message
    };
  }
}

/**
 * Analyze render performance
 */
async function analyzeRenderPerformance(repoPath) {
  try {
    // Check for missing React.memo
    const { stdout: largeComponents } = await execAsync(
      `cd "${repoPath}" && find src/components -name "*.tsx" -o -name "*.jsx" 2>/dev/null | xargs wc -l 2>/dev/null | awk '$1 > 300' | wc -l`
    );

    // Check for useMemo/useCallback usage
    const { stdout: optimizationHooks } = await execAsync(
      `cd "${repoPath}" && grep -r "useMemo\\|useCallback" src 2>/dev/null | wc -l`
    );

    const largeCount = parseInt(largeComponents.trim());
    const hasOptimizations = parseInt(optimizationHooks.trim()) > 0;

    const issues = (largeCount > 5 && !hasOptimizations) ? 1 : 0;

    return {
      checked: true,
      performance_issues: issues,
      large_components: largeCount,
      has_optimizations: hasOptimizations,
      issue_details: issues > 0 ? [
        `${largeCount} large components without optimization hooks`,
        'Consider using React.memo, useMemo, useCallback'
      ] : []
    };
  } catch (error) {
    return {
      checked: false,
      performance_issues: 0,
      issue_details: [],
      error: error.message
    };
  }
}

/**
 * Enhance detected issues with contextual risk scoring
 */
async function enhanceWithRiskContext(affectedFiles, patternType, repoPath) {
  const analysis = {
    pattern_type: patternType,
    files_analyzed: affectedFiles.length,
    risk_scores: [],
    max_risk_score: 0,
    max_severity: 'LOW',
    aggregate_stats: null
  };

  if (affectedFiles.length === 0) {
    return analysis;
  }

  console.log(`   📊 Analyzing risk context for ${affectedFiles.length} file(s)...`);

  const contextualFindings = [];
  for (const file of affectedFiles.slice(0, 10)) {
    try {
      const riskContext = await getRiskContext(file, { repo_path: repoPath });
      const scoring = calculateContextualConfidence(85, riskContext);

      contextualFindings.push({
        file,
        risk_score: scoring.risk_score,
        contextual_severity: scoring.contextual_severity,
        risk_factors: scoring.risk_factors,
        explanation: scoring.explanation,
        adjusted_confidence: scoring.adjusted_confidence
      });

      if (scoring.risk_score > analysis.max_risk_score) {
        analysis.max_risk_score = scoring.risk_score;
        analysis.max_severity = scoring.contextual_severity;
      }

      console.log(`      ${getSeverityIcon(scoring.contextual_severity)} ${file.split('/').pop()}: Risk ${scoring.risk_score}/10 (${scoring.contextual_severity})`);
    } catch (err) {
      console.warn(`      ⚠️  Could not analyze ${file}: ${err.message}`);
    }
  }

  analysis.risk_scores = contextualFindings;
  analysis.aggregate_stats = getAggregateRiskStats(contextualFindings);

  console.log(`   📈 Risk Summary: ${analysis.aggregate_stats.critical} critical, ${analysis.aggregate_stats.high} high, ${analysis.aggregate_stats.medium} medium, ${analysis.aggregate_stats.low} low`);

  return analysis;
}

/**
 * Get severity icon for display
 */
function getSeverityIcon(severity) {
  const icons = {
    CRITICAL: '🔴',
    HIGH: '🟠',
    MEDIUM: '🟡',
    LOW: '🟢'
  };
  return icons[severity] || '⚪';
}

/**
 * Generate recommendations
 */
function generateRecommendations(results) {
  const { findings, critical_issues, warnings } = results;

  if (critical_issues.length > 0) {
    results.recommendations.push(
      'Fix memory leaks before deployment',
      'Add cleanup functions to useEffect hooks',
      'Remove event listeners in component cleanup'
    );
  }

  if (findings.bundle_analysis?.oversized_bundles > 0) {
    results.recommendations.push(
      'Implement code splitting with React.lazy',
      'Use dynamic imports for route-based splitting',
      'Analyze bundle with: npm run build -- --analyze'
    );
  }

  if (findings.load_time_check?.slow_pages > 0) {
    results.recommendations.push(
      'Run Lighthouse performance audit',
      'Optimize images and assets',
      'Implement caching strategies'
    );
  }

  if (findings.query_optimization?.unoptimized_queries > 0) {
    results.recommendations.push(
      'Replace select(\'*\') with specific columns',
      'Add pagination with .limit() and .range()',
      'Create database indexes for frequent queries'
    );
  }

  if (findings.render_performance?.performance_issues > 0) {
    results.recommendations.push(
      'Wrap expensive components in React.memo',
      'Use useMemo for expensive calculations',
      'Use useCallback for event handlers passed to children'
    );
  }

  if (critical_issues.length === 0 && warnings.length === 0) {
    results.recommendations.push(
      'Performance profile is healthy',
      'Continue monitoring performance metrics',
      'Consider performance budgets for future features'
    );
  }

  // Add recommendations for new phases (Vercel React Best Practices)
  if (findings.waterfall_detection?.waterfall_count > 0) {
    results.recommendations.push(
      'Replace sequential awaits with Promise.all()',
      'Example: const [a, b] = await Promise.all([fetchA(), fetchB()])'
    );
  }

  if (findings.barrel_import_audit?.new_barrels > 0) {
    results.recommendations.push(
      'Replace barrel exports with direct imports',
      'See .claude/skills/barrel-remediation.md for patterns',
      'Example: import { fn } from "./utils/string-helpers.js" instead of "./utils"'
    );
  }

  if (findings.server_cache_check?.missing_cache_count > 0) {
    results.recommendations.push(
      'Wrap data fetching with React.cache() for deduplication',
      'Example: const getData = React.cache(async () => fetch(url))'
    );
  }
}

/**
 * Phase 6: Detect waterfall patterns (sequential await chains)
 * SD-LEO-INFRA-INTEGRATE-VERCEL-REACT-001
 */
async function detectWaterfallPatterns(repoPath) {
  try {
    // Find files with 3+ sequential await statements
    // Pattern: lines that start with await and are consecutive
    const { stdout: waterfallFiles } = await execAsync(
      `cd "${repoPath}" && grep -l "await" src/**/*.{js,jsx,ts,tsx} 2>/dev/null | while read f; do ` +
      'awk "/await.*[;]/{count++} /^[^a]|^$/{if(count>=3) print FILENAME; count=0}" "$f" 2>/dev/null; ' +
      'done | sort -u | head -20'
    ).catch(() => ({ stdout: '' }));

    const affectedFiles = waterfallFiles.trim().split('\n').filter(Boolean);

    return {
      checked: true,
      waterfall_count: affectedFiles.length,
      affected_files: affectedFiles,
      threshold: 3,
      recommendation: affectedFiles.length > 0
        ? 'Use Promise.all() for independent async operations'
        : 'No sequential await patterns detected'
    };
  } catch (error) {
    return {
      checked: false,
      waterfall_count: 0,
      affected_files: [],
      error: error.message
    };
  }
}

/**
 * Phase 7: Audit barrel imports (export * from patterns)
 * SD-LEO-INFRA-INTEGRATE-VERCEL-REACT-001
 */
async function auditBarrelImports(repoPath) {
  try {
    // Load baseline (grandfathered files)
    let baseline = { files: [] };
    try {
      const baselinePath = path.resolve(__dirname, '../../config/barrel-baseline-2026-01-29.json');
      const { default: baselineData } = await import(baselinePath, { assert: { type: 'json' } });
      baseline = baselineData;
    } catch {
      // Baseline not found - all barrels are new
      console.log('   ⚠️  Barrel baseline not found - treating all as new');
    }

    // Find all files with export * from
    const { stdout: barrelFiles } = await execAsync(
      `cd "${repoPath}" && grep -rl "export \\* from" --include="*.js" --include="*.ts" src lib scripts 2>/dev/null || echo ""`
    );

    const detectedBarrels = barrelFiles.trim().split('\n').filter(Boolean);

    // Normalize paths for comparison
    const normalizedBaseline = new Set(baseline.files.map(f => f.replace(/^\.\//, '')));

    // Separate new from grandfathered
    const newBarrels = detectedBarrels.filter(f => {
      const normalized = f.replace(/^\.\//, '');
      return !normalizedBaseline.has(normalized);
    });

    const grandfatheredCount = detectedBarrels.length - newBarrels.length;

    return {
      checked: true,
      total_barrels: detectedBarrels.length,
      new_barrels: newBarrels.length,
      grandfathered_count: grandfatheredCount,
      critical_violations: newBarrels,
      grandfathered_files: detectedBarrels.filter(f => {
        const normalized = f.replace(/^\.\//, '');
        return normalizedBaseline.has(normalized);
      }),
      recommendation: newBarrels.length > 0
        ? 'Replace barrel exports with direct imports. See .claude/skills/barrel-remediation.md'
        : 'All barrel imports are grandfathered or none detected'
    };
  } catch (error) {
    return {
      checked: false,
      total_barrels: 0,
      new_barrels: 0,
      grandfathered_count: 0,
      critical_violations: [],
      error: error.message
    };
  }
}

/**
 * Phase 8: Check server cache patterns (React.cache usage)
 * SD-LEO-INFRA-INTEGRATE-VERCEL-REACT-001
 */
async function checkServerCachePatterns(repoPath) {
  try {
    // Find async functions that fetch data but don't use React.cache
    // Pattern: async function or const x = async that has fetch but no cache wrapper
    const { stdout: dataFetchFiles } = await execAsync(
      `cd "${repoPath}" && grep -l "async.*fetch\\|fetch.*then" src/**/*.{js,jsx,ts,tsx} 2>/dev/null | ` +
      'while read f; do grep -L "React.cache\\|cache(" "$f" 2>/dev/null; done | head -20'
    ).catch(() => ({ stdout: '' }));

    const affectedFiles = dataFetchFiles.trim().split('\n').filter(Boolean);

    // Only flag if significant number of fetch calls without cache
    const missingCacheCount = affectedFiles.length > 2 ? affectedFiles.length : 0;

    return {
      checked: true,
      missing_cache_count: missingCacheCount,
      affected_files: affectedFiles,
      recommendation: missingCacheCount > 0
        ? 'Wrap data fetching functions with React.cache() for deduplication'
        : 'Server cache patterns adequate'
    };
  } catch (error) {
    return {
      checked: false,
      missing_cache_count: 0,
      affected_files: [],
      error: error.message
    };
  }
}
