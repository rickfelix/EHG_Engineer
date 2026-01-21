#!/usr/bin/env node

/**
 * Design Sub-Agent - Main Orchestration
 * ACTIVE Design Validation Tool
 * Validates accessibility, responsive design, and UX compliance
 *
 * Extracted from design-sub-agent.js for modularity
 * SD-LEO-REFACTOR-DESIGN-AGENT-001
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import { WCAG_CRITERIA, BREAKPOINTS, SCORE_DEDUCTIONS, SEVERITY } from './constants.js';
import { loadGitDiffFiles } from './file-helpers.js';
import { checkAccessibility, checkTouchTargets } from './accessibility-checks.js';
import { checkResponsiveDesign } from './responsive-checks.js';
import { checkComponentConsistency } from './component-checks.js';
import { checkColorContrast, checkTypography, checkAnimations } from './style-checks.js';
import { checkDesignSystem } from './design-system.js';
import { visualVerification } from './visual-verification.js';

/**
 * DesignSubAgent class - Main orchestrator
 */
class DesignSubAgent {
  constructor() {
    this.wcagCriteria = WCAG_CRITERIA;
    this.breakpoints = BREAKPOINTS;
    this.gitDiffOnly = false;
    this.gitDiffFiles = [];
  }

  /**
   * Main execution - run all design checks
   */
  async execute(options = {}) {
    console.log('🎨 Design Sub-Agent ACTIVATED\n');

    // Enable git-diff-only mode if specified
    if (options.gitDiffOnly) {
      this.gitDiffOnly = true;
      this.gitDiffFiles = await loadGitDiffFiles(options.path || './src');
      console.log(`📋 Git Diff Mode: Scanning ${this.gitDiffFiles.length} modified files only\n`);
    } else {
      console.log('Validating ACTUAL design implementation, not just following guidelines.\n');
    }

    const fileOptions = {
      gitDiffOnly: this.gitDiffOnly,
      gitDiffFiles: this.gitDiffFiles
    };

    const results = {
      timestamp: new Date().toISOString(),
      accessibility: {},
      responsive: {},
      components: {},
      consistency: {},
      issues: [],
      score: 100
    };

    // 1. Accessibility audit
    console.log('♿ Running accessibility audit...');
    const accessibilityCheck = await checkAccessibility(options.path || './src', fileOptions);
    results.accessibility = accessibilityCheck;

    // 2. Responsive design validation
    console.log('📱 Validating responsive design...');
    const responsiveCheck = await checkResponsiveDesign(options.path || './src', fileOptions);
    results.responsive = responsiveCheck;

    // 3. Component consistency check
    console.log('🧩 Checking component consistency...');
    const componentCheck = await checkComponentConsistency(options.path || './src', fileOptions);
    results.components = componentCheck;

    // 4. Color contrast validation
    console.log('🎨 Validating color contrast...');
    const contrastCheck = await checkColorContrast(options.path || './src', fileOptions);
    results.accessibility.contrast = contrastCheck;

    // 5. Touch target sizes
    console.log('👆 Checking touch target sizes...');
    const touchTargetCheck = await checkTouchTargets(options.path || './src', fileOptions);
    results.accessibility.touchTargets = touchTargetCheck;

    // 6. Typography consistency
    console.log('📝 Validating typography...');
    const typographyCheck = await checkTypography(options.path || './src', fileOptions);
    results.consistency.typography = typographyCheck;

    // 7. Animation performance
    console.log('🎬 Checking animation performance...');
    const animationCheck = await checkAnimations(options.path || './src', fileOptions);
    results.consistency.animations = animationCheck;

    // 8. Design system compliance
    console.log('📐 Validating design system compliance...');
    const designSystemCheck = await checkDesignSystem(options.path || './src', fileOptions);
    results.consistency.designSystem = designSystemCheck;

    // 9. Visual Verification (if enabled via --visual-verify flag)
    if (options.visualVerify) {
      console.log('👁️  Running visual verification (Playwright MCP)...');
      const visualResults = visualVerification(options.path || './src', options);
      results.visualVerification = visualResults;

      // Output markdown template
      console.log('\n' + '='.repeat(70));
      console.log('VISUAL AUDIT TEMPLATE');
      console.log('='.repeat(70));
      console.log(visualResults.markdown_summary);

      // Output MCP commands for execution
      console.log('\n' + '='.repeat(70));
      console.log('MCP COMMANDS TO EXECUTE');
      console.log('='.repeat(70));
      console.log('Execute these commands in Claude Code to complete visual verification:\n');
      visualResults.mcp_instructions.forEach(instr => {
        console.log(`   ${instr.step}. ${instr.tool}(${JSON.stringify(instr.params)})`);
        console.log(`      └─ ${instr.description}`);
      });
      console.log('\n' + '='.repeat(70));
    }

    // Calculate design score
    results.score = this.calculateScore(results);

    // Generate report
    this.generateReport(results);

    // Generate fixes
    if (results.score < 90) {
      await this.generateFixRecommendations(results);
    }

    return results;
  }

