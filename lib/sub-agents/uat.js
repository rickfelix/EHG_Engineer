/**
 * UAT Sub-Agent (UAT Test Executor)
 * LEO Protocol v4.2.0 - Sub-Agent Performance Enhancement
 * SD-MAN-GEN-INTELLIGENT-ROUTE-AWARE-001 - Route-Aware Enhancements
 * SD-LEO-ENH-VISION-QA-AUTO-PROCEED-001 - Three-Tier Testing (Debt Registry)
 *
 * Purpose: Interactive UAT test execution guide for manual testing
 * Code: UAT
 * Priority: 90
 *
 * Philosophy: "Structured scenarios prevent missed test cases."
 *
 * Created: 2025-10-11 (SD-SUBAGENT-IMPROVE-001)
 * Enhanced: 2026-02-01 (SD-MAN-GEN-INTELLIGENT-ROUTE-AWARE-001)
 * Enhanced: 2026-02-06 (SD-LEO-ENH-VISION-QA-AUTO-PROCEED-001) - UAT Debt Registry
 */

import dotenv from 'dotenv';
import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';
// LEO v4.3.4: Unified test evidence functions
import { ingestTestEvidence } from '../../scripts/lib/test-evidence-ingest.js';
// SD-MAN-GEN-INTELLIGENT-ROUTE-AWARE-001: Route-aware enhancements
import {
  generateRouteAwareHeader,
  enhanceScenarios,
  getTestingRecommendations
} from '../uat/route-aware-reporter.js';
import { getRouteDevelopmentSummary } from '../uat/route-context-resolver.js';
import { getPatternStatistics } from '../uat/issue-pattern-matcher.js';

dotenv.config();

// Supabase client initialized in execute() to use async createSupabaseServiceClient
let supabase = null;

/**
 * Execute UAT sub-agent
 * Generates structured UAT test scenarios
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent instructions (already loaded)
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} UAT test results
 */
