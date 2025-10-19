#!/usr/bin/env node

/**
 * Fix PRD-KNOWLEDGE-001 field formats
 * Convert string fields to arrays where expected
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function fixPRDFormat() {
  console.log('🔧 Fixing PRD-KNOWLEDGE-001 field formats');
  console.log('================================================================\n');

  // Get current PRD
  const { data: prd, error: fetchError } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('id', 'PRD-KNOWLEDGE-001')
    .single();

  if (fetchError || !prd) {
    console.error('❌ Failed to fetch PRD:', fetchError);
    process.exit(1);
  }

  console.log('📋 Current PRD format:');
  console.log(`   functional_requirements: ${typeof prd.functional_requirements} (${Array.isArray(prd.functional_requirements) ? 'array' : 'not array'})`);
  console.log(`   technical_requirements: ${typeof prd.technical_requirements} (${Array.isArray(prd.technical_requirements) ? 'array' : 'not array'})`);

  // Convert string fields to arrays
  const functionalReqs = [
    'Automated retrospective search with <2 second response time',
    'Context7 MCP fallback when local results <3',
    'PRD auto-enrichment with implementation_context',
    'Circuit breaker with 3-failure threshold and 1-hour recovery',
    'Research audit logging for all operations',
    'Token budget enforcement (5k/query, 15k/PRD hard caps)',
    'Feature flags for gradual rollout control'
  ];

  const technicalReqs = [
    'Create automated-knowledge-retrieval.js orchestrator',
    'Implement Context7 MCP client integration',
    'Create circuit breaker state machine',
    'Build PRD enrichment pipeline',
    'Add 3 new database tables (tech_stack_references, prd_research_audit_log, system_health)',
    'Enhance user_stories with implementation_context JSONB field',
    'Integrate with unified-handoff-system.js at LEAD→PLAN transition',
    'Implement 24-hour TTL cache with package.json versioning'
  ];

  const updates = {
    functional_requirements: functionalReqs,
    technical_requirements: technicalReqs
  };

  console.log('\n🔄 Updating to array format...');

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .update(updates)
    .eq('id', 'PRD-KNOWLEDGE-001')
    .select('id, functional_requirements, technical_requirements');

  if (error) {
    console.error('❌ Failed to update PRD:', error);
    process.exit(1);
  }

  console.log('\n✅ PRD format fixed successfully');
  console.log('   functional_requirements: array ✓');
  console.log('   technical_requirements: array ✓');
  console.log('\n🎯 Ready to retry PLAN→EXEC handoff');
}

fixPRDFormat();
