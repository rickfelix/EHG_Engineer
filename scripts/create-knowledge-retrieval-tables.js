#!/usr/bin/env node

/**
 * Create Knowledge Retrieval System Tables
 * SD-KNOWLEDGE-001: Automated Knowledge Retrieval & PRD Enrichment
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createTables() {
  console.log('🚀 Creating Knowledge Retrieval System Tables');
  console.log('================================================================\n');

  const steps = [
    {
      name: 'tech_stack_references table',
      description: 'Cache for Context7 + retrospective results',
      test: async () => {
        const { count } = await supabase
          .from('tech_stack_references')
          .select('*', { count: 'exact', head: true });
        return count !== null;
      }
    },
    {
      name: 'prd_research_audit_log table',
      description: 'Telemetry for all research operations',
      test: async () => {
        const { count } = await supabase
          .from('prd_research_audit_log')
          .select('*', { count: 'exact', head: true });
        return count !== null;
      }
    },
    {
      name: 'system_health table',
      description: 'Circuit breaker state tracking',
      test: async () => {
        const { count } = await supabase
          .from('system_health')
          .select('*', { count: 'exact', head: true });
        return count !== null;
      }
    },
    {
      name: 'user_stories.implementation_context column',
      description: 'Auto-enriched context field',
      test: async () => {
        const { data } = await supabase
          .from('user_stories')
          .select('implementation_context')
          .limit(1);
        return data !== null;
      }
    },
    {
      name: 'product_requirements_v2.research_confidence_score column',
      description: 'Confidence score for research results',
      test: async () => {
        const { data } = await supabase
          .from('product_requirements_v2')
          .select('research_confidence_score')
          .limit(1);
        return data !== null;
      }
    }
  ];

  console.log('📋 Checking database schema...\n');

  const results = {
    created: [],
    alreadyExists: [],
    failed: []
  };

  for (const step of steps) {
    process.stdout.write(`   Checking ${step.name}... `);

    try {
      const exists = await step.test();

      if (exists) {
        console.log('✅ EXISTS');
        results.alreadyExists.push(step.name);
      } else {
        console.log('❌ NOT FOUND');
        results.failed.push(step.name);
      }
    } catch (error) {
      console.log('❌ ERROR:', error.message);
      results.failed.push(step.name);
    }
  }

  console.log('\n📊 Database Schema Status:');
  console.log('   ✅ Exists:', results.alreadyExists.length);
  console.log('   ❌ Missing:', results.failed.length);

  if (results.failed.length > 0) {
    console.log('\n⚠️  MIGRATION REQUIRED');
    console.log('   Missing components:');
    results.failed.forEach(name => console.log(`     - ${name}`));
    console.log('\n💡 Action Required:');
    console.log('   1. Open Supabase SQL Editor');
    console.log('   2. Run migration file:');
    console.log('      supabase/ehg_engineer/migrations/20251015200000_knowledge_retrieval_system.sql');
    console.log('   3. Re-run this script to verify');
    console.log('\n   Or use Supabase CLI:');
    console.log('      supabase db push');
    process.exit(1);
  }

  console.log('\n✅ All database components ready!');
  console.log('🎯 Knowledge retrieval system can proceed with implementation');

  // Verify Context7 circuit breaker is initialized
  console.log('\n🔍 Verifying circuit breaker initialization...');

  const { data: health, error: healthError } = await supabase
    .from('system_health')
    .select('*')
    .eq('service_name', 'context7')
    .single();

  if (healthError || !health) {
    console.log('   ⚠️  Context7 circuit breaker not initialized');
    console.log('   Creating default entry...');

    const { error: insertError } = await supabase
      .from('system_health')
      .insert({
        service_name: 'context7',
        circuit_breaker_state: 'closed',
        failure_count: 0
      });

    if (insertError) {
      console.log('   ❌ Failed to initialize:', insertError.message);
    } else {
      console.log('   ✅ Context7 circuit breaker initialized');
    }
  } else {
    console.log(`   ✅ Context7 circuit breaker: ${health.circuit_breaker_state}`);
    console.log(`      Failure count: ${health.failure_count}`);
    console.log(`      Last success: ${health.last_success_at || 'Never'}`);
  }

  console.log('\n================================================================');
  console.log('✅ Database setup complete for SD-KNOWLEDGE-001');
}

createTables();
