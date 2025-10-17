/**
 * VALIDATION Sub-Agent (Principal Systems Analyst)
 * LEO Protocol v4.2.0 - Sub-Agent Performance Enhancement
 *
 * Purpose: Comprehensive validation using 5-step SD evaluation checklist
 * Code: VALIDATION
 * Priority: 0 (highest for duplicate detection)
 *
 * Created: 2025-10-11 (SD-SUBAGENT-IMPROVE-001)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Execute VALIDATION sub-agent
 * Implements 5-step SD evaluation checklist
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent instructions (already loaded)
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Validation results
 */
export async function execute(sdId, subAgent, options = {}) {
  console.log(`\n🔍 Starting VALIDATION for ${sdId}...`);
  console.log(`   Using 5-Step SD Evaluation Checklist`);

  const results = {
    verdict: 'PASS',
    confidence: 100,
    critical_issues: [],
    warnings: [],
    recommendations: [],
    detailed_analysis: {},
    findings: {
      step1: null,
      step2: null,
      step3: null,
      step4: null,
      step5: null,
      step6: null
    },
    options
  };

  try {
    // Step 1: Query SD Metadata
    console.log(`\n📊 Step 1: Querying SD Metadata...`);
    const step1 = await querySDMetadata(sdId);
    results.findings.step1 = step1;

    if (!step1.found) {
      results.verdict = 'BLOCKED';
      results.confidence = 100;
      results.critical_issues.push({
        severity: 'CRITICAL',
        issue: `SD ${sdId} not found in database`,
        recommendation: 'Verify SD ID is correct',
        location: 'strategic_directives_v2 table'
      });
      return results;
    }

    console.log(`   ✅ Found: ${step1.title} (status: ${step1.status}, priority: ${step1.priority})`);

    // Step 2: Check for Existing PRD
    console.log(`\n📄 Step 2: Checking for existing PRD...`);
    const step2 = await checkExistingPRD(sdId);
    results.findings.step2 = step2;

    if (step2.found) {
      console.log(`   ✅ PRD exists: ${step2.prd.title}`);
      console.log(`      Objectives: ${step2.prd.objectives?.length || 0}`);
      console.log(`      Features: ${step2.prd.features?.length || 0}`);
      console.log(`      Acceptance Criteria: ${step2.prd.acceptance_criteria?.length || 0}`);
    } else {
      console.log(`   ⚠️  No PRD found - needs creation`);
      results.warnings.push({
        severity: 'MEDIUM',
        issue: 'No PRD exists for this SD',
        recommendation: 'PRD creation is PLAN agent responsibility'
      });
    }

    // Step 3: Query Backlog Items (CRITICAL)
    console.log(`\n📋 Step 3: Querying backlog items (CRITICAL)...`);
    const step3 = await queryBacklogItems(sdId);
    results.findings.step3 = step3;

    if (step3.count === 0) {
      console.log(`   ⚠️  No backlog items found - scope unclear`);
      results.warnings.push({
        severity: 'HIGH',
        issue: 'SD has no backlog items',
        recommendation: 'Link backlog items to define requirements OR document reason for no backlog',
        location: 'sd_backlog_map table'
      });

      // This is a warning, not critical (might be intentional for some SDs)
      if (results.confidence > 80) results.confidence = 80;
    } else {
      console.log(`   ✅ Found ${step3.count} backlog items`);
      step3.items.forEach((item, i) => {
        console.log(`      ${i + 1}. ${item.backlog_title} (${item.priority}, ${item.completion_status})`);
      });

      // Check for priority conflicts
      const conflicts = detectPriorityConflicts(step3.items);
      if (conflicts.length > 0) {
        results.warnings.push({
          severity: 'MEDIUM',
          issue: 'Priority conflicts detected in backlog items',
          recommendation: `Review ${conflicts.length} item(s) with mismatched priority/description`,
          details: conflicts
        });
      }
    }

    // Step 4: Search Codebase for Existing Infrastructure
    console.log(`\n🔎 Step 4: Searching codebase (requires manual analysis)...`);
    console.log(`   💡 Tip: Use grep/find to search for existing implementation`);
    console.log(`   Patterns to search: service files, components, routes, database tables`);

    results.findings.step4 = {
      manual_required: true,
      suggestion: 'Search codebase for existing infrastructure related to this SD',
      commands: [
        `find . -name "*service*.ts" -o -name "*Service.ts" | grep -i <feature-name>`,
        `find . -name "*.tsx" -o -name "*.jsx" | grep -i <feature-name>`,
        `grep -r "/<route-name>" src/App.tsx src/routes/`
      ]
    };

    // Step 5: Gap Analysis
    console.log(`\n📊 Step 5: Gap Analysis (requires manual input)...`);
    console.log(`   💡 After Step 4 codebase search, compare:`);
    console.log(`      - Backlog requirements vs Existing infrastructure`);
    console.log(`      - Identify: ✅ Satisfied, ⚠️ Partial, ❌ Missing, 🔄 Mismatch`);

    results.findings.step5 = {
      manual_required: true,
      backlog_count: step3.count,
      awaiting_codebase_search: true
    };

    // Step 6: Execute QA Smoke Tests
    console.log(`\n✅ Step 6: Checking test evidence...`);
    const step6 = await checkTestEvidence(sdId);
    results.findings.step6 = step6;

    if (!step6.found) {
      console.log(`   ⚠️  No test evidence found`);
      results.warnings.push({
        severity: 'HIGH',
        issue: 'No QA Engineering Director execution found',
        recommendation: 'Before final approval, ensure tests have been executed',
        note: 'This is MANDATORY before LEAD approval (per Step 6)'
      });
    } else {
      console.log(`   ✅ Test evidence found: ${step6.verdict} (${step6.confidence}% confidence)`);

      if (step6.verdict === 'BLOCKED' || step6.verdict === 'FAIL') {
        results.critical_issues.push({
          severity: 'CRITICAL',
          issue: 'QA Engineering Director found BLOCKING issues',
          recommendation: 'Fix test failures before proceeding',
          details: step6
        });
        results.verdict = 'BLOCKED';
      }
    }

    // Generate recommendations
    console.log(`\n💡 Generating recommendations...`);
    generateRecommendations(results);

    // Final verdict
    if (results.critical_issues.length > 0) {
      results.verdict = 'BLOCKED';
    } else if (results.warnings.length > 0) {
      results.verdict = 'CONDITIONAL_PASS';
    } else {
      results.verdict = 'PASS';
    }

    console.log(`\n🏁 VALIDATION Complete: ${results.verdict} (${results.confidence}% confidence)`);

    return results;

  } catch (error) {
    console.error(`\n❌ VALIDATION error:`, error.message);
    results.verdict = 'ERROR';
    results.error = error.message;
    results.confidence = 0;
    return results;
  }
}