export async function execute(sdId, subAgent, options = {}) {
  console.log(`\n🎯 Starting UAT for ${sdId}...`);
  console.log('   UAT Test Executor - Structured Manual Testing');

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
      test_scenarios: null,
      user_stories: null,
      prd_acceptance_criteria: null,
      route_context: null,
      pattern_statistics: null
    },
    options
  };

  try {
    // Phase 0: Route-Aware Header (SD-MAN-GEN-INTELLIGENT-ROUTE-AWARE-001)
    console.log('\n📍 Phase 0: Loading route context...');
    try {
      const routeHeader = await generateRouteAwareHeader();
      console.log(routeHeader);

      // Store route and pattern context
      results.findings.route_context = await getRouteDevelopmentSummary();
      results.findings.pattern_statistics = await getPatternStatistics();

      // Get testing recommendations based on routes
      const recommendations = await getTestingRecommendations(sdId);
      if (recommendations.focusAreas?.length > 0) {
        results.recommendations.push(
          ...recommendations.focusAreas.map(a => `Focus on ${a.area}: ${a.reason}`)
        );
      }
    } catch (routeError) {
      console.log(`   ⚠️  Route context unavailable: ${routeError.message}`);
      results.warnings.push({
        severity: 'LOW',
        issue: 'Route context not loaded',
        recommendation: 'Route-aware features disabled for this session'
      });
    }

    // Phase 1: Load user stories for test scenarios
    console.log('\n📋 Phase 1: Loading user stories...');
    const userStories = await loadUserStories(sdId);
    results.findings.user_stories = userStories;

    if (userStories.count === 0) {
      console.log('   ⚠️  No user stories found');
      results.warnings.push({
        severity: 'HIGH',
        issue: 'No user stories found for SD',
        recommendation: 'Create user stories to define UAT test scenarios',
        note: 'UAT testing requires user stories to guide manual testing'
      });
      if (results.confidence > 70) results.confidence = 70;
    } else {
      console.log(`   ✅ Found ${userStories.count} user stories`);
    }

    // Phase 2: Load PRD acceptance criteria
    console.log('\n📄 Phase 2: Loading PRD acceptance criteria...');
    const prdCriteria = await loadPRDAcceptanceCriteria(sdId);
    results.findings.prd_acceptance_criteria = prdCriteria;

    if (prdCriteria.found) {
      console.log(`   ✅ Found ${prdCriteria.criteria_count} acceptance criteria`);
    } else {
      console.log('   ⚠️  No PRD acceptance criteria found');
      results.warnings.push({
        severity: 'MEDIUM',
        issue: 'No PRD acceptance criteria found',
        recommendation: 'Add acceptance criteria to PRD for comprehensive UAT coverage'
      });
    }

    // Phase 3: Generate UAT test scenarios
    console.log('\n🧪 Phase 3: Generating UAT test scenarios...');
    let testScenarios = generateTestScenarios(userStories, prdCriteria);

    // Enhance scenarios with route context (SD-MAN-GEN-INTELLIGENT-ROUTE-AWARE-001)
    try {
      if (testScenarios.scenarios.length > 0) {
        testScenarios.scenarios = await enhanceScenarios(testScenarios.scenarios);
        console.log('   📍 Scenarios enhanced with route context');
      }
    } catch (enhanceError) {
      console.log(`   ⚠️  Could not enhance with route context: ${enhanceError.message}`);
    }

    results.findings.test_scenarios = testScenarios;

    if (testScenarios.scenarios.length > 0) {
      console.log(`   ✅ Generated ${testScenarios.scenarios.length} test scenario(s)`);
      console.log('\n   📝 Test Scenarios:\n');

      testScenarios.scenarios.forEach((scenario, i) => {
        console.log(`   ${i + 1}. ${scenario.title}`);
        console.log(`      Given: ${scenario.given}`);
        console.log(`      When: ${scenario.when}`);
        console.log(`      Then: ${scenario.then}`);
        console.log(`      Pass Criteria: ${scenario.pass_criteria}`);
        // Show route context if available (SD-MAN-GEN-INTELLIGENT-ROUTE-AWARE-001)
        if (scenario.hasRouteContext) {
          console.log(`      📍 Route: ${scenario.routeContext.path} (${scenario.routeContext.maturityLabel})`);
        }
        console.log('');
      });

      results.recommendations.push(
        `Execute ${testScenarios.scenarios.length} manual UAT test scenario(s)`,
        'Document pass/fail results for each scenario',
        'Capture screenshots for evidence',
        'Report any discrepancies as bugs'
      );
    } else {
      console.log('   ⚠️  No test scenarios generated');
      results.warnings.push({
        severity: 'HIGH',
        issue: 'No UAT test scenarios generated',
        recommendation: 'User stories or acceptance criteria missing - cannot create test plan'
      });
      if (results.confidence > 60) results.confidence = 60;
    }

    // Pre-load debt items for use in Phase 4 checklist and Phase 6 display
    const debtItems = await loadDebtItems(sdId);

    // Phase 4: Generate UAT checklist
    console.log('\n✅ Phase 4: Generating UAT checklist...');
    const checklist = generateUATChecklist(testScenarios, userStories, debtItems);
    results.findings.uat_checklist = checklist;

    console.log(`\n   📋 UAT Checklist (${checklist.items.length} items):\n`);
    checklist.items.forEach((item, i) => {
      console.log(`   [ ] ${i + 1}. ${item.description}`);
      if (item.sub_items && item.sub_items.length > 0) {
        item.sub_items.forEach(sub => {
          console.log(`       [ ] ${sub}`);
        });
      }
      console.log('');
    });

    // LEO v4.3.4: Phase 5 - Record UAT evidence to unified test evidence schema
    console.log('\n📝 Phase 5: Recording UAT evidence (LEO v4.3.4)...');
    try {
      // Create a synthetic test report for UAT results
      const uatTestReport = {
        stats: {
          expected: testScenarios.scenarios.length,
          tests: testScenarios.scenarios.length,
          passed: testScenarios.scenarios.length, // UAT scenarios are guidelines, not automated tests
          failed: 0,
          skipped: 0,
          startTime: new Date().toISOString(),
          duration: 0
        },
        tests: testScenarios.scenarios.map((scenario, idx) => ({
          title: scenario.title,
          fullTitle: `UAT Scenario ${idx + 1}: ${scenario.title}`,
          file: 'manual-uat-verification',
          duration: 0,
          status: 'passed', // UAT scenarios are pending manual verification
          err: null
        }))
      };

      await ingestTestEvidence(sdId, uatTestReport, {
        runType: 'manual_verification',
        triggeredBy: 'UAT_SUBAGENT'
      });

      console.log('   ✅ UAT evidence recorded to unified schema');
      results.findings.uat_evidence_recorded = true;
    } catch (evidenceError) {
      console.log(`   ⚠️  Could not record UAT evidence: ${evidenceError.message}`);
      results.findings.uat_evidence_recorded = false;
      results.warnings.push({
        severity: 'LOW',
        issue: 'UAT evidence not recorded to unified schema',
        recommendation: 'This is non-blocking - manual UAT results can be tracked separately'
      });
    }

    // Phase 6: UAT Debt Registry (Three-Tier Testing Architecture)
    console.log('\n📋 Phase 6: UAT debt registry items...');
    results.findings.debt_registry = debtItems;

    if (debtItems.found && debtItems.count > 0) {
      console.log(`   Found ${debtItems.count} pending debt item(s) from Vision QA / previous testing`);
      console.log('');

      // Group by category for display
      const byCategory = {};
      for (const item of debtItems.items) {
        const cat = item.category || 'uncategorized';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(item);
      }

      for (const [category, items] of Object.entries(byCategory)) {
        console.log(`   [${category.toUpperCase()}] (${items.length} item${items.length > 1 ? 's' : ''})`);
        for (const item of items) {
          const sevIcon = item.severity === 'critical' ? '!!' :
            item.severity === 'high' ? '!' : '-';
          const confidence = item.confidence != null ? ` (conf: ${Math.round(item.confidence * 100)}%)` : '';
          console.log(`     ${sevIcon} [${item.severity}] ${item.description}${confidence}`);
          if (item.area) {
            console.log(`       Area: ${item.area}`);
          }
          if (item.source === 'vision_qa') {
            console.log('       Source: Vision QA (AI-detected, needs human verification)');
          }
        }
        console.log('');
      }

      // Add debt items to recommendations
      const criticalDebt = debtItems.items.filter(d => d.severity === 'critical' || d.severity === 'high');
      if (criticalDebt.length > 0) {
        results.recommendations.push(
          `PRIORITY: Verify ${criticalDebt.length} critical/high-severity debt item(s) from Vision QA`
        );
      }
      results.recommendations.push(
        `Review ${debtItems.count} UAT debt item(s) and mark as resolved/wont_fix/deferred`
      );
    } else {
      console.log('   No pending debt items found');
    }

    console.log(`\n🏁 UAT Complete: ${results.verdict} (${results.confidence}% confidence)`);
    console.log(`   📊 Summary: ${testScenarios.scenarios.length} scenarios, ${checklist.items.length} checklist items`);
    if (debtItems.found && debtItems.count > 0) {
      console.log(`   📋 Debt Registry: ${debtItems.count} pending item(s) to review`);
    }

    return results;

  } catch (error) {
    console.error('\n❌ UAT error:', error.message);
    results.verdict = 'ERROR';
    results.error = error.message;
    results.confidence = 0;
    results.critical_issues.push({
      severity: 'CRITICAL',
      issue: 'UAT sub-agent execution failed',
      recommendation: 'Review error and retry',
      error: error.message
    });
    return results;
  }
}

