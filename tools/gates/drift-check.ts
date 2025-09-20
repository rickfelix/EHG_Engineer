#!/usr/bin/env node

/**
 * Drift Checker for LEO Protocol Compliance
 *
 * Purpose: Detect filesystem drift and boundary violations
 * Runs in CI to prevent ghost artifacts and ensure database-first architecture
 *
 * Exit codes:
 * 0 - No drift detected
 * 1 - Critical drift found (blocks CI)
 * 2 - Configuration error
 */

import { createClient } from '@supabase/supabase-js';
import { globby } from 'globby';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { exit } from 'process';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
  exit(2);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Severity mapping for different violation types
const SEVERITY_MAP = {
  'prds/*.md': 'critical',              // Blocks CI
  'prds/**/*.md': 'critical',           // Blocks CI
  'handoffs/**/*.md': 'critical',       // Blocks CI
  'docs/**/handoff-*.md': 'critical',   // Blocks CI
  'gates/**/*.json': 'warning',         // Log only
  'reviews/**/*.md': 'warning',         // Log only
  'reports/subagents/**': 'warning',    // Log only
  'subagent-results/**/*': 'warning',   // Log only
} as const;

// Drift detection patterns
const FORBIDDEN_PATTERNS = {
  // PRDs must be in database only
  prd_files: {
    patterns: ['prds/**/*.md', 'prds/**/*.txt'],
    severity: 'critical' as const,
    message: 'PRD files detected in filesystem. LEO v4.1.2 requires database-only PRD storage.',
    remediation: 'Run: node scripts/add-prd-to-database.js && rm prds/*.md'
  },

  // Handoffs must be in database only
  handoff_files: {
    patterns: ['handoffs/**/*.md', 'docs/**/handoff-*.md'],
    severity: 'critical' as const,
    message: 'Handoff files detected in filesystem. Use database handoff tracking.',
    remediation: 'Migrate handoffs to leo_handoff_tracking table'
  },

  // Gate review files should not exist
  gate_files: {
    patterns: ['gates/**/*.json', 'reviews/**/*.md'],
    severity: 'warning' as const,  // Changed to warning (non-blocking)
    message: 'Gate review files detected. Use leo_gate_reviews table.',
    remediation: 'Store gate reviews in database'
  },

  // Sub-agent reports must be in database
  subagent_reports: {
    patterns: ['reports/subagents/**/*', 'subagent-results/**/*'],
    severity: 'warning' as const,  // Changed to warning (non-blocking)
    message: 'Sub-agent report files detected. Use sub_agent_executions table.',
    remediation: 'Store sub-agent results in database'
  },

  // Check for boundary violations in imports
  boundary_violations: {
    patterns: [],  // Will check programmatically
    severity: 'critical' as const,
    message: 'Cross-domain imports detected between LEO Engineering and EHG App.',
    remediation: 'Refactor to respect module boundaries'
  }
};

// Allowlist patterns (whitelist for documentation/examples)
const ALLOWLIST_PATTERNS = [
  'docs/**/*.md',              // Documentation is allowed
  'docs/examples/**/*.md',     // Example PRDs for documentation
  'README.md',                 // Root readme allowed
  'CLAUDE.md',                 // Agent instructions allowed
  'templates/**/*.md',         // Templates allowed
  'database/schema/*.sql',     // SQL migrations allowed
  '.github/**/*.yml',          // GitHub workflows allowed
  '**/*.example.md',           // Any example files
  '**/*.template.md',          // Any template files
];

interface DriftResult {
  type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  files: string[];
  message: string;
  remediation: string;
}

interface ComplianceAlert {
  alert_type: 'filesystem_drift' | 'boundary_violation' | 'missing_artifact';
  severity: 'info' | 'warning' | 'error' | 'critical';
  source: string;
  message: string;
  payload: any;
}

/**
 * Get git context for CI/PR tracking
 */
function getGitContext() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const actor = process.env.GITHUB_ACTOR || execSync('git config user.name', { encoding: 'utf8' }).trim() || 'unknown';
    const prNumber = process.env.GITHUB_PR_NUMBER || process.env.PULL_REQUEST_NUMBER || null;

    return { branch, commit, actor, prNumber };
  } catch {
    return {
      branch: 'unknown',
      commit: 'unknown',
      actor: process.env.USER || 'unknown',
      prNumber: null
    };
  }
}

/**
 * Check if file is allowlisted
 */
function isAllowlisted(file: string): boolean {
  const minimatch = require('minimatch');
  return ALLOWLIST_PATTERNS.some(pattern => minimatch(file, pattern));
}

/**
 * Check for forbidden file patterns
 */
async function checkForbiddenPatterns(): Promise<DriftResult[]> {
  const results: DriftResult[] = [];

  for (const [key, config] of Object.entries(FORBIDDEN_PATTERNS)) {
    if (config.patterns.length === 0) continue;

    const files = await globby(config.patterns, {
      ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
      gitignore: true
    });

    // Filter out allowlisted files
    const violatingFiles = files.filter(f => !isAllowlisted(f));

    if (violatingFiles.length > 0) {
      results.push({
        type: key,
        severity: config.severity,
        files: violatingFiles,
        message: config.message,
        remediation: config.remediation
      });
    }
  }

  return results;
}

/**
 * Check for boundary violations in imports
 */
