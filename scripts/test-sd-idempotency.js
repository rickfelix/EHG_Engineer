#!/usr/bin/env node

/**
 * Test that SD creation is idempotent (multiple calls don't create duplicates)
 */

async function testSDIdempotency() {
  console.log('🧪 Testing Strategic Directive Creation Idempotency');
  console.log('=' .repeat(50));
  
  const baseUrl = 'http://localhost:3000';
  const submissionId = '975623b3-668d-41e3-8e84-a0802bc5fefe';
  
  try {
    console.log('\n1️⃣ First attempt to create SD...');
    const res1 = await fetch(`${baseUrl}/api/sdip/create-strategic-directive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submission_id: submissionId })
    });
    
    const result1 = await res1.json();
    console.log('   Response:', {
      success: result1.success,
      sd_id: result1.sd_id,
      message: result1.message,
      existing: result1.existing
    });
    
    console.log('\n2️⃣ Second attempt (should return existing)...');
    const res2 = await fetch(`${baseUrl}/api/sdip/create-strategic-directive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submission_id: submissionId })
    });
    
    const result2 = await res2.json();
    console.log('   Response:', {
      success: result2.success,
      sd_id: result2.sd_id,
      message: result2.message,
      existing: result2.existing
    });
    
    console.log('\n3️⃣ Third attempt (should still return existing)...');
    const res3 = await fetch(`${baseUrl}/api/sdip/create-strategic-directive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submission_id: submissionId })
    });
    
    const result3 = await res3.json();
    console.log('   Response:', {
      success: result3.success,
      sd_id: result3.sd_id,
      message: result3.message,
      existing: result3.existing
    });
    
    // Verify all return the same SD ID
    console.log('\n' + '=' .repeat(50));
    console.log('📊 Test Results:');
    
    const allSame = result1.sd_id === result2.sd_id && result2.sd_id === result3.sd_id;
    const allExisting = result1.existing || (result2.existing && result3.existing);
    
    if (allSame && allExisting) {
      console.log('✅ PASS: SD creation is idempotent!');
      console.log(`   All 3 calls returned the same SD: ${result1.sd_id}`);
      console.log('   Existing flag properly set on subsequent calls');
    } else if (allSame) {
      console.log('⚠️  PARTIAL: Same SD returned but existing flag not set');
      console.log(`   SD ID: ${result1.sd_id}`);
    } else {
      console.log('❌ FAIL: Different SDs were created!');
      console.log(`   Call 1: ${result1.sd_id}`);
      console.log(`   Call 2: ${result2.sd_id}`);
      console.log(`   Call 3: ${result3.sd_id}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run test
testSDIdempotency();