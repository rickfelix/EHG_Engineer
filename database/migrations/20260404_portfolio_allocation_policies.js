import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;
const client = new Client({ connectionString: process.env.SUPABASE_POOLER_URL });

async function run() {
  await client.connect();
  console.log('Connected to database via SUPABASE_POOLER_URL');

  // STEP 1: Drop duplicate CHECK constraint
  console.log('\n=== STEP 1: Drop duplicate CHECK constraint ===');
  try {
    await client.query('ALTER TABLE ventures DROP CONSTRAINT IF EXISTS ventures_portfolio_synergy_score_check;');
    console.log('SUCCESS: Dropped ventures_portfolio_synergy_score_check (or did not exist)');
  } catch (e) {
    console.error('FAILURE Step 1:', e.message);
  }

  // STEP 2: Create portfolio_allocation_policies table
  console.log('\n=== STEP 2: Create portfolio_allocation_policies table ===');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS portfolio_allocation_policies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        policy_version INTEGER NOT NULL,
        policy_key TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT false,
        activated_at TIMESTAMPTZ,
        activated_by TEXT,
        deactivated_at TIMESTAMPTZ,
        dimensions JSONB NOT NULL DEFAULT '[]'::jsonb,
        weights JSONB NOT NULL DEFAULT '{}'::jsonb,
        phase_definitions JSONB NOT NULL DEFAULT '[]'::jsonb,
        archetype_unlock_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        board_approved BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by TEXT NOT NULL,
        CONSTRAINT policy_version_key_unique UNIQUE (policy_key, policy_version)
      );
    `);
    console.log('SUCCESS: portfolio_allocation_policies table created');

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_policy_per_key
      ON portfolio_allocation_policies (policy_key) WHERE (is_active = true);
    `);
    console.log('SUCCESS: Partial unique index idx_one_active_policy_per_key created');

    await client.query(`
      CREATE OR REPLACE FUNCTION update_policy_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('SUCCESS: update_policy_updated_at function created');

    await client.query(`
      CREATE TRIGGER trg_policy_updated_at
      BEFORE UPDATE ON portfolio_allocation_policies
      FOR EACH ROW EXECUTE FUNCTION update_policy_updated_at();
    `);
    console.log('SUCCESS: trg_policy_updated_at trigger created');

    await client.query(`
      ALTER TABLE portfolio_allocation_policies ENABLE ROW LEVEL SECURITY;
    `);
    console.log('SUCCESS: RLS enabled on portfolio_allocation_policies');

    await client.query(`
      CREATE POLICY "service_role_all_policy" ON portfolio_allocation_policies
        FOR ALL TO service_role USING (true) WITH CHECK (true);
    `);
    console.log('SUCCESS: service_role_all_policy RLS policy created');

    await client.query(`
      CREATE POLICY "authenticated_read_active_policy" ON portfolio_allocation_policies
        FOR SELECT TO authenticated USING (is_active = true);
    `);
    console.log('SUCCESS: authenticated_read_active_policy RLS policy created');

    await client.query(`
      COMMENT ON TABLE portfolio_allocation_policies IS 'Versioned portfolio allocation policies for EHG glide path. Only one active per policy_key.';
    `);
    console.log('SUCCESS: Table comment added');

  } catch (e) {
    console.error('FAILURE Step 2:', e.message);
  }

  // STEP 3: Create policy_audit_log table
  console.log('\n=== STEP 3: Create policy_audit_log table ===');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS policy_audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type TEXT NOT NULL CHECK (event_type IN ('INSERT', 'ACTIVATE', 'DEACTIVATE', 'DRY_RUN', 'SCORE_RUN')),
        policy_id UUID REFERENCES portfolio_allocation_policies(id),
        policy_version INTEGER NOT NULL,
        actor TEXT NOT NULL,
        venture_id UUID,
        diff JSONB,
        score_output JSONB,
        dry_run BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    console.log('SUCCESS: policy_audit_log table created');

    await client.query(`
      CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'policy_audit_log is append-only. UPDATE and DELETE operations are not allowed.';
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('SUCCESS: prevent_audit_log_mutation function created');

    await client.query(`
      CREATE TRIGGER trg_no_update_audit
      BEFORE UPDATE ON policy_audit_log
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
    `);
    console.log('SUCCESS: trg_no_update_audit trigger created');

    await client.query(`
      CREATE TRIGGER trg_no_delete_audit
      BEFORE DELETE ON policy_audit_log
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
    `);
    console.log('SUCCESS: trg_no_delete_audit trigger created');

    await client.query(`
      CREATE INDEX idx_audit_policy_id ON policy_audit_log (policy_id);
    `);
    console.log('SUCCESS: idx_audit_policy_id index created');

    await client.query(`
      CREATE INDEX idx_audit_venture_id ON policy_audit_log (venture_id) WHERE venture_id IS NOT NULL;
    `);
    console.log('SUCCESS: idx_audit_venture_id index created');

    await client.query(`
      CREATE INDEX idx_audit_event_type ON policy_audit_log (event_type);
    `);
    console.log('SUCCESS: idx_audit_event_type index created');

    await client.query(`
      ALTER TABLE policy_audit_log ENABLE ROW LEVEL SECURITY;
    `);
    console.log('SUCCESS: RLS enabled on policy_audit_log');

    await client.query(`
      CREATE POLICY "service_role_all_audit" ON policy_audit_log
        FOR ALL TO service_role USING (true) WITH CHECK (true);
    `);
    console.log('SUCCESS: service_role_all_audit RLS policy created');

    await client.query(`
      CREATE POLICY "authenticated_read_audit" ON policy_audit_log
        FOR SELECT TO authenticated USING (true);
    `);
    console.log('SUCCESS: authenticated_read_audit RLS policy created');

    await client.query(`
      COMMENT ON TABLE policy_audit_log IS 'Append-only audit log for portfolio allocation policy mutations. UPDATE/DELETE blocked by trigger.';
    `);
    console.log('SUCCESS: Table comment added');

  } catch (e) {
    console.error('FAILURE Step 3:', e.message);
  }

  // Verification
  console.log('\n=== VERIFICATION ===');
  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('portfolio_allocation_policies', 'policy_audit_log')
    ORDER BY table_name;
  `);
  console.log('Tables found:', tables.rows.map(r => r.table_name).join(', '));

  const constraints = await client.query(`
    SELECT constraint_name FROM information_schema.table_constraints
    WHERE table_name = 'ventures' AND constraint_name = 'ventures_portfolio_synergy_score_check';
  `);
  console.log('ventures_portfolio_synergy_score_check still exists:', constraints.rows.length > 0);

  const triggers = await client.query(`
    SELECT trigger_name, event_object_table FROM information_schema.triggers
    WHERE event_object_table IN ('portfolio_allocation_policies', 'policy_audit_log')
    ORDER BY event_object_table, trigger_name;
  `);
  console.log('Triggers:');
  triggers.rows.forEach(r => console.log('  ', r.event_object_table, '->', r.trigger_name));

  const rls = await client.query(`
    SELECT tablename, policyname FROM pg_policies
    WHERE tablename IN ('portfolio_allocation_policies', 'policy_audit_log')
    ORDER BY tablename, policyname;
  `);
  console.log('RLS Policies:');
  rls.rows.forEach(r => console.log('  ', r.tablename, '->', r.policyname));

  const indexes = await client.query(`
    SELECT indexname, tablename FROM pg_indexes
    WHERE tablename IN ('portfolio_allocation_policies', 'policy_audit_log')
    ORDER BY tablename, indexname;
  `);
  console.log('Indexes:');
  indexes.rows.forEach(r => console.log('  ', r.tablename, '->', r.indexname));

  await client.end();
  console.log('\nMigration complete.');
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
