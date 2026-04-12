#!/usr/bin/env node
/**
 * Runner for complete_orchestrator_sd() fix.
 * The migration runner splits on semicolons which breaks dollar-quoted plpgsql functions.
 * This script sends the CREATE OR REPLACE as a single query.
 */
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '20260412_fix_complete_orchestrator_sd_not_null_cols.sql');
const sql = readFileSync(sqlPath, 'utf-8');

const client = await createDatabaseClient('engineer', { verify: true });
try {
  await client.query(sql);
  console.log('SUCCESS: complete_orchestrator_sd() function replaced with NOT NULL column fix.');
} catch (err) {
  console.error('FAILED:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
