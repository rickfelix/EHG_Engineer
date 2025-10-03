#!/usr/bin/env node

/**
 * Migrate Legacy Handoff Files to Database
 * Reads handoff markdown files and inserts them into leo_handoff_executions table
 */

import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectId = 'dedlbzhpgkmetvhbkyzq'; // EHG_Engineer database
const password = process.env.SUPABASE_DB_PASSWORD || 'Fl!M32DaM00n!1';

async function migrateHandoffFiles() {
  const pool = new Pool({
    host: 'aws-1-us-east-1.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: `postgres.${projectId}`,
    password: password,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  const client = await pool.connect();

  try {
    console.log('\n📦 MIGRATING LEGACY HANDOFF FILES');
    console.log('═'.repeat(60));
    console.log();

    // Find all handoff files
    const handoffsDir = path.join(__dirname, '..', 'handoffs');
    const files = await fs.readdir(handoffsDir);
    const handoffFiles = files.filter(f => f.endsWith('.md'));

    console.log(`Found ${handoffFiles.length} handoff files to migrate\n`);

    // Create a placeholder SD for legacy handoffs if it doesn't exist
    console.log('📌 Ensuring placeholder SD exists for legacy handoffs...\n');

    const placeholderSdId = 'SD-LEGACY-HANDOFFS';
    const checkSd = await client.query(
      `SELECT id FROM strategic_directives_v2 WHERE id = $1`,
      [placeholderSdId]
    );

    if (checkSd.rows.length === 0) {
      await client.query(`
        INSERT INTO strategic_directives_v2 (
          id,
          title,
          description,
          status,
          priority,
          category,
          rationale,
          scope
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO NOTHING
      `, [
        placeholderSdId,
        'Legacy Handoff Files Migration',
        'Placeholder SD for handoff files migrated from markdown to database',
        'completed', // status: draft, in_progress, active, pending_approval, completed, deferred, cancelled
        'low', // priority: critical, high, medium, low
        'Automation',
        'Database-first migration of legacy handoff markdown files to leo_handoff_executions table',
        'Migrate 12 legacy handoff files from handoffs/ directory to database'
      ]);
      console.log(`  ✅ Created placeholder SD: ${placeholderSdId}\n`);
    } else {
      console.log(`  ✅ Placeholder SD already exists: ${placeholderSdId}\n`);
    }

    const migrations = [];

    for (const filename of handoffFiles) {
      const filePath = path.join(handoffsDir, filename);
      const content = await fs.readFile(filePath, 'utf8');

      // Parse metadata from filename
      // Patterns:
      // - EXEC-to-PLAN-SD-UAT-009.md
      // - PLAN-SUPERVISOR-VERIFICATION-SD-UAT-009.md
      // - PLAN-REASSESSMENT-SD-UAT-020.md

      let fromAgent = 'UNKNOWN';
      let toAgent = 'UNKNOWN';
      let handoffType = 'standard';
      let sdId = null;

      // Extract agents and SD ID
      const agentMatch = filename.match(/(LEAD|PLAN|EXEC)/g);
      if (agentMatch && agentMatch.length >= 2) {
        fromAgent = agentMatch[0];
        toAgent = agentMatch[1];
      } else if (agentMatch && agentMatch.length === 1) {
        // Special cases like PLAN-SUPERVISOR-VERIFICATION
        fromAgent = agentMatch[0];
        if (filename.includes('SUPERVISOR')) {
          toAgent = 'LEAD';
          handoffType = 'supervisor_verification';
        } else if (filename.includes('REASSESSMENT')) {
          toAgent = 'EXEC';
          handoffType = 'reassessment';
        } else if (filename.includes('DISCOVERY')) {
          toAgent = 'PLAN';
          handoffType = 'discovery_findings';
        }
      }

      // Extract SD ID
      const sdMatch = filename.match(/SD-([A-Z]+-\d+)/);
      if (sdMatch) {
        sdId = `SD-${sdMatch[1]}`;
      }

      // Parse content sections
      const executiveSummary = extractSection(content, 'Executive Summary') ||
                               extractSection(content, '## Summary') ||
                               content.substring(0, 500);

      // Ensure valid JSON for JSONB fields
      let deliverables = '{}';
      try {
        const delivText = extractSection(content, 'Deliverables') ||
                         extractSection(content, 'Completeness Report');
        if (delivText) {
          // Wrap text content in JSON object
          deliverables = JSON.stringify({ content: delivText });
        }
      } catch (e) {
        deliverables = '{}';
      }

      let actionItems = '[]';
      try {
        const actionsText = extractSection(content, 'Action Items') ||
                           extractSection(content, 'Next Steps');
        if (actionsText) {
          // Wrap text content in JSON array
          actionItems = JSON.stringify([{ content: actionsText }]);
        }
      } catch (e) {
        actionItems = '[]';
      }

      migrations.push({
        filePath: path.relative(process.cwd(), filePath),
        filename,
        fromAgent,
        toAgent,
        handoffType,
        sdId,
        executiveSummary,
        deliverables,
        actionItems,
        content
      });
    }

    // Insert into database
    console.log('📝 Inserting handoffs into database...\n');

    await client.query('BEGIN');

    let successCount = 0;
    let errorCount = 0;

    for (const migration of migrations) {
      try {
        // Try to match SD ID, fallback to placeholder for legacy handoffs
        const result = await client.query(`
          INSERT INTO leo_handoff_executions (
            sd_id,
            handoff_type,
            from_agent,
            to_agent,
            executive_summary,
            deliverables_manifest,
            action_items,
            status,
            file_path,
            created_by
          ) VALUES (
            COALESCE(
              (SELECT id FROM strategic_directives_v2 WHERE id = $1 LIMIT 1),
              $11
            ),
            $2, $3, $4, $5, $6, $7, $8, $9, $10
          )
          RETURNING id
        `, [
          migration.sdId,
          migration.handoffType,
          migration.fromAgent,
          migration.toAgent,
          migration.executiveSummary,
          migration.deliverables,
          migration.actionItems,
          'accepted', // Valid status: created, validated, accepted, rejected, superseded
          migration.filePath,
          'legacy-migration',
          placeholderSdId // Fallback SD ID
        ]);

        console.log(`  ✅ ${migration.filename} → ${result.rows[0].id}`);
        successCount++;

      } catch (error) {
        console.error(`  ❌ ${migration.filename}: ${error.message}`);
        errorCount++;
      }
    }

    await client.query('COMMIT');

    console.log('\n' + '═'.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log(`   ✅ Successfully migrated: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📁 Total files processed: ${handoffFiles.length}`);
    console.log();

    if (successCount > 0) {
      console.log('🎯 NEXT STEPS:');
      console.log('   1. Verify migrated data in database');
      console.log('   2. Update CLAUDE.md with handoff protocol');
      console.log('   3. Delete legacy markdown files after verification');
      console.log();
    }

    process.exit(errorCount > 0 ? 1 : 0);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Extract a section from markdown content
 */
function extractSection(content, heading) {
  const headingRegex = new RegExp(`##\\s+${heading}([^#]+)`, 'i');
  const match = content.match(headingRegex);
  if (match) {
    return match[1].trim();
  }
  return null;
}

migrateHandoffFiles();
