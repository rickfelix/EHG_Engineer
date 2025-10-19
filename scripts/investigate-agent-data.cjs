/**
 * Script to investigate all agent data in EHG application database
 * Queries: ai_ceo_agents, crewai_agents, agent_departments, crewai_crews
 */

const { createClient } = require('@supabase/supabase-js');

// EHG Application Database (business app, not EHG_Engineer)
// Using hardcoded credentials since this is for investigation
const EHG_SUPABASE_URL = 'https://liapbndqlqxdcgpwntbv.supabase.co';
const EHG_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYXBibmRxbHF4ZGNncHdudGJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNzI4MzcsImV4cCI6MjA3MTk0ODgzN30.YlzzH17RYHsFs3TBmKlbmZPJYfUEWU71cAURwTsu8-M';

const supabase = createClient(EHG_SUPABASE_URL, EHG_SUPABASE_ANON_KEY);

async function investigateAgentData() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('🔍 COMPREHENSIVE AGENT DATA INVESTIGATION');
  console.log('   Database: EHG Application (liapbndqlqxdcgpwntbv)');
  console.log('════════════════════════════════════════════════════════════════\n');

  // 1. Check ai_ceo_agents table
  console.log('1️⃣  AI_CEO_AGENTS TABLE');
  console.log('   ─────────────────────────────────────────────────────────────');
  try {
    const { data: ceoAgents, error: ceoError } = await supabase
      .from('ai_ceo_agents')
      .select('*')
      .order('created_at', { ascending: false });

    if (ceoError) {
      console.error('   ❌ Error querying ai_ceo_agents:', ceoError.message);
    } else if (!ceoAgents || ceoAgents.length === 0) {
      console.log('   ⚠️  TABLE IS EMPTY - No AI CEO agents found');
    } else {
      console.log(`   ✓ Found ${ceoAgents.length} AI CEO agent(s):\n`);
      ceoAgents.forEach((agent, idx) => {
        console.log(`   ${idx + 1}. Agent: ${agent.agent_name}`);
        console.log(`      ID: ${agent.agent_id}`);
        console.log(`      Active: ${agent.is_active ? '✓ Yes' : '✗ No'}`);
        console.log(`      Capabilities: ${JSON.stringify(agent.capabilities || [])}`);
        console.log(`      Created: ${agent.created_at}`);
        console.log('');
      });
    }
  } catch (err) {
    console.error('   ❌ Exception:', err.message);
  }

  // 2. Check crewai_agents table
  console.log('\n2️⃣  CREWAI_AGENTS TABLE');
  console.log('   ─────────────────────────────────────────────────────────────');
  try {
    const { data: crewaiAgents, error: crewaiError } = await supabase
      .from('crewai_agents')
      .select('*')
      .order('created_at', { ascending: false });

    if (crewaiError) {
      console.error('   ❌ Error querying crewai_agents:', crewaiError.message);
    } else if (!crewaiAgents || crewaiAgents.length === 0) {
      console.log('   ⚠️  TABLE IS EMPTY - No CrewAI agents found');
    } else {
      console.log(`   ✓ Found ${crewaiAgents.length} CrewAI agent(s):\n`);
      crewaiAgents.forEach((agent, idx) => {
        console.log(`   ${idx + 1}. Agent: ${agent.name}`);
        console.log(`      Key: ${agent.agent_key}`);
        console.log(`      Role: ${agent.role}`);
        console.log(`      Department ID: ${agent.department_id || 'None'}`);
        console.log(`      Status: ${agent.status}`);
        console.log(`      Tools: ${JSON.stringify(agent.tools || [])}`);
        console.log('');
      });
    }
  } catch (err) {
    console.error('   ❌ Exception:', err.message);
  }

  // 3. Check agent_departments table
  console.log('\n3️⃣  AGENT_DEPARTMENTS TABLE');
  console.log('   ─────────────────────────────────────────────────────────────');
  try {
    const { data: departments, error: deptError } = await supabase
      .from('agent_departments')
      .select('*')
      .order('department_name', { ascending: true });

    if (deptError) {
      console.error('   ❌ Error querying agent_departments:', deptError.message);
    } else if (!departments || departments.length === 0) {
      console.log('   ⚠️  TABLE IS EMPTY - No departments found');
    } else {
      console.log(`   ✓ Found ${departments.length} department(s):\n`);
      departments.forEach((dept, idx) => {
        console.log(`   ${idx + 1}. ${dept.department_name}`);
        console.log(`      ID: ${dept.id}`);
        console.log(`      Status: ${dept.status}`);
        console.log(`      Description: ${dept.description || 'N/A'}`);
        console.log('');
      });
    }
  } catch (err) {
    console.error('   ❌ Exception:', err.message);
  }

  // 4. Check crewai_crews table
  console.log('\n4️⃣  CREWAI_CREWS TABLE');
  console.log('   ─────────────────────────────────────────────────────────────');
  try {
    const { data: crews, error: crewsError } = await supabase
      .from('crewai_crews')
      .select('*')
      .order('created_at', { ascending: false });

    if (crewsError) {
      console.error('   ❌ Error querying crewai_crews:', crewsError.message);
    } else if (!crews || crews.length === 0) {
      console.log('   ⚠️  TABLE IS EMPTY - No crews found');
    } else {
      console.log(`   ✓ Found ${crews.length} crew(s):\n`);
      crews.forEach((crew, idx) => {
        console.log(`   ${idx + 1}. Crew: ${crew.crew_name}`);
        console.log(`      Type: ${crew.crew_type}`);
        console.log(`      Status: ${crew.status}`);
        console.log(`      Manager Agent ID: ${crew.manager_agent_id || 'None'}`);
        console.log('');
      });
    }
  } catch (err) {
    console.error('   ❌ Exception:', err.message);
  }

  // 5. Check crew_members table
  console.log('\n5️⃣  CREW_MEMBERS TABLE');
  console.log('   ─────────────────────────────────────────────────────────────');
  try {
    const { data: members, error: membersError } = await supabase
      .from('crew_members')
      .select('*')
      .order('created_at', { ascending: false });

    if (membersError) {
      console.error('   ❌ Error querying crew_members:', membersError.message);
    } else if (!members || members.length === 0) {
      console.log('   ⚠️  TABLE IS EMPTY - No crew members found');
    } else {
      console.log(`   ✓ Found ${members.length} crew member(s):\n`);
      members.forEach((member, idx) => {
        console.log(`   ${idx + 1}. Crew ID: ${member.crew_id}`);
        console.log(`      Agent ID: ${member.agent_id}`);
        console.log(`      Role: ${member.role_in_crew}`);
        console.log(`      Sequence: ${member.sequence_order}`);
        console.log('');
      });
    }
  } catch (err) {
    console.error('   ❌ Exception:', err.message);
  }

  // 6. Summary
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('════════════════════════════════════════════════════════════════\n');

  const { data: ceoCount } = await supabase.from('ai_ceo_agents').select('*', { count: 'exact', head: true });
  const { data: crewaiCount } = await supabase.from('crewai_agents').select('*', { count: 'exact', head: true });
  const { data: deptCount } = await supabase.from('agent_departments').select('*', { count: 'exact', head: true });
  const { data: crewsCount } = await supabase.from('crewai_crews').select('*', { count: 'exact', head: true });
  const { data: membersCount } = await supabase.from('crew_members').select('*', { count: 'exact', head: true });

  console.log('   Agent Tables:');
  console.log(`   - ai_ceo_agents:      ${ceoCount?.length || 0} records`);
  console.log(`   - crewai_agents:      ${crewaiCount?.length || 0} records`);
  console.log(`   - agent_departments:  ${deptCount?.length || 0} records`);
  console.log(`   - crewai_crews:       ${crewsCount?.length || 0} records`);
  console.log(`   - crew_members:       ${membersCount?.length || 0} records`);
  console.log('');
  console.log('════════════════════════════════════════════════════════════════\n');
}

investigateAgentData().catch(console.error);
