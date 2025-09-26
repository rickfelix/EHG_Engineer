#!/usr/bin/env node

/**
 * DATABASE-FIRST ENFORCER
 *
 * Prevents LEO Protocol violations by enforcing database-only storage
 * for PRDs, handoffs, verification reports, and all work documents.
 *
 * This script provides checks and balances to prevent file creation
 * and ensures all agents comply with database-first principles.
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

class DatabaseFirstEnforcer {
  constructor() {
    this.violations = [];
    this.requiredTables = [
      'leo_handoff_executions',
      'product_requirements_v2',
      'strategic_directives_v2',
      'leo_verification_reports',
      'leo_protocol_compliance'
    ];

    this.prohibitedFilePatterns = [
      /^PRD-.*\.md$/,
      /^handoff-.*\.(md|json)$/,
      /^verification-.*\.(md|json)$/,
      /^LEAD-.*\.md$/,
      /^PLAN-.*\.md$/,
      /^EXEC-.*\.md$/,
      /^.*-Final-Approval-.*\.md$/,
      /^.*-Supervisor-Verification-.*\.md$/
    ];
  }

  /**
   * Check if required database tables exist
   */
  async checkDatabaseTables() {
    console.log('📊 Checking Required Database Tables');
    console.log('=' .repeat(60));

    const results = {
      existing: [],
      missing: []
    };

    for (const tableName of this.requiredTables) {
      try {
        const { count, error } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true });

        if (error) {
          results.missing.push(tableName);
          console.log(`❌ ${tableName}: Missing or inaccessible`);
        } else {
          results.existing.push(tableName);
          console.log(`✅ ${tableName}: Exists`);
        }
      } catch (err) {
        results.missing.push(tableName);
        console.log(`❌ ${tableName}: Error checking`);
      }
    }

    return results;
  }

  /**
   * Scan for prohibited files in the filesystem
   */
  async scanForProhibitedFiles() {
    console.log('\n🔍 Scanning for Prohibited Files');
    console.log('=' .repeat(60));

    const violations = [];
    const directories = ['.', 'scripts', 'database', 'ops', 'prds', 'docs'];

    for (const dir of directories) {
      try {
        const files = await fs.readdir(dir);

        for (const file of files) {
          // Check against prohibited patterns
          for (const pattern of this.prohibitedFilePatterns) {
            if (pattern.test(file)) {
              const fullPath = path.join(dir, file);
              violations.push(fullPath);
              console.log(`⚠️  VIOLATION: ${fullPath}`);
            }
          }
        }
      } catch (err) {
        // Directory might not exist, skip
      }
    }

    return violations;
  }

  /**
   * Create missing database tables
   */
  async createMissingTables(tables) {
    console.log('\n🔧 Creating Missing Tables');
    console.log('=' .repeat(60));

    const sqlStatements = {
      'leo_handoff_executions': `
        CREATE TABLE IF NOT EXISTS leo_handoff_executions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          from_agent VARCHAR(50) NOT NULL,
          to_agent VARCHAR(50) NOT NULL,
          sd_id VARCHAR(100),
          prd_id VARCHAR(100),
          handoff_type VARCHAR(100),
          content JSONB NOT NULL,
          status VARCHAR(50) DEFAULT 'pending_review',
          reviewed_by VARCHAR(100),
          review_date TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX idx_handoff_sd ON leo_handoff_executions(sd_id);
        CREATE INDEX idx_handoff_status ON leo_handoff_executions(status);
        CREATE INDEX idx_handoff_agents ON leo_handoff_executions(from_agent, to_agent);
      `,

      'leo_verification_reports': `
        CREATE TABLE IF NOT EXISTS leo_verification_reports (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          sd_id VARCHAR(100),
          prd_id VARCHAR(100),
          verification_type VARCHAR(50),
          agent VARCHAR(50),
          sub_agents_queried TEXT[],
          verdict VARCHAR(50),
          confidence_score INTEGER,
          requirements_met INTEGER,
          requirements_total INTEGER,
          critical_issues JSONB,
          warnings JSONB,
          recommendations JSONB,
          evidence JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX idx_verification_sd ON leo_verification_reports(sd_id);
        CREATE INDEX idx_verification_verdict ON leo_verification_reports(verdict);
      `,

      'leo_protocol_compliance': `
        CREATE TABLE IF NOT EXISTS leo_protocol_compliance (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          check_type VARCHAR(100),
          entity_type VARCHAR(50),
          entity_id VARCHAR(100),
          compliant BOOLEAN,
          violations JSONB,
          recommendations JSONB,
          enforced_at TIMESTAMPTZ DEFAULT NOW(),
          enforced_by VARCHAR(100)
        );

        CREATE INDEX idx_compliance_entity ON leo_protocol_compliance(entity_type, entity_id);
        CREATE INDEX idx_compliance_violations ON leo_protocol_compliance(compliant);
      `
    };

    for (const tableName of tables) {
      if (sqlStatements[tableName]) {
        console.log(`📋 Creating ${tableName}...`);

        // Write SQL to file for manual execution
        const sqlFile = `database/migrations/2025-09-24-${tableName.replace(/_/g, '-')}.sql`;
        await fs.writeFile(sqlFile, sqlStatements[tableName]);

        console.log(`   SQL saved to: ${sqlFile}`);
        console.log(`   Execute with: psql "$SUPABASE_POOLER_URL" -f ${sqlFile}`);
      }
    }
  }

  /**
   * Set up file system watchers to prevent violations
   */
  async setupFileWatcher() {
    console.log('\n👁️  Setting Up File System Monitor');
    console.log('=' .repeat(60));

    const watcherScript = `#!/usr/bin/env node

import { watch } from 'fs';
import path from 'path';

const prohibitedPatterns = ${JSON.stringify(this.prohibitedFilePatterns.map(p => p.source))};

console.log('🚨 DATABASE-FIRST MONITOR ACTIVE');
console.log('Watching for LEO Protocol violations...');

const directories = ['.', 'scripts', 'database', 'ops', 'prds', 'docs'];

directories.forEach(dir => {
  try {
    watch(dir, (eventType, filename) => {
      if (eventType === 'rename' && filename) {
        for (const pattern of prohibitedPatterns) {
          if (new RegExp(pattern).test(filename)) {
            console.error(\`\\n⛔ VIOLATION DETECTED: \${filename}\`);
            console.error('❌ This file violates LEO Protocol database-first principles!');
            console.error('📝 Required Action: Store in database, not as file');
            console.error('🔧 Use appropriate script: unified-handoff-system.js, add-prd-to-database.js, etc.');

            // Log to compliance table
            logViolation(dir, filename);
          }
        }
      }
    });
  } catch (err) {
    // Directory might not exist
  }
});

async function logViolation(dir, filename) {
  // Log violation to database for tracking
  const { createClient } = await import('@supabase/supabase-js');
  const dotenv = await import('dotenv');
  dotenv.config();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  await supabase.from('leo_protocol_compliance').insert({
    check_type: 'file_creation_violation',
    entity_type: 'file',
    entity_id: path.join(dir, filename),
    compliant: false,
    violations: {
      type: 'prohibited_file_pattern',
      file: filename,
      directory: dir,
      timestamp: new Date().toISOString()
    },
    enforced_by: 'file_system_monitor'
  });
}
`;

    await fs.writeFile('scripts/database-first-monitor.js', watcherScript);
    console.log('✅ File system monitor created: scripts/database-first-monitor.js');
    console.log('   Run with: node scripts/database-first-monitor.js');
  }

  /**
   * Create enforcement wrapper for all LEO operations
   */
  async createEnforcementWrapper() {
    console.log('\n🛡️  Creating Enforcement Wrapper');
    console.log('=' .repeat(60));

    const wrapperScript = `#!/usr/bin/env node

/**
 * ENFORCEMENT WRAPPER
 * Ensures all LEO operations go through database-first validation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class EnforcementWrapper {
  async validateOperation(operation, params) {
    const violations = [];

    // Check for file creation attempts
    if (operation.includes('create') || operation.includes('write')) {
      if (params.file_path && this.isProhibitedFile(params.file_path)) {
        violations.push({
          type: 'prohibited_file_creation',
          file: params.file_path,
          suggestion: 'Use database storage instead'
        });
      }
    }

    // Check for handoff creation
    if (operation.includes('handoff')) {
      const tableExists = await this.checkTable('leo_handoff_executions');
      if (!tableExists) {
        violations.push({
          type: 'missing_table',
          table: 'leo_handoff_executions',
          suggestion: 'Create table first using database-first-enforcer.js'
        });
      }
    }

    // Log compliance check
    await supabase.from('leo_protocol_compliance').insert({
      check_type: 'operation_validation',
      entity_type: 'operation',
      entity_id: operation,
      compliant: violations.length === 0,
      violations: violations.length > 0 ? violations : null,
      enforced_by: 'enforcement_wrapper'
    });

    return {
      allowed: violations.length === 0,
      violations
    };
  }

  isProhibitedFile(filePath) {
    const prohibited = [
      /PRD-.*\\.md$/,
      /handoff-.*\\.(md|json)$/,
      /verification-.*\\.(md|json)$/,
      /LEAD-.*\\.md$/,
      /PLAN-.*\\.md$/,
      /EXEC-.*\\.md$/
    ];

    return prohibited.some(pattern => pattern.test(filePath));
  }

  async checkTable(tableName) {
    const { error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    return !error;
  }
}

// Export for use in other scripts
export default EnforcementWrapper;

// CLI usage
if (import.meta.url === \`file://\${process.argv[1]}\`) {
  const wrapper = new EnforcementWrapper();
  const operation = process.argv[2];
  const params = JSON.parse(process.argv[3] || '{}');

  const result = await wrapper.validateOperation(operation, params);
  if (!result.allowed) {
    console.error('⛔ Operation blocked by enforcement wrapper:');
    result.violations.forEach(v => {
      console.error(\`   ❌ \${v.type}: \${v.suggestion}\`);
    });
    process.exit(1);
  }

  console.log('✅ Operation allowed');
}
`;

    await fs.writeFile('scripts/enforcement-wrapper.js', wrapperScript);
    console.log('✅ Enforcement wrapper created: scripts/enforcement-wrapper.js');
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport() {
    console.log('\n📊 Compliance Report');
    console.log('=' .repeat(60));

    const tables = await this.checkDatabaseTables();
    const files = await this.scanForProhibitedFiles();

    const report = {
      timestamp: new Date().toISOString(),
      database_compliance: {
        required_tables: this.requiredTables.length,
        existing_tables: tables.existing.length,
        missing_tables: tables.missing.length,
        compliance_rate: (tables.existing.length / this.requiredTables.length * 100).toFixed(1) + '%'
      },
      file_compliance: {
        violations_found: files.length,
        prohibited_files: files
      },
      recommendations: []
    };

    if (tables.missing.length > 0) {
      report.recommendations.push('Create missing database tables using the generated SQL files');
    }

    if (files.length > 0) {
      report.recommendations.push('Migrate prohibited files to database storage');
      report.recommendations.push('Delete or archive file-based handoffs and PRDs');
    }

    console.log('\n📈 Summary:');
    console.log(`   Database Compliance: ${report.database_compliance.compliance_rate}`);
    console.log(`   File Violations: ${report.file_compliance.violations_found}`);

    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      report.recommendations.forEach(rec => {
        console.log(`   • ${rec}`);
      });
    }

    return report;
  }

  async run() {
    console.log('🚀 DATABASE-FIRST ENFORCEMENT SYSTEM');
    console.log('=' .repeat(60));
    console.log('Ensuring LEO Protocol compliance...\n');

    // Check database tables
    const tableResults = await this.checkDatabaseTables();

    // Create missing tables if needed
    if (tableResults.missing.length > 0) {
      await this.createMissingTables(tableResults.missing);
    }

    // Scan for violations
    await this.scanForProhibitedFiles();

    // Set up monitoring
    await this.setupFileWatcher();

    // Create enforcement wrapper
    await this.createEnforcementWrapper();

    // Generate report
    const report = await this.generateComplianceReport();

    // Save report
    await supabase.from('leo_protocol_compliance').insert({
      check_type: 'full_compliance_audit',
      entity_type: 'system',
      entity_id: 'leo_protocol',
      compliant: tableResults.missing.length === 0 && report.file_compliance.violations_found === 0,
      violations: report,
      recommendations: report.recommendations,
      enforced_by: 'database_first_enforcer'
    });

    console.log('\n✅ Enforcement system ready!');
    console.log('=' .repeat(60));

    return report;
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const enforcer = new DatabaseFirstEnforcer();
  enforcer.run().catch(console.error);
}

export default DatabaseFirstEnforcer;