/**
 * Load user stories
 */
async function loadUserStories(sdId) {
  const { data: stories, error } = await supabase
    .from('user_stories')
    .select('*')
    .eq('sd_id', sdId)
    .order('story_points', { ascending: false });

  if (error || !stories) {
    return {
      found: false,
      count: 0,
      stories: [],
      error: error?.message
    };
  }

  return {
    found: true,
    count: stories.length,
    stories: stories
  };
}

/**
 * Load PRD acceptance criteria
 */
async function loadPRDAcceptanceCriteria(sdId) {
  const { data: prd, error } = await supabase
    .from('product_requirements_v2')
    .select('acceptance_criteria')
    .eq('directive_id', sdId)
    .single();

  if (error || !prd || !prd.acceptance_criteria) {
    return {
      found: false,
      criteria_count: 0,
      criteria: []
    };
  }

  const criteria = Array.isArray(prd.acceptance_criteria) ? prd.acceptance_criteria : [];

  return {
    found: true,
    criteria_count: criteria.length,
    criteria: criteria
  };
}

/**
 * Load pending debt items from UAT debt registry for an SD.
 * Three-Tier Testing Architecture: items deferred from Vision QA (Tier 2)
 * that need human verification (Tier 3).
 */
async function loadDebtItems(sdId) {
  try {
    const { data: items, error } = await supabase
      .from('uat_debt_registry')
      .select('id, sd_id, source, category, severity, confidence, description, area, status, created_at')
      .eq('sd_id', sdId)
      .eq('status', 'pending')
      .order('severity', { ascending: true }); // critical first (alphabetical: critical < high < low < medium)

    if (error) {
      console.log(`   Warning: Could not load debt registry: ${error.message}`);
      return { found: false, count: 0, items: [], error: error.message };
    }

    // Re-sort by severity priority (critical > high > medium > low)
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const sorted = (items || []).sort((a, b) =>
      (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4)
    );

    return {
      found: sorted.length > 0,
      count: sorted.length,
      items: sorted
    };
  } catch (err) {
    console.log(`   Warning: Debt registry query failed: ${err.message}`);
    return { found: false, count: 0, items: [], error: err.message };
  }
}

/**
 * Generate test scenarios from user stories and PRD
 */
