#!/usr/bin/env node
/**
 * Supabase Disk IO Performance Diagnostic Tool
 *
 * Analyzes:
 * 1. pg_stat_statements - Most expensive queries by IO and execution time
 * 2. Sequential scans on large tables (missing indexes)
 * 3. Table bloat and dead tuple counts
 * 4. Long-running queries
 * 5. Buffer hit ratio (cache efficiency)
 * 6. Index usage statistics
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function runDiagnostics() {
  console.log('\n=== SUPABASE DISK IO PERFORMANCE DIAGNOSTICS ===\n');

  const client = await createDatabaseClient('engineer', {
    verify: true,
    verbose: true
  });

  try {
    // 1. Check if pg_stat_statements is enabled
    console.log('\n📊 CHECKING pg_stat_statements EXTENSION...\n');
    const extCheck = await client.query(`
      SELECT * FROM pg_extension WHERE extname = 'pg_stat_statements';
    `);

    if (extCheck.rows.length === 0) {
      console.log('⚠️  pg_stat_statements extension is NOT installed');
      console.log('   This extension is required for query performance analysis');
      console.log('   Enable in Supabase Dashboard > Database > Extensions\n');
    } else {
      console.log('✅ pg_stat_statements is enabled\n');

      // 2. Most expensive queries by total execution time
      console.log('\n🔥 TOP 10 QUERIES BY TOTAL EXECUTION TIME:\n');
      const topByTime = await client.query(`
        SELECT
          query,
          calls,
          total_exec_time::numeric(10,2) as total_time_ms,
          mean_exec_time::numeric(10,2) as avg_time_ms,
          min_exec_time::numeric(10,2) as min_time_ms,
          max_exec_time::numeric(10,2) as max_time_ms,
          rows,
          shared_blks_read as disk_blocks_read,
          shared_blks_hit as cache_blocks_hit,
          (shared_blks_hit::float / NULLIF(shared_blks_hit + shared_blks_read, 0) * 100)::numeric(5,2) as cache_hit_ratio
        FROM pg_stat_statements
        WHERE query NOT LIKE '%pg_stat_statements%'
        ORDER BY total_exec_time DESC
        LIMIT 10;
      `);

      topByTime.rows.forEach((row, idx) => {
        console.log(`${idx + 1}. [${row.calls} calls] ${row.total_time_ms}ms total, ${row.avg_time_ms}ms avg`);
        console.log(`   Disk reads: ${row.disk_blocks_read || 0}, Cache hits: ${row.cache_blocks_hit || 0}`);
        console.log(`   Cache ratio: ${row.cache_hit_ratio || 0}%`);
        console.log(`   Query: ${row.query.substring(0, 150)}...`);
        console.log('');
      });

      // 3. Queries with most disk reads (IO intensive)
      console.log('\n💾 TOP 10 QUERIES BY DISK READS (IO INTENSIVE):\n');
      const topByIO = await client.query(`
        SELECT
          query,
          calls,
          shared_blks_read as disk_blocks_read,
          shared_blks_hit as cache_blocks_hit,
          total_exec_time::numeric(10,2) as total_time_ms,
          mean_exec_time::numeric(10,2) as avg_time_ms,
          (shared_blks_read::float / calls)::numeric(10,2) as avg_blocks_per_call
        FROM pg_stat_statements
        WHERE shared_blks_read > 0
          AND query NOT LIKE '%pg_stat_statements%'
        ORDER BY shared_blks_read DESC
        LIMIT 10;
      `);

      topByIO.rows.forEach((row, idx) => {
        console.log(`${idx + 1}. ${row.disk_blocks_read} disk blocks read (${row.avg_blocks_per_call} avg/call)`);
        console.log(`   Calls: ${row.calls}, Total time: ${row.total_time_ms}ms`);
        console.log(`   Query: ${row.query.substring(0, 150)}...`);
        console.log('');
      });
    }

    // 4. Tables with most sequential scans (potential missing indexes)
    console.log('\n🔍 TABLES WITH SEQUENTIAL SCANS (Potential Missing Indexes):\n');
    const seqScans = await client.query(`
      SELECT
        schemaname,
        relname as tablename,
        seq_scan as sequential_scans,
        seq_tup_read as rows_read_seq,
        idx_scan as index_scans,
        idx_tup_fetch as rows_fetched_idx,
        n_live_tup as live_rows,
        n_dead_tup as dead_rows,
        CASE
          WHEN seq_scan > 0 THEN (seq_tup_read::float / seq_scan)::numeric(10,2)
          ELSE 0
        END as avg_rows_per_seq_scan
      FROM pg_stat_user_tables
      WHERE seq_scan > 0
      ORDER BY seq_scan DESC
      LIMIT 15;
    `);

    seqScans.rows.forEach((row, idx) => {
      const seqRatio = row.index_scans > 0
        ? ((row.sequential_scans / (row.sequential_scans + row.index_scans)) * 100).toFixed(1)
        : 100;

      console.log(`${idx + 1}. ${row.schemaname}.${row.tablename}`);
      console.log(`   Sequential scans: ${row.sequential_scans} (${row.avg_rows_per_seq_scan} avg rows/scan)`);
      console.log(`   Index scans: ${row.index_scans || 0}`);
      console.log(`   Seq/Total ratio: ${seqRatio}%`);
      console.log(`   Live rows: ${row.live_rows}, Dead rows: ${row.dead_rows}`);

      if (row.live_rows > 1000 && seqRatio > 50) {
        console.log('   ⚠️  RECOMMENDATION: Consider adding indexes (large table + high seq scan ratio)');
      }
      console.log('');
    });

    // 5. Table bloat and dead tuples
    console.log('\n🗑️  TABLE BLOAT ANALYSIS (Dead Tuples):\n');
    const bloat = await client.query(`
      SELECT
        schemaname,
        relname as tablename,
        n_live_tup as live_rows,
        n_dead_tup as dead_rows,
        CASE
          WHEN n_live_tup > 0
          THEN (n_dead_tup::float / n_live_tup * 100)::numeric(5,2)
          ELSE 0
        END as dead_ratio_pct,
        last_vacuum,
        last_autovacuum,
        last_analyze,
        last_autoanalyze
      FROM pg_stat_user_tables
      WHERE n_dead_tup > 100
      ORDER BY n_dead_tup DESC
      LIMIT 15;
    `);

    bloat.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.schemaname}.${row.tablename}`);
      console.log(`   Live: ${row.live_rows}, Dead: ${row.dead_rows} (${row.dead_ratio_pct}% dead)`);
      console.log(`   Last vacuum: ${row.last_vacuum || 'never'}`);
      console.log(`   Last autovacuum: ${row.last_autovacuum || 'never'}`);

      if (row.dead_ratio_pct > 20) {
        console.log('   ⚠️  RECOMMENDATION: VACUUM needed (>20% dead tuples)');
      }
      console.log('');
    });

    // 6. Long-running queries
    console.log('\n⏱️  ACTIVE LONG-RUNNING QUERIES:\n');
    const longRunning = await client.query(`
      SELECT
        pid,
        usename,
        application_name,
        state,
        EXTRACT(EPOCH FROM (now() - query_start))::integer as runtime_seconds,
        query
      FROM pg_stat_activity
      WHERE state != 'idle'
        AND query NOT LIKE '%pg_stat_activity%'
        AND (now() - query_start) > interval '5 seconds'
      ORDER BY query_start
      LIMIT 10;
    `);

    if (longRunning.rows.length === 0) {
      console.log('✅ No long-running queries detected (>5s)\n');
    } else {
      longRunning.rows.forEach((row, idx) => {
        console.log(`${idx + 1}. [PID ${row.pid}] Running for ${row.runtime_seconds}s`);
        console.log(`   User: ${row.usename}, App: ${row.application_name}`);
        console.log(`   State: ${row.state}`);
        console.log(`   Query: ${row.query.substring(0, 150)}...`);
        console.log('');
      });
    }

    // 7. Database cache hit ratio
    console.log('\n📈 DATABASE CACHE EFFICIENCY:\n');
    const cacheStats = await client.query(`
      SELECT
        sum(heap_blks_read) as heap_read,
        sum(heap_blks_hit) as heap_hit,
        (sum(heap_blks_hit)::float / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0) * 100)::numeric(5,2) as cache_hit_ratio
      FROM pg_statio_user_tables;
    `);

    const ratio = cacheStats.rows[0].cache_hit_ratio;
    console.log(`Overall cache hit ratio: ${ratio}%`);
    if (ratio < 90) {
      console.log('⚠️  LOW CACHE HIT RATIO - Consider increasing shared_buffers or optimizing queries');
    } else if (ratio < 95) {
      console.log('⚠️  MODERATE - Could be improved');
    } else {
      console.log('✅ Excellent cache performance');
    }
    console.log('');

    // 8. Index usage statistics
    console.log('\n📇 UNUSED OR UNDERUTILIZED INDEXES:\n');
    const unusedIndexes = await client.query(`
      SELECT
        schemaname,
        relname as tablename,
        indexrelname as indexname,
        idx_scan as index_scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched,
        pg_size_pretty(pg_relation_size(indexrelid)) as index_size
      FROM pg_stat_user_indexes
      WHERE idx_scan < 100
        AND schemaname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY pg_relation_size(indexrelid) DESC
      LIMIT 15;
    `);

    if (unusedIndexes.rows.length === 0) {
      console.log('✅ All indexes are being used\n');
    } else {
      unusedIndexes.rows.forEach((row, idx) => {
        console.log(`${idx + 1}. ${row.schemaname}.${row.tablename}.${row.indexname}`);
        console.log(`   Scans: ${row.index_scans}, Size: ${row.index_size}`);
        if (row.index_scans === 0) {
          console.log('   ⚠️  NEVER USED - Consider dropping to reduce IO overhead');
        } else {
          console.log('   ⚠️  LOW USAGE - Verify if needed');
        }
        console.log('');
      });
    }

    // 9. Database size and growth
    console.log('\n💽 DATABASE SIZE:\n');
    const dbSize = await client.query(`
      SELECT
        pg_size_pretty(pg_database_size(current_database())) as database_size;
    `);
    console.log(`Total database size: ${dbSize.rows[0].database_size}\n`);

    // 10. Largest tables
    console.log('\n📊 TOP 15 LARGEST TABLES:\n');
    const largestTables = await client.query(`
      SELECT
        schemaname,
        relname as tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname)) as total_size,
        pg_size_pretty(pg_relation_size(schemaname||'.'||relname)) as table_size,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname) - pg_relation_size(schemaname||'.'||relname)) as indexes_size,
        n_live_tup as row_count
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(schemaname||'.'||relname) DESC
      LIMIT 15;
    `);

    largestTables.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.schemaname}.${row.tablename}`);
      console.log(`   Total: ${row.total_size} (Table: ${row.table_size}, Indexes: ${row.indexes_size})`);
      console.log(`   Rows: ${row.row_count}`);
      console.log('');
    });

    console.log('\n=== DIAGNOSTIC SUMMARY ===\n');
    console.log('Review the following for optimization opportunities:');
    console.log('1. Tables with high sequential scan ratios (>50%) on large tables');
    console.log('2. Queries with high disk block reads');
    console.log('3. Tables with >20% dead tuple ratio (need VACUUM)');
    console.log('4. Unused indexes consuming disk space and IO during writes');
    console.log('5. Cache hit ratio <95%');
    console.log('\nRecommendations will reduce disk IO by improving query patterns and index usage.\n');

  } catch (error) {
    console.error('❌ Error running diagnostics:', error.message);
    if (error.message.includes('permission denied')) {
      console.error('\n⚠️  Some queries require elevated permissions.');
      console.error('   Run in Supabase SQL Editor for full access.\n');
    }
    throw error;
  } finally {
    await client.end();
  }
}

// Run diagnostics
runDiagnostics()
  .then(() => {
    console.log('✅ Diagnostics complete\n');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
