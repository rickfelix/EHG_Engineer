#!/usr/bin/env node

/**
 * PRD Filesystem to Database Migration
 *
 * One-time migration to move PRD markdown files to database
 * Completes PR-4 requirement for LEO Protocol v4.1.2
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface PRDMetadata {
  id: string;
  title: string;
  strategic_directive_id?: string;
  status: 'draft' | 'in_review' | 'approved' | 'active' | 'archived';
  version: string;
  created_at: string;
  updated_at: string;
}

interface MigrationResult {
  migrated: string[];
  failed: string[];
  deleted: string[];
  errors: Record<string, string>;
}

/**
 * Parse PRD markdown file to extract metadata and content
 */
async function parsePRDFile(filePath: string): Promise<{
  metadata: PRDMetadata;
  content: string;
  sections: Record<string, any>;
}> {
  const fileContent = await fs.readFile(filePath, 'utf-8');
  const fileName = path.basename(filePath, '.md');

  // Extract metadata from frontmatter if present
  const frontmatterMatch = fileContent.match(/^---\n([\s\S]*?)\n---/);
  let metadata: Partial<PRDMetadata> = {};
  let mainContent = fileContent;

  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    mainContent = fileContent.replace(frontmatterMatch[0], '').trim();

    // Parse YAML-like frontmatter
    frontmatter.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length) {
        const value = valueParts.join(':').trim();
        metadata[key.trim() as keyof PRDMetadata] = value.replace(/^["']|["']$/g, '');
      }
    });
  }

  // Extract sections based on markdown headers
  const sections: Record<string, any> = {};
  const sectionRegex = /^##\s+(.+)$/gm;
  let match;
  const sectionStarts: Array<{ title: string; start: number }> = [];

  while ((match = sectionRegex.exec(mainContent)) !== null) {
    sectionStarts.push({
      title: match[1].trim(),
      start: match.index + match[0].length
    });
  }

  // Extract section content
  for (let i = 0; i < sectionStarts.length; i++) {
    const section = sectionStarts[i];
    const nextStart = sectionStarts[i + 1]?.start || mainContent.length;
    const content = mainContent.substring(section.start, nextStart).trim();

    // Map section titles to expected PRD structure
    const sectionKey = section.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

    sections[sectionKey] = content;
  }

  // Extract title from first H1 or filename
  const titleMatch = mainContent.match(/^#\s+(.+)$/m);
  const title = metadata.title || (titleMatch ? titleMatch[1] : fileName);

  // Build complete metadata
  const completeMetadata: PRDMetadata = {
    id: metadata.id || fileName,
    title,
    strategic_directive_id: metadata.strategic_directive_id,
    status: metadata.status || 'draft',
    version: metadata.version || '1.0.0',
    created_at: metadata.created_at || new Date().toISOString(),
    updated_at: metadata.updated_at || new Date().toISOString()
  };

  return {
    metadata: completeMetadata,
    content: mainContent,
    sections
  };
}

/**
 * Check if PRD already exists in database
 */
async function prdExistsInDatabase(prdId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('prds')
    .select('id')
    .eq('id', prdId)
    .single();

  return !error && !!data;
}

/**
 * Migrate single PRD file to database
 */
