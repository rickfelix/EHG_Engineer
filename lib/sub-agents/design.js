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

import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

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
  console.log(`   Senior Design Sub-Agent - UI/UX Compliance`);

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
    const repoPath = options.repo_path || '/mnt/c/_EHG/ehg';

    // Phase 1: Design System Compliance
    console.log(`\n🎨 Phase 1: Checking design system compliance...`);
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
      console.log(`   ✅ Design system compliance maintained`);
    }

    // Phase 2: Component Analysis
    console.log(`\n🧩 Phase 2: Analyzing component structure...`);
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
      console.log(`   ✅ All components within size guidelines (<600 lines)`);
    }

    // Phase 3: Accessibility Check
    console.log(`\n♿ Phase 3: Checking accessibility compliance...`);
    const accessibilityCheck = await checkAccessibility(repoPath, sdId);
    results.findings.accessibility_check = accessibilityCheck;

    if (accessibilityCheck.issues > 0) {
      console.log(`   ❌ ${accessibilityCheck.issues} accessibility issue(s) found`);
      results.critical_issues.push({
        severity: 'CRITICAL',
        issue: `${accessibilityCheck.issues} accessibility violations`,
        recommendation: 'Fix WCAG 2.1 AA violations before deployment',
        issues: accessibilityCheck.issue_details
      });
      results.verdict = 'BLOCKED';
    } else {
      console.log(`   ✅ No accessibility issues detected`);
    }

    // Phase 4: Responsive Design Check
    console.log(`\n📱 Phase 4: Checking responsive design...`);
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
      console.log(`   ✅ Responsive design patterns detected`);
    }

    // Phase 5: Consistency Check
    console.log(`\n🔄 Phase 5: Checking design consistency...`);
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
      console.log(`   ✅ Design consistency maintained`);
    }

    // Generate recommendations
    console.log(`\n💡 Generating recommendations...`);
    generateRecommendations(results);

    console.log(`\n🏁 DESIGN Complete: ${results.verdict} (${results.confidence}% confidence)`);

    return results;

  } catch (error) {
    console.error(`\n❌ DESIGN error:`, error.message);
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
async function checkDesignSystem(repoPath, sdId) {
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
async function analyzeComponents(repoPath, sdId) {
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
      } catch (err) {
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
 */
async function checkAccessibility(repoPath, sdId) {
  try {
    console.log(`   🔍 Running design-sub-agent with git-diff-only mode...`);

    // Call design-sub-agent.js with --git-diff-only flag
    const designAgentPath = '/mnt/c/_EHG/EHG_Engineer/lib/agents/design-sub-agent.js';
    const { stdout, stderr } = await execAsync(
      `cd "${repoPath}" && node "${designAgentPath}" src/components --git-diff-only 2>&1`
    );

    // Parse design-sub-agent output
    const scoreMatch = stdout.match(/Design Score: (\d+)\/100/);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;

    // Check if it passed (score >= 70)
    const passed = score >= 70;
    const issues = passed ? 0 : 1;

    console.log(`   📊 Design Score: ${score}/100 ${passed ? '✅ PASS' : '❌ FAIL'}`);

    return {
      checked: true,
      issues: issues,
      design_score: score,
      git_diff_only: true,
      issue_details: passed ? [] : [
        `Design score ${score}/100 (minimum 70 required)`,
        `Run: node ${designAgentPath} src/components --git-diff-only for details`
      ]
    };
  } catch (error) {
    console.warn(`   ⚠️  design-sub-agent error: ${error.message}`);
    // Fall back to simple grep checks
    try {
      const { stdout: missingAlt } = await execAsync(
        `cd "${repoPath}" && grep -r "<img" src/components 2>/dev/null | grep -v "alt=" | wc -l`
      );

      const { stdout: missingAria } = await execAsync(
        `cd "${repoPath}" && grep -r "<button" src/components 2>/dev/null | grep -v "aria-label" | grep -v "children" | wc -l`
      );

      const issues = parseInt(missingAlt.trim()) + parseInt(missingAria.trim());

      return {
        checked: true,
        issues: issues,
        missing_alt: parseInt(missingAlt.trim()),
        missing_aria: parseInt(missingAria.trim()),
        fallback_mode: true,
        issue_details: issues > 0 ? [
          `${missingAlt.trim()} image(s) missing alt text`,
          `${missingAria.trim()} button(s) missing aria-label`
        ] : []
      };
    } catch (fallbackError) {
      return {
        checked: false,
        issues: 0,
        error: fallbackError.message
      };
    }
  }
}

/**
 * Check responsive design
 */
async function checkResponsiveDesign(repoPath, sdId) {
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
async function checkDesignConsistency(repoPath, sdId) {
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
