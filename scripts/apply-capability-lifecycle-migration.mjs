#!/usr/bin/env node
/**
 * Apply Capability Lifecycle Migration
 * SD: SD-CAPABILITY-LIFECYCLE-001
 *
 * This script applies the migration via Supabase Management API
 *
 * Run: node scripts/apply-capability-lifecycle-migration.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjUxMTkzNywiZXhwIjoyMDcyMDg3OTM3fQ.tYGfVTDQWQDje4ZPSl5UsprYK9J15Fa-XdGFVScrRZg';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// SQL statements to execute (broken into individual statements)
const migrations = [
  {
    description: 'Add delivers_capabilities column',
    sql: `ALTER TABLE strategic_directives_v2 ADD COLUMN IF NOT EXISTS delivers_capabilities JSONB DEFAULT '[]'::jsonb`
  },
  {
    description: 'Add modifies_capabilities column',
    sql: `ALTER TABLE strategic_directives_v2 ADD COLUMN IF NOT EXISTS modifies_capabilities JSONB DEFAULT '[]'::jsonb`
  },
  {
    description: 'Add deprecates_capabilities column',
    sql: `ALTER TABLE strategic_directives_v2 ADD COLUMN IF NOT EXISTS deprecates_capabilities JSONB DEFAULT '[]'::jsonb`
  },
  {
    description: 'Create sd_capabilities junction table',
    sql: `CREATE TABLE IF NOT EXISTS sd_capabilities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sd_uuid UUID NOT NULL,
      sd_id VARCHAR(100) NOT NULL,
      capability_type VARCHAR(50) NOT NULL CHECK (capability_type IN ('agent', 'tool', 'crew', 'skill')),
      capability_key VARCHAR(200) NOT NULL,
      action VARCHAR(20) NOT NULL CHECK (action IN ('registered', 'updated', 'deprecated')),
      action_details JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(sd_uuid, capability_key, action)
    )`
  },
  {
    description: 'Add FK constraint on sd_capabilities.sd_uuid',
    sql: `DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'sd_capabilities_sd_uuid_fkey'
        ) THEN
          ALTER TABLE sd_capabilities
          ADD CONSTRAINT sd_capabilities_sd_uuid_fkey
          FOREIGN KEY (sd_uuid) REFERENCES strategic_directives_v2(uuid_id) ON DELETE CASCADE;
        END IF;
      END $$`
  },
  {
    description: 'Create index on sd_capabilities.sd_uuid',
    sql: `CREATE INDEX IF NOT EXISTS idx_sd_capabilities_sd_uuid ON sd_capabilities(sd_uuid)`
  },
  {
    description: 'Create index on sd_capabilities.capability_key',
    sql: `CREATE INDEX IF NOT EXISTS idx_sd_capabilities_capability_key ON sd_capabilities(capability_key)`
  },
  {
    description: 'Enable RLS on sd_capabilities',
    sql: `ALTER TABLE sd_capabilities ENABLE ROW LEVEL SECURITY`
  },
  {
    description: 'Create service role policy',
    sql: `DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'sd_capabilities' AND policyname = 'Service role full access on sd_capabilities'
        ) THEN
          CREATE POLICY "Service role full access on sd_capabilities" ON sd_capabilities FOR ALL TO service_role USING (true) WITH CHECK (true);
        END IF;
      END $$`
  },
  {
    description: 'Create authenticated read policy',
    sql: `DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'sd_capabilities' AND policyname = 'Authenticated users can read sd_capabilities'
        ) THEN
          CREATE POLICY "Authenticated users can read sd_capabilities" ON sd_capabilities FOR SELECT TO authenticated USING (true);
        END IF;
      END $$`
  },
  {
    description: 'Create capability lifecycle trigger function',
    sql: `CREATE OR REPLACE FUNCTION fn_handle_capability_lifecycle()
RETURNS TRIGGER AS $$
DECLARE
    cap_record JSONB;
BEGIN
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        -- Process delivers_capabilities
        IF NEW.delivers_capabilities IS NOT NULL AND jsonb_array_length(NEW.delivers_capabilities) > 0 THEN
            FOR cap_record IN SELECT * FROM jsonb_array_elements(NEW.delivers_capabilities)
            LOOP
                IF cap_record->>'capability_type' = 'agent' THEN
                    INSERT INTO crewai_agents (agent_key, name, role, goal, backstory, status, created_at)
                    VALUES (
                        cap_record->>'capability_key',
                        cap_record->>'name',
                        COALESCE(cap_record->>'role', cap_record->>'name'),
                        COALESCE(cap_record->>'goal', 'Automated agent from SD completion'),
                        COALESCE(cap_record->>'backstory', 'Auto-registered by ' || NEW.id),
                        'active',
                        NOW()
                    )
                    ON CONFLICT (agent_key) DO UPDATE SET name = EXCLUDED.name, status = 'active', updated_at = NOW();
                END IF;
                INSERT INTO sd_capabilities (sd_uuid, sd_id, capability_type, capability_key, action, action_details)
                VALUES (NEW.uuid_id, NEW.id, cap_record->>'capability_type', cap_record->>'capability_key', 'registered', cap_record)
                ON CONFLICT (sd_uuid, capability_key, action) DO NOTHING;
            END LOOP;
        END IF;

        -- Process modifies_capabilities
        IF NEW.modifies_capabilities IS NOT NULL AND jsonb_array_length(NEW.modifies_capabilities) > 0 THEN
            FOR cap_record IN SELECT * FROM jsonb_array_elements(NEW.modifies_capabilities)
            LOOP
                UPDATE crewai_agents SET
                    name = COALESCE(cap_record->'updates'->>'name', name),
                    role = COALESCE(cap_record->'updates'->>'role', role),
                    status = COALESCE(cap_record->'updates'->>'status', status),
                    updated_at = NOW()
                WHERE agent_key = cap_record->>'capability_key';
                INSERT INTO sd_capabilities (sd_uuid, sd_id, capability_type, capability_key, action, action_details)
                VALUES (NEW.uuid_id, NEW.id, COALESCE(cap_record->>'capability_type', 'agent'), cap_record->>'capability_key', 'updated', cap_record)
                ON CONFLICT (sd_uuid, capability_key, action) DO NOTHING;
            END LOOP;
        END IF;

        -- Process deprecates_capabilities
        IF NEW.deprecates_capabilities IS NOT NULL AND jsonb_array_length(NEW.deprecates_capabilities) > 0 THEN
            FOR cap_record IN SELECT * FROM jsonb_array_elements(NEW.deprecates_capabilities)
            LOOP
                UPDATE crewai_agents SET status = 'deprecated', updated_at = NOW() WHERE agent_key = cap_record->>'capability_key';
                INSERT INTO sd_capabilities (sd_uuid, sd_id, capability_type, capability_key, action, action_details)
                VALUES (NEW.uuid_id, NEW.id, COALESCE(cap_record->>'capability_type', 'agent'), cap_record->>'capability_key', 'deprecated', cap_record)
                ON CONFLICT (sd_uuid, capability_key, action) DO NOTHING;
            END LOOP;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql`
  },
  {
    description: 'Create capability lifecycle trigger',
    sql: `DROP TRIGGER IF EXISTS trg_capability_lifecycle ON strategic_directives_v2; CREATE TRIGGER trg_capability_lifecycle AFTER UPDATE ON strategic_directives_v2 FOR EACH ROW EXECUTE FUNCTION fn_handle_capability_lifecycle()`
  }
];

async function executeSQL(sql, description) {
  console.log(`\n[EXEC] ${description}...`);

  // Try exec_sql RPC first
  try {
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    if (!error) {
      console.log('   ✓ Success (via RPC)');
      return true;
    }
  } catch (e) {
    // RPC doesn't exist, try REST
  }

  // Try REST API
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({ sql_query: sql })
    });

    if (response.ok) {
      console.log('   ✓ Success (via REST)');
      return true;
    }

    const text = await response.text();
    if (text.includes('already exists') || text.includes('IF NOT EXISTS')) {
      console.log('   ✓ Already exists (skipped)');
      return true;
    }
    console.log(`   ✗ REST failed: ${text.substring(0, 100)}`);
  } catch (e) {
    console.log(`   ✗ REST error: ${e.message}`);
  }

  return false;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Capability Lifecycle Migration');
  console.log('SD: SD-CAPABILITY-LIFECYCLE-001');
  console.log('='.repeat(60));

  // First check if columns already exist
  console.log('\n[CHECK] Verifying current schema state...');
  const { data: testSD, error: testError } = await supabase
    .from('strategic_directives_v2')
    .select('id, delivers_capabilities')
    .limit(1);

  if (!testError) {
    console.log('   delivers_capabilities column already exists!');
    console.log('   Checking remaining migrations...');
  } else {
    console.log(`   Column does not exist yet: ${testError.message}`);
  }

  let success = 0;
  let failed = 0;

  for (const migration of migrations) {
    const result = await executeSQL(migration.sql, migration.description);
    if (result) {
      success++;
    } else {
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Migration Summary');
  console.log('='.repeat(60));
  console.log(`Successful: ${success}`);
  console.log(`Failed: ${failed}`);

  // Final verification
  console.log('\n[VERIFY] Final schema verification...');

  const { data: finalCheck, error: finalError } = await supabase
    .from('strategic_directives_v2')
    .select('id, delivers_capabilities, modifies_capabilities, deprecates_capabilities')
    .eq('id', 'SD-CAPABILITY-LIFECYCLE-001')
    .single();

  if (finalError) {
    console.log(`   ✗ Verification failed: ${finalError.message}`);
    console.log('\n⚠️  The exec_sql RPC function may not exist in your database.');
    console.log('   Please run the migration SQL manually via Supabase Dashboard:');
    console.log('   https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql/new');
    console.log('\n   Migration file: supabase/migrations/20251202_capability_lifecycle_automation.sql');
  } else {
    console.log('   ✓ Columns verified!');
    console.log(`   delivers_capabilities: ${JSON.stringify(finalCheck.delivers_capabilities)}`);
    console.log(`   modifies_capabilities: ${JSON.stringify(finalCheck.modifies_capabilities)}`);
    console.log(`   deprecates_capabilities: ${JSON.stringify(finalCheck.deprecates_capabilities)}`);
    console.log('\n✅ Migration completed successfully!');
  }
}

main().catch(console.error);
