#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type Args = {
  files: string[];
  stopOnError: boolean;
  envFile: string;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const files: string[] = [];
  let stopOnError = true;
  let envFile = process.env.PSQL_ENV || '.env.staging';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--no-stop-on-error') {
      stopOnError = false;
    } else if (args[i] === '--env' && args[i + 1]) {
      envFile = args[++i];
    } else if (!args[i].startsWith('--')) {
      files.push(args[i]);
    }
  }

  return { files, stopOnError, envFile };
}

function loadEnv(envPath: string) {
  if (!fs.existsSync(envPath)) {
    console.warn(`Warning: env file not found: ${envPath}`);
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) {
      const key = m[1];
      let value = m[2];
      // Strip quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

async function run() {
  const { files, stopOnError, envFile } = parseArgs();

  if (!files.length) {
    console.error('Usage: dbexec <file1.sql> [file2.sql ...] [--env .env.staging] [--no-stop-on-error]');
    console.error('Example: node dbexec.bundle.mjs db/migrations/*.sql --env .env.staging');
    process.exit(2);
  }

  loadEnv(envFile);

  const client = new Client({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  });

  console.log(`Connecting to ${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE} as ${process.env.PGUSER}`);

  const started = Date.now();
  let totalRows = 0;

  try {
    await client.connect();
    console.log('Connected successfully');

    // Start transaction
    await client.query('BEGIN;');
    console.log('Transaction started');

    for (const file of files) {
      const resolvedPath = path.resolve(file);
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File not found: ${resolvedPath}`);
      }

      const sql = fs.readFileSync(resolvedPath, 'utf8');
      console.log(`Executing: ${file}`);

      try {
        const result = await client.query(sql);
        const rowCount = result.rowCount || 0;
        totalRows += rowCount;
        console.log(`✓ Applied ${file} (${rowCount} rows affected)`);
      } catch (queryError: any) {
        console.error(`✗ Error in ${file}: ${queryError.message}`);
        if (stopOnError) {
          throw queryError;
        }
      }
    }

    // Commit transaction
    await client.query('COMMIT;');
    console.log('Transaction committed successfully');

  } catch (error: any) {
    console.error(`Fatal error: ${error.message || error}`);

    try {
      await client.query('ROLLBACK;');
      console.log('Transaction rolled back');
    } catch (rollbackError) {
      console.error('Failed to rollback:', rollbackError);
    }

    if (stopOnError) {
      process.exit(1);
    }
  } finally {
    await client.end();
    const elapsed = Math.round((Date.now() - started) / 1000);
    console.log(`\nCompleted in ${elapsed}s (${totalRows} total rows affected)`);
  }
}

// Main execution
run().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});