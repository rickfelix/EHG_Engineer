/**
 * DESIGN Sub-Agent Checks
 * Design system, accessibility, responsive, and consistency checks
 *
 * Extracted from design.js for modularity
 * SD-LEO-REFACTOR-DESIGN-SUB-001
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { determineDesignThreshold, getGitDiffFiles } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

/**
 * Check design system compliance
 */
export async function checkDesignSystem(repoPath, _sdId) {
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
export async function analyzeComponents(repoPath, _sdId) {
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
export async function checkAccessibility(repoPath, sdId, supabase) {
  try {
    console.log('   🔍 Running design-sub-agent with git-diff-only mode...');

    // Get SD metadata to determine adaptive threshold
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('category, scope, priority')
      .eq('id', sdId)
      .single();

    // Determine adaptive threshold based on SD scope/category
    const scoreThreshold = determineDesignThreshold(sd);

    // Call design-sub-agent.js with --git-diff-only flag
    const designAgentPath = path.resolve(__dirname, '../../agents/design-sub-agent.js');
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
export async function checkResponsiveDesign(repoPath, _sdId) {
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
export async function checkDesignConsistency(repoPath, _sdId) {
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
 * Generate recommendations based on findings
 */
export function generateRecommendations(results) {
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
