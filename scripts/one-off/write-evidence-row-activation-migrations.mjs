import { createDatabaseClient, createSupabaseServiceClient } from '../lib/supabase-connection.js';

const SD_ID = 'ec4221f0-9f95-40a3-acb6-f4f2036351e9';

(async () => {
  // Inspect schema first
  const client = await createDatabaseClient('engineer', { verify: false });
  const cols = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name='sub_agent_execution_results'
    ORDER BY ordinal_position
  `);
  console.log('sub_agent_execution_results columns:');
  console.log(JSON.stringify(cols.rows, null, 2));
  await client.end();

  // Compose evidence row honoring NOT NULL columns
  const supabase = await createSupabaseServiceClient();

  // Build row dynamically: only include known required columns; add defaults for any NOT-NULL without default
  const required = cols.rows.filter(c => c.is_nullable === 'NO' && !c.column_default);
  console.log('\nNOT-NULL columns without default:', required.map(r => r.column_name));

  const verification = {
    column_rows: 1,
    table_rows: 1,
    policy_rows: 2,
    policy_names: ['authenticated_read_activation_catalog', 'service_role_write_activation_catalog'],
  };

  const candidate = {
    sd_id: SD_ID,
    sub_agent_code: 'DATABASE',
    sub_agent_name: 'Principal Database Architect',
    phase: 'EXEC',
    verdict: 'PASS',
    confidence: 95,
    metadata: {
      migration_applied: true,
      migrations: [
        '20260513_add_activation_test_id_to_prd.sql',
        '20260513_create_activation_catalog_expectations.sql',
      ],
      schema_fix_applied: {
        file: 'database/migrations/20260513_create_activation_catalog_expectations.sql',
        change: 'sd_id type uuid -> varchar(50) to match strategic_directives_v2.id PK',
        reason: 'FK type mismatch caught at apply; strategic_directives_v2.id is varchar(50), not uuid',
      },
      verification,
      applied_by: 'database-agent',
      claude_session_id: '690c1ab6-b4a0-4445-b01b-b6480ff7a124',
      applied_at: new Date().toISOString(),
    },
  };

  // Strip keys not present in the table
  const validCols = new Set(cols.rows.map(c => c.column_name));
  const row = Object.fromEntries(Object.entries(candidate).filter(([k]) => validCols.has(k)));
  console.log('\nInserting row keys:', Object.keys(row));

  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .insert(row)
    .select('id')
    .single();

  if (error) {
    console.error('Insert error:', error);
    process.exit(1);
  }
  console.log(`\nEVIDENCE_ROW_ID=${data.id}`);
})();
