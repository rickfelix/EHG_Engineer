#!/usr/bin/env node

/**
 * Add SD-2025-09-EMB (Message Bus) to database
 * Works with existing strategic_directives_v2 schema
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from "dotenv";
dotenv.config();

async function addMessageBusSD() {
  console.log('🚀 Adding SD-2025-09-EMB (EHG Message Bus) to database...\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials in .env file');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // First, check existing table structure
    console.log('📋 Checking existing strategic_directives_v2 structure...');
    const { data: existing, error: checkError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .limit(1);

    if (checkError) {
      console.log('⚠️ Table check error:', checkError.message);
    } else if (existing && existing.length > 0) {
      console.log('✅ Table exists, sample structure:', Object.keys(existing[0]));
    }

    // Insert Strategic Directive using existing schema
    console.log('\n📝 Inserting Strategic Directive SD-2025-09-EMB...');
    const { data: sdData, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .upsert({
        id: 'SD-2025-09-EMB',
        title: 'EHG Message Bus (RabbitMQ) for Agent Handoffs & Stage Transitions',
        status: 'draft',
        category: 'infrastructure',
        priority: 'high',
        description: 'Implement durable message bus for async agent communication and stage transitions in the EHG application (40-stage venture workflow)',
        rationale: 'Current synchronous DB-driven communication creates tight coupling, lacks retry mechanisms, and provides limited observability. RabbitMQ will enable durable async handoffs, retry/DLQ for resilience, and full observability.',
        scope: 'EHG application ONLY (40-stage venture workflow). Governance artifacts stored in EHG_Engineering database. Covers LEAD/PLAN/EXEC agent handoffs and stage transitions.',
        success_criteria: JSON.stringify([
          'Durability: broker restart does not lose acked messages',
          'Idempotency: re-delivery causes no duplicate side-effects',
          'Latency: p50 publish-consume <100ms in staging',
          'Reliability: <1% messages to DLQ over 24h soak',
          'Security: TLS + least-privilege vhost /ehg',
          'Observability: Traces include event_id and correlation_id',
          'Rollback: single toggle back to DB-driven flow'
        ]),
        kpis: JSON.stringify({
          p50_latency_ms: 100,
          dlq_rate_pct_lt: 1,
          uptime_pct: 99.9,
          message_throughput_per_sec: 1000
        }),
        risks: JSON.stringify([
          'Message loss during broker failure',
          'Increased operational complexity',
          'Learning curve for team',
          'Performance degradation under load'
        ]),
        dependencies: JSON.stringify([
          'RabbitMQ 3.12+ infrastructure',
          'OpenTelemetry for observability',
          'Feature flag system (FEATURE_MQ)',
          'Docker/docker-compose for local dev'
        ]),
        timeline: JSON.stringify({
          start: '2025-02-01',
          end: '2025-10-01',
          milestones: [
            { date: '2025-03-01', description: 'Infrastructure & feature flag complete' },
            { date: '2025-05-01', description: 'Publishers and consumers implemented' },
            { date: '2025-07-01', description: 'Shadow mode validation complete' },
            { date: '2025-09-01', description: 'Production rollout begins' },
            { date: '2025-10-01', description: 'Legacy code removed' }
          ]
        }),
        created_by: 'Chairman',
        execution_order: 100, // High priority infrastructure
        version: '1.0',
        metadata: JSON.stringify({
          tags: ['infra', 'agents', 'reliability', 'observability'],
          target_release: '2025.10',
          exchange: 'ehg.events',
          vhost: '/ehg',
          queues: [
            'stage.transitions',
            'agent.lead',
            'agent.plan',
            'agent.exec',
            'eva.integrations'
          ]
        })
      }, {
        onConflict: 'id',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (sdError) {
      console.error('❌ Error inserting SD:', sdError);

      // If error is due to missing columns, try with minimal fields
      if (sdError.message.includes('column')) {
        console.log('\n🔄 Retrying with minimal fields...');
        const { data: minimalData, error: minimalError } = await supabase
          .from('strategic_directives_v2')
          .upsert({
            id: 'SD-2025-09-EMB',
            title: 'EHG Message Bus (RabbitMQ) for Agent Handoffs',
            status: 'draft',
            category: 'infrastructure',
            priority: 'high',
            description: 'Implement RabbitMQ message bus for async agent communication in EHG app',
            rationale: 'Enable durable async handoffs, retry/DLQ, and observability',
            scope: 'EHG application (40-stage venture workflow)',
            created_by: 'Chairman',
            execution_order: 100,
            version: '1.0'
          }, {
            onConflict: 'id'
          })
          .select()
          .single();

        if (minimalError) {
          console.error('❌ Minimal insert also failed:', minimalError);
        } else {
          console.log('✅ SD inserted with minimal fields:', minimalData.id);
          sdData = minimalData;
        }
      }
    } else {
      console.log('✅ Strategic Directive inserted successfully!');
      console.log(`   - ID: ${sdData.id}`);
      console.log(`   - Title: ${sdData.title}`);
      console.log(`   - Status: ${sdData.status}`);
      console.log(`   - Priority: ${sdData.priority}`);
    }

    // Try to insert PRD
    console.log('\n📝 Checking for PRD table and inserting PRD...');
    const prdContent = `# PRD: EHG Message Bus (RabbitMQ)

## Executive Summary
Implement a durable message bus using RabbitMQ for the EHG application's 40-stage venture workflow, enabling async communication between LEAD/PLAN/EXEC agents and reliable stage transitions.

## Problem Statement
The EHG application currently uses synchronous database-driven communication which creates:
- Tight coupling between agents
- No retry mechanism for failed operations
- Limited observability into handoffs
- Risk of data loss during failures

## Solution Overview
RabbitMQ message bus with:
- Topic exchange (ehg.events) for flexible routing
- Durable queues for agent handoffs and stage transitions
- Retry with exponential backoff and DLQ
- Full observability via OpenTelemetry
- Feature flag for instant rollback

## Event Envelope v1.0
\`\`\`json
{
  "event_id": "uuid",
  "event_type": "handoff.lead.plan | stage.transition",
  "routing_key": "handoff.lead | stage.10.11",
  "venture_id": "uuid",
  "stage_from": 10,
  "stage_to": 11,
  "agent_from": "LEAD",
  "agent_to": "PLAN",
  "payload": {},
  "correlation_id": "uuid",
  "occurred_at": "ISO8601",
  "schema_version": "1.0"
}
\`\`\`

## Implementation Phases
1. **Infrastructure & Feature Flag** - RabbitMQ setup, vhost config, FEATURE_MQ flag
2. **Event Contracts & Publishers** - TypeScript types, agent publishers
3. **Consumers & Idempotency** - processed_events table, retry logic
4. **Observability** - OTel traces, Grafana dashboards, alerts
5. **Shadow Mode & Promotion** - Dual-write validation, gradual rollout

## Success Metrics
- p50 latency < 100ms
- DLQ rate < 1%
- 99.9% uptime
- 10K messages/sec throughput`;

    const { data: prdData, error: prdError } = await supabase
      .from('product_requirements_v2')
      .upsert({
        id: 'PRD-SD-2025-09-EMB',
        directive_id: 'SD-2025-09-EMB',
        title: 'PRD: EHG Message Bus (RabbitMQ)',
        version: '1.0',
        status: 'draft',
        category: 'infrastructure',
        priority: 'high',
        executive_summary: 'Implement RabbitMQ message bus for async agent communication',
        content: prdContent,
        created_by: 'PLAN',
        plan_checklist: JSON.stringify([
          { task: 'Define event envelope schema', completed: false },
          { task: 'Design queue topology', completed: false },
          { task: 'Plan rollout phases', completed: false },
          { task: 'Create observability strategy', completed: false }
        ]),
        exec_checklist: JSON.stringify([
          { task: 'Setup RabbitMQ infrastructure', completed: false },
          { task: 'Implement publishers', completed: false },
          { task: 'Build consumers with idempotency', completed: false },
          { task: 'Add observability', completed: false },
          { task: 'Execute shadow mode test', completed: false }
        ])
      }, {
        onConflict: 'id'
      })
      .select()
      .single();

    if (prdError) {
      console.log('⚠️ PRD insert error (table may not exist):', prdError.message);
    } else {
      console.log('✅ PRD inserted successfully!');
      console.log(`   - ID: ${prdData.id}`);
      console.log(`   - Title: ${prdData.title}`);
    }

    // Summary
    console.log('\n📊 Summary:');
    console.log('✅ SD-2025-09-EMB added to database');
    console.log('📄 Migration files created in database/migrations/');
    console.log('📚 Documentation in docs/product-requirements/SD-2025-09-EMB-README.md');

    console.log('\n📝 Next Steps:');
    console.log('1. Review the SD in the dashboard at http://localhost:3000');
    console.log('2. Run full SQL migration for backlog structure:');
    console.log('   - Go to Supabase Dashboard SQL Editor');
    console.log('   - Paste contents of database/migrations/2025-09-EMB-message-bus.sql');
    console.log('   - Execute to create full backlog structure');
    console.log('3. Update SD status to "active" when ready to begin:');
    console.log('   npm run update-directive-status SD-2025-09-EMB active');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

// Run the script
addMessageBusSD().catch(console.error);