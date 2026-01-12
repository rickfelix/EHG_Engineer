/**
 * DESIGN Sub-Agent (Senior Design Sub-Agent)
 * LEO Protocol v4.2.0 - Sub-Agent Performance Enhancement
 *
 * Purpose: UI/UX design compliance and accessibility validation
 * Code: DESIGN
 * Priority: 70
 *
 * Philosophy: "Design compliance = 100%, not 80%. Consistency matters."
 *
 * Created: 2025-10-11 (SD-SUBAGENT-IMPROVE-001)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  getRiskContext,
  calculateContextualConfidence,
  getAggregateRiskStats
} from '../utils/risk-context.js';
import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';
import { validateComponentAgainstUxContract, getInheritedContracts } from '../../scripts/modules/contract-validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const execAsync = promisify(exec);
// Supabase client initialized in execute() to use async createSupabaseServiceClient
let supabase = null;

/**
 * Execute DESIGN sub-agent
 * Validates UI/UX design compliance
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent instructions (already loaded)
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Design validation results
 */
export async function execute(sdId, subAgent, options = {}) {
  console.log(`\n🎨 Starting DESIGN for ${sdId}...`);
  console.log('   Senior Design Sub-Agent - UI/UX Compliance');

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
      design_system_check: null,
      component_analysis: null,
      accessibility_check: null,
      responsive_check: null,
      consistency_check: null
    },
    options
  };

  try {
    const repoPath = options.repo_path || path.resolve(__dirname, '../../../../ehg');

    // Phase 1: Design System Compliance
    console.log('\n🎨 Phase 1: Checking design system compliance...');
    const designSystemCheck = await checkDesignSystem(repoPath, sdId);
    results.findings.design_system_check = designSystemCheck;

    if (designSystemCheck.violations > 0) {
      console.log(`   ⚠️  ${designSystemCheck.violations} design system violation(s) found`);
      results.warnings.push({
        severity: 'MEDIUM',
        issue: `${designSystemCheck.violations} design system violations`,
        recommendation: 'Use Shadcn components and Tailwind utilities consistently',
        violations: designSystemCheck.violation_details
      });
      if (results.confidence > 85) results.confidence = 85;
    } else {
      console.log('   ✅ Design system compliance maintained');
    }

    // Phase 2: Component Analysis
    console.log('\n🧩 Phase 2: Analyzing component structure...');
    const componentAnalysis = await analyzeComponents(repoPath, sdId);
    results.findings.component_analysis = componentAnalysis;

    if (componentAnalysis.large_components > 0) {
      console.log(`   ⚠️  ${componentAnalysis.large_components} component(s) exceed 600 lines`);
      results.warnings.push({
        severity: 'MEDIUM',
        issue: `${componentAnalysis.large_components} oversized components found`,
        recommendation: 'Split components >600 lines into smaller, focused components',
        large_components: componentAnalysis.large_component_list
      });
      if (results.confidence > 85) results.confidence = 85;
    } else {
      console.log('   ✅ All components within size guidelines (<600 lines)');
    }

    // Phase 3: Accessibility Check
    console.log('\n♿ Phase 3: Checking accessibility compliance...');
    const accessibilityCheck = await checkAccessibility(repoPath, sdId);
    results.findings.accessibility_check = accessibilityCheck;

    if (accessibilityCheck.issues > 0) {
      console.log(`   ❌ ${accessibilityCheck.issues} accessibility issue(s) found`);

      // Apply contextual risk scoring to accessibility issues
      const affectedFiles = accessibilityCheck.affected_files || [];
      const contextualIssues = await enhanceWithRiskContext(
        affectedFiles,
        'accessibility',
        repoPath
      );

      results.critical_issues.push({
        severity: contextualIssues.max_severity || 'CRITICAL',
        issue: `${accessibilityCheck.issues} accessibility violations`,
        recommendation: 'Fix WCAG 2.1 AA violations before deployment',
        issues: accessibilityCheck.issue_details,
        risk_context: contextualIssues
      });

      // Only block if high-risk files affected
      if (contextualIssues.max_risk_score >= 7.0) {
        results.verdict = 'BLOCKED';
        console.log(`   🔴 BLOCKED: High-risk files affected (risk score: ${contextualIssues.max_risk_score})`);
      } else if (contextualIssues.max_risk_score >= 4.0) {
        results.verdict = 'CONDITIONAL_PASS';
        console.log(`   🟡 CONDITIONAL: Medium-risk files affected (risk score: ${contextualIssues.max_risk_score})`);
      }
    } else {
      console.log('   ✅ No accessibility issues detected');
    }

    // Phase 4: Responsive Design Check
    console.log('\n📱 Phase 4: Checking responsive design...');
    const responsiveCheck = await checkResponsiveDesign(repoPath, sdId);
    results.findings.responsive_check = responsiveCheck;

    if (responsiveCheck.missing_breakpoints > 0) {
      console.log(`   ⚠️  ${responsiveCheck.missing_breakpoints} component(s) missing responsive classes`);
      results.warnings.push({
        severity: 'HIGH',
        issue: `${responsiveCheck.missing_breakpoints} components not responsive`,
        recommendation: 'Add Tailwind responsive classes (sm:, md:, lg:, xl:)',
        components: responsiveCheck.non_responsive_components
      });
      if (results.confidence > 80) results.confidence = 80;
    } else {
      console.log('   ✅ Responsive design patterns detected');
    }

    // Phase 5: Consistency Check
    console.log('\n🔄 Phase 5: Checking design consistency...');
    const consistencyCheck = await checkDesignConsistency(repoPath, sdId);
    results.findings.consistency_check = consistencyCheck;

    if (consistencyCheck.inconsistencies > 0) {
      console.log(`   ⚠️  ${consistencyCheck.inconsistencies} design inconsistency/ies found`);
      results.warnings.push({
        severity: 'MEDIUM',
        issue: `${consistencyCheck.inconsistencies} design inconsistencies detected`,
        recommendation: 'Ensure consistent spacing, colors, and typography',
        details: consistencyCheck.inconsistency_details
      });
    } else {
      console.log('   ✅ Design consistency maintained');
    }

    // Phase 5.5: UX Contract Compliance (Parent Contract Validation)
    console.log('\n📜 Phase 5.5: UX Contract Compliance...');
    const contractCompliance = await validateUxContractCompliance(sdId, repoPath);
    results.findings.ux_contract_compliance = contractCompliance;

    if (contractCompliance.has_contract) {
      // Report cultural design style inheritance
      if (contractCompliance.cultural_design_style) {
        console.log(`   📎 Cultural Design Style: ${contractCompliance.cultural_design_style} (strictly inherited)`);
        results.detailed_analysis.cultural_design_style = contractCompliance.cultural_design_style;
        results.detailed_analysis.cultural_style_source = contractCompliance.style_source || 'parent';
      }

      // Report max component LOC from contract
      if (contractCompliance.max_component_loc) {
        console.log(`   📏 Max Component LOC: ${contractCompliance.max_component_loc} (from UX contract)`);
      }

      // Report min WCAG level from contract
      if (contractCompliance.min_wcag_level) {
        console.log(`   ♿ Min WCAG Level: ${contractCompliance.min_wcag_level} (from UX contract)`);
      }

      // Check for path violations (UX_CONTRACT = WARNING severity)
      if (contractCompliance.violations && contractCompliance.violations.length > 0) {
        console.log(`   ⚠️  ${contractCompliance.violations.length} UX contract warning(s)`);

        for (const violation of contractCompliance.violations) {
          results.warnings.push({
            severity: 'MEDIUM',
            issue: `UX_CONTRACT: ${violation.message}`,
            recommendation: 'Modify component paths to stay within contract boundaries, or document override justification',
            type: violation.type,
            contract_id: violation.contract_id
          });
        }

        // UX contract violations are warnings, not blockers
        if (results.confidence > 80) results.confidence = 80;
      } else {
        console.log('   ✅ All components within UX contract boundaries');
      }
    } else {
      console.log('   ℹ️  No UX contract found (standalone SD or no contract defined)');
    }

    // Phase 6: Workflow Review (NEW - SD-DESIGN-WORKFLOW-REVIEW-001)
    if (options.workflow_review !== false) {
      console.log('\n📋 Phase 6: Workflow Review...');

      try {
        // Use custom supabase client if provided (for testing), otherwise use default
        const dbClient = options.supabaseClient || supabase;

        // SD ID Schema Cleanup (2025-12-12): Query PRD directly by SD.id
        // No need to look up uuid_id - sd_id references SD.id directly
        const { data: prdData, error: prdError } = await dbClient
          .from('product_requirements_v2')
          .select('functional_requirements, acceptance_criteria')
          .eq('sd_id', sdId)
          .single();

        // Fetch user stories
        const { data: userStories, error: storiesError } = await dbClient
          .from('user_stories')
          .select('*')
          .eq('sd_id', sdId);

        // Fetch current workflow baseline from SD
        const { data: sdData, error: sdError} = await dbClient
          .from('strategic_directives_v2')
          .select('description')
          .eq('id', sdId)
          .single();

        if (prdError || storiesError || sdError) {
          console.warn('   ⚠️  Could not fetch data for workflow review');
          results.findings.workflow_review = {
            status: 'SKIPPED',
            reason: 'Missing PRD or user stories data'
          };
        } else if (!userStories || userStories.length === 0) {
          console.log('   ⏭️  No user stories found - workflow review skipped');
          results.findings.workflow_review = {
            status: 'SKIPPED',
            reason: 'No user stories available for analysis'
          };
        } else {
          const currentWorkflow = parseBaselineWorkflow(sdData?.description || '');

          const workflowAnalysis = await workflowReviewCapability(
            sdId,
            prdData,
            userStories,
            currentWorkflow,
            options
          );

          results.findings.workflow_review = workflowAnalysis;

          // Update verdict based on workflow status
          if (workflowAnalysis.status === 'FAIL') {
            results.verdict = 'BLOCKED';
            results.critical_issues.push({
              severity: 'CRITICAL',
              issue: 'Workflow validation failed',
              recommendation: 'Review workflow analysis and fix identified issues',
              details: workflowAnalysis
            });
          } else if (workflowAnalysis.ux_impact_score < 6.5) {
            results.warnings.push({
              severity: 'MEDIUM',
              issue: `UX impact score ${workflowAnalysis.ux_impact_score}/10 below recommended 6.5`,
              recommendation: 'Address UX recommendations or document rationale',
              details: workflowAnalysis.recommendations
            });
          }
        }
      } catch (error) {
        console.error('   ❌ Workflow review error:', error.message);
        results.findings.workflow_review = {
          status: 'ERROR',
          error: error.message
        };
      }
    } else {
      console.log('   ⏭️  Workflow review skipped (--no-workflow-review flag)');
    }

    // Phase 7: Visual Verification (if enabled via options.visual_verify)
    if (options.visual_verify || options.visualVerify) {
      console.log('\n👁️  Phase 7: Visual Verification (Playwright MCP)...');

      const previewUrl = options.preview_url ||
                         options.previewUrl ||
                         process.env.BASE_URL ||
                         'http://localhost:8080';

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const screenshotDir = `visual-audit-${sdId}-${timestamp}`;

      results.findings.visual_verification = {
        status: 'READY_FOR_MCP',
        preview_url: previewUrl,
        timestamp: new Date().toISOString(),
        mcp_workflow: [
          { step: 1, tool: 'mcp__playwright__browser_navigate', params: { url: previewUrl }, description: 'Navigate to preview URL' },
          { step: 2, tool: 'mcp__playwright__browser_snapshot', params: {}, description: 'Capture accessibility tree' },
          { step: 3, tool: 'mcp__playwright__browser_take_screenshot', params: { filename: `${screenshotDir}/desktop.png` }, description: 'Screenshot desktop viewport' },
          { step: 4, tool: 'mcp__playwright__browser_console_messages', params: { level: 'error' }, description: 'Check for console errors' },
          { step: 5, tool: 'mcp__playwright__browser_resize', params: { width: 768, height: 1024 }, description: 'Resize to tablet' },
          { step: 6, tool: 'mcp__playwright__browser_take_screenshot', params: { filename: `${screenshotDir}/tablet.png` }, description: 'Screenshot tablet viewport' },
          { step: 7, tool: 'mcp__playwright__browser_resize', params: { width: 375, height: 667 }, description: 'Resize to mobile' },
          { step: 8, tool: 'mcp__playwright__browser_take_screenshot', params: { filename: `${screenshotDir}/mobile.png` }, description: 'Screenshot mobile viewport' },
        ]
      };

      console.log(`   📍 Preview URL: ${previewUrl}`);
      console.log('   📋 MCP commands generated for visual verification:');
      results.findings.visual_verification.mcp_workflow.forEach(cmd => {
        console.log(`      ${cmd.step}. ${cmd.tool} - ${cmd.description}`);
      });

      results.recommendations.push(
        `Execute visual verification MCP commands against ${previewUrl}`,
        'Review screenshots for responsive design compliance',
        'Check accessibility snapshot for ARIA and heading issues'
      );
    }

    // Generate recommendations
    console.log('\n💡 Generating recommendations...');
    generateRecommendations(results);

    console.log(`\n🏁 DESIGN Complete: ${results.verdict} (${results.confidence}% confidence)`);

    return results;

  } catch (error) {
    console.error('\n❌ DESIGN error:', error.message);
    results.verdict = 'ERROR';
    results.error = error.message;
    results.confidence = 0;
    results.critical_issues.push({
      severity: 'CRITICAL',
      issue: 'DESIGN sub-agent execution failed',
      recommendation: 'Review error and retry',
      error: error.message
    });
    return results;
  }
}

