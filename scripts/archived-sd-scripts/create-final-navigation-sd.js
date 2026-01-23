#!/usr/bin/env node

import { UATToSDConverter } from './uat-to-strategic-directive-ai.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createNavigationSD() {
  const { data: testCase } = await supabase
    .from('uat_cases')
    .select('*')
    .eq('id', 'TEST-NAV-019')
    .single();

  const testResult = {
    id: testCase.id,
    case_id: testCase.id,
    title: testCase.title,
    section: testCase.section,
    priority: 'high',
    status: 'FAIL',
    description: testCase.description,
    expected: 'Test should pass',
    actual: 'Manual test not yet executed',
    notes: 'Navigation & UX assessment',
    result_id: 'MANUAL-TEST-NAV-019',
    run_id: 'manual-batch-sd-generation'
  };

  const converter = new UATToSDConverter();
  const submission = await converter.convertTestFailureToSD(testResult);
  console.log('✅ Created:', submission.sd_key);
  console.log('📋 Submission:', submission.submission_id);
}

createNavigationSD().catch(console.error);
