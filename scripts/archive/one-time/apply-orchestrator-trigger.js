#!/usr/bin/env node
/**
 * Apply the orchestrator type enforcement trigger
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function applyTrigger() {
  console.log('Creating orchestrator type enforcement trigger...\n');

  // Use pooler URL from environment
  const connectionString = process.env.SUPABASE_POOLER_URL;
  if (!connectionString) {
    console.error('Error: SUPABASE_POOLER_URL not set');
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Create the trigger function
    const createFunction = `
      CREATE OR REPLACE FUNCTION enforce_parent_orchestrator_type()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.parent_sd_id IS NOT NULL THEN
          UPDATE strategic_directives_v2
          SET
            sd_type = 'orchestrator',
            updated_at = NOW()
          WHERE id = NEW.parent_sd_id
          AND sd_type != 'orchestrator';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `;

    await client.query(createFunction);
    console.log('✅ Created function: enforce_parent_orchestrator_type()');

    // Drop existing trigger if exists
    await client.query('DROP TRIGGER IF EXISTS trg_enforce_parent_orchestrator_type ON strategic_directives_v2');
    console.log('✅ Dropped existing trigger (if any)');

    // Create the trigger
    const createTrigger = `
      CREATE TRIGGER trg_enforce_parent_orchestrator_type
        AFTER INSERT OR UPDATE OF parent_sd_id
        ON strategic_directives_v2
        FOR EACH ROW
        EXECUTE FUNCTION enforce_parent_orchestrator_type();
    `;

    await client.query(createTrigger);
    console.log('✅ Created trigger: trg_enforce_parent_orchestrator_type');

    // Add comment
    const addComment = `
      COMMENT ON FUNCTION enforce_parent_orchestrator_type() IS
      'LEO Protocol Governance: Auto-sets sd_type=orchestrator for parent SDs. Created 2025-12-27.';
    `;

    await client.query(addComment);
    console.log('✅ Added documentation comment');

    console.log('\n🎉 Trigger successfully created!');
    console.log('   Any SD with children will now automatically be set to orchestrator type.');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

applyTrigger().catch(console.error);
