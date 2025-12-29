#!/usr/bin/env node

/**
 * Add SD-2025-001 (OpenAI Realtime Voice) to database
 * LEO Protocol v4.1.1 - Database First Approach
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function addOpenAIRealtimeSDToDatabase() {
  console.log('🚀 LEO Protocol v4.1.1 - Database Insertion');
  console.log('================================================');
  console.log('Document: SD-2025-001 - OpenAI Realtime Voice Consolidation\n');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey || 
      supabaseUrl === 'your_supabase_url_here' || 
      supabaseKey === 'your_supabase_anon_key_here') {
    console.log('❌ Missing or placeholder Supabase credentials in .env file');
    console.log('Please update .env with your actual Supabase URL and API key');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // 1. Insert Strategic Directive
    console.log('📋 Inserting Strategic Directive...');
    const { data: _sdData, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .upsert({
        id: 'SD-2025-001',
        title: 'OpenAI Realtime Voice Consolidation',
        status: 'active',
        category: 'product_enhancement',
        priority: 'high',
        description: 'Consolidate three fragmented voice interfaces into a single unified OpenAI Realtime Voice implementation to reduce costs, improve performance, and enable advanced AI capabilities.',
        rationale: 'Current fragmented voice interfaces create user confusion, cost $1,500/month for 11Labs, and lack intelligent reasoning. OpenAI Realtime API with gpt-realtime model provides 48% better instruction following and native function calling.',
        scope: 'Replace 11Labs Realtime, EVA Voice Conversation, and EVA Text+Speech with single OpenAI Realtime implementation using WebRTC and ephemeral tokens.',
        objectives: JSON.stringify([
          'Consolidate three voice interfaces into one unified solution',
          'Reduce operational costs by $1,500/month (eliminate 11Labs)',
          'Achieve <500ms voice-to-voice response latency',
          'Enable native function calling for portfolio queries',
          'Implement intelligent context retention across sessions'
        ]),
        success_criteria: JSON.stringify({
          quantitative: {
            latency_ms: 500,
            cost_per_minute_usd: 0.50,
            function_accuracy_percent: 95,
            uptime_percent: 99.9,
            user_satisfaction_rating: 4.5
          },
          qualitative: [
            'Zero 11Labs dependencies',
            'Single intuitive voice interface',
            'Natural conversation flow',
            'Intelligent portfolio insights',
            'Proactive strategic recommendations'
          ]
        }),
        constraints: JSON.stringify({
          technical: [
            'Must use Supabase Edge Functions',
            'Cannot expose API keys to browser',
            'Handle 30-minute session limits',
            'WebSocket auth limitations in Deno'
          ],
          resource: [
            '18 hours development time',
            '3 day timeline',
            'Single developer',
            'Existing API budget'
          ]
        }),
        risks: JSON.stringify([
          {
            type: 'technical',
            description: 'WebSocket authentication failure',
            probability: 'high',
            impact: 'high',
            mitigation: 'Use ephemeral token pattern with WebRTC'
          },
          {
            type: 'financial',
            description: 'Cost overrun ($1+/minute)',
            probability: 'medium',
            impact: 'high',
            mitigation: 'Aggressive context management, VAD, caching'
          }
        ]),
        created_by: 'LEAD-v4.1',
        execution_order: 1,
        version: '1.0',
        target_completion_date: '2025-01-05',
        estimated_effort_hours: 18,
        actual_effort_hours: null,
        progress_percentage: 40, // 20% LEAD + 20% PLAN complete
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id',
        returning: 'minimal'
      })
      .select()
      .single();
    
    if (sdError) {
      console.error('❌ Error inserting SD:', sdError.message);
      if (sdError.code === 'PGRST116') {
        console.log('⚠️  Table strategic_directives_v2 does not exist');
        console.log('📋 Please run schema creation first');
      }
      throw sdError;
    }
    
    console.log('✅ Strategic Directive inserted successfully');
    
    // 2. Insert Product Requirements Document
    console.log('\n📋 Inserting Product Requirements Document...');
    const { data: _prdData, error: prdError } = await supabase
      .from('product_requirements_v2')
      .upsert({
        id: 'PRD-2025-001',
        strategic_directive_id: 'SD-2025-001',
        title: 'OpenAI Realtime Voice Technical Implementation',
        description: 'Technical implementation specifications for consolidating voice interfaces using WebRTC, ephemeral tokens, and Supabase Edge Functions.',
        status: 'ready', // Ready for EXEC
        category: 'technical',
        priority: 'high',
        technical_requirements: JSON.stringify({
          architecture: 'WebRTC with ephemeral tokens',
          model: 'gpt-realtime',
          audio_format: 'PCM16 24kHz',
          latency_target_ms: 500,
          cost_target_per_min: 0.50,
          components: {
            token_service: '/supabase/functions/openai-session-token/',
            state_relay: '/supabase/functions/eva-state-relay/',
            client_component: '/src/components/eva/EVAVoiceAssistant.tsx'
          }
        }),
        acceptance_criteria: JSON.stringify([
          'WebRTC connection with ephemeral token',
          'Bidirectional audio streaming',
          'Function calling >95% accuracy',
          'Context persistence within session',
          'Automatic reconnection',
          'Cost <$0.50/minute',
          'Latency <500ms P95',
          'Security: injection defense'
        ]),
        test_plan: JSON.stringify({
          unit_coverage: 80,
          integration_tests: true,
          e2e_tests: true,
          security_tests: 50,
          performance_benchmarks: true
        }),
        created_by: 'PLAN-v4.1',
        version: '1.0',
        estimated_effort_hours: 18,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id',
        returning: 'minimal'
      })
      .select()
      .single();
    
    if (prdError) {
      console.error('❌ Error inserting PRD:', prdError.message);
      throw prdError;
    }
    
    console.log('✅ Product Requirements Document inserted successfully');
    
    // 3. Insert Execution Sequence Items
    console.log('\n📋 Inserting Execution Sequence Items...');
    const eesItems = [
      { id: 'EES-001', order: 1, title: 'Infrastructure Setup', hours: 3, deps: [] },
      { id: 'EES-002', order: 2, title: 'WebRTC Client Implementation', hours: 4, deps: ['EES-001'] },
      { id: 'EES-003', order: 3, title: 'Function Calling Integration', hours: 3, deps: ['EES-002'] },
      { id: 'EES-004', order: 4, title: 'Context & Cost Management', hours: 2, deps: ['EES-003'] },
      { id: 'EES-005', order: 5, title: 'Security Hardening', hours: 2, deps: ['EES-004'] },
      { id: 'EES-006', order: 6, title: 'Legacy Code Removal', hours: 1, deps: ['EES-005'] },
      { id: 'EES-007', order: 7, title: 'Testing & Verification', hours: 3, deps: ['EES-006'] }
    ];
    
    for (const ees of eesItems) {
      const { error: eesError } = await supabase
        .from('execution_sequences')
        .upsert({
          id: ees.id,
          product_requirement_id: 'PRD-2025-001',
          sequence_order: ees.order,
          title: ees.title,
          description: `Implementation task ${ees.order} for OpenAI Realtime Voice`,
          status: 'pending',
          estimated_hours: ees.hours,
          dependencies: JSON.stringify(ees.deps),
          created_by: 'PLAN-v4.1',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'id',
          returning: 'minimal'
        });
      
      if (eesError) {
        console.error(`❌ Error inserting ${ees.id}:`, eesError.message);
      } else {
        console.log(`  ✅ ${ees.id}: ${ees.title}`);
      }
    }
    
    // 4. Create audit log entries
    console.log('\n📋 Creating audit log entries...');
    const auditEntries = [
      { agent: 'LEAD', action: 'create_sd', document_id: 'SD-2025-001', phase: 'planning' },
      { agent: 'PLAN', action: 'create_prd', document_id: 'PRD-2025-001', phase: 'design' },
      { agent: 'PLAN', action: 'create_ees', document_id: 'PRD-2025-001', phase: 'design' },
      { agent: 'PLAN', action: 'handoff_to_exec', document_id: 'PRD-2025-001', phase: 'design' }
    ];
    
    for (const entry of auditEntries) {
      await supabase
        .from('leo_audit_log')
        .insert({
          ...entry,
          status: 'success',
          created_at: new Date().toISOString()
        });
    }
    
    console.log('✅ Audit log entries created');
    
    // 5. Summary
    console.log('\n================================================');
    console.log('✅ DATABASE INSERTION COMPLETE');
    console.log('================================================');
    console.log('Documents inserted:');
    console.log('  • SD-2025-001 (status: active)');
    console.log('  • PRD-2025-001 (status: ready)');
    console.log('  • 7 EES items (status: pending)');
    console.log('  • 4 audit log entries');
    console.log('\nProgress: 40% (LEAD 20% + PLAN 20%)');
    console.log('\n📤 Database ready for EXEC handoff');
    console.log('Next: EXEC can begin implementation (Phase 3)');
    
  } catch (error) {
    console.error('\n❌ Database insertion failed:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Check .env file has valid Supabase credentials');
    console.log('2. Ensure tables exist (run schema creation if needed)');
    console.log('3. Check network connection to Supabase');
    process.exit(1);
  }
}

// Execute
addOpenAIRealtimeSDToDatabase();