#!/usr/bin/env node

/**
 * Add SD-2025-09-EMB to existing backlog structure
 * Uses strategic_directives_backlog and sd_backlog_map tables
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Import run ID for tracking
const IMPORT_RUN_ID = uuidv4();

async function addToExistingBacklog() {
  console.log('📋 Adding SD-2025-09-EMB to existing backlog structure...\n');

  try {
    // 1. Add to strategic_directives_backlog
    console.log('1️⃣ Adding to strategic_directives_backlog...');

    const backlogItems = [
      { id: 'EMB-001', title: 'Setup RabbitMQ Docker Infrastructure', priority: 'High', stage: 41, phase: '1' },
      { id: 'EMB-002', title: 'Configure vhost /ehg with security', priority: 'High', stage: 41, phase: '1' },
      { id: 'EMB-003', title: 'Implement FEATURE_MQ feature flag', priority: 'Critical', stage: 41, phase: '1' },
      { id: 'EMB-004', title: 'Define Event Envelope v1.0 Schema', priority: 'Critical', stage: 41, phase: '2' },
      { id: 'EMB-005', title: 'Build LEAD→PLAN publisher', priority: 'High', stage: 41, phase: '2' },
      { id: 'EMB-006', title: 'Build PLAN→EXEC publisher', priority: 'High', stage: 41, phase: '2' },
      { id: 'EMB-007', title: 'Build EXEC→PLAN publisher', priority: 'High', stage: 41, phase: '2' },
      { id: 'EMB-008', title: 'Create processed_events idempotency table', priority: 'Critical', stage: 41, phase: '3' },
      { id: 'EMB-009', title: 'Implement consumer retry logic with DLQ', priority: 'High', stage: 41, phase: '3' },
      { id: 'EMB-010', title: 'Build agent consumers with business logic', priority: 'High', stage: 41, phase: '3' },
      { id: 'EMB-011', title: 'Integrate OpenTelemetry tracing', priority: 'Medium', stage: 41, phase: '4' },
      { id: 'EMB-012', title: 'Setup Prometheus metrics export', priority: 'Medium', stage: 41, phase: '4' },
      { id: 'EMB-013', title: 'Create Grafana dashboards', priority: 'Low', stage: 41, phase: '4' },
      { id: 'EMB-014', title: 'Implement shadow mode dual-write', priority: 'Critical', stage: 41, phase: '5' },
      { id: 'EMB-015', title: 'Execute 24-hour soak test', priority: 'High', stage: 41, phase: '5' },
      { id: 'EMB-016', title: 'Gradual production rollout 10%→50%→100%', priority: 'High', stage: 41, phase: '5' },
      { id: 'EMB-017', title: 'Remove legacy DB polling code', priority: 'Low', stage: 41, phase: '5' }
    ];

    // Count priorities
    const criticalCount = backlogItems.filter(i => i.priority === 'Critical').length;
    const highCount = backlogItems.filter(i => i.priority === 'High').length;
    const mediumCount = backlogItems.filter(i => i.priority === 'Medium').length;
    const lowCount = backlogItems.filter(i => i.priority === 'Low').length;
    const totalCount = backlogItems.length;

    const sdBacklogData = {
      sd_id: 'SD-2025-09-EMB',
      sequence_rank: 200, // High priority infrastructure
      sd_title: 'EHG Message Bus (RabbitMQ) for Agent Handoffs & Stage Transitions',
      page_category: 'Infrastructure',
      page_title: 'Message Bus & Event-Driven Architecture',
      total_items: totalCount,
      h_count: criticalCount + highCount, // Treat Critical as High for counts
      m_count: mediumCount,
      l_count: lowCount,
      future_count: 0,
      must_have_count: criticalCount + highCount,
      wish_list_count: lowCount,
      must_have_pct: parseFloat(((criticalCount + highCount) / totalCount * 100).toFixed(2)),
      rolled_triage: 'High', // Overall priority
      readiness: 85.0, // High readiness - well-defined requirements
      must_have_density: parseFloat(((criticalCount + highCount) / totalCount * 100).toFixed(2)),
      new_module_pct: 100.0, // All new infrastructure
      extras: {
        target_release: '2025.10',
        exchange: 'ehg.events',
        vhost: '/ehg',
        estimated_effort_days: 45,
        source: 'manual_entry',
        created_by: 'add-emb-to-existing-backlog.js'
      },
      import_run_id: IMPORT_RUN_ID,
      present_in_latest_import: true
    };

    const { data: _sdData, error: sdError } = await supabase
      .from('strategic_directives_backlog')
      .upsert(sdBacklogData, {
        onConflict: 'sd_id'
      })
      .select()
      .single();

    if (sdError) {
      console.error('❌ Error adding to strategic_directives_backlog:', sdError);
      return false;
    }

    console.log('✅ Added to strategic_directives_backlog');
    console.log(`   - Total items: ${totalCount}`);
    console.log(`   - Critical/High: ${criticalCount + highCount}`);
    console.log(`   - Medium: ${mediumCount}`);
    console.log(`   - Low: ${lowCount}`);

    // 2. Add items to sd_backlog_map
    console.log('\n2️⃣ Adding items to sd_backlog_map...');

    const backlogMapItems = backlogItems.map((item, index) => ({
      sd_id: 'SD-2025-09-EMB',
      backlog_id: item.id,
      backlog_title: item.title,
      description_raw: null, // Used for tag parsing in imports
      item_description: `Implement ${item.title} as part of RabbitMQ message bus rollout`,
      my_comments: null,
      priority: item.priority,
      stage_number: item.stage,
      phase: item.phase,
      new_module: true, // All infrastructure is new
      extras: {
        implementation_order: index + 1,
        estimated_days: item.priority === 'Critical' ? 3 : item.priority === 'High' ? 2 : 1
      },
      import_run_id: IMPORT_RUN_ID,
      present_in_latest_import: true
    }));

    // Insert in batches to avoid issues
    const batchSize = 5;
    for (let i = 0; i < backlogMapItems.length; i += batchSize) {
      const batch = backlogMapItems.slice(i, i + batchSize);
      const { error: batchError } = await supabase
        .from('sd_backlog_map')
        .upsert(batch, {
          onConflict: 'sd_id,backlog_id'
        });

      if (batchError) {
        console.error(`❌ Error adding batch ${i / batchSize + 1}:`, batchError);
      } else {
        console.log(`   ✅ Added batch ${i / batchSize + 1} (${batch.length} items)`);
      }
    }

    console.log(`✅ Added ${backlogMapItems.length} items to sd_backlog_map`);

    // 3. Verify the data
    console.log('\n3️⃣ Verifying installation...');

    const { count: itemCount } = await supabase
      .from('sd_backlog_map')
      .select('*', { count: 'exact', head: true })
      .eq('sd_id', 'SD-2025-09-EMB');

    console.log(`✅ Verified ${itemCount} items in backlog`);

    // 4. Show sample items
    const { data: sampleItems } = await supabase
      .from('sd_backlog_map')
      .select('backlog_id, backlog_title, priority, phase')
      .eq('sd_id', 'SD-2025-09-EMB')
      .order('backlog_id')
      .limit(5);

    console.log('\n📋 Sample backlog items:');
    sampleItems?.forEach(item => {
      console.log(`   ${item.backlog_id}: ${item.backlog_title}`);
      console.log(`      Priority: ${item.priority}, Phase: ${item.phase}`);
    });

    console.log('\n✅ SD-2025-09-EMB successfully added to existing backlog structure!');
    console.log('\n📝 Next steps:');
    console.log('1. View in dashboard at http://localhost:3000');
    console.log('2. The SD appears in both strategic_directives_v2 AND strategic_directives_backlog');
    console.log('3. Backlog items are queryable via sd_backlog_map table');
    console.log('4. Use existing views like v_prd_sd_payload to see aggregated data');

    return true;

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return false;
  }
}

// Run the script
addToExistingBacklog().catch(console.error);