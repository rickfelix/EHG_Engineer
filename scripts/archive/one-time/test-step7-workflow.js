#!/usr/bin/env node

/**
 * Test Script for Step 7 Workflow
 * Validates the complete Strategic Directive creation process
 */

async function testStep7Workflow() {
  console.log('🧪 Testing Step 7 Workflow');
  console.log('=' .repeat(50));
  
  const baseUrl = 'http://localhost:3000';
  
  try {
    // Step 1: Get all submissions
    console.log('\n1️⃣ Fetching submissions...');
    const submissionsRes = await fetch(`${baseUrl}/api/sdip/submissions`);
    const submissions = await submissionsRes.json();
    
    // Find a submission ready for Step 7
    const readySubmission = submissions.find(s => 
      s.current_step === 7 && 
      (!s.gate_status?.status || s.gate_status?.status === 'ready')
    );
    
    if (!readySubmission) {
      console.log('⚠️ No submission ready for Step 7 testing');
      console.log('📊 Submission statuses:');
      submissions.forEach(s => {
        console.log(`  - ${s.id}: Step ${s.current_step}, Status: ${s.gate_status?.status || 'draft'}`);
      });
      return;
    }
    
    console.log(`✅ Found ready submission: ${readySubmission.id}`);
    console.log(`  Chairman Input: "${readySubmission.chairman_input?.substring(0, 50)}..."`);
    
    // Step 2: Test Strategic Directive creation
    console.log('\n2️⃣ Creating Strategic Directive...');
    const createRes = await fetch(`${baseUrl}/api/sdip/create-strategic-directive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submission_id: readySubmission.id })
    });
    
    if (!createRes.ok) {
      throw new Error(`Failed to create SD: ${createRes.status} ${createRes.statusText}`);
    }
    
    const createResult = await createRes.json();
    console.log('✅ Strategic Directive created:');
    console.log(`  SD ID: ${createResult.sd_id}`);
    console.log(`  Redirect URL: ${createResult.redirect_url}`);
    
    // Step 3: Verify submission was updated
    console.log('\n3️⃣ Verifying submission update...');
    const updatedRes = await fetch(`${baseUrl}/api/sdip/submissions`);
    const updatedSubmissions = await updatedRes.json();
    const updatedSubmission = updatedSubmissions.find(s => s.id === readySubmission.id);
    
    if (updatedSubmission?.gate_status?.status === 'submitted') {
      console.log('✅ Submission status updated correctly:');
      console.log(`  Status: ${updatedSubmission.gate_status.status}`);
      console.log(`  SD ID: ${updatedSubmission.gate_status.resulting_sd_id}`);
      console.log(`  Completed: ${updatedSubmission.gate_status.completed_at}`);
    } else {
      console.log('❌ Submission status not updated correctly');
      console.log('  Current status:', updatedSubmission?.gate_status);
    }
    
    // Step 4: Check Strategic Directive exists
    console.log('\n4️⃣ Checking Strategic Directive...');
    const sdsRes = await fetch(`${baseUrl}/api/strategic-directives`);
    const sds = await sdsRes.json();
    const createdSD = sds.find(sd => sd.id === createResult.sd_id);
    
    if (createdSD) {
      console.log('✅ Strategic Directive found:');
      console.log(`  Title: ${createdSD.title}`);
      console.log(`  Status: ${createdSD.status}`);
      console.log(`  Priority: ${createdSD.priority}`);
    } else {
      console.log('⚠️ Strategic Directive not found in list');
    }
    
    console.log('\n' + '=' .repeat(50));
    console.log('🎉 Step 7 Workflow Test Complete!');
    
  } catch (_error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testStep7Workflow();