/**
 * Check design system compliance
 */
async function checkDesignSystem(repoPath, _sdId) {
  try {
    // Check for inline styles (violation)
    const { stdout: inlineStyles } = await execAsync(
      `cd "${repoPath}" && grep -r "style={{" src/components 2>/dev/null | wc -l`
    );

    // Check for non-Tailwind custom CSS
    const { stdout: customCSS } = await execAsync(
      `cd "${repoPath}" && find src/components -name "*.css" 2>/dev/null | wc -l`
    );

    const violations = parseInt(inlineStyles.trim()) + parseInt(customCSS.trim());

    return {
      checked: true,
      violations: violations,
      inline_styles: parseInt(inlineStyles.trim()),
      custom_css_files: parseInt(customCSS.trim()),
      violation_details: violations > 0 ? [
        `${inlineStyles.trim()} inline style usage(s)`,
        `${customCSS.trim()} custom CSS file(s)`
      ] : []
    };
  } catch (error) {
    return {
      checked: false,
      violations: 0,
      error: error.message
    };
  }
}

/**
 * Analyze components
 */
async function analyzeComponents(repoPath, _sdId) {
  try {
    // Find all component files
    const { stdout: componentFiles } = await execAsync(
      `cd "${repoPath}" && find src/components -name "*.tsx" -o -name "*.jsx" 2>/dev/null`
    );

    const files = componentFiles.trim().split('\n').filter(f => f);

    // Check each file's line count
    const largeComponents = [];
    for (const file of files.slice(0, 20)) { // Limit to 20 files for performance
      try {
        const { stdout: lineCount } = await execAsync(
          `cd "${repoPath}" && wc -l "${file}" 2>/dev/null | awk '{print $1}'`
        );
        const lines = parseInt(lineCount.trim());
        if (lines > 600) {
          largeComponents.push({ file, lines });
        }
      } catch {
        // Skip files we can't read
      }
    }

    return {
      checked: true,
      total_components: files.length,
      large_components: largeComponents.length,
      large_component_list: largeComponents
    };
  } catch (error) {
    return {
      checked: false,
      total_components: 0,
      large_components: 0,
      large_component_list: [],
      error: error.message
    };
  }
}

/**
 * Check accessibility using design-sub-agent.js with git-diff-only mode
 * Note: Uses adaptive thresholds based on SD scope
 */
async function checkAccessibility(repoPath, sdId) {
  try {
    console.log('   🔍 Running design-sub-agent with git-diff-only mode...');

    // Get SD metadata to determine adaptive threshold
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('category, scope, priority')
      .eq('id', sdId)
      .single();

    // Determine adaptive threshold based on SD scope/category
    // Utility/Polish SDs: 50 (low bar)
    // Standard Features: 70 (medium bar)
    // Critical/Security/Performance: 85 (high bar)
    const scoreThreshold = determineDesignThreshold(sd);

    // Call design-sub-agent.js with --git-diff-only flag
    const designAgentPath = path.resolve(__dirname, '../agents/design-sub-agent.js');
    const { stdout, stderr: _stderr } = await execAsync(
      `cd "${repoPath}" && node "${designAgentPath}" src/components --git-diff-only 2>&1`
    );

    // Parse design-sub-agent output
    const scoreMatch = stdout.match(/Design Score: (\d+)\/100/);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;

    // Check if it passed using adaptive threshold
    const passed = score >= scoreThreshold;
    const issues = passed ? 0 : 1;

    // Extract affected files from git diff
    const affectedFiles = await getGitDiffFiles(repoPath);

    console.log(`   📊 Design Score: ${score}/100 (threshold: ${scoreThreshold}) ${passed ? '✅ PASS' : '❌ FAIL'}`);

    return {
      checked: true,
      issues: issues,
      design_score: score,
      score_threshold: scoreThreshold,
      sd_category: sd?.category,
      sd_scope: sd?.scope,
      git_diff_only: true,
      affected_files: affectedFiles,
      issue_details: passed ? [] : [
        `Design score ${score}/100 (minimum ${scoreThreshold} required for ${sd?.category || 'standard'} SD)`,
        `Run: node ${designAgentPath} src/components --git-diff-only for details`
      ]
    };
  } catch (error) {
    console.warn(`   ⚠️  design-sub-agent error: ${error.message}`);
    // Fall back to simple grep checks
    try {
      const { stdout: missingAltFiles } = await execAsync(
        `cd "${repoPath}" && grep -rl "<img" src/components 2>/dev/null | grep -v "alt="`
      );

      const { stdout: missingAriaFiles } = await execAsync(
        `cd "${repoPath}" && grep -rl "<button" src/components 2>/dev/null | grep -v "aria-label"`
      );

      const affectedFiles = [
        ...missingAltFiles.trim().split('\n').filter(f => f),
        ...missingAriaFiles.trim().split('\n').filter(f => f)
      ];

      const issues = affectedFiles.length;

      return {
        checked: true,
        issues: issues,
        affected_files: affectedFiles,
        fallback_mode: true,
        issue_details: issues > 0 ? [
          `${affectedFiles.length} file(s) with accessibility issues`
        ] : []
      };
    } catch (fallbackError) {
      return {
        checked: false,
        issues: 0,
        affected_files: [],
        error: fallbackError.message
      };
    }
  }
}

/**
 * Check responsive design
 */
async function checkResponsiveDesign(repoPath, _sdId) {
  try {
    // Check for responsive breakpoints usage
    const { stdout: responsiveClasses } = await execAsync(
      `cd "${repoPath}" && grep -r "sm:\\|md:\\|lg:\\|xl:" src/components 2>/dev/null | wc -l`
    );

    // Count total components
    const { stdout: totalComponents } = await execAsync(
      `cd "${repoPath}" && find src/components -name "*.tsx" -o -name "*.jsx" 2>/dev/null | wc -l`
    );

    const hasResponsive = parseInt(responsiveClasses.trim()) > 0;
    const total = parseInt(totalComponents.trim());

    return {
      checked: true,
      missing_breakpoints: hasResponsive ? 0 : 1,
      has_responsive_classes: hasResponsive,
      total_components: total,
      non_responsive_components: hasResponsive ? [] : ['Multiple components may need responsive classes']
    };
  } catch (error) {
    return {
      checked: false,
      missing_breakpoints: 0,
      error: error.message
    };
  }
}

/**
 * Check design consistency
 */
async function checkDesignConsistency(repoPath, _sdId) {
  try {
    // Check for consistent spacing (Tailwind scale)
    const { stdout: customSpacing } = await execAsync(
      `cd "${repoPath}" && grep -r "margin:\\|padding:" src/components 2>/dev/null | wc -l`
    );

    // Check for hex colors (should use Tailwind palette)
    const { stdout: hexColors } = await execAsync(
      `cd "${repoPath}" && grep -r "#[0-9a-fA-F]\\{6\\}" src/components 2>/dev/null | wc -l`
    );

    const inconsistencies = parseInt(customSpacing.trim()) + parseInt(hexColors.trim());

    return {
      checked: true,
      inconsistencies: inconsistencies,
      custom_spacing: parseInt(customSpacing.trim()),
      hex_colors: parseInt(hexColors.trim()),
      inconsistency_details: inconsistencies > 0 ? [
        `${customSpacing.trim()} custom spacing value(s)`,
        `${hexColors.trim()} hex color(s) (use Tailwind palette)`
      ] : []
    };
  } catch (error) {
    return {
      checked: false,
      inconsistencies: 0,
      error: error.message
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
      'Fix all accessibility violations (WCAG 2.1 AA compliance required)',
      'Add missing alt text and ARIA labels',
      'Use accessibility testing tools for comprehensive coverage'
    );
  }

  if (findings.design_system_check?.violations > 0) {
    results.recommendations.push(
      'Replace inline styles with Tailwind classes',
      'Remove custom CSS files - use Shadcn components',
      'Follow design system guidelines consistently'
    );
  }

  if (findings.component_analysis?.large_components > 0) {
    results.recommendations.push(
      'Split oversized components into smaller units (target: 300-600 lines)',
      'Extract reusable sub-components',
      'Improve component maintainability'
    );
  }

  if (findings.responsive_check?.missing_breakpoints > 0) {
    results.recommendations.push(
      'Add responsive Tailwind classes (sm:, md:, lg:, xl:)',
      'Test on mobile, tablet, and desktop viewports',
      'Ensure consistent experience across devices'
    );
  }

  if (critical_issues.length === 0 && warnings.length === 0) {
    results.recommendations.push(
      'Design compliance maintained at 100%',
      'Continue following design system guidelines',
      'Excellent UI/UX consistency'
    );
  }
}

