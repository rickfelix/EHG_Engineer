#!/usr/bin/env node

/**
 * Batch Audit All PRD Scripts
 *
 * Scans all PRD creation scripts and validates them against the schema.
 * Generates a comprehensive report of issues across the codebase.
 *
 * Usage:
 *   node scripts/audit-all-prd-scripts.js
 *   node scripts/audit-all-prd-scripts.js --fix-common  # Auto-fix common issues
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import globPkg from 'glob';
const { glob } = globPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Schema field definitions
const VALID_FIELDS = new Set([
  'id', 'directive_id', 'sd_uuid', 'sd_id', 'title', 'version', 'status', 'category', 'priority',
  'executive_summary', 'business_context', 'technical_context',
  'functional_requirements', 'non_functional_requirements', 'technical_requirements',
  'system_architecture', 'data_model', 'api_specifications', 'ui_ux_requirements',
  'implementation_approach', 'technology_stack', 'dependencies',
  'test_scenarios', 'acceptance_criteria', 'performance_requirements',
  'plan_checklist', 'exec_checklist', 'validation_checklist',
  'progress', 'phase', 'phase_progress',
  'risks', 'constraints', 'assumptions',
  'stakeholders', 'approved_by', 'approval_date',
  'planned_start', 'planned_end', 'actual_start', 'actual_end',
  'created_at', 'updated_at', 'created_by', 'updated_by',
  'metadata', 'content', 'evidence_appendix', 'backlog_items',
  'planning_section', 'reasoning_analysis', 'complexity_analysis',
  'reasoning_depth', 'confidence_score', 'research_confidence_score'
]);

const INVALID_FIELDS = new Set([
  'ui_components', 'ui_components_summary', 'strategic_directive_id', 'prd_id',
  'problem_statement', 'objectives', 'user_stories', 'technical_architecture',
  'database_changes', 'test_strategy', 'deployment_plan', 'success_metrics',
  'estimated_effort_hours', 'target_completion_date', 'risks_and_mitigations',
  'documentation_requirements', 'complexity_score'
]);

const FIELD_MAPPINGS = {
  'strategic_directive_id': 'sd_uuid',
  'prd_id': 'id',
  'problem_statement': 'business_context',
  'technical_architecture': 'system_architecture',
  'risks_and_mitigations': 'risks',
  'target_completion_date': 'planned_end'
};

function findPRDScripts() {
  const scriptsDir = path.join(__dirname);

  // Find all JS files that mention 'product_requirements_v2' or 'prd'
  const patterns = [
    'create-prd-*.js',
    'create-*-prd.js',
    'add-prd-*.js',
    'generate-prd-*.js',
    'update-prd-*.js',
    'insert-prd-*.js',
    'populate-prd-*.js',
    '*-prd-*.js'
  ];

  const files = new Set();

  for (const pattern of patterns) {
    const matches = glob.sync(pattern, {
      cwd: scriptsDir,
      ignore: ['node_modules/**', 'audit-all-prd-scripts.js']
    });
    if (Array.isArray(matches)) {
      matches.forEach(f => files.add(path.join(scriptsDir, f)));
    }
  }

  return Array.from(files);
}

function extractPRDFields(fileContent) {
  const fields = new Set();
  const lines = fileContent.split('\n');

  // Look for patterns like:
  // - field: value
  // - field,
  // - 'field':
  // - "field":
  // - .update({ field: ... })
  // - .insert({ field: ... })

  const patterns = [
    /^\s*([a-z_]+):\s*/gi,                   // field: value
    /['"]([a-z_]+)['"]\s*:/gi,               // "field": value
    /\b([a-z_]+)\s*:/gi,                     // generic field: pattern
    /\.update\(\{([^}]+)\}/gi,               // .update({ fields })
    /\.insert\(\{([^}]+)\}/gi                // .insert({ fields })
  ];

  lines.forEach(line => {
    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;

    patterns.forEach(pattern => {
      const matches = line.matchAll(pattern);
      for (const match of matches) {
        const field = match[1];
        if (field && field.length > 2 && field.length < 50) {
          fields.add(field);
        }
      }
    });
  });

  return Array.from(fields);
}

function analyzeScript(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const extractedFields = extractPRDFields(content);

  const issues = {
    invalidFields: [],
    missingCriticalFields: [],
    deprecatedFields: [],
    suggestions: []
  };

  // Check for invalid fields
  extractedFields.forEach(field => {
    if (INVALID_FIELDS.has(field)) {
      issues.invalidFields.push({
        field,
        suggestion: FIELD_MAPPINGS[field] || `Move to metadata.${field}`
      });
    }
  });

  // Check for deprecated fields
  if (extractedFields.includes('directive_id') && !extractedFields.includes('sd_uuid')) {
    issues.deprecatedFields.push({
      field: 'directive_id',
      suggestion: 'Should also populate sd_uuid field'
    });
  }

  // Check for missing critical fields
  const hasSdUuid = extractedFields.includes('sd_uuid') ||
                    content.includes('sd_uuid') ||
                    content.includes('uuid_id');

  if (!hasSdUuid && content.includes('product_requirements_v2')) {
    issues.missingCriticalFields.push('sd_uuid');
  }

  // Check for ui_components usage
  if (content.includes('ui_components') && !content.includes('metadata.ui_components')) {
    issues.suggestions.push('Uses ui_components field - should move to metadata.ui_components');
  }

  return {
    file: path.relative(process.cwd(), filePath),
    totalFields: extractedFields.length,
    issues,
    hasIssues: issues.invalidFields.length > 0 ||
               issues.missingCriticalFields.length > 0 ||
               issues.deprecatedFields.length > 0
  };
}

