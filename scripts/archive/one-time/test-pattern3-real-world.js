import { detectPattern, PHASES } from '../lib/sd-pattern-detector.js';

const tests = [
  {
    name: 'Scenario 1: Direct validation',
    message: 'Validate SD-MONITORING-001',
    expectedPhase: PHASES.PLAN_VERIFY,
    shouldTrigger: true
  },
  {
    name: 'Scenario 2: Pre-approval',
    message: 'Run pre-approval for SD-VISION-ALIGN-001',
    expectedPhase: PHASES.LEAD_PRE_APPROVAL,
    shouldTrigger: true
  },
  {
    name: 'Scenario 3: Status check',
    message: 'What is the status of SD-043?',
    expectedPhase: PHASES.PLAN_VERIFY,
    shouldTrigger: true
  },
  {
    name: 'Scenario 4: PRD creation',
    message: 'Create PRD for SD-RECONNECT-014C',
    expectedPhase: PHASES.PLAN_PRD,
    shouldTrigger: true
  },
  {
    name: 'Scenario 5: Final approval',
    message: 'SD-050 ready for final approval',
    expectedPhase: PHASES.LEAD_FINAL,
    shouldTrigger: true
  },
  {
    name: 'Scenario 6: Readiness check',
    message: 'Is SD-042 ready for implementation?',
    expectedPhase: PHASES.PLAN_VERIFY,
    shouldTrigger: true
  },
  {
    name: 'Scenario 7: Multiple SDs',
    message: 'Check SD-038 and SD-035 progress',
    expectedPhase: PHASES.PLAN_VERIFY,
    shouldTrigger: true
  },
  {
    name: 'Scenario 8: Explicit phase',
    message: 'PLAN_VERIFY SD-034',
    expectedPhase: PHASES.PLAN_VERIFY,
    shouldTrigger: true
  },
  {
    name: 'Scenario 9: Informational (no trigger)',
    message: 'What does SD-033 involve?',
    expectedPhase: null,
    shouldTrigger: false
  },
  {
    name: 'Scenario 10: Implementation review',
    message: 'Review implementation for SD-032',
    expectedPhase: PHASES.PLAN_VERIFY,
    shouldTrigger: true
  }
];

console.log('🧪 Pattern 3 Real-World Testing');
console.log('Testing with actual SD-IDs from EHG_Engineer database');
console.log('='.repeat(70) + '\n');

let passed = 0;
let failed = 0;

tests.forEach((test, index) => {
  const result = detectPattern(test.message);
  const triggered = result ? result.shouldExecute : false;
  const phase = result ? result.phase : null;
  const sdIds = result ? result.sdIds : [];
  
  const passedTrigger = triggered === test.shouldTrigger;
  const passedPhase = !test.expectedPhase || phase === test.expectedPhase;
  const testPassed = passedTrigger && passedPhase;
  
  console.log(`Test ${index + 1}: ${test.name}`);
  console.log(`Message: "${test.message}"`);
  console.log(testPassed ? '✅ PASS' : '❌ FAIL');
  
  if (result) {
    console.log(`   Detected: ${sdIds.join(', ')}`);
    console.log(`   Phase: ${phase}`);
  } else {
    console.log('   No trigger detected');
  }
  
  if (!testPassed) {
    console.log(`   Expected: trigger=${test.shouldTrigger}, phase=${test.expectedPhase}`);
    console.log(`   Got: trigger=${triggered}, phase=${phase}`);
  }
  
  console.log('-'.repeat(70));
  
  if (testPassed) passed++;
  else failed++;
});

console.log('\n' + '='.repeat(70));
console.log(`\n📊 Test Results: ${passed}/${tests.length} passed (${Math.round((passed / tests.length) * 100)}%)\n`);

if (failed === 0) {
  console.log('✅ All real-world scenarios passed!');
  console.log('   Pattern 3 is ready for production deployment.\n');
} else {
  console.log('⚠️  Some scenarios failed. Review detection logic.\n');
}

process.exit(failed > 0 ? 1 : 0);