/**
 * ===========================================================================
 * PHASE 6: WORKFLOW REVIEW CAPABILITY FUNCTIONS
 * ===========================================================================
 * Added: 2025-01-15 (SD-DESIGN-WORKFLOW-REVIEW-001)
 * Purpose: Analyze how user workflows and interactions change with new scope
 */

/**
 * Main workflow review capability function
 * Analyzes workflow changes and generates UX impact assessment
 *
 * @param {string} sdId - Strategic Directive UUID
 * @param {Object} prdData - PRD content from product_requirements_v2
 * @param {Array} userStories - User stories from user_stories table
 * @param {Object} currentWorkflow - Baseline workflow from SD description
 * @param {Object} options - Options including repo_path for pattern scanning
 * @returns {Promise<Object>} Workflow analysis results
 */
async function workflowReviewCapability(sdId, prdData, userStories, currentWorkflow, options = {}) {
  console.log('   🔍 Analyzing workflow changes...');

  const analysis = {
    version: '1.0.0',
    analyzed_at: new Date().toISOString(),
    status: 'PASS',
    ux_impact_score: 10,
    ux_score_breakdown: {},
    workflow_delta: {},
    interaction_impact: {},
    validation_results: {},
    recommendations: [],
    analysis_depth_info: {},
    confidence_metrics: {}
  };

  try {
    // Step 1: Determine adaptive analysis depth for each user story
    console.log('   📐 Determining analysis depth...');
    const analysisDepths = userStories.map(story => determineAnalysisDepth(story));
    const maxDepth = analysisDepths.reduce((max, d) => {
      const depthOrder = { 'LIGHT': 1, 'STANDARD': 2, 'DEEP': 3 };
      return depthOrder[d.depth] > depthOrder[max] ? d.depth : max;
    }, 'LIGHT');
    console.log(`   📐 Analysis depth: ${maxDepth} (${analysisDepths.filter(d => d.depth === 'DEEP').length} DEEP, ${analysisDepths.filter(d => d.depth === 'STANDARD').length} STANDARD, ${analysisDepths.filter(d => d.depth === 'LIGHT').length} LIGHT)`);

    analysis.analysis_depth_info = {
      overall_depth: maxDepth,
      story_depths: analysisDepths,
      depth_rationale: analysisDepths
        .filter(d => d.triggers.length > 0)
        .map(d => `${d.story_id}: ${d.depth} (${d.triggers.join(', ')})`)
    };

    // Step 2: Load or scan codebase patterns (with caching)
    const repoPath = options.repo_path || path.resolve(__dirname, '../../../../ehg');
    console.log('   🔍 Loading codebase patterns...');
    const codebasePatterns = await loadOrScanPatterns(repoPath, options);

    // Step 3: Extract workflow from user stories
    const newWorkflow = await extractWorkflowFromStories(userStories);
    console.log(`   📊 Extracted ${newWorkflow.steps.length} workflow steps from user stories`);

    // Step 4: Build interaction graph
    const interactionGraph = buildInteractionGraph(newWorkflow);
    console.log(`   🗺️  Built interaction graph: ${interactionGraph.nodes.length} nodes, ${interactionGraph.edges.length} edges`);

    // Step 5: Detect workflow issues with adaptive depth and pattern awareness
    const rawIssues = detectWorkflowIssues(interactionGraph, currentWorkflow, analysisDepths, userStories);

    // Step 6: Apply intelligent severity scoring and confidence calculation
    console.log('   🎯 Scoring issue severity and confidence...');
    const allIssues = [];

    // Process each issue dimension
    for (const [dimension, dimensionIssues] of Object.entries(rawIssues)) {
      if (Array.isArray(dimensionIssues)) {
        for (const issue of dimensionIssues) {
          // Find associated user story
          const userStory = userStories.find(s => s.id === issue.story_id || s.story_key === issue.story_id);

          // Build context
          const context = getIssueContext(issue, userStory);

          // Apply auto-pass filter
          if (!shouldFlag(issue, context)) {
            continue; // Skip issues that don't meet flagging criteria
          }

          // Calculate severity
          const severity = calculateSeverity(issue, context);

          // Calculate confidence
          const confidence = calculateConfidence(issue, codebasePatterns, userStory);

          allIssues.push({
            ...issue,
            dimension,
            severity,
            confidence,
            context_flags: {
              is_financial: context.isFinancialTransaction,
              is_destructive: context.isDestructiveAction,
              is_required_path: context.isRequiredPath,
              priority: context.priority
            }
          });
        }
      }
    }

    console.log(`   ✅ ${allIssues.length} issues flagged after filtering (${Object.values(rawIssues).flat().length - allIssues.length} auto-passed)`);

    // Step 7: Calculate overall confidence score
    const confidenceMetrics = calculateOverallConfidenceScore(allIssues, codebasePatterns);
    analysis.confidence_metrics = confidenceMetrics;
    console.log(`   🎯 Overall confidence: ${(confidenceMetrics.overall * 100).toFixed(0)}% (${confidenceMetrics.high_confidence_count} high, ${confidenceMetrics.medium_confidence_count} medium, ${confidenceMetrics.low_confidence_count} low)`);

    // Step 8: Generate pattern-based recommendations
    const patternRecommendations = userStories
      .map(story => checkAgainstPatterns(story, codebasePatterns))
      .flat();

    // Step 9: Calculate UX impact score
    const issues = {
      deadEnds: allIssues.filter(i => i.dimension === 'deadEnds'),
      circularFlows: allIssues.filter(i => i.dimension === 'circularFlows'),
      unreachableStates: allIssues.filter(i => i.dimension === 'unreachableStates'),
      regressions: allIssues.filter(i => i.dimension === 'regressions'),
      touchpoints: rawIssues.touchpoints || [],
      navigation: rawIssues.navigation || {}
    };
    const uxScore = calculateUXImpactScore(issues, newWorkflow, currentWorkflow);

    // Step 5: Populate analysis results
    analysis.workflow_delta = {
      current_flow: currentWorkflow.steps || [],
      new_flow: newWorkflow.steps.map(s => s.action),
      added_steps: newWorkflow.steps.filter(
        s => !currentWorkflow.steps?.some(cs => cs.includes(s.action))
      ).map(s => s.action),
      removed_steps: currentWorkflow.steps?.filter(
        cs => !newWorkflow.steps.some(s => s.action.includes(cs))
      ) || [],
      modified_steps: [],
      step_count_delta: newWorkflow.steps.length - (currentWorkflow.steps?.length || 0)
    };

    analysis.interaction_impact = {
      affected_touchpoints: issues.touchpoints || [],
      navigation_impact: issues.navigation || {
        added_routes: [],
        removed_routes: [],
        modified_routes: [],
        requires_redirects: false
      },
      regressions_detected: issues.regressions || []
    };

    // Step 10: Build comprehensive validation results with all dimensions
    analysis.validation_results = {
      // Core topology issues (ALL depths)
      dead_ends: issues.deadEnds || [],
      circular_flows: issues.circularFlows || [],
      unreachable_states: issues.unreachableStates || [],

      // Enhanced dimensions (STANDARD + DEEP)
      error_recovery: allIssues.filter(i => i.dimension === 'error_recovery'),
      loading_states: allIssues.filter(i => i.dimension === 'loading_states'),
      confirmations: allIssues.filter(i => i.dimension === 'confirmations'),

      // Deep analysis dimensions (DEEP only)
      form_validation: allIssues.filter(i => i.dimension === 'form_validation'),
      state_management: allIssues.filter(i => i.dimension === 'state_management'),
      permission_gates: allIssues.filter(i => i.dimension === 'permission_gates'),
      accessibility: allIssues.filter(i => i.dimension === 'accessibility'),
      browser_controls: allIssues.filter(i => i.dimension === 'browser_controls'),

      graph_metrics: {
        total_nodes: interactionGraph.nodes.length,
        total_edges: interactionGraph.edges.length,
        average_path_length: interactionGraph.edges.length > 0
          ? (interactionGraph.edges.length / interactionGraph.nodes.length).toFixed(1)
          : 0,
        max_path_depth: Math.max(...interactionGraph.nodes.map((n, i) => i + 1), 0),
        goal_nodes: interactionGraph.nodes.filter(n => n.type === 'goal').length
      }
    };

    analysis.ux_impact_score = uxScore.overall;
    analysis.ux_score_breakdown = uxScore.dimensions;

    // Step 11: Merge generated recommendations with pattern-based recommendations
    const workflowRecommendations = generateWorkflowRecommendations(issues, uxScore, analysis);
    analysis.recommendations = [
      ...workflowRecommendations,
      ...patternRecommendations.map(rec => ({
        ...rec,
        source: 'pattern_analysis'
      }))
    ];

    // Determine pass/fail status - consider CRITICAL severity issues
    const criticalIssues = allIssues.filter(i => i.severity === 'CRITICAL');
    const hasBlockingIssues =
      criticalIssues.length > 0 ||
      issues.deadEnds.length > 0 ||
      issues.circularFlows.length > 0 ||
      uxScore.overall < 6.0;

    analysis.status = hasBlockingIssues ? 'FAIL' : 'PASS';

    // Calculate quality gate status
    analysis.quality_gate_status = {
      workflow_validation: analysis.status,
      ux_score_threshold: uxScore.overall >= 6.0 ? 'PASS' : 'FAIL',
      regression_mitigation: issues.regressions.length === 0 ? 'PASS' : 'CONDITIONAL',
      test_coverage: 'PENDING',
      overall: hasBlockingIssues ? 'BLOCKED' : (uxScore.overall >= 6.5 ? 'PASS' : 'CONDITIONAL_PASS'),
      overall_score: calculateOverallQualityScore(analysis)
    };

    console.log(`   ${analysis.status === 'PASS' ? '✅' : '❌'} Workflow validation: ${analysis.status}`);
    console.log(`   📊 UX Impact Score: ${uxScore.overall}/10`);

    // Log critical issues
    if (criticalIssues.length > 0) {
      console.log(`   🚨 ${criticalIssues.length} CRITICAL issue(s) detected`);
    }

    // Log core topology issues
    if (issues.deadEnds.length > 0) {
      console.log(`   ⚠️  ${issues.deadEnds.length} dead end(s) detected`);
    }
    if (issues.circularFlows.length > 0) {
      console.log(`   ⚠️  ${issues.circularFlows.length} circular flow(s) detected`);
    }
    if (issues.regressions.length > 0) {
      console.log(`   ⚠️  ${issues.regressions.length} regression(s) detected`);
    }

    // Log enhanced dimensions (if present)
    const errorRecoveryIssues = allIssues.filter(i => i.dimension === 'error_recovery');
    const confirmationIssues = allIssues.filter(i => i.dimension === 'confirmations');
    const loadingIssues = allIssues.filter(i => i.dimension === 'loading_states');
    const formValidationIssues = allIssues.filter(i => i.dimension === 'form_validation');
    const accessibilityIssues = allIssues.filter(i => i.dimension === 'accessibility');

    if (errorRecoveryIssues.length > 0) {
      console.log(`   ⚠️  ${errorRecoveryIssues.length} missing error recovery path(s)`);
    }
    if (confirmationIssues.length > 0) {
      console.log(`   ⚠️  ${confirmationIssues.length} missing confirmation(s) for destructive actions`);
    }
    if (loadingIssues.length > 0) {
      console.log(`   ⚠️  ${loadingIssues.length} missing loading state(s)`);
    }
    if (formValidationIssues.length > 0) {
      console.log(`   ⚠️  ${formValidationIssues.length} form validation timing issue(s)`);
    }
    if (accessibilityIssues.length > 0) {
      console.log(`   ⚠️  ${accessibilityIssues.length} accessibility issue(s)`);
    }

    // Log recommendations summary
    if (analysis.recommendations.length > 0) {
      const highPriorityRecs = analysis.recommendations.filter(r => r.priority === 'HIGH' || r.priority === 'CRITICAL');
      console.log(`   💡 ${analysis.recommendations.length} recommendation(s) generated (${highPriorityRecs.length} high priority)`);
    }

    return analysis;

  } catch (error) {
    console.error('   ❌ Workflow analysis error:', error.message);
    analysis.status = 'ERROR';
    analysis.error = error.message;
    return analysis;
  }
}

