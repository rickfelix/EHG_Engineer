#!/usr/bin/env node

/**
 * Update SD-2025-09-11: Ventures List Consolidated
 * LEAD agent restructuring with proper objectives
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const updatedSD = {
  title: 'Ventures List: Consolidated View',
  description: `Consolidate and improve the ventures list display by creating a unified, performant view that combines existing grid, kanban, and table views into a single cohesive interface with improved filtering and search.

**Current State**: Multiple separate components (VentureGrid, VenturesKanbanView, VentureDataTable) exist but lack unified experience.

**Business Need**: Users struggle to find ventures across different views. Need single, consolidated interface with all view modes accessible from one place.`,

  scope: `**Must-Haves**:
- Unified ventures list page with view mode toggle (Grid/Kanban/Table)
- Persistent filter state across view modes
- Search functionality (name, stage, status)
- Sort controls (date, name, stage, value)
- Performance optimization (virtualization for 100+ ventures)

**Nice-to-Haves**:
- Saved filter presets
- Bulk actions (stage change, delete)
- Export to CSV

**Out of Scope** (Separate SDs):
- Timeline tab (defer to SD-047A)
- Documents tab (defer to SD-047B)`,

  strategic_intent: 'Simplify venture discovery and management by providing a single, consolidated interface. Reduce cognitive load from navigating multiple disconnected views. Improve user productivity by 30% through faster venture lookup.',

  rationale: `**Simplicity-First Approach**:
- Consolidates 3 existing components instead of building new features
- Leverages existing Shadcn UI components (Tabs, Select, Input)
- Estimated 8-12 hours vs. original 65 hours for Timeline+Documents
- Immediate value: Users can find ventures faster TODAY
- Defers complex features (timeline, documents) to focused SDs`,

  strategic_objectives: JSON.stringify([
    'Create unified ventures list interface with 3 view modes',
    'Implement persistent filtering and search',
    'Optimize performance for 100+ ventures',
    'Improve venture discoverability by 30%'
  ]),

  success_criteria: JSON.stringify([
    'All ventures accessible from single consolidated page',
    'View mode switch (Grid/Kanban/Table) preserves filters',
    'Search returns results in <500ms',
    'Page loads in <2s with 100 ventures',
    'User testing shows 30% faster venture lookup'
  ]),

  status: 'active',
  priority: 'medium', // Lowered from high - consolidation is valuable but not critical

  metadata: {
    original_scope_deferred: {
      timeline_tab: 'Moved to SD-047A (30h estimate)',
      documents_tab: 'Moved to SD-047B (35h estimate)'
    },
    simplicity_first_savings: '53 hours (65h → 12h)',
    estimated_hours: 12,
    components_to_consolidate: ['VentureGrid', 'VenturesKanbanView', 'VentureDataTable']
  }
};

async function updateSD() {
  console.log('📋 Updating SD-2025-09-11: Ventures List Consolidated\n');
  console.log('🎯 LEAD Simplicity-First Restructuring Applied\n');

  const { data: _data, error } = await supabase
    .from('strategic_directives_v2')
    .update(updatedSD)
    .eq('sd_key', 'SD-2025-09-11-ventures-list-consolidated')
    .select();

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  console.log('✅ SD Updated Successfully\n');
  console.log('📊 Changes:');
  console.log('   Title: "Ventures List: Consolidated View"');
  console.log('   Priority: high → medium (realistic impact)');
  console.log('   Scope: 65h (Timeline+Docs) → 12h (Consolidated UI)');
  console.log('   Strategic Objectives: 4 clear objectives added');
  console.log('   Success Criteria: 5 measurable criteria added');
  console.log('\n💡 Deferred to Future SDs:');
  console.log('   - SD-047A: Enhanced Venture Timeline Tab (30h)');
  console.log('   - SD-047B: Enhanced Venture Documents Tab (35h)');
  console.log('\n✅ Ready for LEAD→PLAN handoff\n');
}

updateSD();
