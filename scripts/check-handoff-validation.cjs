const { Client } = require('pg');
require('dotenv').config();

(async () => {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   HANDOFF VALIDATION CHECKER');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const client = new Client({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');
    console.log('');

    // Check table structure
    console.log('─── TABLE STRUCTURE ───');
    console.log('');
    const tableInfo = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'sd_phase_handoffs'
      ORDER BY ordinal_position;
    `);

    tableInfo.rows.forEach(col => {
      const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)';
      const hasDefault = col.column_default ? `[default: ${col.column_default}]` : '';
      console.log(`  ${col.column_name.padEnd(25)} ${col.data_type.padEnd(20)} ${nullable} ${hasDefault}`);
    });

    console.log('');
    console.log('─── TRIGGERS ON TABLE ───');
    console.log('');

    const triggers = await client.query(`
      SELECT
        trigger_name,
        event_manipulation,
        action_statement,
        action_timing
      FROM information_schema.triggers
      WHERE event_object_table = 'sd_phase_handoffs'
      ORDER BY trigger_name;
    `);

    if (triggers.rows.length > 0) {
      triggers.rows.forEach(trig => {
        console.log(`  Trigger: ${trig.trigger_name}`);
        console.log(`    Timing: ${trig.action_timing} ${trig.event_manipulation}`);
        console.log(`    Action: ${trig.action_statement}`);
        console.log('');
      });
    } else {
      console.log('  No triggers found');
    }

    console.log('');
    console.log('─── CHECK CONSTRAINTS ───');
    console.log('');

    const constraints = await client.query(`
      SELECT
        con.conname AS constraint_name,
        con.contype AS constraint_type,
        pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      INNER JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = 'sd_phase_handoffs';
    `);

    if (constraints.rows.length > 0) {
      constraints.rows.forEach(cons => {
        const type = {
          'c': 'CHECK',
          'f': 'FOREIGN KEY',
          'p': 'PRIMARY KEY',
          'u': 'UNIQUE'
        }[cons.constraint_type] || cons.constraint_type;
        console.log(`  ${cons.constraint_name} (${type})`);
        console.log(`    ${cons.definition}`);
        console.log('');
      });
    } else {
      console.log('  No check constraints found');
    }

    console.log('');
    console.log('─── FUNCTIONS THAT MIGHT VALIDATE HANDOFFS ───');
    console.log('');

    const functions = await client.query(`
      SELECT
        proname AS function_name,
        pg_get_functiondef(oid) AS definition
      FROM pg_proc
      WHERE proname LIKE '%handoff%'
        OR proname LIKE '%validate%'
        OR proname LIKE '%accept%'
      ORDER BY proname;
    `);

    if (functions.rows.length > 0) {
      functions.rows.forEach(func => {
        console.log(`  Function: ${func.function_name}`);
        // Show only first 300 chars of definition to avoid clutter
        const def = func.definition.substring(0, 300);
        console.log(`    ${def}...`);
        console.log('');
      });
    } else {
      console.log('  No validation functions found');
    }

  } catch (error) {
    console.log('❌ Error:', error.message);
  } finally {
    await client.end();
    console.log('═══════════════════════════════════════════════════════════════');
  }
})();
