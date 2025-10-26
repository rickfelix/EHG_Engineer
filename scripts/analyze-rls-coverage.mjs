#!/usr/bin/env node

/**
 * Analyze RLS Policy Coverage
 * Provides detailed breakdown of the 131 tables with "incomplete" policies
 */

import pg from 'pg';
const { Client } = pg;
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not configured');
  process.exit(1);
}

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function analyzeRLSCoverage() {
  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Get all tables with RLS analysis
    const query = `
      WITH table_policies AS (
        SELECT
          schemaname,
          tablename,
          rowsecurity as rls_enabled,
          (
            SELECT COUNT(*)
            FROM pg_policies pp
            WHERE pp.schemaname = pt.schemaname
            AND pp.tablename = pt.tablename
          ) as policy_count,
          (
            SELECT array_agg(DISTINCT cmd)
            FROM pg_policies pp
            WHERE pp.schemaname = pt.schemaname
            AND pp.tablename = pt.tablename
          ) as policy_commands
        FROM pg_tables pt
        WHERE schemaname = 'public'
        AND tablename NOT LIKE 'pg_%'
        AND tablename NOT IN (
          'schema_migrations',
          'supabase_migrations',
          'spatial_ref_sys',
          'geography_columns',
          'geometry_columns',
          'raster_columns',
          'raster_overviews',
          '_prisma_migrations'
        )
        ORDER BY tablename
      )
      SELECT
        tablename,
        rls_enabled,
        policy_count,
        policy_commands,
        CASE
          WHEN NOT rls_enabled THEN 'NO_RLS'
          WHEN policy_count = 0 THEN 'NO_POLICIES'
          WHEN policy_commands @> ARRAY['ALL']::text[] THEN 'FULL_CRUD'
          WHEN array_length(policy_commands, 1) = 4 THEN 'FULL_CRUD'
          WHEN 'SELECT' = ANY(policy_commands) AND array_length(policy_commands, 1) = 1 THEN 'READ_ONLY'
          ELSE 'PARTIAL'
        END as coverage_type
      FROM table_policies
      ORDER BY coverage_type, tablename;
    `;

    const result = await client.query(query);

    // Group by coverage type
    const grouped = result.rows.reduce((acc, row) => {
      if (!acc[row.coverage_type]) {
        acc[row.coverage_type] = [];
      }
      acc[row.coverage_type].push(row);
      return acc;
    }, {});

    console.log('📊 RLS Coverage Analysis');
    console.log('═'.repeat(70));
    console.log('');

    // Summary counts
    const totals = {
      NO_RLS: grouped.NO_RLS?.length || 0,
      NO_POLICIES: grouped.NO_POLICIES?.length || 0,
      READ_ONLY: grouped.READ_ONLY?.length || 0,
      PARTIAL: grouped.PARTIAL?.length || 0,
      FULL_CRUD: grouped.FULL_CRUD?.length || 0
    };

    const total = Object.values(totals).reduce((sum, count) => sum + count, 0);

    console.log('Summary:');
    console.log(`  Total Tables: ${total}`);
    console.log(`  ❌ No RLS Enabled: ${totals.NO_RLS}`);
    console.log(`  ⚠️  RLS Enabled but No Policies: ${totals.NO_POLICIES}`);
    console.log(`  📖 Read-Only (SELECT only): ${totals.READ_ONLY}`);
    console.log(`  ⚡ Partial Coverage: ${totals.PARTIAL}`);
    console.log(`  ✅ Full CRUD Coverage: ${totals.FULL_CRUD}`);
    console.log('');

    // Show details for each category
    if (totals.NO_RLS > 0) {
      console.log('❌ Tables WITHOUT RLS Enabled (' + totals.NO_RLS + '):');
      console.log('─'.repeat(70));
      grouped.NO_RLS.forEach(t => {
        console.log(`  • ${t.tablename}`);
      });
      console.log('');
    }

    if (totals.NO_POLICIES > 0) {
      console.log('⚠️  Tables WITH RLS but NO Policies (' + totals.NO_POLICIES + '):');
      console.log('─'.repeat(70));
      grouped.NO_POLICIES.forEach(t => {
        console.log(`  • ${t.tablename}`);
      });
      console.log('');
    }

    if (totals.READ_ONLY > 0) {
      console.log('📖 Read-Only Tables (' + totals.READ_ONLY + '):');
      console.log('─'.repeat(70));
      console.log('   (These may be intentionally read-only)');
      grouped.READ_ONLY.slice(0, 10).forEach(t => {
        console.log(`  • ${t.tablename} (${t.policy_count} policies)`);
      });
      if (totals.READ_ONLY > 10) {
        console.log(`  ... and ${totals.READ_ONLY - 10} more`);
      }
      console.log('');
    }

    if (totals.PARTIAL > 0) {
      console.log('⚡ Partial Coverage Tables (' + totals.PARTIAL + '):');
      console.log('─'.repeat(70));
      console.log('   (Some operations allowed, others blocked)');
      grouped.PARTIAL.slice(0, 10).forEach(t => {
        console.log(`  • ${t.tablename} (${t.policy_commands?.join(', ')})`);
      });
      if (totals.PARTIAL > 10) {
        console.log(`  ... and ${totals.PARTIAL - 10} more`);
      }
      console.log('');
    }

    // Assessment
    console.log('🔍 Assessment:');
    console.log('─'.repeat(70));

    if (totals.NO_RLS > 0) {
      console.log('❌ CRITICAL: Tables without RLS are security vulnerabilities');
    }

    if (totals.NO_POLICIES > 0) {
      console.log('⚠️  WARNING: Tables with RLS but no policies deny all access');
    }

    const readOnlyPercent = ((totals.READ_ONLY / total) * 100).toFixed(1);
    if (totals.READ_ONLY > 50) {
      console.log(`📖 INFO: ${readOnlyPercent}% of tables are read-only`);
      console.log('   This may be intentional (data warehouse, reporting, etc.)');
    }

    console.log('');
    console.log('💡 Recommendations:');
    console.log('─'.repeat(70));

    if (totals.READ_ONLY > 50) {
      console.log('1. Update RLS verification script to recognize read-only as valid');
      console.log('   (Don\'t warn about "incomplete" if intentionally read-only)');
    }

    if (totals.NO_RLS > 0 || totals.NO_POLICIES > 0) {
      console.log('2. Review and fix tables with missing RLS/policies');
    }

    console.log('3. Document policy strategy for each table type');
    console.log('');

  } catch (err) {
    console.error('❌ Analysis failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

analyzeRLSCoverage();
