const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

(async () => {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   HANDOFF STRUCTURE DEBUGGER');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Query any handoffs for reference
  const { data: handoffs, error } = await supabase
    .from('sd_phase_handoffs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);

  if (error) {
    console.log('❌ Error querying handoffs:', error.message);
    return;
  }

  console.log('📊 Total handoffs found:', handoffs?.length || 0);
  console.log('');

  if (handoffs && handoffs.length > 0) {
    console.log('─── MOST RECENT HANDOFF STRUCTURE ───');
    console.log('');
    console.log(JSON.stringify(handoffs[0], null, 2));

    console.log('');
    console.log('─── FIELD ANALYSIS ───');
    console.log('');

    Object.entries(handoffs[0]).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        const typeInfo = typeof value;
        const isEmpty = value === '';
        console.log(`✅ ${key.padEnd(25)} : ${typeInfo}${isEmpty ? ' (EMPTY STRING)' : ''}`);
      } else {
        console.log(`❌ ${key.padEnd(25)} : NULL`);
      }
    });

    console.log('');
    console.log('─── HANDOFF VALIDATION TRIGGER CHECK ───');
    console.log('');
    console.log('Checking if database has validation trigger for handoffs...');

    // Check for triggers on sd_phase_handoffs
    const { data: triggers, error: triggerError } = await supabase.rpc(
      'get_table_triggers',
      { table_name: 'sd_phase_handoffs' }
    ).catch(() => ({ data: null, error: { message: 'RPC function not available' } }));

    if (triggers) {
      console.log('Triggers found:', JSON.stringify(triggers, null, 2));
    } else {
      console.log('⚠️  Cannot query triggers:', triggerError?.message);
    }

  } else {
    console.log('⚠️  No handoffs exist yet - this is the first one');
    console.log('');
    console.log('Expected schema based on table:');

    // Query the schema
    const { data: schema, error: schemaError } = await supabase
      .from('sd_phase_handoffs')
      .select('*')
      .limit(0);

    if (schemaError) {
      console.log('❌ Schema error:', schemaError.message);
    } else {
      console.log('Schema structure retrieved (no data to show field types)');
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
})();
