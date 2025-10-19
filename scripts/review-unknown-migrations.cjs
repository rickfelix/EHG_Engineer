#!/usr/bin/env node
/**
 * Review Unknown Migrations
 * Analyzes files in manual_review directory and categorizes by database
 *
 * Usage: node scripts/review-unknown-migrations.cjs
 */

const fs = require('fs');
const path = require('path');

const MANUAL_REVIEW_DIR = path.join(__dirname, '../archive/migrations/manual_review');

// Keywords that indicate EHG_Engineer database
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
  'impact_analysis',
  'plan_supervisor',
  'vision_qa'
];

// Keywords that indicate EHG App database
const EHG_APP_KEYWORDS = [
  'companies',
  'portfolios',
  'ventures',
  'voice_conversations',
  'voice_usage_metrics',
  'voice_cached_responses'
];

/**
 * Analyze a SQL file
 */
function analyzeFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lowerContent = content.toLowerCase();

    let engineerScore = 0;
    let appScore = 0;
    const matches = {
      engineer: [],
      app: [],
      tables: [],
      operations: []
    };

    // Count keyword matches
    for (const keyword of EHG_ENGINEER_KEYWORDS) {
      if (lowerContent.includes(keyword)) {
        engineerScore++;
        matches.engineer.push(keyword);
      }
    }

    for (const keyword of EHG_APP_KEYWORDS) {
      if (lowerContent.includes(keyword)) {
        appScore++;
        matches.app.push(keyword);
      }
    }

    // Extract table names
    const tableMatches = content.match(/(?:CREATE TABLE|ALTER TABLE|INSERT INTO|DROP TABLE)\s+(\w+)/gi);
    if (tableMatches) {
      matches.tables = [...new Set(tableMatches.map(m =>
        m.replace(/(?:CREATE TABLE|ALTER TABLE|INSERT INTO|DROP TABLE)\s+/i, '').trim()
      ))];
    }

    // Extract operations
    if (content.match(/CREATE TABLE/i)) matches.operations.push('CREATE TABLE');
    if (content.match(/ALTER TABLE/i)) matches.operations.push('ALTER TABLE');
    if (content.match(/CREATE POLICY|ENABLE ROW LEVEL SECURITY/i)) matches.operations.push('RLS');
    if (content.match(/CREATE FUNCTION/i)) matches.operations.push('CREATE FUNCTION');
    if (content.match(/CREATE TRIGGER/i)) matches.operations.push('CREATE TRIGGER');
    if (content.match(/CREATE INDEX/i)) matches.operations.push('CREATE INDEX');
    if (content.match(/INSERT INTO/i)) matches.operations.push('INSERT INTO');

    // Determine category
    let category = 'UNKNOWN';
    let confidence = 'LOW';

    if (engineerScore > appScore) {
      category = 'EHG_ENGINEER';
      confidence = engineerScore >= 3 ? 'HIGH' : engineerScore >= 2 ? 'MEDIUM' : 'LOW';
    } else if (appScore > engineerScore) {
      category = 'EHG_APP';
      confidence = appScore >= 3 ? 'HIGH' : appScore >= 2 ? 'MEDIUM' : 'LOW';
    } else if (engineerScore === appScore && engineerScore > 0) {
      category = 'MIXED';
      confidence = 'MEDIUM';
    } else {
      // No keywords found, try to infer from operations
      category = 'UTILITY';
      confidence = 'LOW';
    }

    return {
      filePath,
      filename: path.basename(filePath),
      category,
      confidence,
      engineerScore,
      appScore,
      matches,
      size: fs.statSync(filePath).size,
      lineCount: content.split('\n').length
    };
  } catch (error) {
    console.error(`Error analyzing ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Generate human-readable report
 */
function generateReport(analyses) {
  const grouped = {
    EHG_ENGINEER: [],
    EHG_APP: [],
    MIXED: [],
    UTILITY: [],
    UNKNOWN: []
  };

  for (const analysis of analyses) {
    if (analysis) {
      grouped[analysis.category].push(analysis);
    }
  }

  console.log('=== Unknown Migrations Analysis ===\n');
  console.log(`Total files analyzed: ${analyses.filter(a => a).length}\n`);

  for (const [category, files] of Object.entries(grouped)) {
    if (files.length === 0) continue;

    console.log(`\n### ${category} (${files.length} files)\n`);

    // Sort by confidence
    files.sort((a, b) => {
      const confidenceOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      return (confidenceOrder[b.confidence] || 0) - (confidenceOrder[a.confidence] || 0);
    });

    for (const file of files) {
      console.log(`**${file.filename}**`);
      console.log(`  Confidence: ${file.confidence}`);
      console.log(`  Score: Engineer=${file.engineerScore}, App=${file.appScore}`);

      if (file.matches.engineer.length > 0) {
        console.log(`  Engineer keywords: ${file.matches.engineer.join(', ')}`);
      }
      if (file.matches.app.length > 0) {
        console.log(`  App keywords: ${file.matches.app.join(', ')}`);
      }
      if (file.matches.tables.length > 0) {
        console.log(`  Tables: ${file.matches.tables.slice(0, 5).join(', ')}${file.matches.tables.length > 5 ? '...' : ''}`);
      }
      if (file.matches.operations.length > 0) {
        console.log(`  Operations: ${file.matches.operations.join(', ')}`);
      }
      console.log('');
    }
  }

  return grouped;
}

