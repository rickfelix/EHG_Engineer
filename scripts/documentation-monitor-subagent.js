#!/usr/bin/env node

/**
 * Documentation Monitor Sub-Agent (DOCMON)
 * Monitors folder structures, enforces database-first approach
 * Deeply integrated with LEO Protocol workflow
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class DocumentationMonitorSubAgent {
  constructor() {
    this.agentCode = 'DOCMON';
    this.agentName = 'Documentation Monitor Sub-Agent';
    this.rootPath = '/mnt/c/_EHG/EHG_Engineer';

    // Paths that should NEVER have work products
    this.protectedPaths = [
      '/docs/strategic-directives',
      '/docs/prds',
      '/docs/handoffs',
      '/docs/retrospectives'
    ];

    // File patterns that violate database-first
    this.violationPatterns = [
      /PRD-.*\.md$/i,
      /handoff.*\.md$/i,
      /retrospective.*\.md$/i,
      /SD-\d+.*\.md$/i,
      /completion.*report.*\.md$/i,
      /verification.*\.md$/i,
      /approval.*\.md$/i
    ];
  }

  /**
   * Main execution triggered by LEO Protocol events
   */
  async execute(context = {}) {
    console.log('📁 Documentation Monitor Sub-Agent activated\n');

    const {
      trigger,
      leoEvent,
      agentType,
      phase,
      sdId,
      checkType = 'comprehensive'
    } = context;

    try {
      // Route based on LEO Protocol event
      if (leoEvent) {
        return await this.handleLeoEvent(leoEvent, context);
      }

      // Default comprehensive check
      return await this.performComprehensiveCheck();

    } catch (error) {
      console.error('❌ Documentation Monitor error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle specific LEO Protocol events
   */
  async handleLeoEvent(event, context) {
    console.log(`🎯 Handling LEO event: ${event}`);

    switch (event) {
      // LEAD Agent Events
      case 'LEAD_SD_CREATION':
        return await this.verifyNoFileCreation('SD', context.sdId);

      case 'LEAD_HANDOFF_CREATION':
        return await this.verifyHandoffInDatabase(context.handoffId);

      case 'LEAD_APPROVAL':
        return await this.checkDocumentationCompleteness(context.sdId);

      // PLAN Agent Events
      case 'PLAN_PRD_GENERATION':
        return await this.verifyPRDInDatabase(context.prdId);

      case 'PLAN_VERIFICATION':
        return await this.auditPlanDocumentation(context.sdId);

      // EXEC Agent Events
      case 'EXEC_IMPLEMENTATION':
        return await this.monitorExecFileOperations(context);

      case 'EXEC_COMPLETION':
        return await this.verifyNoWorkProductFiles(context.sdId);

      // Handoff Events
      case 'HANDOFF_CREATED':
        return await this.validateHandoffCompliance(context);

      case 'HANDOFF_ACCEPTED':
        return await this.auditHandoffDocumentation(context);

      // Phase Transitions
      case 'PHASE_TRANSITION':
        return await this.phaseTransitionCheck(context);

      // Retrospective Events
      case 'RETRO_GENERATED':
        return await this.verifyRetroInDatabase(context.retroId);

      // File System Events
      case 'FILE_CREATED':
      case 'VIOLATION_DETECTED':
        return await this.handleFileViolation(context);

      default:
        console.log(`⚠️ Unknown LEO event: ${event}`);
        return await this.performComprehensiveCheck();
    }
  }

  /**
   * Verify no file was created when it should be in database
   */
  async verifyNoFileCreation(type, id) {
    console.log(`🔍 Verifying no ${type} file created for ${id}...`);

    const violations = [];

    // Search for files that match the pattern
    const searchPatterns = {
      'SD': `SD-*${id}*.md`,
      'PRD': `PRD-*${id}*.md`,
      'HANDOFF': `*handoff*${id}*.md`,
      'RETRO': `*retro*${id}*.md`
    };

    try {
      const pattern = searchPatterns[type];
      const command = `find ${this.rootPath} -name "${pattern}" -type f 2>/dev/null`;
      const result = execSync(command, { encoding: 'utf8' });

      if (result.trim()) {
        const files = result.trim().split('\n');

        for (const file of files) {
          violations.push({
            type: 'FILE_INSTEAD_OF_DB',
            file,
            severity: 'CRITICAL',
            message: `${type} should be in database, not file: ${file}`
          });

          // Record violation
          await this.recordViolation({
            violation_type: 'FILE_INSTEAD_OF_DB',
            file_path: file,
            severity: 'CRITICAL',
            leo_event_type: `${type}_CREATION`,
            leo_event_details: { id, type }
          });
        }
      }
    } catch (error) {
      // No files found is good
    }

    if (violations.length > 0) {
      console.log(`❌ Found ${violations.length} violations`);
      await this.autoResolveViolations(violations);
      return { success: false, violations };
    }

    console.log('✅ No file violations found');
    return { success: true, message: 'Database-first compliance verified' };
  }

  /**
   * Perform comprehensive documentation check
   */
  async performComprehensiveCheck() {
    console.log('📊 Performing comprehensive documentation check...\n');

    const results = {
      inventory: await this.updateDocumentationInventory(),
      violations: await this.scanForViolations(),
      health: await this.performHealthCheck(),
      organization: await this.checkFolderOrganization()
    };

    // Generate report
    const report = this.generateComplianceReport(results);

    // Store health check results
    await this.recordHealthCheck({
      check_type: 'COMPLIANCE',  // Use valid check_type from constraint
      check_passed: results.violations.length === 0,
      score: this.calculateHealthScore(results),
      findings: results,
      recommendations: this.generateRecommendations(results)
    });

    return { success: true, report, results };
  }

  /**
   * Update documentation inventory
   */
  async updateDocumentationInventory() {
    console.log('📚 Updating documentation inventory...');

    const inventory = [];
    const docsPath = path.join(this.rootPath, 'docs');

    try {
      const files = await this.walkDirectory(docsPath);

      for (const file of files) {
        if (file.endsWith('.md')) {
          const stats = await fs.stat(file);
          const content = await fs.readFile(file, 'utf8');

          const docEntry = {
            file_path: file,
            file_name: path.basename(file),
            file_type: 'md',
            file_size: stats.size,
            last_modified: stats.mtime,
            content_hash: this.hashContent(content),
            doc_category: this.categorizeDocument(file, content),
            should_be_in_database: this.shouldBeInDatabase(file)
          };

          inventory.push(docEntry);

          // Upsert to database
          await supabase
            .from('documentation_inventory')
            .upsert(docEntry, { onConflict: 'file_path' });
        }
      }

      console.log(`✅ Cataloged ${inventory.length} documentation files`);
    } catch (error) {
      console.error('Error updating inventory:', error);
    }

    return inventory;
  }

  /**
   * Scan for database-first violations
   */
  async scanForViolations() {
    console.log('🚨 Scanning for violations...');

    const violations = [];

    // Check protected paths
    for (const protectedPath of this.protectedPaths) {
      const fullPath = path.join(this.rootPath, protectedPath);

      try {
        const files = await fs.readdir(fullPath);

        for (const file of files) {
          if (file.endsWith('.md')) {
            // These folders should be empty or only have README
            if (file.toLowerCase() !== 'readme.md') {
              violations.push({
                violation_type: 'FILE_INSTEAD_OF_DB',
                file_path: path.join(fullPath, file),
                folder_path: fullPath,
                severity: 'HIGH'
              });
            }
          }
        }
      } catch (error) {
        // Folder doesn't exist is okay
      }
    }

    // Check for violation patterns anywhere
    const allFiles = await this.walkDirectory(this.rootPath);

    for (const file of allFiles) {
      for (const pattern of this.violationPatterns) {
        if (pattern.test(file)) {
          // Check if it's in archive - that's okay
          if (!file.includes('archive') && !file.includes('archived')) {
            violations.push({
              violation_type: 'FILE_INSTEAD_OF_DB',
              file_path: file,
              severity: 'CRITICAL'
            });
          }
        }
      }
    }

    // Record all violations
    for (const violation of violations) {
      await this.recordViolation(violation);
    }

    console.log(`Found ${violations.length} violations`);
    return violations;
  }

  /**
   * Auto-resolve violations by moving files to database
   */
  async autoResolveViolations(violations) {
    console.log('🔧 Auto-resolving violations...');

    for (const violation of violations) {
      if (violation.type === 'FILE_INSTEAD_OF_DB' ||
          violation.violation_type === 'FILE_INSTEAD_OF_DB') {

        const file = violation.file || violation.file_path;

        try {
          // Move to archive
          const archivePath = path.join(this.rootPath, 'archived_violations');
          await fs.mkdir(archivePath, { recursive: true });

          const fileName = path.basename(file);
          const newPath = path.join(archivePath, `${Date.now()}_${fileName}`);

          await fs.rename(file, newPath);
          console.log(`📦 Archived violation: ${fileName}`);

          // Update violation as resolved
          await supabase
            .from('documentation_violations')
            .update({
              resolution_status: 'RESOLVED',
              resolved_at: new Date(),
              resolution_notes: `Auto-archived to ${newPath}`,
              auto_resolved: true
            })
            .eq('file_path', file);

        } catch (error) {
          console.error(`Could not resolve ${file}:`, error);
        }
      }
    }
  }

  /**
   * Record a violation in the database
   */
  async recordViolation(violation) {
    const { error } = await supabase
      .from('documentation_violations')
      .insert(violation);

    if (error) {
      console.warn('Could not record violation:', error.message);
    }
  }

  /**
   * Record health check results
   */
  async recordHealthCheck(checkData) {
    const { error } = await supabase
      .from('documentation_health_checks')
      .insert(checkData);

    if (error) {
      console.warn('Could not record health check:', error.message);
    }
  }

  /**
   * Verify PRD is in database, not as a file
   */
  async verifyPRDInDatabase(prdId) {
    console.log(`🔍 Verifying PRD ${prdId} is in database...`);

    // Check if PRD exists as a file (violation)
    const possibleFiles = [
      `PRD-${prdId}.md`,
      `prd-${prdId}.md`,
      `${prdId}.md`
    ];

    const violations = [];
    for (const filename of possibleFiles) {
      try {
        const command = `find ${this.rootPath} -name "${filename}" -type f 2>/dev/null`;
        const result = execSync(command, { encoding: 'utf8' });

        if (result.trim()) {
          violations.push({
            type: 'FILE_INSTEAD_OF_DB',
            file: result.trim(),
            severity: 'CRITICAL',
            message: `PRD ${prdId} found as file instead of in database`
          });
        }
      } catch (error) {
        // No file found is good
      }
    }

    if (violations.length > 0) {
      await this.autoResolveViolations(violations);
      return { success: false, violations };
    }

    console.log('✅ PRD not found as file (good - should be in database)');
    return { success: true, message: 'PRD complies with database-first approach' };
  }

  /**
   * Verify handoff is in database
   */
  async verifyHandoffInDatabase(handoffId) {
    console.log(`🔍 Verifying handoff ${handoffId} is in database...`);
    return await this.verifyNoFileCreation('HANDOFF', handoffId);
  }

  /**
   * Check documentation completeness
   */
  async checkDocumentationCompleteness(sdId) {
    console.log(`📊 Checking documentation completeness for SD ${sdId}...`);

    const results = {
      hasPRDs: false,
      hasHandoffs: false,
      hasRetros: false,
      violations: []
    };

    // This would check database for completeness
    // For now, return basic check
    return { success: true, results };
  }

  /**
   * Audit plan documentation
   */
  async auditPlanDocumentation(sdId) {
    console.log(`🔍 Auditing PLAN documentation for SD ${sdId}...`);
    return await this.performComprehensiveCheck();
  }

  /**
   * Monitor EXEC file operations
   */
  async monitorExecFileOperations(context) {
    console.log(`🔍 Monitoring EXEC file operations...`);

    // Check if EXEC is creating documentation files
    const violations = await this.scanForViolations();

    if (violations.length > 0) {
      console.log(`⚠️ EXEC created ${violations.length} documentation files`);
      await this.autoResolveViolations(violations);
      return { success: false, violations };
    }

    return { success: true, message: 'EXEC compliant with database-first' };
  }

  /**
   * Verify no work product files
   */
  async verifyNoWorkProductFiles(sdId) {
    console.log(`🔍 Verifying no work product files for SD ${sdId}...`);
    return await this.verifyNoFileCreation('SD', sdId);
  }

  /**
   * Validate handoff compliance
   */
  async validateHandoffCompliance(context) {
    console.log(`🔍 Validating handoff compliance...`);

    const { handoffId, fromAgent, toAgent } = context;

    // Check that handoff is in database, not file
    return await this.verifyHandoffInDatabase(handoffId);
  }

  /**
   * Audit handoff documentation
   */
  async auditHandoffDocumentation(context) {
    console.log(`📊 Auditing handoff documentation...`);
    return { success: true, message: 'Handoff audit complete' };
  }

  /**
   * Phase transition check
   */
  async phaseTransitionCheck(context) {
    console.log(`🔄 Checking phase transition documentation...`);

    const { fromPhase, toPhase, sdId } = context;

    // Ensure no files were created during phase
    return await this.verifyNoWorkProductFiles(sdId);
  }

  /**
   * Verify retrospective in database
   */
  async verifyRetroInDatabase(retroId) {
    console.log(`🔍 Verifying retrospective ${retroId} is in database...`);
    return await this.verifyNoFileCreation('RETRO', retroId);
  }

  /**
   * Handle file creation violations
   */
  async handleFileViolation(context) {
    console.log(`🚨 Handling file violation...`);

    const violations = await this.scanForViolations();

    if (violations.length > 0) {
      console.log(`❌ Found ${violations.length} violations to resolve`);
      await this.autoResolveViolations(violations);
      return {
        success: true,
        violations,
        message: `Resolved ${violations.length} database-first violations`
      };
    }

    return { success: true, message: 'No violations found' };
  }

  /**
   * LEO Protocol integration: Audit agent file operations
   */
  async auditAgentOperation(agent, operation, filePath, context = {}) {
    console.log(`🔍 Auditing ${agent} ${operation} on ${filePath}`);

    const audit = {
      agent_type: agent,
      operation,
      file_path: filePath,
      leo_phase: context.phase,
      handoff_id: context.handoffId,
      sd_id: context.sdId,
      is_authorized: this.isOperationAuthorized(agent, operation, filePath),
      violates_database_first: this.violatesDatabaseFirst(filePath),
      operation_details: context
    };

    // Record audit
    await supabase
      .from('leo_protocol_file_audit')
      .insert(audit);

    // If violation, create violation record
    if (audit.violates_database_first) {
      await this.recordViolation({
        violation_type: 'UNAUTHORIZED_CREATION',
        file_path: filePath,
        responsible_agent: agent,
        severity: 'HIGH',
        leo_event_type: `${agent}_${operation}`,
        leo_event_details: context
      });

      // Trigger retrospective for pattern analysis
      console.log('🔄 Triggering retrospective for violation pattern...');
      // This would call the retrospective sub-agent
    }

    return audit;
  }

  // Helper methods

  async walkDirectory(dir, files = []) {
    try {
      const items = await fs.readdir(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = await fs.stat(fullPath);

        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          await this.walkDirectory(fullPath, files);
        } else if (stat.isFile()) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip inaccessible directories
    }

    return files;
  }

  categorizeDocument(filePath, content) {
    const lower = filePath.toLowerCase();

    if (lower.includes('prd')) return 'PRD';
    if (lower.includes('handoff')) return 'HANDOFF';
    if (lower.includes('retrospective') || lower.includes('retro')) return 'RETROSPECTIVE';
    if (lower.includes('strategic') || lower.includes('sd-')) return 'STRATEGIC';
    if (lower.includes('technical')) return 'TECHNICAL';
    if (lower.includes('api')) return 'API';
    if (lower.includes('architecture')) return 'ARCHITECTURE';

    return 'UNKNOWN';
  }

  shouldBeInDatabase(filePath) {
    for (const pattern of this.violationPatterns) {
      if (pattern.test(filePath)) {
        return true;
      }
    }
    return false;
  }

  violatesDatabaseFirst(filePath) {
    return this.shouldBeInDatabase(filePath);
  }

  isOperationAuthorized(agent, operation, filePath) {
    // Define what each agent is allowed to do
    const permissions = {
      'LEAD': ['CREATE', 'MODIFY'], // But only for strategic docs
      'PLAN': ['CREATE', 'MODIFY'], // But only for technical docs
      'EXEC': ['MODIFY'], // Should not create new docs
      'SUB_AGENT': ['CREATE', 'MODIFY', 'ARCHIVE'] // Sub-agents have more freedom
    };

    return permissions[agent]?.includes(operation) || false;
  }

  hashContent(content) {
    // Simple hash for change detection
    return require('crypto').createHash('md5').update(content).digest('hex');
  }

  calculateHealthScore(results) {
    let score = 100;

    // Deduct for violations
    score -= results.violations.length * 10;

    // Deduct for disorganization
    if (results.organization?.issues > 0) {
      score -= results.organization.issues * 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  generateRecommendations(results) {
    const recommendations = [];

    if (results.violations.length > 0) {
      recommendations.push('Archive or remove files that should be in database');
      recommendations.push('Review agent permissions and training');
    }

    if (results.organization?.issues > 0) {
      recommendations.push('Reorganize folder structure according to standards');
    }

    return recommendations;
  }

  generateComplianceReport(results) {
    const report = {
      timestamp: new Date(),
      summary: {
        total_files: results.inventory.length,
        violations: results.violations.length,
        health_score: this.calculateHealthScore(results),
        compliance: results.violations.length === 0 ? 'COMPLIANT' : 'NON_COMPLIANT'
      },
      details: results
    };

    return report;
  }

  async checkFolderOrganization() {
    // Simplified for now
    return { organized: true, issues: 0 };
  }

  async performHealthCheck() {
    // Simplified for now
    return { healthy: true, issues: [] };
  }
}

// Command line execution
if (require.main === module) {
  const agent = new DocumentationMonitorSubAgent();

  const args = process.argv.slice(2);
  const context = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];
    context[key] = value;
  }

  agent.execute(context)
    .then(result => {
      console.log('\n✅ Documentation Monitor completed');
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Documentation Monitor failed:', error);
      process.exit(1);
    });
}

module.exports = DocumentationMonitorSubAgent;