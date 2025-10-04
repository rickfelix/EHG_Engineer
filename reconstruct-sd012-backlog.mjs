import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function reconstructBacklogItems() {
  const backlogItems = [
    {
      id: 'SD-012-BL-001',
      title: 'Phase 1: Core Sync Engine',
      description: 'Implement basic GitHub integration, build document sync mechanics, create conflict detection system',
      tasks: [
        'Implement basic GitHub integration',
        'Build document sync mechanics',
        'Create conflict detection system'
      ],
      priority: 'high',
      estimatedHours: 120,
      duration: '3 weeks',
      status: 'pending',
      dependencies: [],
      source: 'enhanced_prds/20_workflows/18_documentation_sync.md',
      sourceSection: 'Phase 1: Core Sync Engine (Weeks 1-3)'
    },
    {
      id: 'SD-012-BL-002',
      title: 'Phase 2: Advanced Features',
      description: 'Add sophisticated conflict resolution, implement performance optimization, build comprehensive UI dashboard',
      tasks: [
        'Add sophisticated conflict resolution',
        'Implement performance optimization',
        'Build comprehensive UI dashboard'
      ],
      priority: 'high',
      estimatedHours: 120,
      duration: '3 weeks',
      status: 'pending',
      dependencies: ['SD-012-BL-001'],
      source: 'enhanced_prds/20_workflows/18_documentation_sync.md',
      sourceSection: 'Phase 2: Advanced Features (Weeks 4-6)'
    },
    {
      id: 'SD-012-BL-003',
      title: 'Phase 3: Integration & Automation',
      description: 'Complete EVA and Chairman integration, add voice command support, implement automated scheduling and optimization',
      tasks: [
        'Complete EVA and Chairman integration',
        'Add voice command support',
        'Implement automated scheduling and optimization'
      ],
      priority: 'medium',
      estimatedHours: 80,
      duration: '2 weeks',
      status: 'pending',
      dependencies: ['SD-012-BL-002'],
      source: 'enhanced_prds/20_workflows/18_documentation_sync.md',
      sourceSection: 'Phase 3: Integration & Automation (Weeks 7-8)'
    }
  ];

  console.log('📦 Reconstructed Backlog Items for SD-012:\n');
  console.log(JSON.stringify(backlogItems, null, 2));

  console.log('\n\n🔄 Updating SD-012 in database...\n');

  // First get current metadata
  const { data: currentSD } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', 'SD-2025-09-11-stage-18-documentation-sync-consolidated')
    .single();

  const updatedMetadata = {
    ...(currentSD?.metadata || {}),
    backlog_items: backlogItems,
    backlog_reconstructed: new Date().toISOString(),
    backlog_source: 'enhanced_prds/20_workflows/18_documentation_sync.md',
    total_estimated_hours: 320,
    total_phases: 3
  };

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      metadata: updatedMetadata
    })
    .eq('sd_key', 'SD-2025-09-11-stage-18-documentation-sync-consolidated')
    .select();

  if (error) {
    console.error('❌ Error updating SD:', error);
    return;
  }

  console.log('✅ Successfully updated SD-012 with', backlogItems.length, 'backlog items');
  console.log('\nTotal Estimated Hours:', 320);
  console.log('Total Duration: 8 weeks');
  console.log('Phases: 3');

  // Verify the update
  const { data: verification } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', 'SD-2025-09-11-stage-18-documentation-sync-consolidated')
    .single();

  console.log('\n🔍 Verification:');
  console.log('Backlog items count:', verification?.metadata?.backlog_items?.length || 0);
  console.log('Metadata backlog_source:', verification?.metadata?.backlog_source);
}

reconstructBacklogItems();
