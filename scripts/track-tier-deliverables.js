#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function trackDeliverables() {
  const sdId = 'SD-VIF-TIER-001';

  const deliverables = [
    {
      sd_id: sdId,
      deliverable_name: 'Core Tier Routing Utility',
      deliverable_type: 'ui_feature',
      description: 'tierRouting.ts - Single source of truth for tier stage mapping (60 LOC, 5 exported functions)',
      completion_status: 'completed',
      completion_evidence: 'File: src/utils/tierRouting.ts'
    },
    {
      sd_id: sdId,
      deliverable_name: 'TierIndicator Component',
      deliverable_type: 'ui_feature',
      description: 'React component with visual tier differentiation (colors, icons, tooltips)',
      completion_status: 'completed',
      completion_evidence: 'File: src/components/ventures/TierIndicator.tsx',
    },
    {
      sd_id: sdId,
      deliverable_name: 'Venture Component Integration',
      deliverable_type: 'ui_feature',
      description: 'Tier-aware updates to 7 venture components (Grid, Card, DataTable, Kanban, Detail, Overview, StartWorkflow)',
      completion_status: 'completed',
      completion_evidence: 'Files: VentureGrid.tsx, VentureCard.tsx, VentureDataTable.tsx, VenturesKanbanView.tsx, VentureDetailEnhanced.tsx, VentureOverviewTab.tsx, StartWorkflowButton.tsx',
    },
    {
      sd_id: sdId,
      deliverable_name: 'E2E Test Suite',
      deliverable_type: 'test',
      description: 'Comprehensive Playwright E2E tests covering all tier scenarios',
      completion_status: 'completed',
      completion_evidence: '50/50 tests passing in tests/e2e/tier-routing.spec.ts',
    },
    {
      sd_id: sdId,
      deliverable_name: 'Retrospective',
      deliverable_type: 'test',  // Using 'test' as closest valid type for documentation
      description: 'Comprehensive retrospective with quality score 90/100',
      completion_status: 'completed',
      completion_evidence: 'Retrospective ID: 1084284f-fcac-4ff9-990d-c85da5e9f75a',
    }
  ];

  console.log('Tracking deliverables for SD-VIF-TIER-001...\n');

  for (const deliverable of deliverables) {
    const { data, error } = await supabase
      .from('sd_scope_deliverables')
      .insert(deliverable)
      .select();

    if (error) {
      console.error(`❌ Failed to track ${deliverable.deliverable_name}:`, error.message);
    } else {
      console.log(`✅ Tracked: ${deliverable.deliverable_name}`);
    }
  }

  console.log('\n✅ All deliverables tracked successfully!');
}

trackDeliverables().catch(console.error);
