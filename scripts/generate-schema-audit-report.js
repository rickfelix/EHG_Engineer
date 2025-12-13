#!/usr/bin/env node
/**
 * Generate Comprehensive Schema Audit Report
 *
 * Purpose: Creates a detailed audit report of database schema state
 * Used for: Migration validation, schema documentation, change tracking
 *
 * Output: docs/audit/schema-audit-[date].md
 */

import { createDatabaseClient } from './lib/supabase-connection.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

async function generateSchemaAuditReport() {
  console.log('\n📊 Generating Schema Audit Report...\n');

  const client = await createDatabaseClient('engineer', {
    verbose: true,
    verify: true
  });

  const timestamp = new Date().toISOString().split('T')[0];
  const auditDir = join(process.cwd(), 'docs', 'audit');
  await mkdir(auditDir, { recursive: true });
  
  const outputPath = join(auditDir, `schema-audit-${timestamp}.md`);

  try {
    const report = [];

    // Header
    report.push('# Schema Audit Report');
    report.push('');
    report.push(`**Generated**: ${new Date().toISOString()}`);
    report.push('**Database**: EHG_Engineer (dedlbzhpgkmetvhbkyzq)');
    report.push('**Purpose**: Schema validation and migration tracking');
    report.push('');
    report.push('---');
    report.push('');

    // Table Count
    const tableCount = await client.query(`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE';
    `);
    report.push('## Overview');
    report.push('');
    report.push(`- **Total Tables**: ${tableCount.rows[0].count}`);
    report.push('');

    // Key Tables Row Counts
    report.push('## Key Tables');
    report.push('');
    report.push('| Table | Rows | Purpose |');
    report.push('|-------|------|---------|');

    const keyTables = [
      { name: 'strategic_directives_v2', purpose: 'Strategic Directives (human-readable IDs)' },
      { name: 'product_requirements_v2', purpose: 'Product Requirements Documents' },
      { name: 'sub_agent_execution_results', purpose: 'Sub-agent validation results' },
      { name: 'sd_phase_handoffs', purpose: 'Phase transition handoffs' },
      { name: 'issue_patterns', purpose: 'Known issue patterns and solutions' },
      { name: 'retrospectives', purpose: 'SD retrospectives and lessons learned' }
    ];

    for (const table of keyTables) {
      try {
        const countResult = await client.query(`SELECT COUNT(*) as count FROM ${table.name}`);
        report.push(`| ${table.name} | ${countResult.rows[0].count.toLocaleString()} | ${table.purpose} |`);
      } catch (err) {
        report.push(`| ${table.name} | ERROR | ${err.message} |`);
      }
    }
    report.push('');

    // Foreign Keys
    report.push('## Foreign Key Constraints');
    report.push('');
    const fkResult = await client.query(`
      SELECT
        tc.table_name,
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      ORDER BY tc.table_name, tc.constraint_name;
    `);

    report.push('| Table | Constraint | Column | References |');
    report.push('|-------|------------|--------|------------|');
    for (const fk of fkResult.rows) {
      report.push(`| ${fk.table_name} | ${fk.constraint_name} | ${fk.column_name} | ${fk.foreign_table_name}(${fk.foreign_column_name}) |`);
    }
    report.push('');
    report.push(`**Total Foreign Keys**: ${fkResult.rows.length}`);
    report.push('');

    // Column Comments (Deprecations)
    report.push('## Column Comments & Deprecations');
    report.push('');
    const commentsResult = await client.query(`
      SELECT
        c.table_name,
        c.column_name,
        pgd.description
      FROM information_schema.columns c
      JOIN pg_catalog.pg_statio_all_tables as st
        ON c.table_schema = st.schemaname AND c.table_name = st.relname
      JOIN pg_catalog.pg_description pgd
        ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
      WHERE c.table_schema = 'public'
        AND pgd.description IS NOT NULL
      ORDER BY c.table_name, c.column_name;
    `);

    if (commentsResult.rows.length > 0) {
      report.push('| Table | Column | Comment |');
      report.push('|-------|--------|---------|');
      for (const cmt of commentsResult.rows) {
        const comment = cmt.description.replace(/\n/g, ' ');
        report.push(`| ${cmt.table_name} | ${cmt.column_name} | ${comment} |`);
      }
      report.push('');
    } else {
      report.push('_No column comments found_');
      report.push('');
    }

    // Write report
    const reportContent = report.join('\n');
    await writeFile(outputPath, reportContent, 'utf-8');

    console.log(`\n✅ Schema audit report generated: ${outputPath}`);
    console.log(`📊 Report size: ${Math.round(reportContent.length / 1024)}KB`);
    console.log(`📋 Tables audited: ${tableCount.rows[0].count}`);
    console.log(`🔗 Foreign keys: ${fkResult.rows.length}`);
    console.log(`💬 Column comments: ${commentsResult.rows.length}`);
    console.log('');

  } catch (error) {
    console.error('\n❌ Schema audit failed:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

generateSchemaAuditReport().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