/**
 * Step 1: Query SD Metadata
 */
async function querySDMetadata(sdId) {
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, priority, progress, current_phase, scope, category, target_application')
    .eq('id', sdId)
    .single();

  if (error || !sd) {
    return {
      found: false,
      error: error?.message || 'Not found'
    };
  }

  return {
    found: true,
    ...sd
  };
}

/**
 * Step 2: Check for Existing PRD
 */
async function checkExistingPRD(sdId) {
  const { data: prd, error } = await supabase
    .from('product_requirements_v2')
    .select('id, title, status, objectives, features, acceptance_criteria')
    .eq('directive_id', sdId)
    .single();

  if (error || !prd) {
    return {
      found: false,
      error: error?.message || 'Not found'
    };
  }

  return {
    found: true,
    prd
  };
}

/**
 * Step 3: Query Backlog Items
 */
async function queryBacklogItems(sdId) {
  const { data: items, error } = await supabase
    .from('sd_backlog_map')
    .select('*')
    .eq('sd_id', sdId)
    .order('priority', { ascending: false })
    .order('sequence_no', { ascending: true });

  if (error) {
    return {
      found: false,
      count: 0,
      error: error.message
    };
  }

  return {
    found: true,
    count: items?.length || 0,
    items: items || []
  };
}

/**
 * Step 6: Check Test Evidence
 */
async function checkTestEvidence(sdId) {
  const { data: testResult, error } = await supabase
    .from('sub_agent_execution_results')
    .select('*')
    .eq('sd_id', sdId)
    .eq('sub_agent_code', 'TESTING')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !testResult) {
    return {
      found: false,
      error: error?.message || 'No test execution found'
    };
  }

  return {
    found: true,
    verdict: testResult.verdict,
    confidence: testResult.confidence,
    execution_time: testResult.execution_time,
    created_at: testResult.created_at
  };
}

/**
 * Detect Priority Conflicts
 * Checks if priority field (High/Medium/Low) matches description_raw (Must Have/Nice to Have)
 */
function detectPriorityConflicts(items) {
  const conflicts = [];

  for (const item of items) {
    const priority = item.priority?.toLowerCase();
    const descRaw = item.description_raw?.toLowerCase();

    // High priority but "Nice to Have" = conflict
    if (priority === 'high' && descRaw?.includes('nice to have')) {
      conflicts.push({
        backlog_title: item.backlog_title,
        issue: 'High priority marked as "Nice to Have"',
        priority: item.priority,
        description_raw: item.description_raw
      });
    }

    // Low priority but "Must Have" = conflict
    if (priority === 'low' && descRaw?.includes('must have')) {
      conflicts.push({
        backlog_title: item.backlog_title,
        issue: 'Low priority marked as "Must Have"',
        priority: item.priority,
        description_raw: item.description_raw
      });
    }
  }

  return conflicts;
}

/**
 * Generate Recommendations
 */
function generateRecommendations(results) {
  const { findings } = results;

  // Step 2: No PRD
  if (!findings.step2?.found) {
    results.recommendations.push('PLAN agent should create PRD before EXEC phase begins');
  }

  // Step 3: No backlog items
  if (findings.step3?.count === 0) {
    results.recommendations.push('Link backlog items to define clear requirements OR document reason for no backlog');
  }

  // Step 4: Manual codebase search needed
  if (findings.step4?.manual_required) {
    results.recommendations.push('Perform codebase search to identify existing infrastructure (prevents duplicate work)');
  }

  // Step 5: Manual gap analysis needed
  if (findings.step5?.manual_required) {
    results.recommendations.push('Complete gap analysis: Compare backlog requirements vs existing code');
  }

  // Step 6: No test evidence
  if (!findings.step6?.found) {
    results.recommendations.push('Execute QA Engineering Director before final approval (MANDATORY per protocol)');
  }
}
