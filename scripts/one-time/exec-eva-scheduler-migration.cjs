/**
 * Execute EVA Master Scheduler migration
 *
 * Handles two known issues:
 * 1. GENERATED ALWAYS AS + NOW() is not immutable -- uses fallback regular column
 * 2. orchestration_metrics already exists with different schema -- creates eva_scheduler_metrics instead
 */
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

async function run() {
  const client = new Client({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database via pooler URL');

    // Check prerequisite tables
    const prereq = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('eva_ventures', 'eva_decisions', 'eva_scheduler_queue', 'orchestration_metrics', 'eva_scheduler_metrics', 'eva_scheduler_heartbeat')
      ORDER BY table_name;
    `);
    console.log('Existing relevant tables:', prereq.rows.map(r => r.table_name));

    const hasVentures = prereq.rows.some(r => r.table_name === 'eva_ventures');
    const hasDecisions = prereq.rows.some(r => r.table_name === 'eva_decisions');
    const hasOldMetrics = prereq.rows.some(r => r.table_name === 'orchestration_metrics');

    if (!hasVentures) {
      console.error('ERROR: eva_ventures table does not exist. Cannot create FK references.');
      process.exit(1);
    }
    if (!hasDecisions) {
      console.error('ERROR: eva_decisions table does not exist. Cannot create RPC function.');
      process.exit(1);
    }

    // Determine metrics table name
    let metricsTableName = 'orchestration_metrics';
    if (hasOldMetrics) {
      // Check if the existing table has event_type column (scheduler schema) or metric_id (old EVA schema)
      const colCheck = await client.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'orchestration_metrics' AND column_name = 'event_type'"
      );
      if (colCheck.rows.length === 0) {
        console.log('\nWARN: orchestration_metrics already exists with a DIFFERENT schema (EVA framework metrics).');
        console.log('  Using eva_scheduler_metrics as the scheduler metrics table name instead.\n');
        metricsTableName = 'eva_scheduler_metrics';
      } else {
        console.log('\norchestration_metrics already has event_type column -- reusing existing table.\n');
      }
    }

    console.log('Prerequisites verified. Executing migration statements...\n');

    // Execute each statement individually with error handling
    const statements = [
      // ── 1. eva_scheduler_queue ──────────────────────────────
      {
        name: '1. Create eva_scheduler_queue table (with generated column)',
        sql: `CREATE TABLE IF NOT EXISTS eva_scheduler_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES eva_ventures(id) ON DELETE CASCADE,
  last_blocking_decision_at TIMESTAMPTZ,
  blocking_decision_age_seconds NUMERIC GENERATED ALWAYS AS (
    CASE
      WHEN last_blocking_decision_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (NOW() - last_blocking_decision_at))
      ELSE 0
    END
  ) STORED,
  fifo_key TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'dispatching', 'blocked', 'paused', 'completed')),
  max_stages_per_cycle INTEGER NOT NULL DEFAULT 5,
  last_dispatched_at TIMESTAMPTZ,
  last_dispatch_outcome TEXT,
  dispatch_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`
      },
      {
        name: '1b. Create eva_scheduler_queue (FALLBACK - without generated column)',
        sql: `CREATE TABLE IF NOT EXISTS eva_scheduler_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES eva_ventures(id) ON DELETE CASCADE,
  last_blocking_decision_at TIMESTAMPTZ,
  fifo_key TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'dispatching', 'blocked', 'paused', 'completed')),
  max_stages_per_cycle INTEGER NOT NULL DEFAULT 5,
  last_dispatched_at TIMESTAMPTZ,
  last_dispatch_outcome TEXT,
  dispatch_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
        fallback: true
      },
      {
        name: '1c. Add blocking_decision_age_seconds as regular column (if fallback used)',
        sql: `DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'eva_scheduler_queue'
    AND column_name = 'blocking_decision_age_seconds'
  ) THEN
    ALTER TABLE eva_scheduler_queue ADD COLUMN blocking_decision_age_seconds NUMERIC DEFAULT 0;
  END IF;
END $$;`,
        dependsOnFallback: true
      },

      // ── Queue indexes ──────────────────────────────
      {
        name: '2. Unique index on venture_id',
        sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_esq_venture_id ON eva_scheduler_queue (venture_id);`
      },
      {
        name: '3. Scheduling order index',
        sql: `CREATE INDEX IF NOT EXISTS idx_esq_scheduling_order
  ON eva_scheduler_queue (status, blocking_decision_age_seconds DESC NULLS LAST, fifo_key ASC)
  WHERE status = 'pending';`
      },
      {
        name: '4. Status index',
        sql: `CREATE INDEX IF NOT EXISTS idx_esq_status ON eva_scheduler_queue (status);`
      },

      // ── 2. Scheduler metrics table ──────────────────────────────
      {
        name: `5. Create ${metricsTableName} table`,
        sql: `CREATE TABLE IF NOT EXISTS ${metricsTableName} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'scheduler_poll',
      'scheduler_dispatch',
      'scheduler_cadence_limited',
      'scheduler_circuit_breaker_pause',
      'scheduler_error'
    )),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduler_instance_id TEXT,
  venture_id UUID REFERENCES eva_ventures(id),
  stage_name TEXT,
  outcome TEXT CHECK (outcome IN ('success', 'failure', 'skipped', NULL)),
  failure_reason TEXT,
  duration_ms INTEGER,
  queue_depth INTEGER,
  dispatched_count INTEGER,
  paused BOOLEAN DEFAULT FALSE,
  pause_reason TEXT,
  stages_dispatched INTEGER,
  stages_remaining INTEGER,
  max_stages_per_cycle INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`
      },
      {
        name: '6. Event type + time index',
        sql: `CREATE INDEX IF NOT EXISTS idx_${metricsTableName === 'eva_scheduler_metrics' ? 'esm' : 'om'}_event_type_time ON ${metricsTableName} (event_type, occurred_at DESC);`
      },
      {
        name: '7. Venture time index',
        sql: `CREATE INDEX IF NOT EXISTS idx_${metricsTableName === 'eva_scheduler_metrics' ? 'esm' : 'om'}_venture_time ON ${metricsTableName} (venture_id, occurred_at DESC) WHERE venture_id IS NOT NULL;`
      },

      // ── 3. Heartbeat table ──────────────────────────────
      {
        name: '8. Create eva_scheduler_heartbeat table',
        sql: `CREATE TABLE IF NOT EXISTS eva_scheduler_heartbeat (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  instance_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_poll_at TIMESTAMPTZ,
  next_poll_at TIMESTAMPTZ,
  poll_count INTEGER NOT NULL DEFAULT 0,
  dispatch_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  circuit_breaker_state TEXT DEFAULT 'CLOSED',
  paused_reason TEXT,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'stopping', 'stopped')),
  metadata JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`
      },

      // ── 4. RPC function ──────────────────────────────
      {
        name: '9. Create select_schedulable_ventures RPC function',
        sql: `CREATE OR REPLACE FUNCTION select_schedulable_ventures(p_batch_size INTEGER DEFAULT 20)