function main() {
  console.log('\n🔍 AUDITING ALL PRD SCRIPTS');
  console.log('='.repeat(70));
  console.log('');

  const scripts = findPRDScripts();
  console.log(`Found ${scripts.length} PRD scripts to audit\n`);

  const results = scripts.map(analyzeScript);

  // Separate into categories
  const scriptsWithIssues = results.filter(r => r.hasIssues);
  const cleanScripts = results.filter(r => !r.hasIssues);

  // Summary statistics
  console.log('📊 AUDIT SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total Scripts: ${results.length}`);
  console.log(`✅ Clean: ${cleanScripts.length} (${Math.round(cleanScripts.length/results.length*100)}%)`);
  console.log(`⚠️  With Issues: ${scriptsWithIssues.length} (${Math.round(scriptsWithIssues.length/results.length*100)}%)`);
  console.log('');

  // Count issues by type
  const allInvalidFields = scriptsWithIssues.flatMap(r => r.issues.invalidFields);
  const fieldCounts = {};
  allInvalidFields.forEach(({ field }) => {
    fieldCounts[field] = (fieldCounts[field] || 0) + 1;
  });

  console.log('🚨 TOP INVALID FIELDS USED');
  console.log('='.repeat(70));
  Object.entries(fieldCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([field, count]) => {
      const suggestion = FIELD_MAPPINGS[field] || 'metadata.' + field;
      console.log(`  ${field.padEnd(30)} ${count} scripts → ${suggestion}`);
    });
  console.log('');

  // Critical issues
  const criticalIssues = scriptsWithIssues.filter(r =>
    r.issues.missingCriticalFields.length > 0
  );

  if (criticalIssues.length > 0) {
    console.log('🔴 CRITICAL ISSUES (Missing sd_uuid)');
    console.log('='.repeat(70));
    criticalIssues.forEach(r => {
      console.log(`  ❌ ${r.file}`);
    });
    console.log('');
  }

  // Detailed issues
  if (scriptsWithIssues.length > 0 && scriptsWithIssues.length <= 20) {
    console.log('📋 DETAILED ISSUES BY SCRIPT');
    console.log('='.repeat(70));

    scriptsWithIssues.forEach(result => {
      console.log(`\n📄 ${result.file}`);

      if (result.issues.invalidFields.length > 0) {
        console.log('  Invalid Fields:');
        result.issues.invalidFields.forEach(({ field, suggestion }) => {
          console.log(`    - ${field} → ${suggestion}`);
        });
      }

      if (result.issues.missingCriticalFields.length > 0) {
        console.log('  Missing Critical Fields:');
        result.issues.missingCriticalFields.forEach(field => {
          console.log(`    - ${field} (CRITICAL for handoff validation)`);
        });
      }

      if (result.issues.deprecatedFields.length > 0) {
        console.log('  Deprecated Fields:');
        result.issues.deprecatedFields.forEach(({ field, suggestion }) => {
          console.log(`    - ${field} → ${suggestion}`);
        });
      }

      if (result.issues.suggestions.length > 0) {
        console.log('  Suggestions:');
        result.issues.suggestions.forEach(suggestion => {
          console.log(`    - ${suggestion}`);
        });
      }
    });
  } else if (scriptsWithIssues.length > 20) {
    console.log(`\n⚠️  Too many scripts with issues (${scriptsWithIssues.length}) - showing top 20\n`);
    scriptsWithIssues.slice(0, 20).forEach(result => {
      const issueCount = result.issues.invalidFields.length +
                        result.issues.missingCriticalFields.length;
      console.log(`  ${result.file} (${issueCount} issues)`);
    });
  }

  // Recommendations
  console.log('\n💡 RECOMMENDATIONS');
  console.log('='.repeat(70));

  if (criticalIssues.length > 0) {
    console.log(`1. Fix ${criticalIssues.length} scripts missing sd_uuid field`);
    console.log('   - Add sd_uuid fetch from strategic_directives_v2');
    console.log('   - See add-prd-to-database.js lines 76-91 for pattern');
  }

  if (fieldCounts['strategic_directive_id']) {
    console.log(`2. Replace strategic_directive_id with sd_uuid in ${fieldCounts['strategic_directive_id']} scripts`);
  }

  if (fieldCounts['ui_components']) {
    console.log(`3. Move ui_components to metadata in ${fieldCounts['ui_components']} scripts`);
  }

  console.log('\n4. Use prd-schema-validator.js for all new PRD scripts');
  console.log('5. Consider adding pre-commit hook for schema validation');

  // Export results to JSON
  const reportPath = path.join(__dirname, '../docs/prd-audit-results.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      totalScripts: results.length,
      cleanScripts: cleanScripts.length,
      scriptsWithIssues: scriptsWithIssues.length,
      criticalIssues: criticalIssues.length
    },
    topInvalidFields: Object.entries(fieldCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([field, count]) => ({ field, count, suggestion: FIELD_MAPPINGS[field] })),
    scriptsWithIssues: scriptsWithIssues.map(r => ({
      file: r.file,
      invalidFields: r.issues.invalidFields,
      missingCriticalFields: r.issues.missingCriticalFields,
      deprecatedFields: r.issues.deprecatedFields
    }))
  }, null, 2));

  console.log(`\n📄 Full report saved to: ${path.relative(process.cwd(), reportPath)}`);
  console.log('');

  // Exit code
  process.exit(scriptsWithIssues.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('❌ Audit failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
