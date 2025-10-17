/**
 * Simple direct query of agent tables
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://liapbndqlqxdcgpwntbv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYXBibmRxbHF4ZGNncHdudGJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNzI4MzcsImV4cCI6MjA3MTk0ODgzN30.YlzzH17RYHsFs3TBmKlbmZPJYfUEWU71cAURwTsu8-M'
);

async function queryAgentTables() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('📊 AGENT DATA INVESTIGATION - SIMPLIFIED');
  console.log('════════════════════════════════════════════════════════\n');

  // 1. AI CEO Agents
  console.log('1. AI_CEO_AGENTS:');
  console.log('   ─────────────────────────────────────────────────');
  try {
    const { data, error, count } = await supabase
      .from('ai_ceo_agents')
      .select('*', { count: 'exact' });

    if (error) throw error;

    console.log(`   Total records: ${count || 0}`);
    if (data && data.length > 0) {
      data.forEach((agent, i) => {
        console.log(`\n   ${i + 1}. ${agent.agent_name || 'Unnamed'}`);
        console.log(`      ID: ${agent.agent_id}`);
        console.log(`      Active: ${agent.is_active}`);
        console.log(`      Type: ${agent.agent_type || 'N/A'}`);
      });
    } else {
      console.log('   ⚠️  No agents found - table is empty');
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }

  // 2. CrewAI Agents
  console.log('\n\n2. CREWAI_AGENTS:');
  console.log('   ─────────────────────────────────────────────────');
  try {
    const { data, error, count } = await supabase
      .from('crewai_agents')
      .select('*', { count: 'exact' });

    if (error) throw error;

    console.log(`   Total records: ${count || 0}`);
    if (data && data.length > 0) {
      data.forEach((agent, i) => {
        console.log(`\n   ${i + 1}. ${agent.name}`);
        console.log(`      Key: ${agent.agent_key}`);
        console.log(`      Role: ${agent.role}`);
        console.log(`      Department: ${agent.department_id || 'None'}`);
      });
    } else {
      console.log('   ⚠️  No agents found - table is empty');
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }

  // 3. Agent Departments
  console.log('\n\n3. AGENT_DEPARTMENTS:');
  console.log('   ─────────────────────────────────────────────────');
  try {
    const { data, error, count } = await supabase
      .from('agent_departments')
      .select('*', { count: 'exact' });

    if (error) throw error;

    console.log(`   Total records: ${count || 0}`);
    if (data && data.length > 0) {
      data.forEach((dept, i) => {
        console.log(`   ${i + 1}. ${dept.department_name} (${dept.status})`);
      });
    } else {
      console.log('   ⚠️  No departments found - table is empty');
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }

  // 4. CrewAI Crews
  console.log('\n\n4. CREWAI_CREWS:');
  console.log('   ─────────────────────────────────────────────────');
  try {
    const { data, error, count } = await supabase
      .from('crewai_crews')
      .select('*', { count: 'exact' });

    if (error) throw error;

    console.log(`   Total records: ${count || 0}`);
    if (data && data.length > 0) {
      data.forEach((crew, i) => {
        console.log(`   ${i + 1}. ${crew.crew_name} (${crew.crew_type})`);
      });
    } else {
      console.log('   ⚠️  No crews found - table is empty');
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }

  console.log('\n════════════════════════════════════════════════════════\n');
}

queryAgentTables().catch(console.error);