async function migratePRD(filePath: string): Promise<void> {
  console.log(`  📄 Processing: ${path.basename(filePath)}`);

  const { metadata, content, sections } = await parsePRDFile(filePath);

  // Check if already exists
  if (await prdExistsInDatabase(metadata.id)) {
    console.log(`    ⚠️  Already in database: ${metadata.id}`);

    // Update existing record with latest content
    const { error } = await supabase
      .from('prds')
      .update({
        content,
        metadata: {
          ...metadata,
          migrated_from: filePath,
          migration_date: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', metadata.id);

    if (error) {
      throw new Error(`Failed to update: ${error.message}`);
    }

    console.log(`    ✅ Updated existing PRD`);
  } else {
    // Insert new PRD
    const { error } = await supabase
      .from('prds')
      .insert({
        id: metadata.id,
        title: metadata.title,
        content,
        status: metadata.status,
        strategic_directive_id: metadata.strategic_directive_id,
        metadata: {
          version: metadata.version,
          sections,
          migrated_from: filePath,
          migration_date: new Date().toISOString(),
          file_hash: createHash('sha256').update(content).digest('hex')
        },
        created_at: metadata.created_at,
        updated_at: metadata.updated_at
      });

    if (error) {
      throw new Error(`Failed to insert: ${error.message}`);
    }

    console.log(`    ✅ Migrated to database`);
  }

  // Store migration audit record
  await supabase.from('compliance_alerts').insert({
    alert_type: 'missing_artifact',
    severity: 'info',
    source: 'prd-migration',
    message: `PRD ${metadata.id} migrated from filesystem to database`,
    payload: {
      prd_id: metadata.id,
      file_path: filePath,
      action: 'migrated',
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * Delete PRD files after successful migration
 */
async function deletePRDFiles(files: string[]): Promise<string[]> {
  const deleted: string[] = [];

  for (const file of files) {
    try {
      // Create backup first
      const backupDir = path.join(path.dirname(file), '.backup');
      await fs.mkdir(backupDir, { recursive: true });

      const backupPath = path.join(backupDir, path.basename(file));
      await fs.copyFile(file, backupPath);

      // Delete original
      await fs.unlink(file);
      deleted.push(file);

      console.log(`    🗑️  Deleted: ${path.basename(file)} (backed up)`);
    } catch (error) {
      console.error(`    ❌ Failed to delete ${file}: ${error}`);
    }
  }

  return deleted;
}

/**
 * Main migration function
 */
export async function migratePRDsToDatabase(
  dryRun: boolean = false
): Promise<MigrationResult> {
  console.log('🚀 Starting PRD Filesystem to Database Migration');
  console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  const prdsDir = path.join(process.cwd(), 'prds');
  const result: MigrationResult = {
    migrated: [],
    failed: [],
    deleted: [],
    errors: {}
  };

  try {
    // Check if PRDs directory exists
    await fs.access(prdsDir);
  } catch {
    console.log('✅ No /prds directory found - already migrated!');
    return result;
  }

  // Find all .md files
  const files = await fs.readdir(prdsDir);
  const prdFiles = files
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(prdsDir, f));

  if (prdFiles.length === 0) {
    console.log('✅ No PRD files found in filesystem');
    return result;
  }

  console.log(`📁 Found ${prdFiles.length} PRD files to migrate\n`);

  // Migrate each file
  for (const file of prdFiles) {
    try {
      if (!dryRun) {
        await migratePRD(file);
        result.migrated.push(file);
      } else {
        const { metadata } = await parsePRDFile(file);
        console.log(`  [DRY RUN] Would migrate: ${metadata.id}`);
        result.migrated.push(file);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`    ❌ Failed: ${errorMsg}`);
      result.failed.push(file);
      result.errors[file] = errorMsg;
    }
  }

  // Delete successfully migrated files
  if (!dryRun && result.migrated.length > 0) {
    console.log('\n🗑️  Cleaning up filesystem...');
    result.deleted = await deletePRDFiles(result.migrated);
  }

  // Create compliance alert for migration completion
  if (!dryRun && result.migrated.length > 0) {
    await supabase.from('compliance_alerts').insert({
      alert_type: 'filesystem_drift',
      severity: 'info',
      source: 'prd-migration',
      message: `Completed PRD migration: ${result.migrated.length} files moved to database`,
      payload: {
        migrated_count: result.migrated.length,
        failed_count: result.failed.length,
        deleted_count: result.deleted.length,
        timestamp: new Date().toISOString()
      },
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolution_notes: 'PR-4: One-time migration to database-first architecture'
    });
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Migration Summary');
  console.log('='.repeat(60));
  console.log(`✅ Migrated: ${result.migrated.length} PRDs`);
  console.log(`❌ Failed:   ${result.failed.length} PRDs`);
  console.log(`🗑️  Deleted:  ${result.deleted.length} files`);

  if (result.failed.length > 0) {
    console.log('\n⚠️  Failed migrations need manual review:');
    result.failed.forEach(f => {
      console.log(`  - ${path.basename(f)}: ${result.errors[f]}`);
    });
  }

  if (dryRun) {
    console.log('\n📝 This was a DRY RUN - no changes were made');
    console.log('   Run without --dry-run flag to execute migration');
  } else if (result.migrated.length > 0) {
    console.log('\n🎉 Migration complete! PRDs are now in the database.');
    console.log('   Filesystem PRDs have been deleted (backups in .backup/)');
  }

  return result;
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');

  // Check environment
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing required environment variables:');
    console.error('   - NEXT_PUBLIC_SUPABASE_URL');
    console.error('   - SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  // Confirmation prompt for live run
  if (!dryRun && !force) {
    console.log('⚠️  WARNING: This will migrate PRDs to the database and DELETE filesystem files!');
    console.log('   Backups will be created in prds/.backup/');
    console.log('');
    console.log('   Use --dry-run to preview changes');
    console.log('   Use --force to skip this confirmation');
    console.log('');

    const readline = (await import('readline')).createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question('Type "migrate" to proceed: ', (answer) => {
      readline.close();

      if (answer.toLowerCase() === 'migrate') {
        migratePRDsToDatabase(false)
          .then(() => process.exit(0))
          .catch(error => {
            console.error('Migration failed:', error);
            process.exit(1);
          });
      } else {
        console.log('Migration cancelled');
        process.exit(0);
      }
    });
  } else {
    // Run migration
    migratePRDsToDatabase(dryRun)
      .then(() => process.exit(0))
      .catch(error => {
        console.error('Migration failed:', error);
        process.exit(1);
      });
  }
}