#!/usr/bin/env node
/**
 * Ad-hoc SQL Query Runner
 *
 * Executes arbitrary SQL queries against the Supabase database via direct
 * PostgreSQL connection. Designed to be shell-escaping-safe: pass SQL via
 * heredoc (stdin) to avoid bash mangling special characters.
 *
 * BACKGROUND: The Claude Code Bash tool escapes all `!` characters with
 * backslashes before passing to the shell. This breaks `node -e` commands
 * containing JavaScript negation (!), double-bang (!!), or other `!` usage.
 * This script avoids the issue by reading SQL from stdin (heredoc) or as
 * a simple argument string that doesn't contain shell-sensitive characters.
 *
 * Usage:
 *   # Pass SQL via stdin heredoc (RECOMMENDED - avoids all escaping issues)
 *   node scripts/db-query.js <<'SQL'
 *   SELECT sd_key, title, status
 *   FROM strategic_directives_v2
 *   WHERE sd_key LIKE 'SD-EVA-%'
 *   ORDER BY sd_key
 *   SQL
 *
 *   # Pass SQL as argument (simple queries only)
 *   node scripts/db-query.js "SELECT sd_key, title FROM strategic_directives_v2 LIMIT 5"
 *
 *   # Pass SQL from a file
 *   node scripts/db-query.js < query.sql
 *
 *   # Output as JSON
 *   node scripts/db-query.js --json "SELECT * FROM strategic_directives_v2 LIMIT 3"
 *
 *   # Output as CSV
 *   node scripts/db-query.js --csv "SELECT sd_key, status FROM strategic_directives_v2"
 *
 *   # Use app database instead of engineer
 *   node scripts/db-query.js --db app "SELECT * FROM profiles LIMIT 3"
 *
 * Options:
 *   --json     Output results as JSON array
 *   --csv      Output results as CSV
 *   --db NAME  Database to query ('engineer' or 'app', default: 'engineer')
 *   --quiet    Suppress connection messages
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    format: 'table',
    db: 'engineer',
    quiet: false,
    sql: null
  };

  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      options.format = 'json';
    } else if (arg === '--csv') {
      options.format = 'csv';
    } else if (arg === '--quiet' || arg === '-q') {
      options.quiet = true;
    } else if (arg === '--db' && i + 1 < args.length) {
      options.db = args[++i];
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }

  if (positional.length > 0) {
    options.sql = positional.join(' ');
  }

  return options;
}

async function readStdin() {
  // Check if stdin is a TTY (interactive terminal) - if so, no stdin data
  if (process.stdin.isTTY) {
    return null;
  }

  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim() || null));
    process.stdin.on('error', reject);
    // Timeout after 1 second if no data arrives
    setTimeout(() => resolve(data.trim() || null), 1000);
  });
}

function formatTable(rows) {
  if (!rows || rows.length === 0) {
    console.log('(0 rows)');
    return;
  }

  const columns = Object.keys(rows[0]);

  // Calculate column widths
  const widths = {};
  for (const col of columns) {
    widths[col] = col.length;
    for (const row of rows) {
      const val = String(row[col] === null ? 'NULL' : row[col]);
      widths[col] = Math.max(widths[col], val.length);
    }
    // Cap at 60 chars to prevent horizontal overflow
    widths[col] = Math.min(widths[col], 60);
  }

  // Header
  const header = columns.map(c => c.padEnd(widths[c])).join(' | ');
  const separator = columns.map(c => '-'.repeat(widths[c])).join('-+-');

  console.log(header);
  console.log(separator);

  // Rows
  for (const row of rows) {
    const line = columns.map(c => {
      const val = String(row[c] === null ? 'NULL' : row[c]);
      return val.substring(0, widths[c]).padEnd(widths[c]);
    }).join(' | ');
    console.log(line);
  }

  console.log(`\n(${rows.length} row${rows.length !== 1 ? 's' : ''})`);
}

function formatCSV(rows) {
  if (!rows || rows.length === 0) return;

  const columns = Object.keys(rows[0]);
  console.log(columns.join(','));

  for (const row of rows) {
    const values = columns.map(c => {
      const val = row[c] === null ? '' : String(row[c]);
      // Escape commas and quotes in CSV
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    });
    console.log(values.join(','));
  }
}

async function main() {
  const options = parseArgs(process.argv);

  // Get SQL from args or stdin
  let sql = options.sql;
  if (!sql) {
    sql = await readStdin();
  }

  if (!sql) {
    console.error('Error: No SQL query provided.');
    console.error('');
    console.error('Usage:');
    console.error('  node scripts/db-query.js "SELECT * FROM table LIMIT 5"');
    console.error("  node scripts/db-query.js <<'SQL'");
    console.error('  SELECT * FROM table');
    console.error('  WHERE condition = true');
    console.error('  SQL');
    console.error('');
    console.error('Options: --json, --csv, --db NAME, --quiet');
    process.exit(1);
  }

  const poolerUrl = options.db === 'app'
    ? process.env.EHG_POOLER_URL
    : process.env.SUPABASE_POOLER_URL;

  if (!poolerUrl) {
    console.error(`Error: Missing POOLER_URL for '${options.db}' database.`);
    console.error('Set SUPABASE_POOLER_URL (engineer) or EHG_POOLER_URL (app) in .env');
    process.exit(1);
  }

  if (!options.quiet) {
    process.stderr.write(`Querying ${options.db} database...\n`);
  }

  let client;
  try {
    client = new Client({
      connectionString: poolerUrl,
      ssl: { rejectUnauthorized: false }  // Supabase pooler uses SSL; safe for dev
    });

    await client.connect();
    const result = await client.query(sql);

    // Format output
    if (options.format === 'json') {
      console.log(JSON.stringify(result.rows, null, 2));
    } else if (options.format === 'csv') {
      formatCSV(result.rows);
    } else {
      formatTable(result.rows);
    }

  } catch (error) {
    console.error('Query error:', error.message);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

main();
