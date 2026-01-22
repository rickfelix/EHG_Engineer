/**
 * Schema Documentation Generator - Database Queries
 * All PostgreSQL introspection queries
 */

import { CONFIG } from './config.js';

/**
 * Query all tables in public schema
 * @param {Client} pgClient - PostgreSQL client
 * @returns {Promise<Array>} Array of table info
 */
export async function queryAllTables(pgClient) {
  const query = `
    SELECT
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      n.nspname AS schema_name,
      obj_description(c.oid) AS table_description,
      (
        SELECT COUNT(*)
        FROM pg_policies p
        WHERE p.tablename = c.relname
          AND p.schemaname = n.nspname
      ) AS policy_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE
      n.nspname = 'public'
      AND c.relkind = 'r'
    ORDER BY c.relname;
  `;

  const result = await pgClient.query(query);

  // Filter out internal tables
  return result.rows.filter(table => {
    return !CONFIG.skipTables.some(skip => table.table_name.includes(skip));
  });
}

/**
 * Query column information for a table
 * @param {Client} pgClient - PostgreSQL client
 * @param {string} tableName - Table name
 * @returns {Promise<Array>} Array of column info
 */
export async function queryColumns(pgClient, tableName) {
  const query = `
    SELECT
      c.column_name,
      c.data_type,
      c.character_maximum_length,
      c.numeric_precision,
      c.numeric_scale,
      c.is_nullable,
      c.column_default,
      c.ordinal_position,
      pg_catalog.col_description(
        (SELECT oid FROM pg_class WHERE relname = c.table_name AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')),
        c.ordinal_position
      ) AS column_description
    FROM information_schema.columns c
    WHERE c.table_name = $1
      AND c.table_schema = 'public'
    ORDER BY c.ordinal_position;
  `;

  const result = await pgClient.query(query, [tableName]);
  return result.rows;
}

/**
 * Query constraints for a table
 * @param {Client} pgClient - PostgreSQL client
 * @param {string} tableName - Table name
 * @returns {Promise<Array>} Array of constraint info
 */
export async function queryConstraints(pgClient, tableName) {
  const query = `
    SELECT
      con.conname AS constraint_name,
      con.contype AS constraint_type,
      CASE con.contype
        WHEN 'p' THEN 'PRIMARY KEY'
        WHEN 'f' THEN 'FOREIGN KEY'
        WHEN 'u' THEN 'UNIQUE'
        WHEN 'c' THEN 'CHECK'
        ELSE con.contype::text
      END AS constraint_type_label,
      pg_get_constraintdef(con.oid) AS constraint_definition
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = $1
      AND nsp.nspname = 'public'
    ORDER BY con.contype, con.conname;
  `;

  const result = await pgClient.query(query, [tableName]);
  return result.rows;
}

/**
 * Query indexes for a table
 * @param {Client} pgClient - PostgreSQL client
 * @param {string} tableName - Table name
 * @returns {Promise<Array>} Array of index info
 */
export async function queryIndexes(pgClient, tableName) {
  const query = `
    SELECT
      indexname,
      indexdef
    FROM pg_indexes
    WHERE tablename = $1
      AND schemaname = 'public'
    ORDER BY indexname;
  `;

  const result = await pgClient.query(query, [tableName]);
  return result.rows;
}

/**
 * Query RLS policies for a table
 * @param {Client} pgClient - PostgreSQL client
 * @param {string} tableName - Table name
 * @returns {Promise<Array>} Array of policy info
 */
export async function queryRLSPolicies(pgClient, tableName) {
  const query = `
    SELECT
      policyname,
      cmd AS command,
      roles,
      qual AS using_expression,
      with_check AS with_check_expression
    FROM pg_policies
    WHERE tablename = $1
      AND schemaname = 'public'
    ORDER BY policyname;
  `;

  const result = await pgClient.query(query, [tableName]);
  return result.rows;
}

/**
 * Query triggers for a table
 * @param {Client} pgClient - PostgreSQL client
 * @param {string} tableName - Table name
 * @returns {Promise<Array>} Array of trigger info
 */
export async function queryTriggers(pgClient, tableName) {
  const query = `
    SELECT
      trigger_name,
      event_manipulation,
      action_timing,
      action_statement
    FROM information_schema.triggers
    WHERE event_object_table = $1
      AND event_object_schema = 'public'
    ORDER BY trigger_name;
  `;

  const result = await pgClient.query(query, [tableName]);
  return result.rows;
}

/**
 * Query foreign keys for a table
 * @param {Client} pgClient - PostgreSQL client
 * @param {string} tableName - Table name
 * @returns {Promise<Array>} Array of foreign key info
 */
export async function queryForeignKeys(pgClient, tableName) {
  const query = `
    SELECT
      con.conname AS constraint_name,
      att.attname AS column_name,
      ref_class.relname AS referenced_table,
      ref_att.attname AS referenced_column
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
    JOIN pg_class ref_class ON ref_class.oid = con.confrelid
    JOIN pg_attribute ref_att ON ref_att.attrelid = con.confrelid AND ref_att.attnum = ANY(con.confkey)
    WHERE rel.relname = $1
      AND con.contype = 'f'
    ORDER BY con.conname;
  `;

  const result = await pgClient.query(query, [tableName]);
  return result.rows;
}

/**
 * Query row count for a table using Supabase client
 * @param {SupabaseClient} supabase - Supabase client
 * @param {string} tableName - Table name
 * @returns {Promise<number|string>} Row count or N/A
 */
export async function queryRowCount(supabase, tableName) {
  try {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    return error ? 'N/A (RLS restricted)' : count;
  } catch {
    return 'N/A';
  }
}

/**
 * Check if RLS is enabled for a table
 * @param {Client} pgClient - PostgreSQL client
 * @param {string} tableName - Table name
 * @returns {Promise<boolean>} RLS enabled status
 */
export async function isRLSEnabled(pgClient, tableName) {
  const query = `
    SELECT relrowsecurity
    FROM pg_class
    WHERE relname = $1
      AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
  `;

  const result = await pgClient.query(query, [tableName]);
  return result.rows[0]?.relrowsecurity || false;
}

/**
 * Query all foreign keys in the database
 * @param {Client} pgClient - PostgreSQL client
 * @returns {Promise<Array>} Array of all foreign key info
 */
export async function queryAllForeignKeys(pgClient) {
  const query = `
    SELECT
      rel.relname AS table_name,
      con.conname AS constraint_name,
      att.attname AS column_name,
      ref_class.relname AS referenced_table,
      ref_att.attname AS referenced_column
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
    JOIN pg_class ref_class ON ref_class.oid = con.confrelid
    JOIN pg_attribute ref_att ON ref_att.attrelid = con.confrelid AND ref_att.attnum = ANY(con.confkey)
    WHERE nsp.nspname = 'public'
      AND con.contype = 'f'
    ORDER BY rel.relname, con.conname;
  `;

  const result = await pgClient.query(query);
  return result.rows;
}
