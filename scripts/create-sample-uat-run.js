#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

async function createSampleRun() {
  console.log('🚀 Creating sample UAT run with test results...\n');

  try {
    // Create a new test run
    const { data: run, error: runError } = await supabase
      .from('uat_runs')
      .insert({
        app: 'EHG',
        env_url: 'http://localhost:5173',
        app_version: '1.0.0',
        browser: 'Chrome',
        role: 'Admin',
        started_at: new Date().toISOString(),
        created_by: 'Demo UAT Lead',
        notes: 'Sample UAT run for dashboard demonstration'
      })
      .select()
      .single();

    if (runError) throw runError;

    console.log(`✅ Created test run: ${run.id.slice(0, 8)}...`);
    console.log(`   Environment: ${run.env_url}`);
    console.log(`   Created by: ${run.created_by}\n`);

    // Get all test cases
    const { data: testCases, error: casesError } = await supabase
      .from('uat_cases')
      .select('*')
      .order('section');

    if (casesError) throw casesError;

    console.log(`📋 Found ${testCases.length} test cases to simulate...\n`);

    // Simulate test results
    const results = [];
    let passCount = 0, failCount = 0, blockedCount = 0, naCount = 0;

    for (const testCase of testCases) {
      // Generate realistic test status distribution
      let status;
      const random = Math.random();

      if (testCase.priority === 'critical') {
        // Critical tests have higher pass rate
        if (random < 0.92) {
          status = 'PASS';
          passCount++;
        } else if (random < 0.96) {
          status = 'FAIL';
          failCount++;
        } else {
          status = 'BLOCKED';
          blockedCount++;
        }
      } else if (testCase.priority === 'high') {
        // High priority tests
        if (random < 0.88) {
          status = 'PASS';
          passCount++;
        } else if (random < 0.94) {
          status = 'FAIL';
          failCount++;
        } else if (random < 0.97) {
          status = 'BLOCKED';
          blockedCount++;
        } else {
          status = 'NA';
          naCount++;
        }
      } else {
        // Medium priority tests
        if (random < 0.85) {
          status = 'PASS';
          passCount++;
        } else if (random < 0.92) {
          status = 'FAIL';
          failCount++;
        } else if (random < 0.96) {
          status = 'BLOCKED';
          blockedCount++;
        } else {
          status = 'NA';
          naCount++;
        }
      }

      const result = {
        run_id: run.id,
        case_id: testCase.id,
        status,
        evidence_url: status === 'PASS' ? null : `http://localhost:3000/screenshots/${testCase.id}.png`,
        notes: status === 'PASS' ? 'Test passed successfully' :
               status === 'FAIL' ? `Failed: ${testCase.title} not working as expected` :
               status === 'BLOCKED' ? 'Blocked by dependency issue' :
               'Test not applicable in current environment',
        recorded_at: new Date().toISOString()
      };

      results.push(result);
    }

    // Insert all results
    const { error: resultsError } = await supabase
      .from('uat_results')
      .insert(results);

    if (resultsError) throw resultsError;

    console.log('📊 Test Results Summary:');
    console.log(`   ✅ Passed: ${passCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log(`   ⚠️ Blocked: ${blockedCount}`);
    console.log(`   ⭕ N/A: ${naCount}`);
    console.log(`   📈 Total: ${testCases.length}\n`);

    // Create defects for failed tests
    const failedResults = results.filter(r => r.status === 'FAIL');
    const defects = [];

    for (const failedResult of failedResults) {
      const testCase = testCases.find(tc => tc.id === failedResult.case_id);

      // Only create defects for critical and high priority failures
      if (testCase.priority === 'critical' || testCase.priority === 'high') {
        defects.push({
          run_id: run.id,
          case_id: failedResult.case_id,
          severity: testCase.priority === 'critical' ? 'critical' : 'major',
          summary: `${testCase.title} is not functioning correctly`,
          suspected_files: JSON.stringify([
            {
              path: `/src/components/${testCase.section.toLowerCase()}.tsx`,
              reason: 'Component logic failure'
            }
          ]),
          created_at: new Date().toISOString()
        });
      }
    }

    if (defects.length > 0) {
      const { error: defectsError } = await supabase
        .from('uat_defects')
        .insert(defects);

      if (defectsError) throw defectsError;
      console.log(`🐛 Created ${defects.length} defects for critical/high priority failures\n`);
    }

    // Calculate pass rate
    const passRate = Math.round((passCount / (passCount + failCount + blockedCount)) * 100);
    const hasCriticalDefects = defects.some(d => d.severity === 'critical');

    let gateStatus;
    if (passRate >= 85 && !hasCriticalDefects) {
      gateStatus = 'GREEN ✅';
    } else if (passRate >= 85 && hasCriticalDefects) {
      gateStatus = 'YELLOW ⚠️';
    } else {
      gateStatus = 'RED ❌';
    }

    console.log('🎯 Gate Status:');
    console.log(`   Pass Rate: ${passRate}%`);
    console.log(`   Critical Defects: ${hasCriticalDefects ? 'Yes' : 'No'}`);
    console.log(`   Gate: ${gateStatus}\n`);

    // Update run with completion time
    await supabase
      .from('uat_runs')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', run.id);

    console.log('✨ Sample UAT run created successfully!');
    console.log('🔗 View the dashboard at: http://localhost:3000/uat-dashboard');
    console.log(`📝 Run ID: ${run.id}`);

  } catch (error) {
    console.error('❌ Error creating sample run:', error.message);
  }
}

createSampleRun();