async function checkBoundaryViolations(): Promise<DriftResult[]> {
  const results: DriftResult[] = [];
  
  // LEO Engineering files
  const leoFiles = await globby([
    'scripts/leo*.js',
    'lib/leo/**/*.js',
    'lib/validation/**/*.js',
    'tools/**/*.{js,ts}'
  ]);
  
  // EHG App files
  const appFiles = await globby([
    'src/**/*.{js,jsx,ts,tsx}',
    'lib/venture/**/*.js',
    'lib/portfolio/**/*.js'
  ]);
  
  const violations: string[] = [];
  
  // Check LEO files for app imports
  for (const file of leoFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const importRegex = /import\s+.*\s+from\s+['"]([^'"]+)['"]/g;
    const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
    
    const imports = [
      ...Array.from(content.matchAll(importRegex), m => m[1]),
      ...Array.from(content.matchAll(requireRegex), m => m[1])
    ];
    
    for (const imp of imports) {
      if (imp.includes('/venture/') || imp.includes('/portfolio/') || imp.includes('/src/')) {
        violations.push(`${file} imports from EHG App: ${imp}`);
      }
    }
  }
  
  // Check App files for LEO imports
  for (const file of appFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const importRegex = /import\s+.*\s+from\s+['"]([^'"]+)['"]/g;
    const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
    
    const imports = [
      ...Array.from(content.matchAll(importRegex), m => m[1]),
      ...Array.from(content.matchAll(requireRegex), m => m[1])
    ];
    
    for (const imp of imports) {
      if (imp.includes('/leo/') || imp.includes('/validation/') || imp.includes('scripts/leo')) {
        violations.push(`${file} imports from LEO Engineering: ${imp}`);
      }
    }
  }
  
  if (violations.length > 0) {
    results.push({
      type: 'boundary_violations',
      severity: 'critical',
      files: violations,
      message: FORBIDDEN_PATTERNS.boundary_violations.message,
      remediation: FORBIDDEN_PATTERNS.boundary_violations.remediation
    });
  }
  
  return results;
}

/**
 * Store drift alerts in database with git context
 */
async function storeDriftAlerts(driftResults: DriftResult[]): Promise<void> {
  const gitContext = getGitContext();

  for (const drift of driftResults) {
    const alert: ComplianceAlert = {
      alert_type: drift.type.includes('boundary') ? 'boundary_violation' : 'filesystem_drift',
      severity: drift.severity,
      source: 'drift-check',
      message: drift.message,
      payload: {
        files: drift.files,
        remediation: drift.remediation,
        timestamp: new Date().toISOString(),
        git: gitContext,  // Include branch, commit, actor, prNumber
        environment: {
          ci: process.env.CI === 'true',
          github_action: process.env.GITHUB_ACTION || null,
          github_run_id: process.env.GITHUB_RUN_ID || null
        }
      }
    };

    const { error } = await supabase
      .from('compliance_alerts')
      .insert(alert);

    if (error) {
      console.error(`⚠️  Failed to store alert in database: ${error.message}`);
    }
  }
}

/**
 * Main drift detection
 */
async function main(): Promise<void> {
  console.log('🔍 LEO Protocol Drift Checker v1.0.0');
  console.log('━'.repeat(50));
  
  // Check for forbidden patterns
  const forbiddenResults = await checkForbiddenPatterns();
  
  // Check for boundary violations
  const boundaryResults = await checkBoundaryViolations();
  
  // Combine all results
  const allResults = [...forbiddenResults, ...boundaryResults];
  
  // Store alerts in database
  if (allResults.length > 0) {
    await storeDriftAlerts(allResults);
  }
  
  // Report results
  let hasCritical = false;
  let hasError = false;
  
  if (allResults.length === 0) {
    console.log('✅ No drift detected. System is compliant with LEO v4.1.2');
  } else {
    console.log(`\n⚠️  Drift Detection Results:`);
    console.log('━'.repeat(50));
    
    for (const result of allResults) {
      const icon = result.severity === 'critical' ? '🚨' : 
                   result.severity === 'error' ? '❌' :
                   result.severity === 'warning' ? '⚠️' : 'ℹ️';
      
      console.log(`\n${icon} [${result.severity.toUpperCase()}] ${result.type}`);
      console.log(`   ${result.message}`);
      console.log(`   Files: ${result.files.length} detected`);
      
      if (result.files.length <= 5) {
        result.files.forEach(f => console.log(`     - ${f}`));
      } else {
        result.files.slice(0, 3).forEach(f => console.log(`     - ${f}`));
        console.log(`     ... and ${result.files.length - 3} more`);
      }
      
      console.log(`   📋 Remediation: ${result.remediation}`);
      
      if (result.severity === 'critical') hasCritical = true;
      if (result.severity === 'error') hasError = true;
    }
    
    console.log('\n' + '━'.repeat(50));
  }
  
  // Summary
  const criticalCount = allResults.filter(r => r.severity === 'critical').length;
  const errorCount = allResults.filter(r => r.severity === 'error').length;
  const warningCount = allResults.filter(r => r.severity === 'warning').length;
  
  console.log('\n📊 Summary:');
  console.log(`   Critical: ${criticalCount}`);
  console.log(`   Errors: ${errorCount}`);
  console.log(`   Warnings: ${warningCount}`);
  
  // Exit with appropriate code
  if (hasCritical) {
    console.log('\n❌ CI BLOCKED: Critical drift detected. Fix before proceeding.');
    exit(1);
  } else if (hasError) {
    console.log('\n⚠️  Errors detected but not blocking CI. Please address soon.');
    exit(0);  // Don't block CI for non-critical errors
  } else {
    console.log('\n✅ Drift check passed.');
    exit(0);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Drift checker failed:', error);
    exit(2);
  });
}

export { checkForbiddenPatterns, checkBoundaryViolations, storeDriftAlerts };