#!/usr/bin/env node

/**
 * VERIFY HANDOFF: SD-RECURSION-AI-001 EXEC→PLAN
 *
 * Purpose: Query and display the created handoff for verification
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

console.log('=====================================');
console.log('HANDOFF VERIFICATION');
console.log('=====================================');
console.log('');

const { data: handoff, error } = await supabase
  .from('sd_phase_handoffs')
  .select('*')
  .eq('sd_id', 'SD-RECURSION-AI-001')
  .eq('from_phase', 'EXEC')
  .eq('to_phase', 'PLAN')
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

if (error) {
  console.error('❌ Failed to query handoff:', error.message);
  process.exit(1);
}

console.log('HANDOFF RECORD');
console.log('--------------');
console.log(`ID: ${handoff.id}`);
console.log(`SD ID: ${handoff.sd_id}`);
console.log(`Type: ${handoff.handoff_type}`);
console.log(`From: ${handoff.from_phase} → To: ${handoff.to_phase}`);
console.log(`Status: ${handoff.status}`);
console.log(`Created: ${handoff.created_at}`);
console.log(`Created By: ${handoff.created_by}`);
console.log(`Validation Score: ${handoff.validation_score}`);
console.log(`Validation Passed: ${handoff.validation_passed}`);
console.log('');

console.log('7-ELEMENT HANDOFF STRUCTURE');
console.log('============================');
console.log('');

console.log('1. EXECUTIVE SUMMARY');
console.log('--------------------');
console.log(handoff.executive_summary);
console.log('');

console.log('2. DELIVERABLES MANIFEST');
console.log('------------------------');
console.log(handoff.deliverables_manifest);
console.log('');

console.log('3. KEY DECISIONS');
console.log('----------------');
console.log(handoff.key_decisions);
console.log('');

console.log('4. KNOWN ISSUES');
console.log('---------------');
console.log(handoff.known_issues);
console.log('');

console.log('5. RESOURCE UTILIZATION');
console.log('-----------------------');
console.log(handoff.resource_utilization);
console.log('');

console.log('6. ACTION ITEMS');
console.log('---------------');
console.log(handoff.action_items);
console.log('');

console.log('7. COMPLETENESS REPORT');
console.log('----------------------');
console.log(handoff.completeness_report);
console.log('');

console.log('METADATA');
console.log('--------');
console.log(JSON.stringify(handoff.metadata, null, 2));
console.log('');

console.log('=====================================');
console.log('VERIFICATION COMPLETE');
console.log('=====================================');
