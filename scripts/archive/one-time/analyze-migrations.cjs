#!/usr/bin/env node
/**
 * Migration Analysis Script
 * Analyzes SQL migration files and categorizes them by database target
 *
 * Usage: node scripts/analyze-migrations.js
 */

const fs = require('fs');
const path = require('path');

// Keywords that indicate EHG_Engineer database (dedlbzhpgkmetvhbkyzq)
const EHG_ENGINEER_KEYWORDS = [
  'strategic_directives',
  'product_requirements',
  'retrospectives',
  'leo_protocols',
  'leo_sub_agents',
  'leo_handoff',
  'uat_test_cases',
  'uat_credentials',
  'test_failures',
  'directive_submissions',
  'sdip_',
  'sub_agent_execution',
  'agentic_reviews',
  'context_learning',
  'impact_analysis'
];

// Keywords that indicate EHG App database (liapbndqlqxdcgpwntbv)
const EHG_APP_KEYWORDS = [
  'companies',
  'portfolios',
  'ventures',
  'voice_conversations',
  'voice_usage_metrics',
  'voice_cached_responses'
];

/**
 * Analyze a SQL file and determine which database it belongs to
 */
function analyzeMigration(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8').toLowerCase();

    let engineerScore = 0;
    let appScore = 0;

    // Count keyword matches
    for (const keyword of EHG_ENGINEER_KEYWORDS) {
      if (content.includes(keyword)) {
        engineerScore++;
      }
    }

    for (const keyword of EHG_APP_KEYWORDS) {
      if (content.includes(keyword)) {
        appScore++;
      }
    }

    // Determine category
    let category = 'UNKNOWN';
    if (engineerScore > appScore) {
      category = 'EHG_ENGINEER';
    } else if (appScore > engineerScore) {
      category = 'EHG_APP';
    } else if (engineerScore === 0 && appScore === 0) {
      category = 'UNKNOWN';
    } else {
      category = 'MIXED';
    }

    return {
      filePath,
      category,
      engineerScore,
      appScore,
      size: fs.statSync(filePath).size
    };
  } catch (error) {
    console.error(`Error analyzing ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Find all SQL migration files in a directory
 */
function findMigrations(dir, excludeDirs = ['node_modules', 'archive', '.git']) {
  const migrations = [];

  function walk(currentDir) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          // Skip excluded directories
          if (!excludeDirs.includes(entry.name)) {
            walk(fullPath);
          }
        } else if (entry.isFile() && entry.name.endsWith('.sql')) {
          // Include migration files
          if (fullPath.includes('migration') || fullPath.includes('schema')) {
            migrations.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${currentDir}:`, error.message);
    }
  }

  walk(dir);
  return migrations;
}

/**
 * Main execution
 */
function main() {
  console.log('=== Migration Analysis Tool ===\n');

  const rootDir = path.join(__dirname, '..');
  const migrations = findMigrations(rootDir);

  console.log(`Found ${migrations.length} migration files\n`);

  const results = {
    EHG_ENGINEER: [],
    EHG_APP: [],
    MIXED: [],
    UNKNOWN: []
  };

  // Analyze each migration
  for (const migration of migrations) {
    const analysis = analyzeMigration(migration);
    if (analysis) {
      results[analysis.category].push(analysis);
    }
  }

  // Print summary
  console.log('=== Summary ===');
  console.log(`EHG_Engineer migrations: ${results.EHG_ENGINEER.length}`);
  console.log(`EHG App migrations: ${results.EHG_APP.length}`);
  console.log(`Mixed migrations: ${results.MIXED.length}`);
  console.log(`Unknown migrations: ${results.UNKNOWN.length}`);
  console.log('');

  // Print detailed results
  console.log('=== EHG_Engineer Database Migrations ===');
  results.EHG_ENGINEER.forEach(m => {
    const relativePath = path.relative(rootDir, m.filePath);
    console.log(`  ${relativePath} (score: ${m.engineerScore})`);
  });

  console.log('\n=== EHG App Database Migrations ===');
  results.EHG_APP.forEach(m => {
    const relativePath = path.relative(rootDir, m.filePath);
    console.log(`  ${relativePath} (score: ${m.appScore})`);
  });

  if (results.MIXED.length > 0) {
    console.log('\n=== MIXED Migrations (Need Manual Review) ===');
    results.MIXED.forEach(m => {
      const relativePath = path.relative(rootDir, m.filePath);
      console.log(`  ${relativePath} (engineer: ${m.engineerScore}, app: ${m.appScore})`);
    });
  }

  if (results.UNKNOWN.length > 0) {
    console.log('\n=== UNKNOWN Migrations (Need Manual Review) ===');
    results.UNKNOWN.forEach(m => {
      const relativePath = path.relative(rootDir, m.filePath);
      console.log(`  ${relativePath}`);
    });
  }

  // Save results to JSON
  const outputPath = path.join(rootDir, 'database/docs/migration-analysis.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nDetailed results saved to: database/docs/migration-analysis.json`);
}

if (require.main === module) {
  main();
}

module.exports = { analyzeMigration, findMigrations };