RETURNS TABLE (
  queue_id UUID,
  venture_id UUID,
  blocking_decision_age_seconds NUMERIC,
  priority_score NUMERIC,
  fifo_key TIMESTAMPTZ,
  max_stages_per_cycle INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH lockable AS (
    SELECT
      q.id AS queue_id,
      q.venture_id,
      q.blocking_decision_age_seconds,
      q.fifo_key,
      q.max_stages_per_cycle,
      v.orchestrator_state
    FROM eva_scheduler_queue q
    JOIN eva_ventures v ON v.id = q.venture_id
    WHERE q.status = 'pending'
      AND v.orchestrator_state NOT IN ('blocked', 'failed')
    ORDER BY q.blocking_decision_age_seconds DESC NULLS LAST,
             q.fifo_key ASC
    LIMIT p_batch_size
    FOR UPDATE OF q SKIP LOCKED
  )
  SELECT
    l.queue_id,
    l.venture_id,
    l.blocking_decision_age_seconds,
    0::NUMERIC AS priority_score,
    l.fifo_key,
    l.max_stages_per_cycle
  FROM lockable l
  WHERE NOT EXISTS (
    SELECT 1 FROM eva_decisions d
    WHERE d.venture_id = l.venture_id
      AND d.status = 'pending'
  );
END;
$$ LANGUAGE plpgsql;`
      },

      // ── 5. Triggers ──────────────────────────────
      {
        name: '10. Create auto-enqueue trigger function',
        sql: `CREATE OR REPLACE FUNCTION fn_auto_enqueue_venture()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO eva_scheduler_queue (venture_id, fifo_key)
  VALUES (NEW.id, NOW())
  ON CONFLICT (venture_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;`
      },
      {
        name: '11. Create auto-enqueue trigger on eva_ventures',
        sql: `DROP TRIGGER IF EXISTS trg_auto_enqueue_venture ON eva_ventures;
CREATE TRIGGER trg_auto_enqueue_venture
  AFTER INSERT ON eva_ventures
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_enqueue_venture();`
      },

      // ── 6. Backfill ──────────────────────────────
      {
        name: '12. Backfill existing ventures into scheduler queue',
        sql: `INSERT INTO eva_scheduler_queue (venture_id, fifo_key)
SELECT id, COALESCE(created_at, NOW())
FROM eva_ventures
WHERE id NOT IN (SELECT venture_id FROM eva_scheduler_queue)
ON CONFLICT (venture_id) DO NOTHING;`
      },

      // ── 7. Updated_at trigger ──────────────────────────────
      {
        name: '13. Create updated_at trigger function',
        sql: `CREATE OR REPLACE FUNCTION fn_esq_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;`
      },
      {
        name: '14. Create updated_at trigger on eva_scheduler_queue',
        sql: `DROP TRIGGER IF EXISTS trg_esq_updated_at ON eva_scheduler_queue;
CREATE TRIGGER trg_esq_updated_at
  BEFORE UPDATE ON eva_scheduler_queue
  FOR EACH ROW
  EXECUTE FUNCTION fn_esq_updated_at();`
      },

      // ── 8. RLS ──────────────────────────────
      {
        name: '15. Enable RLS on eva_scheduler_queue',
        sql: `ALTER TABLE eva_scheduler_queue ENABLE ROW LEVEL SECURITY;`
      },
      {
        name: `16. Enable RLS on ${metricsTableName}`,
        sql: `ALTER TABLE ${metricsTableName} ENABLE ROW LEVEL SECURITY;`
      },
      {
        name: '17. Enable RLS on eva_scheduler_heartbeat',
        sql: `ALTER TABLE eva_scheduler_heartbeat ENABLE ROW LEVEL SECURITY;`
      },
      {
        name: '18. RLS: service_role on eva_scheduler_queue',
        sql: `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_esq' AND tablename = 'eva_scheduler_queue') THEN
    CREATE POLICY "service_role_esq" ON eva_scheduler_queue FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;`
      },
      {
        name: `19. RLS: service_role on ${metricsTableName}`,
        sql: `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_${metricsTableName === 'eva_scheduler_metrics' ? 'esm' : 'om'}' AND tablename = '${metricsTableName}') THEN
    CREATE POLICY "service_role_${metricsTableName === 'eva_scheduler_metrics' ? 'esm' : 'om'}" ON ${metricsTableName} FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;`
      },
      {
        name: '20. RLS: service_role on eva_scheduler_heartbeat',
        sql: `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_esh' AND tablename = 'eva_scheduler_heartbeat') THEN
    CREATE POLICY "service_role_esh" ON eva_scheduler_heartbeat FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;`
      },
      {
        name: '21. RLS: authenticated_read on eva_scheduler_queue',
        sql: `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_read_esq' AND tablename = 'eva_scheduler_queue') THEN
    CREATE POLICY "authenticated_read_esq" ON eva_scheduler_queue FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;`
      },
      {
        name: `22. RLS: authenticated_read on ${metricsTableName}`,
        sql: `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_read_${metricsTableName === 'eva_scheduler_metrics' ? 'esm' : 'om'}' AND tablename = '${metricsTableName}') THEN
    CREATE POLICY "authenticated_read_${metricsTableName === 'eva_scheduler_metrics' ? 'esm' : 'om'}" ON ${metricsTableName} FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;`
      },
      {
        name: '23. RLS: authenticated_read on eva_scheduler_heartbeat',
        sql: `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated_read_esh' AND tablename = 'eva_scheduler_heartbeat') THEN
    CREATE POLICY "authenticated_read_esh" ON eva_scheduler_heartbeat FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;`
      }
    ];

    let usedFallback = false;
    let successCount = 0;
    let skipCount = 0;

    for (const stmt of statements) {
      // Skip fallback statements if primary succeeded
      if (stmt.fallback && !usedFallback) {
        continue;
      }
      if (stmt.dependsOnFallback && !usedFallback) {
        continue;
      }

      try {
        console.log(`  Executing: ${stmt.name}...`);
        const result = await client.query(stmt.sql);
        const rowInfo = result.rowCount !== null && result.rowCount > 0 ? ` (${result.rowCount} rows)` : '';
        console.log(`  OK: ${stmt.name}${rowInfo}`);
        successCount++;
      } catch (err) {
        // If the primary CREATE TABLE fails due to immutability, mark for fallback
        if (stmt.name.includes('1. Create eva_scheduler_queue') && err.message.includes('immutable')) {
          console.log(`  WARN: Generated column not supported (NOW() is not immutable). Using fallback approach...`);
          usedFallback = true;
          continue;
        }
        // "already exists" errors are OK for idempotent operations
        if (err.message.includes('already exists')) {
          console.log(`  SKIP (already exists): ${stmt.name}`);
          skipCount++;
          continue;
        }
        console.error(`  FAIL: ${stmt.name}`);
        console.error(`    Error: ${err.message}`);
        if (err.detail) console.error(`    Detail: ${err.detail}`);
        throw err;
      }
    }

    console.log(`\n========================================`);
    console.log(`Migration complete!`);
    console.log(`  Successful: ${successCount}`);
    console.log(`  Skipped (already exists): ${skipCount}`);
    if (usedFallback) {
      console.log(`  Note: Used fallback for blocking_decision_age_seconds (regular column instead of generated).`);
      console.log(`        The RPC function and application code compute this at query time -- functionally equivalent.`);
    }
    if (metricsTableName !== 'orchestration_metrics') {
      console.log(`  Note: Scheduler metrics table created as '${metricsTableName}' to avoid conflict`);
      console.log(`        with existing 'orchestration_metrics' table (different schema).`);
      console.log(`        UPDATE your application code to reference '${metricsTableName}' instead of 'orchestration_metrics'.`);
    }
    console.log(`========================================\n`);

    // ── Verification ──────────────────────────────
    console.log('Verifying migration results...\n');

    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('eva_scheduler_queue', '${metricsTableName}', 'eva_scheduler_heartbeat')
      ORDER BY table_name;
    `);
    console.log('Tables present:', tables.rows.map(r => r.table_name));

    // Queue columns
    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'eva_scheduler_queue'
      ORDER BY ordinal_position;
    `);
    console.log('\neva_scheduler_queue columns:');
    cols.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type} (nullable: ${c.is_nullable})`));

    // Metrics columns
    const metricsCols = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = '${metricsTableName}'
      ORDER BY ordinal_position;
    `);
    console.log(`\n${metricsTableName} columns:`);
    metricsCols.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type} (nullable: ${c.is_nullable})`));

    // Heartbeat columns
    const hbCols = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'eva_scheduler_heartbeat'
      ORDER BY ordinal_position;
    `);
    console.log('\neva_scheduler_heartbeat columns:');
    hbCols.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type} (nullable: ${c.is_nullable})`));

    // Functions
    const funcs = await client.query(`
      SELECT routine_name FROM information_schema.routines
      WHERE routine_schema = 'public'
      AND routine_name IN ('select_schedulable_ventures', 'fn_auto_enqueue_venture', 'fn_esq_updated_at')
      ORDER BY routine_name;
    `);
    console.log('\nFunctions:', funcs.rows.map(r => r.routine_name));

    // Triggers
    const triggers = await client.query(`
      SELECT trigger_name, event_object_table
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
      AND trigger_name IN ('trg_auto_enqueue_venture', 'trg_esq_updated_at')
      ORDER BY trigger_name;
    `);
    console.log('\nTriggers:', triggers.rows.map(r => `${r.trigger_name} on ${r.event_object_table}`));

    // RLS policies
    const policies = await client.query(`
      SELECT policyname, tablename FROM pg_policies
      WHERE tablename IN ('eva_scheduler_queue', '${metricsTableName}', 'eva_scheduler_heartbeat')
      ORDER BY tablename, policyname;
    `);
    console.log('\nRLS policies:');
    policies.rows.forEach(r => console.log(`  ${r.policyname} on ${r.tablename}`));

    // Queue count
    const queueCount = await client.query('SELECT COUNT(*) as cnt FROM eva_scheduler_queue;');
    console.log('\nQueue entries (backfilled from eva_ventures):', queueCount.rows[0].cnt);

    // Venture count for comparison
    const ventureCount = await client.query('SELECT COUNT(*) as cnt FROM eva_ventures;');
    console.log('Total ventures:', ventureCount.rows[0].cnt);

  } finally {
    await client.end();
    console.log('\nConnection closed.');
  }
}

run().catch(err => {
  console.error('\nMIGRATION FAILED:', err.message);
  process.exit(1);
});
