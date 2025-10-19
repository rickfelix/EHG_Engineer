#!/usr/bin/env node

/**
 * Design UI/UX Audit Script
 *
 * Ensures all features have proper UI/UX coverage by analyzing PRDs and implementations
 * Prevents "invisible backend features" by detecting missing UI components
 *
 * Usage:
 *   node scripts/design-ui-ux-audit.js [--prd PRD-ID] [--sd SD-ID] [--all]
 *
 * Part of LEO Protocol v4.2.0 - Enhanced Design Sub-Agent
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ Error: SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

// Design checklist items
const UI_CHECKLIST = {
  visual_components_defined: 'All UI components specified with visual design',
  design_system_compliant: 'Components follow design system patterns',
  responsive_design_verified: 'Responsive breakpoints tested',
  theme_support_implemented: 'Light/dark theme support included',
  css_implementation_ready: 'CSS/styling specifications complete'
};

const UX_CHECKLIST = {
  user_flows_documented: 'All user flows mapped and documented',
  navigation_clear: 'Navigation paths intuitive and tested',
  accessibility_verified: 'WCAG 2.1 AA compliance checked',
  interaction_patterns_defined: 'All interactions specified',
  user_journey_complete: 'End-to-end user journey validated'
};

// Backend patterns that should trigger UI/UX requirements
const BACKEND_PATTERNS = [
  /api[\/\s]+endpoint/i,
  /database[\/\s]+(table|model)/i,
  /new[\/\s]+route/i,
  /controller/i,
  /service[\/\s]+layer/i,
  /backend[\/\s]+feature/i,
  /business[\/\s]+logic/i,
  /data[\/\s]+model/i
];

class DesignAudit {
  constructor() {
    this.findings = [];
    this.stats = {
      total_prds: 0,
      with_ui_ux: 0,
      missing_ui: 0,
      missing_ux: 0,
      missing_both: 0,
      backend_without_frontend: 0
    };
  }

  log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  async auditPRD(prdId) {
    this.log(`\n🔍 Auditing PRD: ${prdId}`, 'cyan');

    // Fetch PRD (try product_requirements_v2 first, then fall back to prds)
    let { data: prd, error } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('id', prdId)
      .single();

    // Fallback to prds table if not found
    if (error || !prd) {
      const result = await supabase
        .from('product_requirements_v2')
        .select('*')
        .eq('id', prdId)
        .single();
      prd = result.data;
      error = result.error;
    }

    if (error || !prd) {
      this.log(`❌ PRD not found: ${prdId}`, 'red');
      return null;
    }

    this.stats.total_prds++;

    const audit = {
      prd_id: prdId,
      prd_title: prd.title,
      sd_id: prd.strategic_directive_id || prd.directive_id || prd.sd_id,
      ui_checklist: {},
      ux_checklist: {},
      backend_detected: false,
      ui_component_found: false,
      issues: [],
      score: 0
    };

    // Check for backend patterns in PRD content
    // Handle both prds table and product_requirements_v2 table fields
    const content = `
      ${prd.title}
      ${prd.description || ''}
      ${prd.technical_approach || ''}
      ${prd.executive_summary || ''}
      ${prd.content || ''}
      ${prd.technical_requirements || ''}
      ${prd.implementation_approach || ''}
      ${prd.ui_ux_requirements || ''}
    `.toLowerCase();
    audit.backend_detected = BACKEND_PATTERNS.some(pattern => pattern.test(content));

    // Analyze PRD content for UI/UX mentions
    audit.ui_component_found = this.detectUIComponents(content);
    audit.ux_flow_found = this.detectUXFlows(content);

    // Check UI Checklist
    for (const [key, description] of Object.entries(UI_CHECKLIST)) {
      const hasItem = this.checkForKeywords(content, this.getUIKeywords(key));
      audit.ui_checklist[key] = {
        present: hasItem,
        description: description,
        keywords_found: hasItem ? 'Yes' : 'No'
      };
    }

    // Check UX Checklist
    for (const [key, description] of Object.entries(UX_CHECKLIST)) {
      const hasItem = this.checkForKeywords(content, this.getUXKeywords(key));
      audit.ux_checklist[key] = {
        present: hasItem,
        description: description,
        keywords_found: hasItem ? 'Yes' : 'No'
      };
    }

    // Calculate scores
    const uiScore = Object.values(audit.ui_checklist).filter(item => item.present).length;
    const uxScore = Object.values(audit.ux_checklist).filter(item => item.present).length;
    const uiTotal = Object.keys(UI_CHECKLIST).length;
    const uxTotal = Object.keys(UX_CHECKLIST).length;

    audit.ui_score = `${uiScore}/${uiTotal}`;
    audit.ux_score = `${uxScore}/${uxTotal}`;
    audit.score = ((uiScore + uxScore) / (uiTotal + uxTotal) * 100).toFixed(1);

    // Detect critical issues
    if (audit.backend_detected && !audit.ui_component_found) {
      audit.issues.push({
        severity: 'CRITICAL',
        type: 'INVISIBLE_BACKEND_FEATURE',
        message: 'Backend feature detected without UI component specification'
      });
      this.stats.backend_without_frontend++;
    }

    // Check for backend with insufficient UI/UX (score < 50%)
    if (audit.backend_detected && parseFloat(audit.score) < 50) {
      audit.issues.push({
        severity: 'CRITICAL',
        type: 'INSUFFICIENT_UI_UX_FOR_BACKEND',
        message: `Backend feature detected but UI/UX score is only ${audit.score}% (requires ≥50% for backend features)`
      });
    }

    if (uiScore === 0) {
      audit.issues.push({
        severity: 'ERROR',
        type: 'MISSING_UI',
        message: 'No UI specifications found in PRD'
      });
      this.stats.missing_ui++;
    }

    if (uxScore === 0) {
      audit.issues.push({
        severity: 'ERROR',
        type: 'MISSING_UX',
        message: 'No UX specifications found in PRD'
      });
      this.stats.missing_ux++;
    }

    if (uiScore === 0 && uxScore === 0) {
      this.stats.missing_both++;
    } else if (uiScore > 0 && uxScore > 0) {
      this.stats.with_ui_ux++;
    }

    this.findings.push(audit);
    return audit;
  }

  detectUIComponents(content) {
    const uiKeywords = [
      'component', 'button', 'form', 'input', 'modal', 'dialog',
      'card', 'table', 'list', 'menu', 'navigation', 'header',
      'footer', 'sidebar', 'panel', 'css', 'style', 'tailwind',
      'design system', 'ui', 'interface', 'visual'
    ];
    return uiKeywords.some(keyword => content.includes(keyword));
  }

  detectUXFlows(content) {
    const uxKeywords = [
      'user flow', 'navigation', 'journey', 'interaction', 'click',
      'navigate', 'redirect', 'accessibility', 'wcag', 'aria',
      'screen reader', 'keyboard', 'ux', 'user experience'
    ];
    return uxKeywords.some(keyword => content.includes(keyword));
  }

  getUIKeywords(checklistItem) {
    const keywordMap = {
      visual_components_defined: ['component', 'button', 'form', 'visual', 'ui element'],
      design_system_compliant: ['design system', 'pattern', 'consistent', 'style guide'],
      responsive_design_verified: ['responsive', 'mobile', 'breakpoint', 'viewport'],
      theme_support_implemented: ['theme', 'dark mode', 'light mode', 'color scheme'],
      css_implementation_ready: ['css', 'tailwind', 'style', 'class']
    };
    return keywordMap[checklistItem] || [];
  }

  getUXKeywords(checklistItem) {
    const keywordMap = {
      user_flows_documented: ['user flow', 'flow diagram', 'user path', 'flow map'],
      navigation_clear: ['navigation', 'menu', 'nav', 'route'],
      accessibility_verified: ['accessibility', 'wcag', 'aria', 'a11y', 'screen reader'],
      interaction_patterns_defined: ['interaction', 'click', 'hover', 'gesture', 'action'],
      user_journey_complete: ['user journey', 'journey map', 'user experience', 'end-to-end']
    };
    return keywordMap[checklistItem] || [];
  }

  checkForKeywords(content, keywords) {
    return keywords.some(keyword => content.toLowerCase().includes(keyword.toLowerCase()));
  }

  async auditAll() {
    this.log('\n🎨 Design UI/UX Audit - All PRDs', 'magenta');
    this.log('=' .repeat(60), 'blue');

    // Fetch all active PRDs
    const { data: prds, error } = await supabase
      .from('product_requirements_v2')
      .select('id, title, strategic_directive_id')
      .in('status', ['draft', 'approved', 'in_progress'])
      .order('created_at', { ascending: false });

    if (error) {
      this.log(`❌ Error fetching PRDs: ${error.message}`, 'red');
      return;
    }

    this.log(`\nFound ${prds.length} active PRDs to audit\n`, 'cyan');

    for (const prd of prds) {
      await this.auditPRD(prd.id);
    }

    this.displaySummary();
  }

  displayAudit(audit) {
    if (!audit) return;

    this.log(`\n📊 Audit Results for ${audit.prd_id}`, 'cyan');
    this.log(`Title: ${audit.prd_title}`, 'blue');
    this.log(`Score: ${audit.score}%`, audit.score >= 70 ? 'green' : 'yellow');
    this.log(`UI Score: ${audit.ui_score} | UX Score: ${audit.ux_score}`, 'blue');

    if (audit.backend_detected) {
      this.log(`⚠️  Backend feature detected`, 'yellow');
    }

    if (audit.issues.length > 0) {
      this.log(`\n❌ Issues Found:`, 'red');
      audit.issues.forEach(issue => {
        const color = issue.severity === 'CRITICAL' ? 'red' : issue.severity === 'ERROR' ? 'yellow' : 'blue';
        this.log(`  [${issue.severity}] ${issue.message}`, color);
      });
    }

    // UI Checklist Status
    this.log(`\n✅ UI Checklist:`, 'green');
    Object.entries(audit.ui_checklist).forEach(([key, value]) => {
      const icon = value.present ? '✓' : '✗';
      const color = value.present ? 'green' : 'red';
      this.log(`  ${icon} ${value.description}`, color);
    });

    // UX Checklist Status
    this.log(`\n✅ UX Checklist:`, 'green');
    Object.entries(audit.ux_checklist).forEach(([key, value]) => {
      const icon = value.present ? '✓' : '✗';
      const color = value.present ? 'green' : 'red';
      this.log(`  ${icon} ${value.description}`, color);
    });
  }

  displaySummary() {
    this.log('\n📈 Design Audit Summary', 'magenta');
    this.log('=' .repeat(60), 'blue');
    this.log(`Total PRDs Audited: ${this.stats.total_prds}`, 'cyan');
    this.log(`PRDs with UI/UX: ${this.stats.with_ui_ux} (${(this.stats.with_ui_ux/this.stats.total_prds*100).toFixed(1)}%)`, 'green');
    this.log(`Missing UI: ${this.stats.missing_ui}`, this.stats.missing_ui > 0 ? 'yellow' : 'green');
    this.log(`Missing UX: ${this.stats.missing_ux}`, this.stats.missing_ux > 0 ? 'yellow' : 'green');
    this.log(`Missing Both: ${this.stats.missing_both}`, this.stats.missing_both > 0 ? 'red' : 'green');
    this.log(`Backend without Frontend: ${this.stats.backend_without_frontend}`, this.stats.backend_without_frontend > 0 ? 'red' : 'green');

    if (this.stats.backend_without_frontend > 0) {
      this.log('\n🚨 CRITICAL: Backend features detected without UI specifications!', 'red');
      this.log('These features may be invisible to users.', 'yellow');
    }

    this.log('\n📋 Findings:', 'cyan');
    this.findings.forEach(finding => {
      const scoreColor = finding.score >= 70 ? 'green' : finding.score >= 40 ? 'yellow' : 'red';
      this.log(`  ${finding.prd_id}: ${finding.prd_title} - Score: ${finding.score}%`, scoreColor);
      if (finding.issues.length > 0) {
        finding.issues.forEach(issue => {
          this.log(`    [${issue.type}] ${issue.message}`, 'red');
        });
      }
    });
  }

  async generateReport() {
    const report = {
      audit_date: new Date().toISOString(),
      stats: this.stats,
      findings: this.findings,
      recommendations: []
    };

    // Generate recommendations
    if (this.stats.backend_without_frontend > 0) {
      report.recommendations.push({
        priority: 'CRITICAL',
        message: 'Add UI specifications for all backend features',
        action: 'Run Design sub-agent for each backend feature to define UI/UX'
      });
    }

    if (this.stats.missing_ui > 0) {
      report.recommendations.push({
        priority: 'HIGH',
        message: 'Complete UI component specifications for PRDs missing UI details',
        action: 'Trigger UI mode of Design sub-agent'
      });
    }

    if (this.stats.missing_ux > 0) {
      report.recommendations.push({
        priority: 'HIGH',
        message: 'Complete UX flow documentation for PRDs missing UX details',
        action: 'Trigger UX mode of Design sub-agent'
      });
    }

    return report;
  }
}

// CLI Execution
async function main() {
  const args = process.argv.slice(2);
  const audit = new DesignAudit();

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🎨 Design UI/UX Audit Script

Usage:
  node scripts/design-ui-ux-audit.js [options]

Options:
  --prd <PRD-ID>    Audit specific PRD
  --sd <SD-ID>      Audit all PRDs for a Strategic Directive
  --all             Audit all active PRDs
  --help, -h        Show this help message

Examples:
  node scripts/design-ui-ux-audit.js --prd PRD-2025-001
  node scripts/design-ui-ux-audit.js --all
  node scripts/design-ui-ux-audit.js --sd SD-2025-001
    `);
    process.exit(0);
  }

  if (args.includes('--all')) {
    await audit.auditAll();
  } else if (args.includes('--prd')) {
    const prdIndex = args.indexOf('--prd');
    const prdId = args[prdIndex + 1];
    if (!prdId) {
      console.error('❌ Error: --prd requires a PRD ID');
      process.exit(1);
    }
    const result = await audit.auditPRD(prdId);
    audit.displayAudit(result);
  } else if (args.includes('--sd')) {
    const sdIndex = args.indexOf('--sd');
    const sdId = args[sdIndex + 1];
    if (!sdId) {
      console.error('❌ Error: --sd requires a Strategic Directive ID');
      process.exit(1);
    }

    // Fetch PRDs for this SD
    const { data: prds, error } = await supabase
      .from('product_requirements_v2')
      .select('id')
      .eq('strategic_directive_id', sdId);

    if (error || !prds || prds.length === 0) {
      console.error(`❌ No PRDs found for SD: ${sdId}`);
      process.exit(1);
    }

    console.log(`\n🔍 Auditing ${prds.length} PRDs for ${sdId}\n`);
    for (const prd of prds) {
      await audit.auditPRD(prd.id);
    }
    audit.displaySummary();
  } else {
    console.error('❌ Error: Please specify --prd, --sd, or --all');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  // Generate and save report
  const report = await audit.generateReport();
  const reportPath = path.join(process.cwd(), 'design-audit-report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Full report saved to: ${reportPath}`);
}

main().catch(console.error);
