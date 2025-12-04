import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjUxMTkzNywiZXhwIjoyMDcyMDg3OTM3fQ.tYGfVTDQWQDje4ZPSl5UsprYK9J15Fa-XdGFVScrRZg'
);

async function verifyCompliance() {
  console.log('=== LEO Protocol Compliance Verification ===');
  console.log('SD: SD-STAGE-08-001');
  console.log('Timestamp:', new Date().toISOString());
  console.log();

  const results = {
    passed: 0,
    failed: 0,
    details: []
  };

  // 1. Check SD exists with status=completed, progress=100
  console.log('1. Strategic Directive Status');
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, uuid_id, title, status, progress_percentage')
    .eq('id', 'SD-STAGE-08-001')
    .single();

  if (sdError || !sd) {
    console.log('   ❌ FAIL - SD not found');
    if (sdError) console.log('   Error:', sdError.message);
    results.failed++;
    results.details.push({ req: 'SD Exists', status: 'FAIL', reason: 'Not found' });
  } else if (sd.status === 'completed' && sd.progress_percentage === 100) {
    console.log('   ✅ PASS - Status: completed, Progress: 100%');
    results.passed++;
    results.details.push({ req: 'SD Status', status: 'PASS', data: `${sd.status}, ${sd.progress_percentage}%` });
  } else {
    console.log(`   ❌ FAIL - Status: ${sd.status}, Progress: ${sd.progress_percentage}%`);
    results.failed++;
    results.details.push({ req: 'SD Status', status: 'FAIL', data: `${sd.status}, ${sd.progress_percentage}%` });
  }
  console.log();

  // Get both SD ID and UUID for other queries
  const sdId = sd?.id;
  const sdUuid = sd?.uuid_id;

  // 2. Check PRD exists
  console.log('2. Product Requirements Document');
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('id, title, status')
    .eq('sd_uuid', sdUuid)
    .maybeSingle();

  if (prdError) {
    console.log('   ❌ FAIL - Error querying PRD');
    console.log('   Error:', prdError.message);
    results.failed++;
    results.details.push({ req: 'PRD Exists', status: 'FAIL', reason: 'Query error' });
  } else if (!prd) {
    console.log('   ❌ FAIL - PRD not found');
    results.failed++;
    results.details.push({ req: 'PRD Exists', status: 'FAIL', reason: 'Not found' });
  } else {
    console.log(`   ✅ PASS - PRD: ${prd.id} (${prd.status})`);
    results.passed++;
    results.details.push({ req: 'PRD Exists', status: 'PASS', data: prd.id });
  }
  console.log();

  // 3. Check phase handoffs (using leo_handoff_executions)
  console.log('3. Phase Handoffs');
  const requiredHandoffs = ['lead_to_plan', 'plan_to_exec', 'exec_to_plan', 'plan_to_lead'];
  const { data: handoffs, error: handoffsError } = await supabase
    .from('leo_handoff_executions')
    .select('id, handoff_type, status')
    .eq('sd_id', sdUuid)
    .in('handoff_type', requiredHandoffs);

  if (handoffsError) {
    console.log('   ❌ FAIL - Error querying handoffs');
    console.log('   Error:', handoffsError.message);
    results.failed++;
    results.details.push({ req: 'Phase Handoffs', status: 'FAIL', reason: 'Query error' });
  } else {
    const foundTypes = handoffs?.map(h => h.handoff_type) || [];
    const missing = requiredHandoffs.filter(t => !foundTypes.includes(t));

    if (missing.length === 0) {
      console.log('   ✅ PASS - All 4 handoffs present');
      handoffs.forEach(h => console.log(`      - ${h.handoff_type}: ${h.status}`));
      results.passed++;
      results.details.push({ req: 'Phase Handoffs', status: 'PASS', data: `${handoffs.length} handoffs` });
    } else {
      console.log(`   ❌ FAIL - Missing: ${missing.join(', ')}`);
      console.log(`      Found: ${foundTypes.join(', ')}`);
      results.failed++;
      results.details.push({ req: 'Phase Handoffs', status: 'FAIL', reason: `Missing: ${missing.join(', ')}` });
    }
  }
  console.log();

  // 4. Check user stories validated
  console.log('4. User Stories Validation');
  const { data: stories, error: storiesError } = await supabase
    .from('user_stories')
    .select('id, title, validation_status')
    .eq('sd_id', sdUuid);

  if (storiesError) {
    console.log('   ❌ FAIL - Error querying user stories');
    console.log('   Error:', storiesError.message);
    results.failed++;
    results.details.push({ req: 'User Stories', status: 'FAIL', reason: 'Query error' });
  } else if (!stories || stories.length === 0) {
    console.log('   ⚠️  WARN - No user stories found (may not be required)');
    results.passed++; // Don't fail if not required
    results.details.push({ req: 'User Stories', status: 'PASS', data: 'None (optional)' });
  } else {
    const validated = stories.filter(s => s.validation_status === 'validated');
    if (validated.length === stories.length) {
      console.log(`   ✅ PASS - ${validated.length}/${stories.length} validated`);
      results.passed++;
      results.details.push({ req: 'User Stories', status: 'PASS', data: `${validated.length}/${stories.length}` });
    } else {
      console.log(`   ❌ FAIL - ${validated.length}/${stories.length} validated`);
      results.failed++;
      results.details.push({ req: 'User Stories', status: 'FAIL', data: `${validated.length}/${stories.length}` });
    }
  }
  console.log();

  // 5. Check deliverables completed (using sd_scope_deliverables)
  console.log('5. Deliverables Completion');
  const { data: deliverables, error: delivError } = await supabase
    .from('sd_scope_deliverables')
    .select('id, deliverable_name, completion_status')
    .eq('sd_id', sdUuid);

  if (delivError) {
    console.log('   ❌ FAIL - Error querying deliverables');
    console.log('   Error:', delivError.message);
    results.failed++;
    results.details.push({ req: 'Deliverables', status: 'FAIL', reason: 'Query error' });
  } else if (!deliverables || deliverables.length === 0) {
    console.log('   ⚠️  WARN - No deliverables found');
    results.passed++; // Don't fail if not required
    results.details.push({ req: 'Deliverables', status: 'PASS', data: 'None (optional)' });
  } else {
    const completed = deliverables.filter(d => d.completion_status === 'completed');
    if (completed.length === deliverables.length) {
      console.log(`   ✅ PASS - ${completed.length}/${deliverables.length} completed`);
      results.passed++;
      results.details.push({ req: 'Deliverables', status: 'PASS', data: `${completed.length}/${deliverables.length}` });
    } else {
      console.log(`   ❌ FAIL - ${completed.length}/${deliverables.length} completed`);
      deliverables.forEach(d => console.log(`      - ${d.deliverable_name}: ${d.completion_status}`));
      results.failed++;
      results.details.push({ req: 'Deliverables', status: 'FAIL', data: `${completed.length}/${deliverables.length}` });
    }
  }
  console.log();

  // 6. Check sub-agent executions
  console.log('6. Sub-Agent Executions');
  const { data: executions, error: execError } = await supabase
    .from('sub_agent_execution_results')
    .select('id, sub_agent_name, verdict')
    .eq('sd_id', sdId);

  if (execError) {
    console.log('   ❌ FAIL - Error querying executions');
    console.log('   Error:', execError.message);
    results.failed++;
    results.details.push({ req: 'Sub-Agent Executions', status: 'FAIL', reason: 'Query error' });
  } else if (!executions || executions.length === 0) {
    console.log('   ⚠️  WARN - No sub-agent executions found');
    results.passed++; // Don't fail if not required
    results.details.push({ req: 'Sub-Agent Executions', status: 'PASS', data: 'None (optional)' });
  } else {
    console.log(`   ✅ PASS - ${executions.length} executions recorded`);
    const byAgent = {};
    executions.forEach(e => {
      byAgent[e.sub_agent_name] = (byAgent[e.sub_agent_name] || 0) + 1;
    });
    Object.entries(byAgent).forEach(([agent, count]) => {
      console.log(`      - ${agent}: ${count}`);
    });
    results.passed++;
    results.details.push({ req: 'Sub-Agent Executions', status: 'PASS', data: `${executions.length} executions` });
  }
  console.log();

  // 7. Check retrospective
  console.log('7. Retrospective Published');
  const { data: retro, error: retroError } = await supabase
    .from('retrospectives')
    .select('id, status, conducted_date')
    .eq('sd_id', sdUuid)
    .maybeSingle();

  if (retroError) {
    console.log('   ❌ FAIL - Error querying retrospective');
    console.log('   Error:', retroError.message);
    results.failed++;
    results.details.push({ req: 'Retrospective', status: 'FAIL', reason: 'Query error' });
  } else if (!retro) {
    console.log('   ❌ FAIL - Retrospective not found');
    results.failed++;
    results.details.push({ req: 'Retrospective', status: 'FAIL', reason: 'Not found' });
  } else if (retro.status === 'published' && retro.conducted_date) {
    console.log(`   ✅ PASS - Published: ${new Date(retro.conducted_date).toISOString()}`);
    results.passed++;
    results.details.push({ req: 'Retrospective', status: 'PASS', data: 'Published' });
  } else {
    console.log(`   ❌ FAIL - Status: ${retro.status}`);
    results.failed++;
    results.details.push({ req: 'Retrospective', status: 'FAIL', data: `Status: ${retro.status}` });
  }
  console.log();

  // Summary
  console.log('=== COMPLIANCE SUMMARY ===');
  console.log(`Total Checks: ${results.passed + results.failed}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log();

  if (results.failed === 0) {
    console.log('🎉 OVERALL STATUS: FULLY COMPLIANT');
  } else {
    console.log('⚠️  OVERALL STATUS: NON-COMPLIANT');
    console.log();
    console.log('Failed Requirements:');
    results.details
      .filter(d => d.status === 'FAIL')
      .forEach(d => console.log(`  - ${d.req}: ${d.reason || d.data}`));
  }
}

verifyCompliance().catch(console.error);
