#!/usr/bin/env node

/**
 * Add SD-2025-09-EMB backlog items to sd_backlog_map
 * Works with the existing backlog structure
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function addBacklogItems() {
  console.log('📋 Adding SD-2025-09-EMB backlog items...\n');

  try {
    // Define backlog items with realistic priorities matching existing patterns
    const backlogItems = [
      // Phase 1: Infrastructure
      { id: 'EMB-001', title: 'Setup RabbitMQ Docker Infrastructure', priority: 'Very High', stage: 41, phase: '1' },
      { id: 'EMB-002', title: 'Configure vhost /ehg with security', priority: 'Very High', stage: 41, phase: '1' },
      { id: 'EMB-003', title: 'Implement FEATURE_MQ feature flag', priority: 'Very High', stage: 41, phase: '1' },

      // Phase 2: Event Contracts
      { id: 'EMB-004', title: 'Define Event Envelope v1.0 Schema', priority: 'Very High', stage: 41, phase: '2' },
      { id: 'EMB-005', title: 'Build LEAD→PLAN publisher', priority: 'High', stage: 41, phase: '2' },
      { id: 'EMB-006', title: 'Build PLAN→EXEC publisher', priority: 'High', stage: 41, phase: '2' },
      { id: 'EMB-007', title: 'Build EXEC→PLAN publisher', priority: 'High', stage: 41, phase: '2' },

      // Phase 3: Consumers
      { id: 'EMB-008', title: 'Create processed_events idempotency table', priority: 'Very High', stage: 41, phase: '3' },
      { id: 'EMB-009', title: 'Implement consumer retry logic with DLQ', priority: 'High', stage: 41, phase: '3' },
      { id: 'EMB-010', title: 'Build agent consumers with business logic', priority: 'High', stage: 41, phase: '3' },

      // Phase 4: Observability
      { id: 'EMB-011', title: 'Integrate OpenTelemetry tracing', priority: 'Medium', stage: 41, phase: '4' },
      { id: 'EMB-012', title: 'Setup Prometheus metrics export', priority: 'Medium', stage: 41, phase: '4' },
      { id: 'EMB-013', title: 'Create Grafana dashboards', priority: 'Low', stage: 41, phase: '4' },
      { id: 'EMB-014', title: 'Setup DLQ alerts to EVA', priority: 'Medium', stage: 41, phase: '4' },

      // Phase 5: Rollout
      { id: 'EMB-015', title: 'Implement shadow mode dual-write', priority: 'Very High', stage: 41, phase: '5' },
      { id: 'EMB-016', title: 'Execute 24-hour soak test', priority: 'High', stage: 41, phase: '5' },
      { id: 'EMB-017', title: 'Gradual production rollout 10%→50%→100%', priority: 'High', stage: 41, phase: '5' },
      { id: 'EMB-018', title: 'Remove legacy DB polling code', priority: 'Low', stage: 41, phase: '5' }
    ];

    console.log(`📦 Preparing to add ${backlogItems.length} backlog items...`);

    // First, clear any existing test items
    const { error: deleteError } = await supabase
      .from('sd_backlog_map')
      .delete()
      .eq('sd_id', 'SD-2025-09-EMB');

    if (deleteError) {
      console.log('⚠️ Could not clear existing items:', deleteError.message);
    }

    // Convert to database format
    const backlogMapItems = backlogItems.map(item => ({
      sd_id: 'SD-2025-09-EMB',
      backlog_id: item.id,
      backlog_title: item.title,
      description_raw: null,
      item_description: `${item.title} - Part of RabbitMQ message bus implementation for EHG application`,
      my_comments: null,
      priority: item.priority,
      stage_number: item.stage,
      phase: item.phase,
      new_module: true, // All infrastructure is new
      extras: {
        implementation_phase: parseInt(item.phase),
        estimated_effort: item.priority === 'Very High' ? '3-5 days' :
                         item.priority === 'High' ? '2-3 days' :
                         item.priority === 'Medium' ? '1-2 days' : '1 day'
      },
      present_in_latest_import: true
    }));

    // Insert all items
    const { data, error } = await supabase
      .from('sd_backlog_map')
      .insert(backlogMapItems)
      .select();

    if (error) {
      console.error('❌ Error adding backlog items:', error);
      return false;
    }

    console.log(`✅ Successfully added ${data.length} backlog items!`);

    // Verify and show summary
    const { data: allItems, error: _fetchError } = await supabase
      .from('sd_backlog_map')
      .select('backlog_id, backlog_title, priority, phase')
      .eq('sd_id', 'SD-2025-09-EMB')
      .order('phase')
      .order('backlog_id');

    if (allItems) {
      console.log('\n📊 Backlog Summary by Phase:');

      const phases = {};
      allItems.forEach(item => {
        if (!phases[item.phase]) {
          phases[item.phase] = [];
        }
        phases[item.phase].push(item);
      });

      Object.keys(phases).sort().forEach(phase => {
        console.log(`\n  Phase ${phase}:`);
        phases[phase].forEach(item => {
          console.log(`    ${item.backlog_id}: ${item.backlog_title}`);
          console.log(`       Priority: ${item.priority}`);
        });
      });

      // Priority summary
      const priorities = {};
      allItems.forEach(item => {
        priorities[item.priority] = (priorities[item.priority] || 0) + 1;
      });

      console.log('\n📈 Priority Distribution:');
      Object.entries(priorities).forEach(([priority, count]) => {
        console.log(`   ${priority}: ${count} items`);
      });
    }

    console.log('\n✅ SD-2025-09-EMB backlog items successfully added!');
    console.log('\n📝 Integration with existing system:');
    console.log('1. Items are in sd_backlog_map table (same as SD-023, SD-024, etc.)');
    console.log('2. SD-2025-09-EMB exists in strategic_directives_v2 table');
    console.log('3. PRD exists in product_requirements_v2 table');
    console.log('4. View in dashboard at http://localhost:3000');
    console.log('5. Query backlog: SELECT * FROM sd_backlog_map WHERE sd_id = \'SD-2025-09-EMB\'');

    return true;

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return false;
  }
}

// Run the script
addBacklogItems().catch(console.error);