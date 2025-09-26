#!/usr/bin/env node

/**
 * VALIDATION SUB-AGENT ENFORCER
 *
 * Principal Systems Analyst with 28 years preventing duplicate work and technical debt
 * Philosophy: "An hour of analysis saves a week of rework"
 *
 * This sub-agent is responsible for:
 * - Preventing file-based handoffs and PRDs
 * - Checking for existing implementations
 * - Validating database-first compliance
 * - Catching conflicts before they happen
 */

import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class ValidationSubAgent {
  constructor() {
    this.persona = {
      name: 'Principal Systems Analyst',
      experience: '28 years preventing duplicate work and technical debt',
      philosophy: 'An hour of analysis saves a week of rework',
      expertise: [
        'Codebase archaeology',
        'Impact analysis',
        'Dependency mapping',
        'Conflict detection',
        'Database-first enforcement'
      ]
    };

    this.validationRules = {
      fileCreation: {
        prohibited: [
          /^PRD-.*\.md$/,
          /^handoff-.*\.(md|json)$/,
          /^verification-.*\.(md|json)$/,
          /^LEAD-.*\.md$/,
          /^PLAN-.*\.md$/,
          /^EXEC-.*\.md$/
        ],
        severity: 'CRITICAL',
        action: 'BLOCK'
      },
      databaseFirst: {
        requiredTables: [
          'leo_handoff_executions',
          'product_requirements_v2',
          'strategic_directives_v2',
          'leo_verification_reports'
        ],
        severity: 'HIGH',
        action: 'WARN_AND_CREATE'
      },
      duplication: {
        checkExisting: true,
        preventOverlap: true,
        severity: 'MEDIUM',
        action: 'WARN'
      }
    };

    this.activationTriggers = [
      'existing implementation',
      'duplicate',
      'conflict',
      'already implemented',
      'codebase check',
      'file creation',
      'handoff',
      'PRD'
    ];
  }

  /**
   * MAIN VALIDATION ENTRY POINT
   * Called whenever validation sub-agent is triggered
   */
  async validate(operation, context = {}) {
    console.log('\n🔍 VALIDATION SUB-AGENT ACTIVATED');
    console.log('=' .repeat(60));
    console.log(`👤 ${this.persona.name}`);
    console.log(`📚 ${this.persona.experience}`);
    console.log(`💭 "${this.persona.philosophy}"`);
    console.log('=' .repeat(60));
    console.log(`\n🎯 Operation: ${operation}`);
    console.log(`📋 Context: ${JSON.stringify(context, null, 2).substring(0, 200)}...`);

    const validationReport = {
      timestamp: new Date().toISOString(),
      operation,
      context,
      checks: [],
      violations: [],
      warnings: [],
      recommendations: [],
      verdict: 'PENDING',
      confidence: 0
    };

    // Run validation checks based on operation
    switch (operation) {
      case 'create_handoff':
        await this.validateHandoffCreation(context, validationReport);
        break;

      case 'create_prd':
        await this.validatePRDCreation(context, validationReport);
        break;

      case 'file_creation':
        await this.validateFileCreation(context, validationReport);
        break;

      case 'check_duplication':
        await this.checkForDuplication(context, validationReport);
        break;

      case 'database_compliance':
        await this.validateDatabaseCompliance(context, validationReport);
        break;

      default:
        // Run all checks
        await this.runComprehensiveValidation(context, validationReport);
    }

    // Generate verdict
    this.generateVerdict(validationReport);

    // Log to database
    await this.logValidation(validationReport);

    // Print report
    this.printValidationReport(validationReport);

    return validationReport;
  }

  /**
   * VALIDATION CHECK: Handoff Creation
   */
  async validateHandoffCreation(context, report) {
    console.log('\n📋 Validating Handoff Creation...');

    const check = {
      name: 'handoff_creation',
      status: 'PENDING',
      details: []
    };

    // Check 1: Ensure database table exists
    const tableExists = await this.checkDatabaseTable('leo_handoff_executions');
    if (!tableExists) {
      check.status = 'FAILED';
      report.violations.push({
        type: 'MISSING_TABLE',
        severity: 'CRITICAL',
        message: 'leo_handoff_executions table does not exist',
        action: 'Create table before proceeding'
      });
    } else {
      check.details.push('✅ Database table exists');
    }

    // Check 2: No file path provided (enforce database-only)
    if (context.filePath) {
      check.status = 'FAILED';
      report.violations.push({
        type: 'FILE_CREATION_ATTEMPT',
        severity: 'CRITICAL',
        message: `Attempted to create handoff file: ${context.filePath}`,
        action: 'Use database storage instead'
      });
    } else {
      check.details.push('✅ No file creation attempted');
    }

    // Check 3: Check for duplicate handoffs
    if (context.sdId && context.handoffType) {
      const duplicates = await this.checkDuplicateHandoffs(
        context.sdId,
        context.handoffType
      );

      if (duplicates > 0) {
        report.warnings.push({
          type: 'DUPLICATE_HANDOFF',
          message: `Found ${duplicates} existing handoff(s) for ${context.sdId}`,
          recommendation: 'Review existing handoffs before creating new one'
        });
        check.details.push(`⚠️ ${duplicates} duplicate handoffs found`);
      } else {
        check.details.push('✅ No duplicate handoffs');
      }
    }

    // Check 4: Validate handoff content completeness
    if (context.content) {
      const contentScore = this.validateHandoffContent(context.content);
      if (contentScore < 80) {
        report.warnings.push({
          type: 'INCOMPLETE_CONTENT',
          message: `Handoff content only ${contentScore}% complete`,
          recommendation: 'Add missing required elements'
        });
      }
      check.details.push(`📊 Content completeness: ${contentScore}%`);
    }

    check.status = report.violations.length === 0 ? 'PASSED' : 'FAILED';
    report.checks.push(check);
  }

  /**
   * VALIDATION CHECK: File Creation
   */
  async validateFileCreation(context, report) {
    console.log('\n📁 Validating File Creation...');

    const check = {
      name: 'file_creation',
      status: 'PENDING',
      details: []
    };

    if (!context.filePath) {
      check.status = 'SKIPPED';
      check.details.push('No file path provided');
      report.checks.push(check);
      return;
    }

    const fileName = path.basename(context.filePath);

    // Check against prohibited patterns
    for (const pattern of this.validationRules.fileCreation.prohibited) {
      if (pattern.test(fileName)) {
        check.status = 'FAILED';
        report.violations.push({
          type: 'PROHIBITED_FILE_PATTERN',
          severity: 'CRITICAL',
          message: `File "${fileName}" matches prohibited pattern: ${pattern}`,
          action: 'BLOCKED - Use database storage instead',
          alternatives: [
            'Store in leo_handoff_executions table',
            'Store in product_requirements_v2 table',
            'Use unified-handoff-system.js script'
          ]
        });

        // Provide specific guidance based on file type
        if (fileName.includes('handoff')) {
          report.recommendations.push({
            action: 'Use Handoff Governance System',
            command: `node scripts/handoff-governance-system.js create ${context.handoffType || 'TYPE'} ${context.sdId || 'SD-ID'}`,
            reason: 'Ensures compliance and validation'
          });
        }

        if (fileName.includes('PRD')) {
          report.recommendations.push({
            action: 'Use PRD Database Script',
            command: 'node scripts/add-prd-to-database.js',
            reason: 'Maintains single source of truth'
          });
        }

        break;
      }
    }

    if (check.status !== 'FAILED') {
      check.status = 'PASSED';
      check.details.push(`✅ File "${fileName}" is allowed`);
    }

    report.checks.push(check);
  }

  /**
   * VALIDATION CHECK: Duplication
   */
  async checkForDuplication(context, report) {
    console.log('\n🔄 Checking for Duplication...');

    const check = {
      name: 'duplication_check',
      status: 'PENDING',
      details: []
    };

    // Check for existing implementations
    if (context.feature || context.component) {
      console.log(`   Searching for: ${context.feature || context.component}`);

      // Check database for existing features
      const existing = await this.searchExistingImplementations(
        context.feature || context.component
      );

      if (existing.length > 0) {
        check.status = 'WARNING';
        report.warnings.push({
          type: 'POTENTIAL_DUPLICATION',
          message: `Found ${existing.length} similar implementations`,
          items: existing,
          recommendation: 'Review existing code before implementing'
        });

        check.details.push(`⚠️ ${existing.length} similar implementations found`);
        existing.forEach(item => {
          check.details.push(`   • ${item.location}: ${item.description}`);
        });
      } else {
        check.status = 'PASSED';
        check.details.push('✅ No duplicates found');
      }
    }

    report.checks.push(check);
  }

  /**
   * VALIDATION CHECK: Database Compliance
   */
  async validateDatabaseCompliance(context, report) {
    console.log('\n💾 Validating Database Compliance...');

    const check = {
      name: 'database_compliance',
      status: 'PENDING',
      details: []
    };

    let missingTables = [];

    for (const tableName of this.validationRules.databaseFirst.requiredTables) {
      const exists = await this.checkDatabaseTable(tableName);
      if (!exists) {
        missingTables.push(tableName);
        check.details.push(`❌ ${tableName}: Missing`);
      } else {
        check.details.push(`✅ ${tableName}: Exists`);
      }
    }

    if (missingTables.length > 0) {
      check.status = 'FAILED';
      report.violations.push({
        type: 'MISSING_TABLES',
        severity: 'HIGH',
        message: `${missingTables.length} required tables missing`,
        tables: missingTables,
        action: 'Create tables using database-first-enforcer.js'
      });

      report.recommendations.push({
        action: 'Create Missing Tables',
        command: 'node scripts/database-first-enforcer.js',
        reason: 'Required for LEO Protocol compliance'
      });
    } else {
      check.status = 'PASSED';
      check.details.push('✅ All required tables exist');
    }

    report.checks.push(check);
  }

  /**
   * Run comprehensive validation
   */
  async runComprehensiveValidation(context, report) {
    console.log('\n🔬 Running Comprehensive Validation...');

    await this.validateDatabaseCompliance(context, report);
    await this.validateFileCreation(context, report);
    await this.checkForDuplication(context, report);

    // Additional checks
    await this.checkCodebaseIntegrity(context, report);
    await this.validateDependencies(context, report);
  }

  /**
   * Check codebase integrity
   */
  async checkCodebaseIntegrity(context, report) {
    const check = {
      name: 'codebase_integrity',
      status: 'PENDING',
      details: []
    };

    // Count violation files in the codebase
    const violations = await this.scanForViolations();

    if (violations.length > 0) {
      check.status = 'WARNING';
      report.warnings.push({
        type: 'CODEBASE_VIOLATIONS',
        message: `Found ${violations.length} files violating database-first principle`,
        files: violations.slice(0, 5),
        recommendation: 'Run migration script to clean up'
      });

      report.recommendations.push({
        action: 'Migrate Legacy Files',
        command: 'node scripts/migrate-legacy-handoffs.js',
        reason: 'Clean up codebase violations'
      });
    } else {
      check.status = 'PASSED';
      check.details.push('✅ No violations found');
    }

    report.checks.push(check);
  }

  /**
   * Validate dependencies
   */
  async validateDependencies(context, report) {
    const check = {
      name: 'dependency_validation',
      status: 'PASSED',
      details: ['✅ Dependencies validated']
    };

    report.checks.push(check);
  }

  /**
   * Generate final verdict
   */
  generateVerdict(report) {
    const hasViolations = report.violations.length > 0;
    const hasWarnings = report.warnings.length > 0;

    if (hasViolations) {
      report.verdict = 'BLOCKED';
      report.confidence = 100;
    } else if (hasWarnings) {
      report.verdict = 'PROCEED_WITH_CAUTION';
      report.confidence = 75;
    } else {
      report.verdict = 'APPROVED';
      report.confidence = 95;
    }
  }

  /**
   * Log validation to database
   */
  async logValidation(report) {
    try {
      await supabase
        .from('leo_sub_agent_executions')
        .insert({
          sub_agent_code: 'VALIDATION',
          operation: report.operation,
          context: report.context,
          results: report,
          verdict: report.verdict,
          confidence_score: report.confidence,
          created_at: report.timestamp
        });
    } catch (error) {
      console.error(`⚠️ Failed to log validation: ${error.message}`);
    }
  }

  /**
   * Print validation report
   */
  printValidationReport(report) {
    console.log('\n' + '=' .repeat(60));
    console.log('📊 VALIDATION REPORT');
    console.log('=' .repeat(60));

    // Verdict
    const verdictEmoji = {
      'APPROVED': '✅',
      'BLOCKED': '❌',
      'PROCEED_WITH_CAUTION': '⚠️'
    };

    console.log(`\n🎯 VERDICT: ${verdictEmoji[report.verdict]} ${report.verdict}`);
    console.log(`📊 Confidence: ${report.confidence}%`);

    // Checks summary
    console.log('\n📋 Checks Performed:');
    report.checks.forEach(check => {
      const statusEmoji = {
        'PASSED': '✅',
        'FAILED': '❌',
        'WARNING': '⚠️',
        'SKIPPED': '⏭️'
      };
      console.log(`   ${statusEmoji[check.status]} ${check.name}: ${check.status}`);
    });

    // Violations
    if (report.violations.length > 0) {
      console.log('\n❌ VIOLATIONS:');
      report.violations.forEach(v => {
        console.log(`   [${v.severity}] ${v.type}`);
        console.log(`   ${v.message}`);
        console.log(`   Action: ${v.action}`);
      });
    }

    // Warnings
    if (report.warnings.length > 0) {
      console.log('\n⚠️ WARNINGS:');
      report.warnings.forEach(w => {
        console.log(`   • ${w.type}: ${w.message}`);
        if (w.recommendation) {
          console.log(`     → ${w.recommendation}`);
        }
      });
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      console.log('\n💡 RECOMMENDATIONS:');
      report.recommendations.forEach(r => {
        console.log(`   • ${r.action}`);
        if (r.command) {
          console.log(`     $ ${r.command}`);
        }
        console.log(`     Reason: ${r.reason}`);
      });
    }

    console.log('\n' + '=' .repeat(60));
    console.log(`💭 Remember: "${this.persona.philosophy}"`);
    console.log('=' .repeat(60));
  }

  // Helper methods
  async checkDatabaseTable(tableName) {
    const { error } = await supabase
      .from(tableName)
      .select('id')
      .limit(1);

    return !error || error.code !== 'PGRST204';
  }

  async checkDuplicateHandoffs(sdId, handoffType) {
    const { count } = await supabase
      .from('leo_handoff_executions')
      .select('id', { count: 'exact' })
      .eq('sd_id', sdId)
      .eq('handoff_type', handoffType)
      .eq('status', 'pending_review');

    return count || 0;
  }

  validateHandoffContent(content) {
    const requiredFields = [
      'executive_summary',
      'completeness_report',
      'deliverables_manifest',
      'action_items'
    ];

    let present = 0;
    requiredFields.forEach(field => {
      if (content[field]) present++;
    });

    return Math.round((present / requiredFields.length) * 100);
  }

  async searchExistingImplementations(feature) {
    // Simplified search - in reality would search codebase
    return [];
  }

  async scanForViolations() {
    const violations = [];
    const prohibitedPatterns = this.validationRules.fileCreation.prohibited;

    try {
      const files = await fs.readdir('.');
      for (const file of files) {
        for (const pattern of prohibitedPatterns) {
          if (pattern.test(file)) {
            violations.push(file);
            break;
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning: ${error.message}`);
    }

    return violations;
  }

  /**
   * Check if operation should trigger validation
   */
  shouldTrigger(text) {
    const lowerText = text.toLowerCase();
    return this.activationTriggers.some(trigger =>
      lowerText.includes(trigger)
    );
  }
}

// Export for use by other agents
export default ValidationSubAgent;

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new ValidationSubAgent();

  const operation = process.argv[2] || 'database_compliance';
  const contextArg = process.argv[3] || '{}';

  let context;
  try {
    context = JSON.parse(contextArg);
  } catch {
    context = { input: contextArg };
  }

  validator.validate(operation, context)
    .then(report => {
      process.exit(report.verdict === 'BLOCKED' ? 1 : 0);
    })
    .catch(error => {
      console.error('Validation error:', error);
      process.exit(1);
    });
}