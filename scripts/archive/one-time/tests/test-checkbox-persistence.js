#!/usr/bin/env node

/**
 * Test Script for Checkbox Persistence in DirectiveLab
 * Verifies that checkbox states are saved and restored properly
 */

async function testCheckboxPersistence() {
  console.log('🧪 Testing Checkbox Persistence');
  console.log('=' .repeat(50));
  
  const baseUrl = 'http://localhost:3000';
  
  try {
    // Get submissions to find one with step data
    console.log('\n1️⃣ Fetching submissions...');
    const submissionsRes = await fetch(`${baseUrl}/api/sdip/submissions`);
    const submissions = await submissionsRes.json();
    
    if (!submissions || submissions.length === 0) {
      console.log('⚠️ No submissions found');
      return;
    }
    
    const submission = submissions[0];
    console.log(`\n📋 Testing with submission: ${submission.id}`);
    console.log(`  Current Step: ${submission.current_step}`);
    console.log(`  Status: ${submission.status || 'draft'}`);
    
    // Check Step 5 checkbox state
    console.log('\n2️⃣ Checking Step 5 (Synthesis Review) checkbox...');
    if (submission.gate_status?.synthesis_reviewed !== undefined) {
      console.log(`  ✅ Synthesis reviewed checkbox: ${submission.gate_status.synthesis_reviewed ? '☑️ Checked' : '☐ Unchecked'}`);
    } else {
      console.log('  ⚠️ Synthesis reviewed checkbox state not saved');
    }
    
    // Check Step 6 checkbox state  
    console.log('\n3️⃣ Checking Step 6 (Questions) checkbox...');
    if (submission.gate_status?.questions_reviewed !== undefined) {
      console.log(`  ✅ Questions reviewed checkbox: ${submission.gate_status.questions_reviewed ? '☑️ Checked' : '☐ Unchecked'}`);
    } else {
      console.log('  ⚠️ Questions reviewed checkbox state not saved');
    }
    
    // Check Step 7 checkbox state
    console.log('\n4️⃣ Checking Step 7 (Final Summary) checkbox...');
    if (submission.gate_status?.summary_confirmed !== undefined) {
      console.log(`  ✅ Summary confirmed checkbox: ${submission.gate_status.summary_confirmed ? '☑️ Checked' : '☐ Unchecked'}`);
    } else {
      console.log('  ⚠️ Summary confirmed checkbox state not saved');
    }
    
    // Summary
    console.log('\n' + '=' .repeat(50));
    console.log('📊 Checkbox Persistence Summary:');
    
    const checkboxStates = [
      { step: 5, name: 'synthesis_reviewed', value: submission.gate_status?.synthesis_reviewed },
      { step: 6, name: 'questions_reviewed', value: submission.gate_status?.questions_reviewed },
      { step: 7, name: 'summary_confirmed', value: submission.gate_status?.summary_confirmed }
    ];
    
    const savedCount = checkboxStates.filter(cb => cb.value !== undefined).length;
    const checkedCount = checkboxStates.filter(cb => cb.value === true).length;
    
    console.log('  Total checkboxes: 3');
    console.log(`  Saved states: ${savedCount}/3`);
    console.log(`  Checked boxes: ${checkedCount}`);
    
    if (savedCount === 3) {
      console.log('\n🎉 All checkbox states are being persisted correctly!');
    } else if (savedCount > 0) {
      console.log(`\n⚠️ Only ${savedCount}/3 checkbox states are being saved`);
    } else {
      console.log('\n❌ No checkbox states are being saved');
    }
    
  } catch (_error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testCheckboxPersistence();