#!/usr/bin/env node
/**
 * Migration: Create specialist_registry table
 *
 * Required by: lib/proving-companion/specialist-persister.js
 * Purpose: Stores Board of Directors specialist entries (one per assessed venture stage)
 *          with upsert-on-conflict(role) semantics.
 *
 * Idempotent — safe to re-run (uses IF NOT EXISTS / IF EXISTS guards).
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../..', '.env') });

const { Client } = pg;

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS specialist_registry (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  role          TEXT NOT NULL UNIQUE,
  expertise     TEXT NOT NULL,
  context       TEXT CHECK (char_length(context) <= 8000),
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE specialist_registry IS 'Board of Directors specialist registry — one entry per assessed venture stage, upserted by proving companion';
COMMENT ON COLUMN specialist_registry.role IS 'Unique specialist role identifier (e.g. venture-stage-5), used as upsert conflict target';
COMMENT ON COLUMN specialist_registry.context IS 'Stage assessment context (capped at 8000 chars / ~2000 tokens)';
COMMENT ON COLUMN specialist_registry.metadata IS 'Flexible metadata: source_venture_id, stage_number, created_by';

CREATE OR REPLACE FUNCTION set_specialist_registry_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_specialist_registry_updated_at ON specialist_registry;
CREATE TRIGGER trg_specialist_registry_updated_at
  BEFORE UPDATE ON specialist_registry
  FOR EACH ROW
  EXECUTE FUNCTION set_specialist_registry_updated_at();

ALTER TABLE specialist_registry ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'specialist_registry'
      AND policyname = 'service_role_full_access_specialist_registry'
  ) THEN
    CREATE POLICY service_role_full_access_specialist_registry
      ON specialist_registry
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_specialist_registry_role ON specialist_registry (role);
CREATE INDEX IF NOT EXISTS idx_specialist_registry_metadata ON specialist_registry USING GIN (metadata);
`;

async function runMigration() {
  console.log('\\n=== Migration: create specialist_registry ===\\n');

  const connectionString = process.env.SUPABASE_POOLER_URL;
  if (!connectionString) {
    console.error('SUPABASE_POOLER_URL not set in .env');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  try {
    await client.connect();
    const verifyResult = await client.query('SELECT current_database(), current_user');
    console.log(`Connected to: ${verifyResult.rows[0].current_database} as ${verifyResult.rows[0].current_user}`);

    const statements = splitStatements(MIGRATION_SQL);
    console.log(`Executing ${statements.length} statements...\\n`);

    let success = 0;
    let skipped = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.replace(/\\s+/g, ' ').substring(0, 90);
      try {
        await client.query(stmt);
        console.log(`  [${i + 1}/${statements.length}] OK: ${preview}...`);
        success++;
      } catch (err) {
        if (err.message.includes('already exists') || err.message.includes('already enabled')) {
          console.log(`  [${i + 1}/${statements.length}] SKIP (already exists): ${preview}...`);
          skipped++;
        } else {
          console.error(`  [${i + 1}/${statements.length}] ERROR: ${err.message}`);
          throw err;
        }
      }
    }

    console.log(`\\n--- Summary: ${success} succeeded, ${skipped} skipped ---\\n`);
    console.log('Migration completed successfully.\\n');

  } catch (err) {
    console.error('\\nMigration FAILED:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

function splitStatements(sql) {
  const statements = [];
  let current = '';
  let inDollarQuote = false;

  for (let i = 0; i < sql.length; i++) {
    if (sql[i] === '$' && sql[i + 1] === '$') {
      inDollarQuote = !inDollarQuote;
      current += '$$';
      i++;
    } else if (sql[i] === ';' && !inDollarQuote) {
      const trimmed = current.trim();
      if (trimmed.length > 0 && !isCommentOnly(trimmed)) {
        statements.push(trimmed);
      }
      current = '';
    } else {
      current += sql[i];
    }
  }

  const trimmed = current.trim();
  if (trimmed.length > 0 && !isCommentOnly(trimmed)) {
    statements.push(trimmed);
  }

  return statements;
}

function isCommentOnly(sql) {
  const lines = sql.split('\\n').filter(l => l.trim().length > 0);
  return lines.every(l => l.trim().startsWith('--'));
}

runMigration();