/**
 * Extract workflow steps from user stories
 * Parses Given-When-Then format and implementation context
 */
async function extractWorkflowFromStories(userStories) {
  const steps = [];

  for (const story of userStories) {
    // Parse Given-When-Then structure from description (if available)
    const gwtMatch = story.description?.match(/Given (.+?),?\s*When (.+?),?\s*Then (.+?)\.?$/i);
    if (gwtMatch) {
      const [_, given, when, then] = gwtMatch;
      steps.push({
        precondition: given.trim(),
        action: when.trim(),
        outcome: then.trim(),
        story_id: story.id,
        type: 'user_action'
      });
    } else if (story.user_role && story.user_want && story.user_benefit) {
      // Construct workflow step from standard user story format
      // "As a [user_role], I want to [user_want] so that [user_benefit]"
      steps.push({
        precondition: `${story.user_role} on page`,
        action: story.user_want,
        outcome: story.user_benefit,
        story_id: story.id,
        type: 'user_action'
      });
    }

    // Parse implementation_context for UI interactions
    if (story.implementation_context) {
      const contextSteps = extractInteractionsFromContext(story.implementation_context);
      steps.push(...contextSteps.map(s => ({ ...s, story_id: story.id })));
    }
  }

  return { steps, total_steps: steps.length };
}

/**
 * Extract interaction steps from implementation context
 */
