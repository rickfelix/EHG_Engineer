/**
 * Cost Optimization Sub-Agent - Database Analyzer
 * Analyze database usage and identify issues
 */

import { LIMITS, KNOWN_TABLES } from './config.js';

/**
 * Analyze database usage
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} Database usage analysis
 */
export async function analyzeDatabaseUsage(supabase) {
  const usage = {
    tables: [],
    totalRows: 0,
    estimatedSize: 0,
    largestTables: [],
    growthRate: 0,
    issues: []
  };

  if (!supabase) {
    usage.status = 'NO_CONNECTION';
    usage.message = 'Supabase connection not configured';
    return usage;
  }

  try {
    // Get all tables
    const { data: tables } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public');

    if (!tables) {
      // Fallback: check known tables
      for (const table of KNOWN_TABLES) {
        try {
          const { count } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true });

          usage.tables.push({
            name: table,
            rowCount: count || 0,
            estimatedSize: (count || 0) * 1024 // Rough estimate: 1KB per row
          });

          usage.totalRows += count || 0;
        } catch {
          // Table doesn't exist
        }
      }
    } else {
      // Analyze each table
      for (const table of tables) {
        const { count } = await supabase
          .from(table.table_name)
          .select('*', { count: 'exact', head: true });

        const estimatedSize = (count || 0) * 1024; // 1KB average per row

        usage.tables.push({
          name: table.table_name,
          rowCount: count || 0,
          estimatedSize
        });

        usage.totalRows += count || 0;
        usage.estimatedSize += estimatedSize;
      }
    }

    // Sort by size
    usage.tables.sort((a, b) => b.estimatedSize - a.estimatedSize);
    usage.largestTables = usage.tables.slice(0, 5);

    // Check for issues
    if (usage.totalRows > LIMITS.database.rows * LIMITS.database.warning) {
      usage.issues.push({
        type: 'HIGH_ROW_COUNT',
        message: `Total rows (${usage.totalRows}) approaching limit`,
        severity: 'WARNING'
      });
    }

    // Check for tables without indexes
    for (const table of usage.largestTables) {
      if (table.rowCount > 10000) {
        usage.issues.push({
          type: 'LARGE_TABLE',
          message: `Table ${table.name} has ${table.rowCount} rows - ensure proper indexing`,
          severity: 'MEDIUM'
        });
      }
    }

    usage.status = usage.issues.length > 0 ? 'WARNING' : 'GOOD';

  } catch {
    usage.status = 'ERROR';
    usage.message = 'Could not analyze database usage';
  }

  return usage;
}