  /**
   * Calculate design score
   */
  calculateScore(results) {
    let score = 100;

    // Accessibility deductions
    const a11yIssues = results.accessibility.issues || [];
    score -= a11yIssues.filter(i => i.severity === SEVERITY.HIGH).length * SCORE_DEDUCTIONS.accessibility.HIGH;
    score -= a11yIssues.filter(i => i.severity === SEVERITY.MEDIUM).length * SCORE_DEDUCTIONS.accessibility.MEDIUM;

    // Responsive design deductions
    const responsiveIssues = results.responsive.issues || [];
    score -= responsiveIssues.filter(i => i.severity === SEVERITY.HIGH).length * SCORE_DEDUCTIONS.responsive.HIGH;
    score -= responsiveIssues.filter(i => i.severity === SEVERITY.MEDIUM).length * SCORE_DEDUCTIONS.responsive.MEDIUM;

    // Consistency deductions
    const consistencyIssues = results.components.inconsistencies || [];
    score -= consistencyIssues.length * SCORE_DEDUCTIONS.consistency;

    // Touch target issues
    if (results.accessibility.touchTargets) {
      score -= results.accessibility.touchTargets.issues.length * SCORE_DEDUCTIONS.touchTarget;
    }

    // Contrast issues
    if (results.accessibility.contrast) {
      score -= results.accessibility.contrast.issues.length * SCORE_DEDUCTIONS.contrast;
    }

    return Math.max(0, score);
  }

  /**
   * Generate design report
   */
  generateReport(results) {
    console.log('\n' + '='.repeat(70));
    console.log('DESIGN VALIDATION REPORT');
    console.log('='.repeat(70));

    console.log(`\n🎨 Design Score: ${results.score}/100`);

    // Accessibility summary
    const a11y = results.accessibility;
    console.log(`\n♿ Accessibility: ${a11y.status}`);
    if (a11y.issues && a11y.issues.length > 0) {
      console.log(`   Issues: ${a11y.issues.length}`);
      a11y.issues.slice(0, 3).forEach(issue => {
        console.log(`   - ${issue.type} (WCAG ${issue.wcag})`);
      });
    }
    if (a11y.passed && a11y.passed.length > 0) {
      console.log(`   ✅ ${a11y.passed.join(', ')}`);
    }

    // Responsive design summary
    const responsive = results.responsive;
    console.log(`\n📱 Responsive Design: ${responsive.status}`);
    console.log(`   Viewport meta: ${responsive.viewportMeta ? '✅' : '❌'}`);
    console.log(`   Mobile-first: ${responsive.mobileFirst ? '✅' : '❌'}`);
    console.log(`   Breakpoints: ${responsive.breakpoints.length}`);

    // Component consistency
    const components = results.components;
    if (components.inconsistencies && components.inconsistencies.length > 0) {
      console.log('\n🧩 Component Consistency: WARNING');
      components.inconsistencies.forEach(issue => {
        console.log(`   - ${issue.message}`);
      });
    }

    // Design system compliance
    if (results.consistency && results.consistency.designSystem) {
      const ds = results.consistency.designSystem;
      console.log(`\n📐 Design System Compliance: ${ds.compliance}%`);
      if (ds.tokens) {
        console.log(`   CSS Variables: ${ds.tokens.cssVariables || 0}`);
        console.log(`   Token Usage: ${ds.tokens.usage || 0}`);
      }
    }

    console.log('\n' + '='.repeat(70));
  }

  /**
   * Generate fix recommendations
   */
  async generateFixRecommendations(results) {
    const fixes = [];

    // Accessibility fixes
    if (results.accessibility.issues) {
      for (const issue of results.accessibility.issues.filter(i => i.severity === SEVERITY.HIGH)) {
        fixes.push({
          priority: 'CRITICAL',
          area: 'Accessibility',
          issue: issue.type,
          wcag: issue.wcag,
          fix: issue.fix
        });
      }
    }

    // Responsive fixes
    if (!results.responsive.viewportMeta) {
      fixes.push({
        priority: 'CRITICAL',
        area: 'Responsive',
        issue: 'Missing viewport meta tag',
        fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">'
      });
    }

    // Save fix guide
    const guidePath = 'design-fixes.md';
    let md = '# Design Fix Guide\n\n';
    md += `**Generated**: ${new Date().toISOString()}\n`;
    md += `**Score**: ${results.score}/100\n\n`;

    md += '## Critical Fixes\n\n';
    fixes.filter(f => f.priority === 'CRITICAL').forEach(fix => {
      md += `### ${fix.area}: ${fix.issue}\n`;
      if (fix.wcag) md += `**WCAG**: ${fix.wcag}\n`;
      md += `**Fix**: ${fix.fix}\n\n`;
    });

    await fs.writeFile(guidePath, md);
    console.log(`\n📝 Design fix guide saved to: ${guidePath}`);
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new DesignSubAgent();

  const gitDiffOnly = process.argv.includes('--git-diff-only');
  const visualVerify = process.argv.includes('--visual-verify');
  const urlArg = process.argv.find(arg => arg.startsWith('--url='));
  const previewUrl = urlArg ? urlArg.split('=')[1] : null;
  const pathArg = process.argv.find(arg => !arg.includes('--') && arg !== process.argv[1]);

  agent.execute({
    path: pathArg || './src',
    gitDiffOnly,
    visualVerify,
    previewUrl
  }).then(results => {
    if (results.score < 70) {
      console.log('\n⚠️  Design validation failed!');
      console.log('   Fix accessibility and responsive issues.');
      process.exit(1);
    } else {
      console.log('\n✅ Design validation complete.');
      process.exit(0);
    }
  }).catch(error => {
    console.error('Design validation failed:', error);
    process.exit(1);
  });
}

export default DesignSubAgent;
export { DesignSubAgent };