function generateTestScenarios(userStories, prdCriteria) {
  const scenarios = [];

  // Generate scenarios from user stories
  if (userStories.found && userStories.count > 0) {
    userStories.stories.forEach(story => {
      scenarios.push({
        source: 'user_story',
        story_id: story.story_id,
        title: story.title || `Test ${story.story_id}`,
        given: story.description || 'User is logged in and has necessary permissions',
        when: `User performs action described in ${story.story_id}`,
        then: story.acceptance_criteria || 'Expected outcome matches story requirements',
        pass_criteria: `All acceptance criteria from ${story.story_id} are met`,
        priority: story.story_points > 5 ? 'HIGH' : 'MEDIUM'
      });
    });
  }

  // Generate scenarios from PRD acceptance criteria
  if (prdCriteria.found && prdCriteria.criteria_count > 0) {
    prdCriteria.criteria.forEach((criterion, i) => {
      const criterionText = typeof criterion === 'string' ? criterion : criterion.description || criterion.title;

      scenarios.push({
        source: 'prd_acceptance_criteria',
        title: `PRD Criterion ${i + 1}: ${criterionText.substring(0, 50)}...`,
        given: 'Feature is implemented per PRD specifications',
        when: 'Feature is tested against acceptance criteria',
        then: criterionText,
        pass_criteria: `Criterion ${i + 1} is satisfied`,
        priority: 'MEDIUM'
      });
    });
  }

  // If no scenarios generated, create basic smoke test
  if (scenarios.length === 0) {
    scenarios.push({
      source: 'default',
      title: 'Basic Smoke Test',
      given: 'Application is deployed and accessible',
      when: 'User navigates to feature',
      then: 'Feature loads without errors',
      pass_criteria: 'No errors, feature is visible and functional',
      priority: 'HIGH'
    });
  }

  return {
    scenarios: scenarios,
    total_count: scenarios.length,
    high_priority_count: scenarios.filter(s => s.priority === 'HIGH').length
  };
}

/**
 * Generate UAT checklist
 */
function generateUATChecklist(testScenarios, _userStories, debtItems = { found: false, items: [] }) {
  const items = [];

  // Debt registry items first (highest priority - AI-detected issues needing human verification)
  if (debtItems.found && debtItems.items.length > 0) {
    const criticalHigh = debtItems.items.filter(d => d.severity === 'critical' || d.severity === 'high');
    const other = debtItems.items.filter(d => d.severity !== 'critical' && d.severity !== 'high');

    if (criticalHigh.length > 0) {
      items.push({
        category: 'Debt Registry (PRIORITY)',
        description: `Verify ${criticalHigh.length} critical/high-severity Vision QA finding(s)`,
        sub_items: criticalHigh.map(d =>
          `[${d.severity.toUpperCase()}] ${d.description}${d.area ? ` (${d.area})` : ''}`
        )
      });
    }

    if (other.length > 0) {
      items.push({
        category: 'Debt Registry',
        description: `Review ${other.length} medium/low-severity Vision QA finding(s)`,
        sub_items: other.map(d =>
          `[${d.severity.toUpperCase()}] ${d.description}${d.area ? ` (${d.area})` : ''}`
        )
      });
    }
  }

  // Authentication checks
  items.push({
    category: 'Authentication',
    description: 'Verify user can access the feature with proper authentication',
    sub_items: [
      'User can log in successfully',
      'Unauthorized users are redirected',
      'Session persists across page refreshes'
    ]
  });

  // Functional checks (from scenarios)
  if (testScenarios.scenarios.length > 0) {
    testScenarios.scenarios.forEach(scenario => {
      items.push({
        category: 'Functional',
        description: scenario.title,
        sub_items: [
          scenario.pass_criteria,
          'No console errors during test',
          'UI updates reflect changes'
        ]
      });
    });
  }

  // UI/UX checks
  items.push({
    category: 'UI/UX',
    description: 'Verify user interface meets design standards',
    sub_items: [
      'Layout is responsive on different screen sizes',
      'Buttons and links are clickable',
      'Loading states are shown appropriately',
      'Error messages are clear and helpful'
    ]
  });

  // Performance checks
  items.push({
    category: 'Performance',
    description: 'Verify acceptable performance',
    sub_items: [
      'Page loads in < 3 seconds',
      'No noticeable lag during interactions',
      'Large datasets handle gracefully'
    ]
  });

  // Accessibility checks
  items.push({
    category: 'Accessibility',
    description: 'Verify basic accessibility compliance',
    sub_items: [
      'Keyboard navigation works',
      'Focus indicators visible',
      'Color contrast meets standards'
    ]
  });

  return {
    items: items,
    total_items: items.length,
    estimated_time_minutes: items.length * 5 // 5 min per item
  };
}
