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
 * REFACTORED: This file now orchestrates modular components.
 * Original 2569 LOC split into focused modules (~300-400 LOC each):
 * - design/index.js: Main entry point and execute function
 * - design/utils.js: Helper functions, thresholds, risk context
 * - design/checks.js: Design system, accessibility, responsive checks
 * - design/patterns.js: Codebase pattern analysis
 * - design/workflow-analyzer.js: Main workflow review capability
 * - design/workflow-detection.js: Issue detection, graph building
 * - design/workflow-scoring.js: Severity, confidence, UX scoring
 *
 * SD-LEO-REFACTOR-DESIGN-SUB-001
 *
 * Created: 2025-10-11 (SD-SUBAGENT-IMPROVE-001)
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createSupabaseServiceClient } from '../../../scripts/lib/supabase-connection.js';

// Import modular components
import {
  enhanceWithRiskContext,
  validateUxContractCompliance,
  parseBaselineWorkflow
} from './utils.js';
import {
  checkDesignSystem,
  analyzeComponents,
  checkAccessibility,
  checkResponsiveDesign,
  checkDesignConsistency,
  generateRecommendations
} from './checks.js';
import { workflowReviewCapability } from './workflow-analyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

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

  // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-010: Early-return for non-UI SD types
  // ROOT CAUSE FIX (SAL-DESIGN-PERF): DESIGN sub-agent ran all UI/UX checks on infrastructure
  // SDs, causing 40% pass rate since infra SDs have no UI components to validate.
  const skipResult = await checkForNonUISdType(sdId, options);
  if (skipResult) return skipResult;

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
    const repoPath = options.repo_path || path.resolve(__dirname, '../../../../../ehg');

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
    const accessibilityCheck = await checkAccessibility(repoPath, sdId, supabase);
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
        const { data: prdData, error: prdError } = await dbClient
          .from('product_requirements_v2')
          .select('functional_requirements, acceptance_criteria, system_architecture')
          .eq('sd_id', sdId)
          .single();

        // Fetch user stories
        const { data: userStories, error: storiesError } = await dbClient
          .from('user_stories')
          .select('*')
          .eq('sd_id', sdId);

        // Fetch current workflow baseline from SD
        const { data: sdData, error: sdError } = await dbClient
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
 * Check if SD is a non-UI type that should skip DESIGN validation
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-010: Prevents running UI/UX checks on infrastructure SDs
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - Execution options
 * @returns {Promise<Object|null>} Skip result if non-UI, null to continue
 */
async function checkForNonUISdType(sdId, options) {
  try {
    const { data: sdData } = await supabase
      .from('strategic_directives_v2')
      .select('sd_type, category')
      .or(`sd_key.eq.${sdId},id.eq.${sdId}`)
      .single();

    const sdType = (sdData?.sd_type || '').toLowerCase();
    const sdCategory = (sdData?.category || '').toLowerCase();
    const effectiveType = sdType || sdCategory;

    // Non-UI SD types that should skip design validation
    const nonUISdTypes = [
      'infrastructure', 'database', 'documentation', 'docs',
      'process', 'uat', 'api', 'backend', 'orchestrator'
    ];

    if (!nonUISdTypes.includes(effectiveType)) {
      return null; // Continue with full DESIGN validation
    }

    const isInfra = ['infrastructure', 'database', 'backend', 'api'].includes(effectiveType);

    console.log(`\n🏗️  SD Type Detection: ${effectiveType.toUpperCase()} (source: ${sdType ? 'sd_type' : 'category'})`);
    console.log(`   💡 ${effectiveType} SDs do not require UI/UX design validation`);
    console.log(isInfra
      ? '   ✅ Infrastructure validation: deployment, CI/CD, monitoring, rollback, config management'
      : `   ✅ ${effectiveType} SD - design checks skipped (no UI components)`);

    const infraChecklist = isInfra ? [
      'Deployment strategy documented',
      'CI/CD pipeline integration verified',
      'Monitoring and alerting configured',
      'Rollback procedure defined',
      'Configuration management approach specified'
    ] : [];

    return {
      verdict: 'PASS',
      confidence: 95,
      critical_issues: [],
      warnings: [],
      recommendations: isInfra ? [{
        severity: 'INFO',
        issue: `${effectiveType} SD - UI/UX design checks not applicable`,
        recommendation: 'Validate infrastructure concerns: deployment, monitoring, rollback, CI/CD integration'
      }] : [{
        severity: 'INFO',
        issue: `${effectiveType} SD - design checks skipped`,
        recommendation: `No UI components to validate for ${effectiveType} SD type`
      }],
      detailed_analysis: {
        sd_type: effectiveType,
        sd_type_source: sdType ? 'declared' : 'category_fallback',
        skip_reason: `Non-UI SD type (${effectiveType}) - UI/UX design validation not applicable`,
        validation_approach: isInfra
          ? 'Infrastructure design review: deployment, CI/CD, monitoring, rollback, config management'
          : `${effectiveType}-appropriate validation (non-UI)`,
        infra_checklist: infraChecklist
      },
      findings: {
        design_system_check: { skipped: true, reason: `${effectiveType} SD - no UI components` },
        component_analysis: { skipped: true, reason: `${effectiveType} SD - no UI components` },
        accessibility_check: { skipped: true, reason: `${effectiveType} SD - no UI components` },
        responsive_check: { skipped: true, reason: `${effectiveType} SD - no UI components` },
        consistency_check: { skipped: true, reason: `${effectiveType} SD - no UI components` },
        workflow_review: { skipped: true, reason: `${effectiveType} SD - no user-facing workflows` }
      },
      options
    };
  } catch (error) {
    console.warn(`   ⚠️  SD type detection failed: ${error.message}, continuing with full DESIGN validation`);
    return null; // On error, fall through to full validation
  }
}

// Export for backward compatibility
export default { execute };