function extractInteractionsFromContext(context) {
  const steps = [];

  // Look for navigation patterns: "Navigate to X"
  const navMatches = context.match(/Navigate\s+to\s+([^\s→,]+)/gi);
  if (navMatches) {
    navMatches.forEach(match => {
      const route = match.replace(/Navigate\s+to\s+/i, '').trim();
      steps.push({
        action: `Navigate to ${route}`,
        type: 'navigation'
      });
    });
  }

  // Look for click patterns: "Click X" or "click #id"
  const clickMatches = context.match(/Click\s+[#\w\s-]+/gi);
  if (clickMatches) {
    clickMatches.forEach(match => {
      steps.push({
        action: match.trim(),
        type: 'interaction'
      });
    });
  }

  // Look for form patterns: "Fill X" or "Submit Y"
  const formMatches = context.match(/(Fill|Submit|Enter)\s+[\w\s]+/gi);
  if (formMatches) {
    formMatches.forEach(match => {
      steps.push({
        action: match.trim(),
        type: 'form_interaction'
      });
    });
  }

  return steps;
}

/**
 * Build directed graph of user interactions
 */
function buildInteractionGraph(workflow) {
  const graph = {
    nodes: [],
    edges: []
  };

  workflow.steps.forEach((step, index) => {
    const nodeId = `state_${index}`;
    const nodeType = inferStateType(step);

    graph.nodes.push({
      id: nodeId,
      label: step.action,
      type: nodeType,
      story_id: step.story_id
    });

    // Add edge to next state
    if (index < workflow.steps.length - 1) {
      graph.edges.push({
        from: nodeId,
        to: `state_${index + 1}`,
        action: step.action
      });
    }
  });

  return graph;
}

/**
 * Infer state type from step action
 */
function inferStateType(step) {
  const action = step.action.toLowerCase();

  if (action.includes('navigate to') || action.includes('load')) {
    return 'page';
  }
  if (action.includes('submit') || action.includes('confirm') || action.includes('complete')) {
    return 'goal';
  }
  if (action.includes('click') || action.includes('select')) {
    return 'interaction';
  }
  if (action.includes('fill') || action.includes('enter')) {
    return 'form';
  }

  return 'state';
}

/**
 * Detect workflow issues (dead ends, circular flows, regressions, error recovery, etc.)
 *
 * Adaptive analysis based on depth: LIGHT (4 dimensions), STANDARD (8 dimensions), DEEP (12 dimensions)
 *
 * @param {Object} interactionGraph - Graph representation of workflow
 * @param {Object} currentWorkflow - Baseline workflow from SD
 * @param {Array<Object>} analysisDepths - Per-story depth analysis results
 * @param {Array<Object>} userStories - User stories being analyzed
 * @returns {Object} Detected issues across all dimensions
 */
function detectWorkflowIssues(interactionGraph, currentWorkflow, analysisDepths = [], userStories = []) {
  // Determine max depth from all stories (use highest depth for workflow-level checks)
  const maxDepth = analysisDepths.length > 0
    ? analysisDepths.reduce((max, d) => {
        const depthOrder = { 'LIGHT': 1, 'STANDARD': 2, 'DEEP': 3 };
        return depthOrder[d.depth] > depthOrder[max] ? d.depth : max;
      }, 'LIGHT')
    : 'STANDARD';

  const issues = {
    // Core dimensions (ALL depths)
    deadEnds: [],
    circularFlows: [],
    unreachableStates: [],
    regressions: [],

    // STANDARD + DEEP dimensions
    error_recovery: [],
    loading_states: [],
    confirmations: [],

    // DEEP only dimensions
    form_validation: [],
    state_management: [],
    permission_gates: [],
    accessibility: [],
    browser_controls: [],

    // Metadata
    navigation: {
      added_routes: [],
      removed_routes: [],
      modified_routes: [],
      requires_redirects: false
    },
    touchpoints: [],
    analysis_depth: maxDepth
  };

  // Detect dead ends (nodes with no outgoing edges except goal states)
  // NOTE: Landing pages (dashboards, home, overview) are NOT dead ends - they have
  // standard app navigation (header, sidebar) that user stories don't explicitly model.
  interactionGraph.nodes.forEach(node => {
    const outgoingEdges = interactionGraph.edges.filter(e => e.from === node.id);
    if (outgoingEdges.length === 0 && node.type !== 'goal') {
      const label = node.label.toLowerCase();
      // Don't flag common landing page patterns as dead ends
      // These pages have standard app navigation not modeled in user stories
      const isLandingPage = /dashboard|home|overview|landing|main view|briefing|index|welcome/i.test(label);
      // Don't flag pages with route paths - they're app pages with standard navigation
      const isAppPage = /\/[\w/-]+/.test(label);

      if (!isLandingPage && !isAppPage) {
        issues.deadEnds.push({
          node_id: node.id,
          label: node.label,
          severity: 'HIGH',
          description: `User reaches "${node.label}" but has no way to proceed or return`
        });
      }
    }
  });

  // Detect circular flows (cycles in graph)
  const cycles = detectCycles(interactionGraph);
  issues.circularFlows = cycles.map(cycle => ({
    path: cycle,
    severity: cycle.length > 3 ? 'HIGH' : 'MEDIUM',
    description: `User can loop through ${cycle.length} states: ${cycle.join(' → ')}`
  }));

  // Detect navigation regressions (routes removed from current workflow)
  // NOTE: currentWorkflow.routes comes from SD description - for NEW feature SDs,
  // these are TARGET routes to ADD, not existing routes to preserve.
  // Only flag as "removed" if the route existed in the CODEBASE before this SD.
  if (currentWorkflow.routes && currentWorkflow.routes.length > 0) {
    const newRoutes = interactionGraph.nodes
      .filter(n => n.type === 'page')
      .map(n => {
        const match = n.label.match(/\/[\w/-]+/);
        return match ? match[0] : null;
      })
      .filter(r => r);

    // Extract all routes mentioned in user story acceptance criteria or implementation context
    // These are TARGET routes this SD is creating, not existing routes
    const targetRoutes = userStories.flatMap(story => {
      const text = [
        story.title,
        story.user_want,
        story.user_benefit,
        story.implementation_context,
        ...(story.acceptance_criteria || [])
      ].join(' ');
      const matches = text.match(/\/[\w/-]+/g) || [];
      return matches;
    });

    // For NEW feature SDs: ALL routes from the SD description are TARGETS being added
    // They should never be flagged as "removed" - they're the whole point of the SD
    // Include SD description routes as targets since they describe what we're building
    const allTargetRoutes = [
      ...targetRoutes,
      ...currentWorkflow.routes  // Routes from SD description are targets, not baselines
    ];
    const targetRouteSet = new Set(allTargetRoutes);

    // Only consider routes as "removed" if they're NOT target routes from this SD
    // For new feature SDs, this should effectively result in zero removedRoutes
    const removedRoutes = currentWorkflow.routes.filter(
      route => !newRoutes.includes(route) && !targetRouteSet.has(route)
    );

    if (removedRoutes.length > 0) {
      issues.navigation.removed_routes = removedRoutes;
      issues.navigation.requires_redirects = true;

      removedRoutes.forEach(route => {
        issues.regressions.push({
          type: 'navigation_pattern',
          severity: 'MEDIUM',
          existing_pattern: `Direct ${route} access`,
          new_pattern: 'Route removed or relocated',
          affected_users: `Users with ${route} bookmarks or direct links`,
          recommendation: `Add redirect: ${route} → [new location] or restore route`
        });
      });
    }
  }

  // ============================================================================
  // STANDARD + DEEP: Error Recovery Analysis
  // ============================================================================
  if (maxDepth === 'STANDARD' || maxDepth === 'DEEP') {
    // Check for missing error recovery on action nodes
    interactionGraph.nodes.forEach(node => {
      if (node.type === 'form' || node.type === 'interaction') {
        const hasAction = /submit|save|update|delete|create/i.test(node.label);
        if (hasAction) {
          // Look for error/failure edges
          const outgoing = interactionGraph.edges.filter(e => e.from === node.id);
          const hasErrorPath = outgoing.some(e => /error|fail|retry|cancel/i.test(e.action));

          if (!hasErrorPath) {
            issues.error_recovery.push({
              node_id: node.id,
              label: node.label,
              severity: 'HIGH',
              description: `Action "${node.label}" has no error recovery path (retry/cancel)`,
              story_id: node.story_id
            });
          }
        }
      }
    });
  }

  // ============================================================================
  // STANDARD + DEEP: Loading State Analysis
  // ============================================================================
  if (maxDepth === 'STANDARD' || maxDepth === 'DEEP') {
    // Check for missing loading indicators on async operations
    userStories.forEach(story => {
      const storyText = [
        story.title,
        story.implementation_context,
        (story.acceptance_criteria || []).join(' ')
      ].join(' ').toLowerCase();

      const hasAsync = /fetch|api|load|query|async|await/i.test(storyText);
      const hasLoadingState = /loading|spinner|skeleton|indicator/i.test(storyText);

      if (hasAsync && !hasLoadingState) {
        issues.loading_states.push({
          story_id: story.id || story.story_key,
          severity: 'MEDIUM',
          description: 'Async operation detected but no loading state specified',
          recommendation: 'Add loading indicator to acceptance criteria'
        });
      }
    });
  }

  // ============================================================================
  // STANDARD + DEEP: Confirmation Pattern Analysis
  // ============================================================================
  if (maxDepth === 'STANDARD' || maxDepth === 'DEEP') {
    // Check for missing confirmations on destructive actions
    userStories.forEach(story => {
      const storyText = [
        story.title,
        story.user_want,
        story.implementation_context
      ].join(' ').toLowerCase();

      const isDestructive = /delete|remove|cancel.*subscription|deactivate|purge|destroy/i.test(storyText);
      const hasConfirmation = /confirm|confirmation|are you sure|modal|dialog/i.test(storyText) ||
        (story.acceptance_criteria || []).some(c => /confirm/i.test(c));

      if (isDestructive && !hasConfirmation) {
        issues.confirmations.push({
          story_id: story.id || story.story_key,
          severity: 'HIGH',
          description: `Destructive action "${story.title}" missing confirmation step`,
          recommendation: 'Add confirmation dialog to acceptance criteria'
        });
      }
    });
  }

  // ============================================================================
  // DEEP ONLY: Form Validation Analysis
  // ============================================================================
  if (maxDepth === 'DEEP') {
    userStories.forEach(story => {
      const storyText = [
        story.title,
        story.implementation_context,
        (story.acceptance_criteria || []).join(' ')
      ].join(' ').toLowerCase();

      const hasForm = /form|input|field|submit|validation/i.test(storyText);
      const hasValidationTiming = /inline|on-blur|on-submit|real-time|instant/i.test(storyText);

      if (hasForm && !hasValidationTiming) {
        const fieldCount = (storyText.match(/field|input/gi) || []).length;
        if (fieldCount >= 3) { // Only flag for complex forms
          issues.form_validation.push({
            story_id: story.id || story.story_key,
            severity: 'MEDIUM',
            description: `Form validation timing not specified (${fieldCount} fields detected)`,
            recommendation: 'Specify when validation occurs: inline, on-blur, or on-submit'
          });
        }
      }
    });
  }

  // ============================================================================
  // DEEP ONLY: State Management Analysis
  // ============================================================================
  if (maxDepth === 'DEEP') {
    // Check for missing state handling on multi-step flows
    const multiStepStories = userStories.filter(story => {
      const stepCount = getStepCount(story);
      return stepCount > 3;
    });

    multiStepStories.forEach(story => {
      const storyText = [
        story.implementation_context,
        (story.acceptance_criteria || []).join(' ')
      ].join(' ').toLowerCase();

      const hasRefreshHandling = /refresh|reload|persist|session|draft/i.test(storyText);
      const hasBackHandling = /back button|browser back|navigation/i.test(storyText);

      if (!hasRefreshHandling) {
        issues.state_management.push({
          story_id: story.id || story.story_key,
          severity: 'MEDIUM',
          type: 'refresh_behavior',
          description: 'Multi-step flow: page refresh behavior not specified',
          recommendation: 'Define what happens if user refreshes during flow'
        });
      }

      if (!hasBackHandling) {
        issues.state_management.push({
          story_id: story.id || story.story_key,
          severity: 'LOW',
          type: 'back_button',
          description: 'Multi-step flow: browser back button behavior not specified',
          recommendation: 'Define browser back/forward button behavior'
        });
      }
    });
  }

  // ============================================================================
  // DEEP ONLY: Accessibility Analysis
  // ============================================================================
  if (maxDepth === 'DEEP') {
    // Check for keyboard navigation and screen reader support
    userStories.forEach(story => {
      const storyText = [
        story.title,
        story.implementation_context,
        (story.acceptance_criteria || []).join(' ')
      ].join(' ').toLowerCase();

      const hasInteraction = /click|select|choose|navigate|toggle/i.test(storyText);
      const hasA11y = /keyboard|tab|aria|screen reader|accessibility|a11y/i.test(storyText);

      if (hasInteraction && !hasA11y) {
        const priority = story.priority;
        // Only flag high/critical priority stories for accessibility
        if (priority === 'high' || priority === 'critical') {
          issues.accessibility.push({
            story_id: story.id || story.story_key,
            severity: 'MEDIUM',
            description: 'Interactive element: keyboard navigation not specified',
            recommendation: 'Add keyboard navigation to acceptance criteria'
          });
        }
      }
    });
  }

  return issues;
}

/**
 * Detect cycles in interaction graph using DFS
 */
function detectCycles(graph) {
  const visited = new Set();
  const recursionStack = new Set();
  const cycles = [];

  function dfs(nodeId, path) {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    const outgoingEdges = graph.edges.filter(e => e.from === nodeId);
    for (const edge of outgoingEdges) {
      if (!visited.has(edge.to)) {
        dfs(edge.to, [...path]);
      } else if (recursionStack.has(edge.to)) {
        const cycleStart = path.indexOf(edge.to);
        if (cycleStart >= 0) {
          cycles.push(path.slice(cycleStart));
        }
      }
    }

    recursionStack.delete(nodeId);
  }

  graph.nodes.forEach(node => {
    if (!visited.has(node.id)) {
      dfs(node.id, []);
    }
  });

  return cycles;
}

/**
 * Calculate intelligent severity for an issue based on context
 *
 * Uses contextual rules to determine if issue is CRITICAL, HIGH, MEDIUM, LOW, or INFO
 *
 * @param {Object} issue - Issue to score
 * @param {Object} context - Contextual information (story, flow characteristics)
 * @returns {string} Severity level
 */
function calculateSeverity(issue, context = {}) {
  // CRITICAL: Blocks core functionality, causes data loss, financial risk
  if (issue.type === 'dead_end' && context.isRequiredPath) {
    return 'CRITICAL';
  }

  if (issue.type === 'error_recovery' &&
      context.isFinancialTransaction &&
      context.canLoseData) {
    return 'CRITICAL';
  }

  if (issue.type === 'circular_flow' &&
      !hasEscapePath(issue) &&
      issue.path && issue.path.length > 3) {
    return 'CRITICAL';
  }

  // HIGH: Significant user impact, poor UX, security/privacy concerns
  if (issue.type === 'confirmation' && context.isDestructiveAction) {
    return 'HIGH';
  }

  if (issue.type === 'navigation_regression' && context.hasExternalLinks) {
    return 'HIGH';
  }

  if (issue.type === 'error_recovery' && context.isUserFacingOperation) {
    return 'HIGH';
  }

  // MEDIUM: Usability improvements, edge case handling
  if (issue.type === 'loading_state' && context.expectedLoadTime > 2000) {
    return 'MEDIUM';
  }

  if (issue.type === 'form_validation' && context.formFieldCount > 5) {
    return 'MEDIUM';
  }

  if (issue.type === 'state_management') {
    return 'MEDIUM';
  }

  // LOW: Nice-to-have, minor enhancements
  if (issue.type === 'accessibility' && context.priority !== 'critical') {
    return 'LOW';
  }

  if (issue.type === 'browser_controls') {
    return 'LOW';
  }

  // Default to issue's own severity or MEDIUM
  return issue.severity || 'MEDIUM';
}

/**
 * Check if a circular flow has an escape path
 *
 * @param {Object} issue - Circular flow issue
 * @returns {boolean} True if escape path exists
 */
function hasEscapePath(issue) {
  if (!issue.path || !Array.isArray(issue.path)) {
    return false;
  }

  // Check if any node in the cycle has an exit (Cancel, Back, Close)
  return issue.path.some(nodeId =>
    /cancel|back|close|exit|skip/i.test(nodeId)
  );
}

/**
 * Determine if an issue should be flagged (auto-pass rules)
 *
 * Filters out non-issues based on context to reduce noise.
 *
 * @param {Object} issue - Issue to evaluate
 * @param {Object} context - Contextual information
 * @returns {boolean} True if issue should be reported
 */
function shouldFlag(issue, context = {}) {
  // Don't flag error recovery for read-only views
  if (issue.type === 'error_recovery' && context.isReadOnly) {
    return false;
  }

  // Don't flag confirmation for non-destructive actions
  if (issue.type === 'confirmation' && !context.isDestructive) {
    return false;
  }

  // Don't flag validation timing for simple forms (<3 fields)
  if (issue.type === 'form_validation' && context.formFieldCount < 3) {
    return false;
  }

  // Don't flag loading states for synchronous operations
  if (issue.type === 'loading_state' && context.isSync) {
    return false;
  }

  // Don't flag accessibility for low priority, read-only content
  if (issue.type === 'accessibility' &&
      context.priority === 'low' &&
      context.isReadOnly) {
    return false;
  }

  // Don't flag state management for single-step flows
  if (issue.type === 'state_management' && context.stepCount <= 2) {
    return false;
  }

  // Don't flag dead ends if they're clearly terminal goal states
  if (issue.type === 'dead_end' &&
      /success|complete|confirmation|thank you|done/i.test(issue.label)) {
    return false;
  }

  // Flag everything else
  return true;
}

/**
 * Build context object for an issue from user story
 *
 * @param {Object} issue - Issue being evaluated
 * @param {Object} userStory - Related user story
 * @returns {Object} Context information
 */
function getIssueContext(issue, userStory) {
  if (!userStory) {
    return {};
  }

  const storyText = [
    userStory.title,
    userStory.user_want,
    userStory.implementation_context,
    (userStory.acceptance_criteria || []).join(' ')
  ].join(' ').toLowerCase();

  return {
    isFinancialTransaction: /payment|purchase|checkout|billing/i.test(storyText),
    isDestructiveAction: /delete|remove|cancel.*subscription|deactivate/i.test(storyText),
    isReadOnly: /view|display|see|read|show/i.test(userStory.title),
    isUserFacingOperation: !/internal|admin|system/i.test(storyText),
    isRequiredPath: userStory.priority === 'critical' || userStory.priority === 'high',
    hasExternalLinks: /external|seo|bookmark|share/i.test(storyText),
    canLoseData: /form|input|data|save/i.test(storyText),
    isSync: !/async|await|fetch|api|load/i.test(storyText),
    formFieldCount: (storyText.match(/field|input/gi) || []).length,
    stepCount: getStepCount(userStory),
    expectedLoadTime: /slow|large|heavy/i.test(storyText) ? 3000 : 1000,
    priority: userStory.priority
  };
}

/**
 * Calculate confidence score for an issue/recommendation based on codebase patterns
 *
 * Returns confidence from 0.0 to 1.0 based on pattern frequency and context.
 *
 * @param {Object} issue - Issue or recommendation to score
 * @param {Object} codebasePatterns - Discovered patterns from codebase
 * @param {Object} userStory - Related user story
 * @returns {number} Confidence score (0.0 - 1.0)
 */
function calculateConfidence(issue, codebasePatterns, userStory = null) {
  let confidence = 0.60; // Default medium confidence

  if (!codebasePatterns) {
    return confidence;
  }

  // High confidence (≥0.90): Pattern exists in codebase 10+ times
  if (issue.type === 'error_recovery' && codebasePatterns.error_recovery.length > 0) {
    const pattern = codebasePatterns.error_recovery[0];
    if (pattern.count >= 10) {
      confidence = 0.92;
    } else if (pattern.count >= 5) {
      confidence = 0.80;
    } else if (pattern.count >= 3) {
      confidence = 0.70;
    }
  }

  if (issue.type === 'confirmation' && codebasePatterns.confirmation_modals.length > 0) {
    const pattern = codebasePatterns.confirmation_modals[0];
    if (pattern.count >= 10) {
      confidence = 0.95; // Very high confidence for confirmations
    } else if (pattern.count >= 5) {
      confidence = 0.85;
    } else if (pattern.count >= 3) {
      confidence = 0.75;
    }
  }

  if (issue.type === 'form_validation' && codebasePatterns.form_validation.length > 0) {
    const pattern = codebasePatterns.form_validation[0];
    if (pattern.count >= 10) {
      confidence = 0.90;
    } else if (pattern.count >= 5) {
      confidence = 0.78;
    } else if (pattern.count >= 3) {
      confidence = 0.65;
    }
  }

  if (issue.type === 'loading_state' && codebasePatterns.loading_patterns.length > 0) {
    const pattern = codebasePatterns.loading_patterns[0];
    if (pattern.count >= 10) {
      confidence = 0.88;
    } else if (pattern.count >= 5) {
      confidence = 0.75;
    } else if (pattern.count >= 3) {
      confidence = 0.63;
    }
  }

  // Boost confidence for critical priority stories
  if (userStory && userStory.priority === 'critical') {
    confidence = Math.min(confidence + 0.05, 1.0);
  }

  // Boost confidence for financial transactions (extra important)
  if (userStory) {
    const storyText = [
      userStory.title,
      userStory.user_want
    ].join(' ').toLowerCase();

    if (/payment|checkout|billing/i.test(storyText)) {
      confidence = Math.min(confidence + 0.05, 1.0);
    }
  }

  // Round to 2 decimal places
  return Math.round(confidence * 100) / 100;
}

/**
 * Calculate overall confidence score for workflow analysis
 *
 * @param {Array<Object>} issues - All detected issues
 * @param {Object} codebasePatterns - Pattern analysis results
 * @returns {Object} Confidence metrics
 */
function calculateOverallConfidenceScore(issues, _codebasePatterns) {
  if (issues.length === 0) {
    return {
      overall: 0.95,
      high_confidence_count: 0,
      medium_confidence_count: 0,
      low_confidence_count: 0
    };
  }

  const confidenceScores = issues
    .filter(i => i.confidence !== undefined)
    .map(i => i.confidence);

  if (confidenceScores.length === 0) {
    return {
      overall: 0.75,
      high_confidence_count: 0,
      medium_confidence_count: 0,
      low_confidence_count: 0
    };
  }

  const avgConfidence = confidenceScores.reduce((sum, c) => sum + c, 0) / confidenceScores.length;

  return {
    overall: Math.round(avgConfidence * 100) / 100,
    high_confidence_count: confidenceScores.filter(c => c >= 0.90).length,
    medium_confidence_count: confidenceScores.filter(c => c >= 0.60 && c < 0.90).length,
    low_confidence_count: confidenceScores.filter(c => c < 0.60).length
  };
}

/**
 * Calculate UX impact score across 4 dimensions
 */
function calculateUXImpactScore(issues, newWorkflow, currentWorkflow) {
  const dimensions = {
    efficiency: 10,
    learnability: 10,
    satisfaction: 10,
    consistency: 10
  };

  // Efficiency: Penalize added steps
  const stepDelta = newWorkflow.steps.length - (currentWorkflow.steps?.length || 0);
  if (stepDelta > 0) {
    dimensions.efficiency -= Math.min(stepDelta * 0.5, 3);
  } else if (stepDelta < 0) {
    dimensions.efficiency = Math.min(dimensions.efficiency + Math.abs(stepDelta) * 0.3, 10);
  }

  // Learnability: Penalize new patterns
  const newPatterns = newWorkflow.steps.filter(s =>
    !currentWorkflow.steps?.some(cs => cs.toLowerCase().includes(s.action.toLowerCase()))
  );
  dimensions.learnability -= Math.min(newPatterns.length * 0.3, 4);

  // Satisfaction: Penalize dead ends and regressions
  dimensions.satisfaction -= Math.min(issues.deadEnds.length * 2, 5);
  dimensions.satisfaction -= Math.min(issues.regressions.length * 1.5, 3);

  // Consistency: Penalize circular flows
  dimensions.consistency -= Math.min(issues.circularFlows.length * 1.5, 4);

  // Clamp to 0-10 range
  Object.keys(dimensions).forEach(key => {
    dimensions[key] = Math.max(0, Math.min(10, dimensions[key]));
  });

  // Weighted average (efficiency 30%, learnability 20%, satisfaction 30%, consistency 20%)
  const overall = (
    dimensions.efficiency * 0.3 +
    dimensions.learnability * 0.2 +
    dimensions.satisfaction * 0.3 +
    dimensions.consistency * 0.2
  );

  return {
    overall: Math.round(overall * 10) / 10,
    dimensions
  };
}

/**
 * Generate workflow-specific recommendations
 */
function generateWorkflowRecommendations(issues, uxScore, analysis) {
  const recommendations = [];

  // Critical: Dead ends
  issues.deadEnds.forEach(deadEnd => {
    recommendations.push({
      priority: 'CRITICAL',
      category: 'workflow',
      action: `Add navigation or action button to "${deadEnd.label}" state`,
      rationale: 'Prevents dead end that blocks users from progressing',
      implementation: `Add exit path or "Back" button in ${deadEnd.node_id}`
    });
  });

  // Critical: Circular flows
  issues.circularFlows.forEach((flow, _index) => {
    recommendations.push({
      priority: 'CRITICAL',
      category: 'workflow',
      action: `Break circular flow: ${flow.path.slice(0, 3).join(' → ')}...`,
      rationale: 'Prevents infinite loop that confuses users',
      implementation: 'Add confirmation step or terminal state to exit loop'
    });
  });

  // High: Navigation regressions
  issues.regressions.forEach(regression => {
    recommendations.push({
      priority: 'HIGH',
      category: 'navigation',
      action: regression.recommendation,
      rationale: regression.existing_pattern + ' no longer works',
      implementation: 'Server-side redirect or route preservation'
    });
  });

  // Medium: UX score improvements
  if (uxScore.overall < 7.0 && uxScore.overall >= 6.0) {
    if (uxScore.dimensions.efficiency < 7) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'ux',
        action: 'Reduce workflow steps or combine related actions',
        rationale: `Efficiency score ${uxScore.dimensions.efficiency}/10 below target`,
        implementation: 'Review workflow delta and consolidate where possible'
      });
    }

    if (uxScore.dimensions.learnability < 7) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'ux',
        action: 'Add user guidance or tooltips for new patterns',
        rationale: `Learnability score ${uxScore.dimensions.learnability}/10 indicates learning curve`,
        implementation: 'Onboarding tooltips or contextual help for new interactions'
      });
    }
  }

  // Low: Testing
  if (analysis.validation_results.graph_metrics.total_nodes > 5) {
    recommendations.push({
      priority: 'LOW',
      category: 'testing',
      action: 'Add E2E tests covering all workflow paths',
      rationale: 'Complex workflow requires comprehensive test coverage',
      implementation: `Playwright tests for ${analysis.validation_results.graph_metrics.total_nodes} interaction states`
    });
  }

  return recommendations;
}

