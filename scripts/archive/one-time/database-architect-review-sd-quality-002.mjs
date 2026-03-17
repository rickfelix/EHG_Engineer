#!/usr/bin/env node

/**
 * Database Architect Sub-Agent Review: SD-QUALITY-002
 * Verify schema design for test_coverage_policies table
 *
 * Sub-Agent: Principal Database Architect
 * Trigger: "schema" keyword in PRD
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🗄️ DATABASE ARCHITECT SUB-AGENT REVIEW');
console.log('═'.repeat(60));
console.log('SD: SD-QUALITY-002');
console.log('PRD: PRD-99e35b97-e370-459f-96e2-373176210254');
console.log('Table: test_coverage_policies');
console.log('');

// Get PRD to review schema
const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('id', 'PRD-99e35b97-e370-459f-96e2-373176210254')
  .single();

const schema = prd.data_model.tables[0];

console.log('📋 SCHEMA REVIEW');
console.log('─'.repeat(60));
console.log('Table Name:', schema.name);
console.log('Description:', schema.description);
console.log('Columns:', schema.columns.length);
console.log('');

// Validate schema design
const findings = [];
let score = 100;

// 1. Primary Key Check
const pkColumn = schema.columns.find(c => c.primary_key);
if (pkColumn && pkColumn.type === 'UUID') {
  findings.push('✅ Primary key: UUID (best practice for distributed systems)');
} else {
  findings.push('⚠️ Primary key: Not UUID (consider using UUID)');
  score -= 10;
}

// 2. NOT NULL constraints
const requiredFields = schema.columns.filter(c => c.not_null);
if (requiredFields.length >= 5) {
  findings.push('✅ NOT NULL constraints: ' + requiredFields.length + ' fields enforced');
} else {
  findings.push('⚠️ NOT NULL constraints: Consider adding more constraints');
  score -= 5;
}

// 3. Index on query columns
if (schema.indexes && schema.indexes.length > 0) {
  findings.push('✅ Index: ' + schema.indexes[0].name + ' on [' + schema.indexes[0].columns.join(', ') + ']');
} else {
  findings.push('⚠️ Index: No indexes defined (consider adding for loc_min, loc_max)');
  score -= 10;
}

// 4. Data integrity - LOC ranges
const initialData = schema.initial_data;
if (initialData && initialData.length === 3) {
  findings.push('✅ Initial data: 3 policy tiers defined');

  // Check for gaps/overlaps
  const sorted = [...initialData].sort((a, b) => a.loc_min - b.loc_min);
  let hasGaps = false;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].loc_max + 1 !== sorted[i + 1].loc_min) {
      hasGaps = true;
      findings.push('⚠️ LOC range gap: Tier ' + (i + 1) + ' ends at ' + sorted[i].loc_max + ', Tier ' + (i + 2) + ' starts at ' + sorted[i + 1].loc_min);
      score -= 15;
    }
  }

  if (!hasGaps) {
    findings.push('✅ LOC ranges: No gaps or overlaps detected');
  }
} else {
  findings.push('❌ Initial data: Missing or incomplete tier definitions');
  score -= 20;
}

// 5. Enum constraint for requirement_level
const reqLevelCol = schema.columns.find(c => c.name === 'requirement_level');
if (reqLevelCol) {
  findings.push('✅ requirement_level column exists');
  // Note: CHECK constraint should be added in migration
  findings.push('⚠️ Recommendation: Add CHECK constraint IN (\'OPTIONAL\', \'RECOMMENDED\', \'REQUIRED\')');
} else {
  findings.push('❌ requirement_level column missing');
  score -= 20;
}

// 6. Timestamp tracking
const hasTimestamp = schema.columns.some(c => c.name === 'created_at');
if (hasTimestamp) {
  findings.push('✅ Timestamp tracking: created_at column present');
} else {
  findings.push('⚠️ Timestamp tracking: Consider adding created_at column');
  score -= 5;
}

console.log('📊 FINDINGS');
console.log('─'.repeat(60));
findings.forEach(f => console.log('  ' + f));
console.log('');

console.log('🎯 SCHEMA QUALITY SCORE: ' + score + '/100');
console.log('');

let verdict;
let recommendations = [];

if (score >= 90) {
  verdict = 'APPROVED';
  console.log('✅ VERDICT: APPROVED');
  console.log('   Schema design meets all quality standards');
} else if (score >= 75) {
  verdict = 'APPROVED_WITH_RECOMMENDATIONS';
  console.log('⚠️  VERDICT: APPROVED WITH RECOMMENDATIONS');
  console.log('   Schema is acceptable but improvements suggested');

  recommendations = [
    'Add CHECK constraint for requirement_level enum values',
    'Consider adding updated_at column for audit trail',
    'Add composite index on (loc_min, loc_max) for range queries'
  ];
} else {
  verdict = 'REVISIONS_REQUIRED';
  console.log('❌ VERDICT: REVISIONS REQUIRED');
  console.log('   Schema needs improvements before implementation');

  recommendations = [
    'Fix LOC range gaps in tier definitions',
    'Add CHECK constraint for requirement_level',
    'Ensure all required fields have NOT NULL constraints'
  ];
}

console.log('');

if (recommendations.length > 0) {
  console.log('📝 RECOMMENDATIONS');
  console.log('─'.repeat(60));
  recommendations.forEach((r, i) => console.log('  ' + (i + 1) + '. ' + r));
  console.log('');
}

// Store sub-agent results in PRD metadata
const subAgentResults = {
  sub_agent: 'Principal Database Architect',
  review_date: new Date().toISOString(),
  verdict,
  score,
  findings,
  recommendations,
  table_reviewed: schema.name,
  approval_status: verdict === 'APPROVED' || verdict === 'APPROVED_WITH_RECOMMENDATIONS' ? 'APPROVED' : 'REJECTED'
};

const { error } = await supabase
  .from('product_requirements_v2')
  .update({
    metadata: {
      ...(prd.metadata || {}),
      database_architect_review: subAgentResults
    },
    updated_at: new Date().toISOString()
  })
  .eq('id', 'PRD-99e35b97-e370-459f-96e2-373176210254');

if (error) {
  console.error('⚠️  Could not store results:', error.message);
} else {
  console.log('✅ Sub-agent results stored in PRD metadata');
}

console.log('');
console.log('🎯 NEXT STEP: Create PLAN→EXEC handoff');
console.log('   Database schema has been validated');
console.log('');

process.exit(verdict === 'REVISIONS_REQUIRED' ? 1 : 0);
