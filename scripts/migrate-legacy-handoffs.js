#!/usr/bin/env node

/**
 * MIGRATE LEGACY HANDOFFS TO DATABASE
 *
 * Imports all existing handoff JSON files into the database
 * and archives them to prevent future violations
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

class LegacyHandoffMigrator {
  constructor() {
    this.handoffFiles = [];
    this.migrationResults = {
      successful: [],
      failed: [],
      archived: []
    };
  }

  /**
   * Find all handoff JSON files
   */
  async findHandoffFiles() {
    console.log('🔍 Searching for Legacy Handoff Files');
    console.log('=' .repeat(60));

    const patterns = [
      /^handoff-.*\.json$/,
      /^handoff_.*\.json$/,
      /^.*-handoff.*\.json$/
    ];

    try {
      const files = await fs.readdir('.');

      for (const file of files) {
        for (const pattern of patterns) {
          if (pattern.test(file)) {
            this.handoffFiles.push(file);
            console.log(`📄 Found: ${file}`);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error scanning directory: ${error.message}`);
    }

    console.log(`\n📊 Total handoff files found: ${this.handoffFiles.length}`);
    return this.handoffFiles;
  }

  /**
   * Parse handoff type from filename
   */
  parseHandoffType(filename) {
    // Common patterns in our handoff files
    if (filename.includes('EXEC-PLAN')) return 'EXEC-to-PLAN';
    if (filename.includes('PLAN-EXEC')) return 'PLAN-to-EXEC';
    if (filename.includes('LEAD-PLAN')) return 'LEAD-to-PLAN';
    if (filename.includes('PLAN-LEAD')) return 'PLAN-to-LEAD';

    // Try to extract from pattern like handoff-FROM-TO
    const match = filename.match(/handoff[_-]?(\w+)[_-](\w+)/i);
    if (match) {
      return `${match[1]}-to-${match[2]}`;
    }

    return 'unknown';
  }

  /**
   * Parse SD ID from filename or content
   */
  parseSDId(filename, content) {
    // Try filename first
    const sdMatch = filename.match(/SD-([A-Z0-9]+)/);
    if (sdMatch) return sdMatch[0];

    // Check content
    if (content.sd_id) return content.sd_id;
    if (content.strategic_directive) return content.strategic_directive;
    if (content.sd) return content.sd;

    // Default
    return 'SD-UNKNOWN';
  }

  /**
   * Migrate a single handoff file
   */
  async migrateHandoffFile(filename) {
    console.log(`\n📦 Migrating: ${filename}`);
    console.log('-' .repeat(40));

    try {
      // Read file content
      const fileContent = await fs.readFile(filename, 'utf-8');
      let content;

      try {
        content = JSON.parse(fileContent);
      } catch (parseError) {
        console.error(`❌ Invalid JSON in ${filename}`);
        this.migrationResults.failed.push({
          file: filename,
          error: 'Invalid JSON'
        });
        return false;
      }

      // Parse metadata
      const handoffType = this.parseHandoffType(filename);
      const sdId = this.parseSDId(filename, content);

      // Extract agent information
      let fromAgent = 'UNKNOWN';
      let toAgent = 'UNKNOWN';

      if (handoffType !== 'unknown') {
        const [from, to] = handoffType.split('-to-');
        fromAgent = from;
        toAgent = to;
      } else if (content.from_agent && content.to_agent) {
        fromAgent = content.from_agent;
        toAgent = content.to_agent;
      }

      // Get file stats for timestamp
      const stats = await fs.stat(filename);

      // Prepare database record
      const handoffRecord = {
        from_agent: fromAgent,
        to_agent: toAgent,
        sd_id: sdId,
        handoff_type: handoffType,
        content: content,
        status: 'migrated',
        metadata: {
          original_filename: filename,
          migration_date: new Date().toISOString(),
          file_created: stats.birthtime,
          file_modified: stats.mtime
        },
        created_at: stats.birthtime || stats.mtime,
        updated_at: new Date().toISOString()
      };

      // Insert into database
      const { data, error } = await supabase
        .from('leo_handoff_executions')
        .insert(handoffRecord)
        .select()
        .single();

      if (error) {
        console.error(`❌ Database insertion failed: ${error.message}`);
        this.migrationResults.failed.push({
          file: filename,
          error: error.message
        });
        return false;
      }

      console.log(`✅ Migrated to database`);
      console.log(`   ID: ${data.id}`);
      console.log(`   Type: ${handoffType}`);
      console.log(`   SD: ${sdId}`);
      console.log(`   Agents: ${fromAgent} → ${toAgent}`);

      this.migrationResults.successful.push({
        file: filename,
        id: data.id,
        type: handoffType,
        sd: sdId
      });

      return true;

    } catch (error) {
      console.error(`❌ Migration failed: ${error.message}`);
      this.migrationResults.failed.push({
        file: filename,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Archive migrated files
   */
  async archiveFiles() {
    console.log('\n📁 Archiving Migrated Files');
    console.log('=' .repeat(60));

    // Create archive directory
    const archiveDir = 'archived-handoffs';

    try {
      await fs.mkdir(archiveDir, { recursive: true });
      console.log(`📁 Archive directory: ${archiveDir}`);
    } catch (error) {
      console.error(`❌ Failed to create archive directory: ${error.message}`);
      return;
    }

    // Move successfully migrated files
    for (const migration of this.migrationResults.successful) {
      try {
        const oldPath = migration.file;
        const newPath = path.join(archiveDir, migration.file);

        await fs.rename(oldPath, newPath);
        console.log(`📦 Archived: ${migration.file}`);

        this.migrationResults.archived.push(migration.file);
      } catch (error) {
        console.error(`⚠️  Failed to archive ${migration.file}: ${error.message}`);
      }
    }

    // Create archive manifest
    const manifest = {
      migration_date: new Date().toISOString(),
      total_files: this.handoffFiles.length,
      migrated: this.migrationResults.successful.length,
      archived: this.migrationResults.archived.length,
      failed: this.migrationResults.failed.length,
      files: {
        successful: this.migrationResults.successful,
        failed: this.migrationResults.failed
      }
    };

    const manifestPath = path.join(archiveDir, 'migration-manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`\n📋 Manifest saved: ${manifestPath}`);
  }

  /**
   * Generate migration report
   */
  generateReport() {
    console.log('\n📊 MIGRATION REPORT');
    console.log('=' .repeat(60));

    const total = this.handoffFiles.length;
    const successful = this.migrationResults.successful.length;
    const failed = this.migrationResults.failed.length;
    const archived = this.migrationResults.archived.length;

    console.log(`\n📈 Results:`);
    console.log(`   Files Found: ${total}`);
    console.log(`   ✅ Migrated: ${successful} (${((successful/total)*100).toFixed(1)}%)`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📦 Archived: ${archived}`);

    if (successful > 0) {
      console.log(`\n✅ Successfully Migrated:`);
      this.migrationResults.successful.forEach(m => {
        console.log(`   • ${m.file} → ${m.id.substring(0, 8)}... (${m.type})`);
      });
    }

    if (failed > 0) {
      console.log(`\n❌ Failed Migrations:`);
      this.migrationResults.failed.forEach(f => {
        console.log(`   • ${f.file}: ${f.error}`);
      });
    }

    // Log to compliance table
    this.logCompliance();
  }

  /**
   * Log migration to compliance table
   */
  async logCompliance() {
    try {
      await supabase
        .from('leo_protocol_compliance')
        .insert({
          check_type: 'legacy_handoff_migration',
          entity_type: 'system',
          entity_id: 'handoff_migration',
          compliant: this.migrationResults.failed.length === 0,
          violations: this.migrationResults.failed.length > 0
            ? { failed_files: this.migrationResults.failed }
            : null,
          recommendations: {
            action: 'Legacy handoffs migrated to database',
            successful: this.migrationResults.successful.length,
            failed: this.migrationResults.failed.length,
            archived: this.migrationResults.archived.length
          },
          enforced_by: 'legacy_handoff_migrator'
        });

      console.log('\n📊 Compliance record created');
    } catch (error) {
      console.error(`⚠️  Failed to log compliance: ${error.message}`);
    }
  }

  /**
   * Run the complete migration process
   */
  async run() {
    console.log('🚀 LEGACY HANDOFF MIGRATION SYSTEM');
    console.log('=' .repeat(60));
    console.log('Migrating file-based handoffs to database...\n');

    // Step 1: Find all handoff files
    await this.findHandoffFiles();

    if (this.handoffFiles.length === 0) {
      console.log('\n✅ No legacy handoff files found');
      console.log('   System is already compliant!');
      return;
    }

    // Step 2: Confirm migration
    console.log('\n⚠️  This will:');
    console.log('   1. Import all handoff files to the database');
    console.log('   2. Archive original files to archived-handoffs/');
    console.log('   3. Clean up the root directory');

    // Step 3: Migrate each file
    for (const file of this.handoffFiles) {
      await this.migrateHandoffFile(file);
    }

    // Step 4: Archive migrated files
    if (this.migrationResults.successful.length > 0) {
      await this.archiveFiles();
    }

    // Step 5: Generate report
    this.generateReport();

    console.log('\n' + '=' .repeat(60));
    console.log('✅ Migration Complete!');

    if (this.migrationResults.successful.length === this.handoffFiles.length) {
      console.log('🎉 All handoffs successfully migrated to database');
      console.log('🧹 Root directory cleaned of handoff files');
      console.log('📦 Original files archived for reference');
    } else {
      console.log(`⚠️  ${this.migrationResults.failed.length} files need manual review`);
    }
  }
}

// Execute migration
if (import.meta.url === `file://${process.argv[1]}`) {
  const migrator = new LegacyHandoffMigrator();
  migrator.run().catch(console.error);
}

export default LegacyHandoffMigrator;