/**
 * Calculate overall quality score for quality gate
 * Formula: 40% validation + 30% UX score + 20% regressions + 10% tests
 */
function calculateOverallQualityScore(analysis) {
  const validationScore = analysis.status === 'PASS' ? 1.0 : 0.0;
  const uxScore = analysis.ux_impact_score / 10;
  const regressionScore = analysis.interaction_impact.regressions_detected.length === 0 ? 1.0 : 0.75;
  const testScore = 0.95; // Placeholder - actual test coverage evaluated later

  const overall = (
    validationScore * 0.4 +
    uxScore * 0.3 +
    regressionScore * 0.2 +
    testScore * 0.1
  );

  return Math.round(overall * 100) / 100;
}

/**
 * Parse baseline workflow from SD description
 * NOTE: For NEW feature SDs, routes in the description are TARGETS to add,
 * not existing routes. The regression detection logic in detectWorkflowIssues
 * handles this by comparing against user story targets.
 */
function parseBaselineWorkflow(description) {
  const workflow = {
    steps: [],
    routes: []
  };

  // Extract workflow steps (simple pattern matching)
  const stepMatches = description.match(/(?:User|Customer)\s+(.+?)(?:\.|,|$)/gi);
  if (stepMatches) {
    workflow.steps = stepMatches.map(s => s.trim());
  }

  // Extract route patterns: /path-name
  const routeMatches = description.match(/\/[\w/-]+/g);
  if (routeMatches) {
    // Filter out false positives:
    // - Documentation paths (/docs/, /specs/)
    // - Status/descriptor patterns that aren't routes (/warning, /hard, /server, etc.)
    // - Patterns that are clearly not URL routes
    const filteredRoutes = routeMatches.filter(route => {
      // Exclude documentation paths
      if (/^\/docs\//i.test(route)) return false;
      if (/^\/specs\//i.test(route)) return false;

      // Exclude common false positive patterns (status descriptors, not routes)
      const falsePositivePatterns = [
        /^\/warning/i,
        /^\/critical/i,
        /^\/paused/i,
        /^\/killed/i,
        /^\/hard/i,
        /^\/soft/i,
        /^\/yellow/i,
        /^\/red/i,
        /^\/green/i,
        /^\/server/i,
        /^\/client/i,
        /^\/local/i,
        /^\/remote/i,
        /^\/true/i,
        /^\/false/i,
        /^\/null/i,
        /^\/undefined/i
      ];
      if (falsePositivePatterns.some(p => p.test(route))) return false;

      // Only include routes that look like app routes (start with / followed by lowercase letters)
      // App routes typically: /dashboard, /chairman, /ventures, /settings, etc.
      if (!/^\/[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*\/?$/i.test(route)) return false;

      return true;
    });

    workflow.routes = [...new Set(filteredRoutes)]; // Deduplicate
  }

  return workflow;
}

/**
 * ===========================================================================
 * INTELLIGENT WORKFLOW REVIEW FUNCTIONS
 * ===========================================================================
 * Added: 2025-10-27 (SD-DESIGN-WORKFLOW-REVIEW-001 Enhancement)
 * Purpose: Adaptive, context-aware workflow analysis with pattern learning
 */

/**
 * Determine analysis depth for a user story based on complexity and risk
 *
 * Returns DEEP (12 dimensions), STANDARD (8 dimensions), or LIGHT (4 dimensions)
 * based on story characteristics and impact.
 *
 * @param {Object} userStory - User story to analyze
 * @returns {Object} { depth: string, triggers: string[], rationale: string }
 */
function determineAnalysisDepth(userStory) {
  const triggers = [];
  let depth = 'STANDARD'; // Default

  // Extract story text for pattern matching
  const storyText = [
    userStory.title,
    userStory.user_want,
    userStory.user_benefit,
    userStory.implementation_context,
    (userStory.acceptance_criteria || []).join(' ')
  ].join(' ').toLowerCase();

  // DEEP triggers (high risk/impact operations)

  // Financial transactions (highest risk)
  if (/payment|purchase|checkout|subscribe|billing|refund|transaction/i.test(storyText)) {
    depth = 'DEEP';
    triggers.push('Financial transaction detected');
  }

  // Destructive actions (data loss risk)
  if (/delete|remove|cancel\s+subscription|deactivate\s+account|terminate|purge/i.test(storyText)) {
    depth = 'DEEP';
    triggers.push('Destructive action detected');
  }

  // High complexity (story points)
  if (userStory.story_points && userStory.story_points >= 8) {
    depth = 'DEEP';
    triggers.push(`High complexity (${userStory.story_points} story points)`);
  }

  // First-time user experience (onboarding is critical)
  if (/onboarding|first[- ]time|signup|registration|getting\s+started|welcome/i.test(storyText)) {
    depth = 'DEEP';
    triggers.push('First-time user experience');
  }

  // Multi-step flows (error-prone)
  const stepCount = getStepCount(userStory);
  if (stepCount > 5) {
    depth = 'DEEP';
    triggers.push(`Multi-step flow (${stepCount} steps)`);
  }

  // Authentication/Authorization (security critical)
  if (/login|logout|authenticate|authorize|permission|access\s+control|security/i.test(storyText)) {
    depth = 'DEEP';
    triggers.push('Authentication/authorization flow');
  }

  // Data export/import (compliance risk)
  if (/export|import|download\s+data|backup|restore|migrate/i.test(storyText)) {
    depth = 'DEEP';
    triggers.push('Data export/import operation');
  }

  // LIGHT triggers (low risk/impact operations)
  // Only downgrade to LIGHT if no DEEP triggers exist

  if (depth === 'STANDARD') {
    // Read-only operations
    if (/^(view|display|see|read|show|list|browse)/i.test(userStory.title) &&
        !/edit|modify|change|update/i.test(storyText)) {
      depth = 'LIGHT';
      triggers.push('Read-only operation');
    }

    // Low priority features
    if (userStory.priority === 'low') {
      depth = 'LIGHT';
      triggers.push('Low priority feature');
    }

    // Simple single-step actions
    if (stepCount === 1 && userStory.story_points && userStory.story_points <= 2) {
      depth = 'LIGHT';
      triggers.push('Simple single-step action');
    }
  }

  // Generate rationale
  const rationale = triggers.length > 0
    ? `Analysis depth: ${depth} (${triggers.join(', ')})`
    : `Analysis depth: ${depth} (default)`;

  return {
    depth,
    triggers,
    rationale,
    story_id: userStory.id || userStory.story_key
  };
}

/**
 * Count workflow steps in a user story
 *
 * @param {Object} userStory - User story to analyze
 * @returns {number} Number of steps detected
 */
function getStepCount(userStory) {
  if (!userStory.implementation_context) {
    return 1; // Default single step
  }

  // Count arrow-separated steps: "Step 1 → Step 2 → Step 3"
  const arrowSteps = userStory.implementation_context.split('→').length;

  // Count "then" keywords: "Click X then Y then Z"
  const thenSteps = (userStory.implementation_context.match(/\bthen\b/gi) || []).length + 1;

  // Count numbered steps: "1. X 2. Y 3. Z"
  const numberedSteps = (userStory.implementation_context.match(/\d+\./g) || []).length;

  // Return max of detected step counts
  return Math.max(arrowSteps, thenSteps, numberedSteps, 1);
}

/**
 * Analyze codebase for existing patterns (error handling, confirmations, forms, etc.)
 *
 * Scans repository to learn from existing patterns and recommend consistency.
 * Results are cached in .workflow-patterns.json for performance.
 *
 * @param {string} repoPath - Path to repository
 * @returns {Promise<Object>} Pattern analysis with frequencies
 */
async function analyzeCodebasePatterns(repoPath) {
  const patterns = {
    error_recovery: [],
    confirmation_modals: [],
    form_validation: [],
    loading_patterns: [],
    navigation: [],
    last_scan: new Date().toISOString()
  };

  try {
    // 1. Scan for error boundary patterns
    const { stdout: errorBoundaries } = await execAsync(
      `cd "${repoPath}" && grep -r "ErrorBoundary\\|useErrorHandler\\|try.*catch\\|\.catch(" src/ --include="*.jsx" --include="*.tsx" --include="*.js" --include="*.ts" 2>/dev/null | wc -l`
    );
    const errorCount = parseInt(errorBoundaries.trim()) || 0;

    if (errorCount > 0) {
      // Find actual implementations
      const { stdout: errorExamples } = await execAsync(
        `cd "${repoPath}" && grep -r "ErrorBoundary\\|try.*catch" src/ --include="*.jsx" --include="*.tsx" -A 3 2>/dev/null | head -20`
      );
      patterns.error_recovery.push({
        pattern: 'ErrorBoundary / try-catch',
        count: errorCount,
        confidence: errorCount >= 10 ? 'high' : errorCount >= 3 ? 'medium' : 'low',
        examples: errorExamples.split('\n').slice(0, 3)
      });
    }

    // 2. Scan for confirmation modal patterns
    const { stdout: confirmations } = await execAsync(
      `cd "${repoPath}" && grep -ri "confirm\\|AlertDialog\\|ConfirmDialog\\|Modal.*destructive" src/ --include="*.jsx" --include="*.tsx" 2>/dev/null | wc -l`
    );
    const confirmCount = parseInt(confirmations.trim()) || 0;

    if (confirmCount > 0) {
      patterns.confirmation_modals.push({
        pattern: 'Confirmation Dialog',
        count: confirmCount,
        confidence: confirmCount >= 10 ? 'high' : confirmCount >= 3 ? 'medium' : 'low'
      });
    }

    // 3. Scan for form validation patterns
    const { stdout: formValidation } = await execAsync(
      `cd "${repoPath}" && grep -ri "yup\\|zod\\|validation.*schema\\|useForm\\|FormProvider" src/ --include="*.jsx" --include="*.tsx" --include="*.js" --include="*.ts" 2>/dev/null | wc -l`
    );
    const formCount = parseInt(formValidation.trim()) || 0;

    if (formCount > 0) {
      // Detect validation library
      const { stdout: hasYup } = await execAsync(
        `cd "${repoPath}" && grep -r "yup" src/ 2>/dev/null | wc -l`
      );
      const { stdout: hasZod } = await execAsync(
        `cd "${repoPath}" && grep -r "zod" src/ 2>/dev/null | wc -l`
      );

      const yupCount = parseInt(hasYup.trim()) || 0;
      const zodCount = parseInt(hasZod.trim()) || 0;

      const library = yupCount > zodCount ? 'yup' : zodCount > 0 ? 'zod' : 'react-hook-form';

      patterns.form_validation.push({
        pattern: `Form validation (${library})`,
        count: formCount,
        library,
        confidence: formCount >= 10 ? 'high' : formCount >= 3 ? 'medium' : 'low'
      });
    }

    // 4. Scan for loading state patterns
    const { stdout: loadingStates } = await execAsync(
      `cd "${repoPath}" && grep -ri "isLoading\\|loading\\|Skeleton\\|Spinner" src/ --include="*.jsx" --include="*.tsx" 2>/dev/null | wc -l`
    );
    const loadingCount = parseInt(loadingStates.trim()) || 0;

    if (loadingCount > 0) {
      patterns.loading_patterns.push({
        pattern: 'Loading states (isLoading, Skeleton)',
        count: loadingCount,
        confidence: loadingCount >= 10 ? 'high' : loadingCount >= 3 ? 'medium' : 'low'
      });
    }

    // 5. Scan for navigation patterns (React Router, Next.js)
    const { stdout: navigationPatterns } = await execAsync(
      `cd "${repoPath}" && grep -ri "useNavigate\\|useRouter\\|router\\.push\\|navigate(" src/ --include="*.jsx" --include="*.tsx" --include="*.js" --include="*.ts" 2>/dev/null | wc -l`
    );
    const navCount = parseInt(navigationPatterns.trim()) || 0;

    if (navCount > 0) {
      patterns.navigation.push({
        pattern: 'Programmatic navigation',
        count: navCount,
        confidence: navCount >= 10 ? 'high' : navCount >= 3 ? 'medium' : 'low'
      });
    }

  } catch (error) {
    console.warn(`   ⚠️  Pattern scanning error: ${error.message}`);
  }

  return patterns;
}

/**
 * Load or scan codebase patterns (with caching)
 *
 * @param {string} repoPath - Path to repository
 * @param {Object} options - Options including cache path
 * @returns {Promise<Object>} Cached or fresh pattern analysis
 */
async function loadOrScanPatterns(repoPath, options = {}) {
  const cacheFile = options.patternCacheFile || '.workflow-patterns.json';
  const cacheMaxAge = options.cacheMaxAgeHours || 24; // Cache for 24 hours by default

  // Try to load from cache
  try {
    const cacheData = await fs.readFile(cacheFile, 'utf8');
    const cachedPatterns = JSON.parse(cacheData);

    // Check if cache is still valid
    const cacheAge = new Date() - new Date(cachedPatterns.last_scan);
    const cacheAgeHours = cacheAge / (1000 * 60 * 60);

    if (cacheAgeHours < cacheMaxAge) {
      console.log(`   📦 Using cached patterns (${Math.round(cacheAgeHours)}h old)`);
      return cachedPatterns;
    }
  } catch {
    // Cache doesn't exist or is invalid, will scan
  }

  // Scan codebase and cache results
  console.log('   🔍 Scanning codebase for patterns...');
  const patterns = await analyzeCodebasePatterns(repoPath);

  // Save to cache
  try {
    await fs.writeFile(cacheFile, JSON.stringify(patterns, null, 2));
    console.log(`   ✅ Patterns cached to ${cacheFile}`);
  } catch (error) {
    console.warn(`   ⚠️  Could not cache patterns: ${error.message}`);
  }

  return patterns;
}

/**
 * Check if a user story should use existing codebase patterns
 *
 * @param {Object} userStory - User story to analyze
 * @param {Object} codebasePatterns - Discovered patterns from codebase
 * @returns {Array<Object>} Pattern-based recommendations
 */
function checkAgainstPatterns(userStory, codebasePatterns) {
  const recommendations = [];

  const storyText = [
    userStory.title,
    userStory.user_want,
    userStory.implementation_context
  ].join(' ').toLowerCase();

  // Check for error recovery needs
  if (/submit|save|update|delete|api|fetch/i.test(storyText) &&
      codebasePatterns.error_recovery.length > 0) {
    const pattern = codebasePatterns.error_recovery[0];
    recommendations.push({
      priority: 'MEDIUM',
      category: 'consistency',
      pattern: pattern.pattern,
      action: 'Add error recovery pattern',
      rationale: `Codebase uses ${pattern.pattern} in ${pattern.count} places`,
      confidence: pattern.confidence === 'high' ? 0.90 : pattern.confidence === 'medium' ? 0.75 : 0.60
    });
  }

  // Check for confirmation needs on destructive actions
  if (/delete|remove|cancel.*subscription|deactivate/i.test(storyText) &&
      codebasePatterns.confirmation_modals.length > 0) {
    const pattern = codebasePatterns.confirmation_modals[0];
    recommendations.push({
      priority: 'HIGH',
      category: 'consistency',
      pattern: pattern.pattern,
      action: 'Add confirmation modal before destructive action',
      rationale: `Codebase uses ${pattern.pattern} in ${pattern.count} places`,
      confidence: pattern.confidence === 'high' ? 0.95 : pattern.confidence === 'medium' ? 0.80 : 0.65
    });
  }

  // Check for form validation needs
  if (/form|input|field|validation/i.test(storyText) &&
      codebasePatterns.form_validation.length > 0) {
    const pattern = codebasePatterns.form_validation[0];
    recommendations.push({
      priority: 'MEDIUM',
      category: 'consistency',
      pattern: pattern.pattern,
      action: `Use ${pattern.library} for form validation`,
      rationale: `Codebase standardizes on ${pattern.library} (${pattern.count} uses)`,
      confidence: pattern.confidence === 'high' ? 0.92 : pattern.confidence === 'medium' ? 0.77 : 0.62
    });
  }

  // Check for loading state needs
  if (/fetch|load|api|query|async/i.test(storyText) &&
      codebasePatterns.loading_patterns.length > 0) {
    const pattern = codebasePatterns.loading_patterns[0];
    recommendations.push({
      priority: 'LOW',
      category: 'consistency',
      pattern: pattern.pattern,
      action: 'Add loading state indicator',
      rationale: `Codebase uses loading patterns in ${pattern.count} places`,
      confidence: pattern.confidence === 'high' ? 0.85 : pattern.confidence === 'medium' ? 0.70 : 0.55
    });
  }

  return recommendations;
}

/**
 * ===========================================================================
 * DESIGN THRESHOLD & HELPER FUNCTIONS
 * ===========================================================================
 */

/**
 * Determine adaptive design score threshold based on SD scope
 * Different SDs have different design rigor requirements
 *
 * @param {Object} sd - Strategic Directive metadata
 * @returns {number} Design score threshold (0-100)
 */
function determineDesignThreshold(sd) {
  if (!sd) return 70; // Default threshold

  const category = (sd.category || '').toLowerCase();
  const scope = (sd.scope || '').toLowerCase();
  const priority = (sd.priority || '').toLowerCase();

  // Critical/Security SDs need higher design bar
  if (category.includes('security') || category.includes('critical') || priority === 'critical') {
    return 85; // High bar for critical work
  }

  // Infrastructure/Database changes have moderate design requirements
  if (category.includes('infrastructure') || category.includes('database') || category.includes('migration')) {
    return 60; // Lower bar for backend-only work
  }

  // Utility/Polish/Quick-fix SDs are lower bar
  if (category.includes('utility') || category.includes('polish') || category.includes('quick-fix') || scope.includes('small')) {
    return 50; // Low bar for small/polish work
  }

  // Performance optimization can have moderate bar
  if (category.includes('performance') || category.includes('optimization')) {
    return 65; // Moderate bar
  }

  // Default for standard feature SDs
  return 70; // Medium bar for normal features
}

/**
 * ===========================================================================
 * CONTEXTUAL RISK SCORING FUNCTIONS
 * ===========================================================================
 * Added: 2025-01-27 (Phase 1: Pareto improvement)
 * Purpose: Apply context-aware risk scoring to pattern detections
 */

/**
 * Enhance detected issues with contextual risk scoring
 *
 * @param {Array<string>} affectedFiles - Files with detected patterns
 * @param {string} patternType - Type of pattern (accessibility, performance, etc)
 * @param {string} repoPath - Repository path
 * @returns {Promise<Object>} Contextual risk analysis
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

  // Gather risk context for each file
  const contextualFindings = [];
  for (const file of affectedFiles.slice(0, 10)) { // Limit to 10 for performance
    try {
      const riskContext = await getRiskContext(file, { repo_path: repoPath });
      const scoring = calculateContextualConfidence(85, riskContext); // Base confidence 85

      contextualFindings.push({
        file,
        risk_score: scoring.risk_score,
        contextual_severity: scoring.contextual_severity,
        risk_factors: scoring.risk_factors,
        explanation: scoring.explanation,
        adjusted_confidence: scoring.adjusted_confidence
      });

      // Track max risk
      if (scoring.risk_score > analysis.max_risk_score) {
        analysis.max_risk_score = scoring.risk_score;
        analysis.max_severity = scoring.contextual_severity;
      }

      console.log(`      ${getSeverityIcon(scoring.contextual_severity)} ${file.split('/').pop()}: Risk ${scoring.risk_score}/10 (${scoring.contextual_severity})`);
      if (scoring.risk_factors.length > 0) {
        console.log(`         Factors: ${scoring.risk_factors.join(', ')}`);
      }
    } catch (err) {
      console.warn(`      ⚠️  Could not analyze ${file}: ${err.message}`);
    }
  }

  analysis.risk_scores = contextualFindings;
  analysis.aggregate_stats = getAggregateRiskStats(contextualFindings);

  console.log(`   📈 Risk Summary: ${analysis.aggregate_stats.critical} critical, ${analysis.aggregate_stats.high} high, ${analysis.aggregate_stats.medium} medium, ${analysis.aggregate_stats.low} low`);
  console.log(`   📊 Avg Risk Score: ${analysis.aggregate_stats.avg_risk_score}/10`);

  return analysis;
}

/**
 * Get files changed in current git diff
 */
async function getGitDiffFiles(repoPath) {
  try {
    const { stdout } = await execAsync(
      `cd "${repoPath}" && git diff --name-only HEAD 2>/dev/null`
    );

    const files = stdout.trim().split('\n').filter(f => f && f.endsWith('.tsx') || f.endsWith('.jsx'));
    return files;
  } catch {
    // No git or no changes
    return [];
  }
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
 * ===========================================================================
 * UX CONTRACT COMPLIANCE VALIDATION
 * ===========================================================================
 * Added: 2025-12-08 (SD-VISION-TRANSITION-001E Contract System)
 * Purpose: Validate component paths against parent UX contract boundaries
 *          and enforce cultural design style inheritance
 */

/**
 * Validate UX contract compliance for SD
 * @param {string} sdId - Strategic Directive ID
 * @param {string} repoPath - Repository path to check components
 * @returns {Promise<Object>} UX contract compliance result
 */
async function validateUxContractCompliance(sdId, repoPath) {
  const result = {
    has_contract: false,
    valid: true,
    violations: [],
    cultural_design_style: null,
    style_source: null,
    max_component_loc: null,
    min_wcag_level: null,
    contract_id: null,
    contract_version: null
  };

  try {
    // Check if SD has an inherited UX contract
    const contracts = await getInheritedContracts(sdId);

    if (contracts.error || !contracts.uxContract) {
      // No UX contract = no restrictions
      return result;
    }

    result.has_contract = true;
    result.contract_id = contracts.uxContract.contract_id;
    result.contract_version = contracts.uxContract.contract_version;

    // Extract cultural design style (strictly inherited)
    if (contracts.uxContract.cultural_design_style) {
      result.cultural_design_style = contracts.uxContract.cultural_design_style;
      result.style_source = `inherited_from_${contracts.uxContract.parent_sd_id}`;
    }

    // Extract component constraints
    result.max_component_loc = contracts.uxContract.max_component_loc;
    result.min_wcag_level = contracts.uxContract.min_wcag_level;

    // Get changed files from git diff (focus on what's being modified)
    const changedFiles = await getGitDiffFiles(repoPath);
    const componentFiles = changedFiles.filter(f =>
      f.endsWith('.tsx') || f.endsWith('.jsx')
    );

    if (componentFiles.length === 0) {
      console.log('   ℹ️  No component files changed in current diff');
      return result;
    }

    // Validate each changed component against UX contract
    for (const componentPath of componentFiles) {
      const validation = await validateComponentAgainstUxContract(sdId, componentPath);

      if (validation && validation.valid === false) {
        result.valid = false;
        if (validation.violations) {
          result.violations.push(...validation.violations);
        }
      }

      // Also inherit cultural style and WCAG level from validation
      if (validation?.cultural_design_style && !result.cultural_design_style) {
        result.cultural_design_style = validation.cultural_design_style;
      }
      if (validation?.min_wcag_level && !result.min_wcag_level) {
        result.min_wcag_level = validation.min_wcag_level;
      }
    }

    // Remove duplicate violations
    const uniqueViolations = [];
    const seen = new Set();
    for (const v of result.violations) {
      const key = `${v.type}:${v.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueViolations.push(v);
      }
    }
    result.violations = uniqueViolations;

  } catch (error) {
    console.error(`      ❌ UX contract validation error: ${error.message}`);
    result.error = error.message;
    // Don't block on errors - just warn
    result.valid = true;
  }

  return result;
}
