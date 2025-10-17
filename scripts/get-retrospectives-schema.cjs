#!/usr/bin/env node

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.SUPABASE_POOLER_URL,
  ssl: { rejectUnauthorized: false }
});

async function getRetrospectivesSchema() {
  try {
    // Get table definition
    const result = await pool.query(`
      SELECT
        a.attname AS column_name,
        pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
        a.attnotnull AS not_null,
        (SELECT pg_catalog.pg_get_expr(d.adbin, d.adrelid)
         FROM pg_catalog.pg_attrdef d
         WHERE d.adrelid = a.attrelid AND d.adnum = a.attnum AND a.atthasdef) AS column_default,
        col_description(a.attrelid, a.attnum) AS description
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = 'public.retrospectives'::regclass
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY a.attnum;
    `);

    console.log('=== RETROSPECTIVES TABLE SCHEMA ===\n');
    console.log('COLUMNS:');
    result.rows.forEach(row => {
      const nullable = row.not_null ? 'NOT NULL' : 'NULL';
      const def = row.column_default ? `DEFAULT ${row.column_default}` : '';
      console.log(`  ${row.column_name.padEnd(30)} ${row.data_type.padEnd(30)} ${nullable.padEnd(10)} ${def}`);
    });

    // Get constraints
    const constraints = await pool.query(`
      SELECT
        con.conname AS constraint_name,
        con.contype AS constraint_type,
        CASE con.contype
          WHEN 'c' THEN pg_get_constraintdef(con.oid)
          WHEN 'f' THEN pg_get_constraintdef(con.oid)
          WHEN 'p' THEN pg_get_constraintdef(con.oid)
          WHEN 'u' THEN pg_get_constraintdef(con.oid)
        END AS constraint_definition
      FROM pg_catalog.pg_constraint con
      INNER JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
      INNER JOIN pg_catalog.pg_namespace nsp ON nsp.oid = connamespace
      WHERE nsp.nspname = 'public'
        AND rel.relname = 'retrospectives';
    `);

    console.log('\n\nCONSTRAINTS:');
    constraints.rows.forEach(row => {
      const type = {
        'c': 'CHECK',
        'f': 'FOREIGN KEY',
        'p': 'PRIMARY KEY',
        'u': 'UNIQUE'
      }[row.constraint_type] || row.constraint_type;
      console.log(`  ${row.constraint_name} (${type})`);
      console.log(`    ${row.constraint_definition}`);
    });

    // Get indexes
    const indexes = await pool.query(`
      SELECT
        i.relname AS index_name,
        a.attname AS column_name,
        ix.indisunique AS is_unique,
        ix.indisprimary AS is_primary
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      WHERE t.relname = 'retrospectives'
        AND t.relnamespace = 'public'::regnamespace
      ORDER BY i.relname, a.attnum;
    `);

    console.log('\n\nINDEXES:');
    const indexGroups = {};
    indexes.rows.forEach(row => {
      if (!indexGroups[row.index_name]) {
        indexGroups[row.index_name] = {
          columns: [],
          unique: row.is_unique,
          primary: row.is_primary
        };
      }
      indexGroups[row.index_name].columns.push(row.column_name);
    });

    Object.entries(indexGroups).forEach(([name, info]) => {
      const type = info.primary ? 'PRIMARY KEY' : info.unique ? 'UNIQUE' : 'INDEX';
      console.log(`  ${name} (${type}) ON (${info.columns.join(', ')})`);
    });

    // Get triggers
    const triggers = await pool.query(`
      SELECT
        tgname AS trigger_name,
        pg_get_triggerdef(oid) AS trigger_definition
      FROM pg_trigger
      WHERE tgrelid = 'public.retrospectives'::regclass
        AND NOT tgisinternal;
    `);

    console.log('\n\nTRIGGERS:');
    if (triggers.rows.length === 0) {
      console.log('  (none)');
    } else {
      triggers.rows.forEach(row => {
        console.log(`  ${row.trigger_name}`);
        console.log(`    ${row.trigger_definition}`);
      });
    }

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

getRetrospectivesSchema();
