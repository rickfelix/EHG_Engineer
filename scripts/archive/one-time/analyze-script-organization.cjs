#!/usr/bin/env node
/**
 * Script Organization Analyzer
 *
 * Analyzes all scripts in scripts/ directory and categorizes them
 * by naming pattern and purpose for reorganization planning
 *
 * Usage: node scripts/analyze-script-organization.cjs
 */

const fs = require('fs').promises;
const path = require('path');

const SCRIPT_DIR = path.join(process.cwd(), 'scripts');

// Define category patterns (order matters - first match wins)
const CATEGORIES = [
  {
    name: 'handoff',
    pattern: /^(accept|create|complete|handoff|transition|transfer)/,
    description: 'Handoff operations (LEAD→PLAN, PLAN→EXEC, etc.)',
  },
  {
    name: 'strategic-directives',
    pattern: /^(sd-|create-sd|update-sd|complete-sd|force-complete|query-sd)/,
    description: 'Strategic Directive (SD) management',
  },
  {
    name: 'user-stories',
    pattern: /^(create-user-stories|update-user-stories|add-.*-stories|stories-)/,
    description: 'User story management',
  },
  {
    name: 'leo-protocol',
    pattern: /^(activate-leo|add-.*-to-protocol|leo-|protocol-)/,
    description: 'LEO Protocol operations and configuration',
  },
  {
    name: 'sub-agents',
    pattern: /^(activate-sub|add-.*-subagent|update-.*-subagent|regenerate-.*-agent)/,
    description: 'Sub-agent management and updates',
  },
  {
    name: 'database',
    pattern: /^(migrate|migration|add-.*-columns?|create-.*-table|update-.*-table|query-|validate-.*-sync)/,
    description: 'Database migrations and schema updates',
  },
  {
    name: 'testing',
    pattern: /^(test|e2e|uat|playwright|coverage|validate-.*-tests?)/,
    description: 'Testing infrastructure and validation',
  },
  {
    name: 'github',
    pattern: /^(github|gh-|workflow|actions-|ci-cd)/,
    description: 'GitHub Actions and CI/CD',
  },
  {
    name: 'activation',
    pattern: /^activate-/,
    description: 'Feature and system activation',
  },
  {
    name: 'addition',
    pattern: /^add-/,
    description: 'Adding new features, sections, or capabilities',
  },
  {
    name: 'verification',
    pattern: /^(verify|validate|check)-/,
    description: 'Verification and validation scripts',
  },
  {
    name: 'retrospective',
    pattern: /^(retro|retrospective|lessons)/,
    description: 'Retrospective and lessons learned',
  },
  {
    name: 'documentation',
    pattern: /^(doc|docs|generate-.*-md|readme)/,
    description: 'Documentation generation',
  },
  {
    name: 'backlog',
    pattern: /^(backlog|add-.*-backlog)/,
    description: 'Backlog management',
  },
  {
    name: 'utility',
    pattern: /^(analyze|report|export|import|sync)/,
    description: 'Utility and helper scripts',
  },
];

async function analyzeScripts() {
  console.log('📊 Analyzing script organization...\n');

  try {
    // Read all files in scripts directory
    const files = await fs.readdir(SCRIPT_DIR);

    // Filter to executable scripts only
    const scripts = files.filter(file => {
      const ext = path.extname(file);
      return ['.js', '.mjs', '.cjs', '.sh'].includes(ext);
    });

    console.log(`Found ${scripts.length} executable scripts\n`);

    // Categorize scripts
    const categorized = new Map();
    const uncategorized = [];

    CATEGORIES.forEach(cat => categorized.set(cat.name, []));

    scripts.forEach(script => {
      let matched = false;

      for (const category of CATEGORIES) {
        if (category.pattern.test(script)) {
          categorized.get(category.name).push(script);
          matched = true;
          break; // First match wins
        }
      }

      if (!matched) {
        uncategorized.push(script);
      }
    });

    // Generate report
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('SCRIPT ORGANIZATION ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Category breakdown
    console.log('📁 CATEGORY BREAKDOWN:\n');

    const sortedCategories = Array.from(categorized.entries())
      .filter(([_, scripts]) => scripts.length > 0)
      .sort((a, b) => b[1].length - a[1].length);

    sortedCategories.forEach(([catName, scripts], index) => {
      const category = CATEGORIES.find(c => c.name === catName);
      const percentage = ((scripts.length / scripts.length) * 100).toFixed(1);

      console.log(`${index + 1}. ${catName.toUpperCase()} (${scripts.length} scripts)`);
      console.log(`   ${category.description}`);
      console.log(`   Examples: ${scripts.slice(0, 3).join(', ')}`);
      if (scripts.length > 3) {
        console.log(`   ... and ${scripts.length - 3} more`);
      }
      console.log('');
    });

    // Uncategorized
    if (uncategorized.length > 0) {
      console.log(`❓ UNCATEGORIZED (${uncategorized.length} scripts):\n`);
      uncategorized.slice(0, 10).forEach(script => {
        console.log(`   - ${script}`);
      });
      if (uncategorized.length > 10) {
        console.log(`   ... and ${uncategorized.length - 10} more\n`);
      }
      console.log('');
    }

    // Statistics
    const totalCategorized = sortedCategories.reduce((sum, [_, scripts]) => sum + scripts.length, 0);
    const coveragePercent = ((totalCategorized / scripts.length) * 100).toFixed(1);

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('STATISTICS:\n');
    console.log(`Total Scripts: ${scripts.length}`);
    console.log(`Categorized: ${totalCategorized} (${coveragePercent}%)`);
    console.log(`Uncategorized: ${uncategorized.length} (${(100 - coveragePercent).toFixed(1)}%)`);
    console.log(`Categories Used: ${sortedCategories.length}/${CATEGORIES.length}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Proposed folder structure
    console.log('📂 PROPOSED FOLDER STRUCTURE:\n');
    console.log('scripts/');
    sortedCategories.forEach(([catName, scripts]) => {
      console.log(`├── ${catName}/ (${scripts.length} scripts)`);
    });
    if (uncategorized.length > 0) {
      console.log(`├── uncategorized/ (${uncategorized.length} scripts)`);
    }
    console.log(`└── archive/ (for deprecated scripts)\n`);

    // Top 5 categories recommendation
    const top5 = sortedCategories.slice(0, 5);
    console.log('🎯 PRIORITY MIGRATION (Top 5 categories):\n');
    top5.forEach(([catName, scripts], index) => {
      console.log(`${index + 1}. ${catName}: ${scripts.length} scripts`);
    });
    console.log('');

    // Save detailed report
    const reportPath = path.join(SCRIPT_DIR, 'organization-analysis.json');
    const report = {
      total_scripts: scripts.length,
      total_categorized: totalCategorized,
      total_uncategorized: uncategorized.length,
      coverage_percent: parseFloat(coveragePercent),
      categories: Object.fromEntries(
        sortedCategories.map(([name, scripts]) => [
          name,
          {
            count: scripts.length,
            scripts: scripts.sort(),
          },
        ])
      ),
      uncategorized: uncategorized.sort(),
      timestamp: new Date().toISOString(),
    };

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`📄 Detailed report saved: ${reportPath}\n`);

    return report;
  } catch (error) {
    console.error('❌ Error analyzing scripts:', error.message);
    throw error;
  }
}

// Execute
if (require.main === module) {
  analyzeScripts()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { analyzeScripts };
