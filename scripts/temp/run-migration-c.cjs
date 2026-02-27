require('dotenv').config();
const { Client } = require('pg');

async function run() {
  // Build connection from env
  const projectRef = process.env.SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');
  const dbPass = process.env.SUPABASE_DB_PASSWORD || process.env.DB_PASSWORD || '';

  // Try direct connection
  const connStr = process.env.SUPABASE_POOLER_URL;

  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log('Connected to database');

    const sql = `
      ALTER TABLE lead_evaluations
        ADD COLUMN IF NOT EXISTS business_value_score integer DEFAULT 50,
        ADD COLUMN IF NOT EXISTS duplication_risk_score integer DEFAULT 50,
        ADD COLUMN IF NOT EXISTS resource_cost_score integer DEFAULT 50,
        ADD COLUMN IF NOT EXISTS scope_complexity_score integer DEFAULT 50,
        ADD COLUMN IF NOT EXISTS technical_debt_impact text DEFAULT 'NONE',
        ADD COLUMN IF NOT EXISTS dependency_risk text DEFAULT 'NONE';
    `;

    await client.query(sql);
    console.log('Columns added successfully');

    // Add check constraints
    const constraints = [
      "ALTER TABLE lead_evaluations ADD CONSTRAINT lead_eval_bvs_range CHECK (business_value_score >= 0 AND business_value_score <= 100)",
      "ALTER TABLE lead_evaluations ADD CONSTRAINT lead_eval_drs_range CHECK (duplication_risk_score >= 0 AND duplication_risk_score <= 100)",
      "ALTER TABLE lead_evaluations ADD CONSTRAINT lead_eval_rcs_range CHECK (resource_cost_score >= 0 AND resource_cost_score <= 100)",
      "ALTER TABLE lead_evaluations ADD CONSTRAINT lead_eval_scs_range CHECK (scope_complexity_score >= 0 AND scope_complexity_score <= 100)",
      "ALTER TABLE lead_evaluations ADD CONSTRAINT lead_eval_tdi_check CHECK (technical_debt_impact IN ('NONE','LOW','MEDIUM','HIGH','CRITICAL'))",
      "ALTER TABLE lead_evaluations ADD CONSTRAINT lead_eval_dr_check CHECK (dependency_risk IN ('NONE','LOW','MEDIUM','HIGH','CRITICAL'))"
    ];

    for (const c of constraints) {
      try {
        await client.query(c);
        console.log('Added constraint:', c.match(/CONSTRAINT (\S+)/)?.[1]);
      } catch (e) {
        if (e.message.includes('already exists')) {
          console.log('Constraint already exists, skipping');
        } else {
          console.error('Constraint error:', e.message);
        }
      }
    }

    console.log('Migration complete');
  } catch (e) {
    console.error('Connection/query error:', e.message);
  } finally {
    await client.end();
  }
}

run();