/**
 * Generate categorization JSON
 */
function generateJSON(grouped, outputPath) {
  const summary = {
    generated: new Date().toISOString(),
    total_files: Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0),
    categories: {
      EHG_ENGINEER: grouped.EHG_ENGINEER.length,
      EHG_APP: grouped.EHG_APP.length,
      MIXED: grouped.MIXED.length,
      UTILITY: grouped.UTILITY.length,
      UNKNOWN: grouped.UNKNOWN.length
    },
    files: {}
  };

  for (const [category, files] of Object.entries(grouped)) {
    summary.files[category] = files.map(f => ({
      filename: f.filename,
      category: f.category,
      confidence: f.confidence,
      engineer_score: f.engineerScore,
      app_score: f.appScore,
      tables: f.matches.tables,
      operations: f.matches.operations,
      engineer_keywords: f.matches.engineer,
      app_keywords: f.matches.app
    }));
  }

  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
  console.log(`\nDetailed analysis saved to: ${outputPath}`);
}

/**
 * Main execution
 */
function main() {
  console.log('=== Reviewing Unknown Migrations ===\n');

  // Get all SQL files in manual_review
  const files = fs.readdirSync(MANUAL_REVIEW_DIR)
    .filter(f => f.endsWith('.sql') && f !== 'manifest.json')
    .map(f => path.join(MANUAL_REVIEW_DIR, f));

  console.log(`Found ${files.length} files to analyze\n`);

  // Analyze each file
  const analyses = files.map(analyzeFile);

  // Generate report
  const grouped = generateReport(analyses);

  // Generate JSON
  const outputPath = path.join(__dirname, '../database/docs/unknown-migrations-analysis.json');
  generateJSON(grouped, outputPath);

  // Summary
  console.log('\n=== Summary ===');
  console.log(`EHG_Engineer: ${grouped.EHG_ENGINEER.length} files`);
  console.log(`EHG App: ${grouped.EHG_APP.length} files`);
  console.log(`Mixed: ${grouped.MIXED.length} files`);
  console.log(`Utility: ${grouped.UTILITY.length} files`);
  console.log(`Unknown: ${grouped.UNKNOWN.length} files`);
  console.log('\nNext step: Review categorization and move files to appropriate directories');
}

if (require.main === module) {
  main();
}

module.exports = { analyzeFile };
