import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function analyzeAndReorderSDs() {
  console.log('📊 Analyzing High Priority Strategic Directives...\n');

  // Get all high priority SDs
  const { data: highPrioritySDs, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('priority', 'high')
    .order('sequence_rank', { ascending: true });

  if (error) {
    console.error('Error fetching SDs:', error);
    return;
  }

  console.log('Found', highPrioritySDs.length, 'high priority SDs:\n');
  console.log('=' .repeat(80));

  // Display current state with descriptions
  highPrioritySDs.forEach(sd => {
    console.log(`\n${sd.id} (Sequence: ${sd.sequence_rank || 'N/A'})`);
    console.log(`Title: ${sd.title}`);
    console.log(`Description: ${sd.description?.substring(0, 200)}${sd.description?.length > 200 ? '...' : ''}`);
    console.log(`Status: ${sd.status}`);
    console.log(`Metadata:`, sd.metadata ? JSON.stringify(sd.metadata).substring(0, 100) : 'None');
  });

  console.log('\n' + '='.repeat(80));
  console.log('\n📋 LOGICAL REORDERING ANALYSIS:\n');

  // Analyze dependencies and create logical ordering
  const reorderingLogic = `
DEPENDENCY ANALYSIS & LOGICAL SEQUENCE:

1. FOUNDATION & INFRASTRUCTURE (Must come first):
   - SD-PIPELINE-001: CI/CD Pipeline Hardening
     → Critical infrastructure that all other work depends on
   - SD-GOVERNANCE-UI-001: Governance UI Implementation
     → Governance framework needed before features

2. CORE SYSTEM SETUP (Early requirements):
   - SD-006: Settings: Consolidated
     → Basic settings/configuration needed by other features
   - SD-036: Stage 11 - Strategic Naming
     → Naming conventions must be established early

3. DEVELOPMENT & ORCHESTRATION (Mid-stage):
   - SD-009: Stage 14 - Development Preparation
     → Dev environment setup after infrastructure
   - SD-029: Orchestration: Consolidated
     → Process orchestration after dev prep

4. FEATURES & PAGES (Can be done after core):
   - SD-044: New Page: Consolidated
     → New pages/features after core system ready

5. LAUNCH & DEPLOYMENT (Final stage):
   - SD-016: Stage 31 - MVP Launch
     → Launch only after everything else is ready
`;

  console.log(reorderingLogic);

  // Proposed new sequence
  const proposedSequence = [
    { id: 'SD-PIPELINE-001', sequence: 100, reason: 'CI/CD infrastructure foundation' },
    { id: 'SD-GOVERNANCE-UI-001', sequence: 110, reason: 'Governance framework required early' },
    { id: 'SD-006', sequence: 120, reason: 'Settings/configuration for system' },
    { id: 'SD-036', sequence: 130, reason: 'Naming conventions establishment' },
    { id: 'SD-009', sequence: 140, reason: 'Development environment preparation' },
    { id: 'SD-029', sequence: 150, reason: 'Orchestration processes' },
    { id: 'SD-044', sequence: 160, reason: 'New features/pages' },
    { id: 'SD-016', sequence: 170, reason: 'MVP launch after all ready' }
  ];

  // Also check for any other high priority SDs not in our list
  const knownIds = proposedSequence.map(p => p.id);
  const additionalHighPriority = highPrioritySDs.filter(sd => !knownIds.includes(sd.id));

  if (additionalHighPriority.length > 0) {
    console.log('\n⚠️  Found additional high priority SDs not in reorder list:');
    additionalHighPriority.forEach(sd => {
      console.log(`   - ${sd.id}: ${sd.title}`);
      // Add them at the end
      proposedSequence.push({
        id: sd.id,
        sequence: 180 + proposedSequence.length * 10,
        reason: 'Additional high priority SD'
      });
    });
  }

  console.log('\n📝 PROPOSED NEW SEQUENCE:\n');
  console.log('Sequence | SD ID                  | Reason');
  console.log('-'.repeat(80));
  proposedSequence.forEach(item => {
    console.log(`${String(item.sequence).padEnd(8)} | ${item.id.padEnd(22)} | ${item.reason}`);
  });

  return proposedSequence;
}

async function applyReordering(proposedSequence) {
  console.log('\n\n🔄 Applying new sequence rankings...\n');

  for (const item of proposedSequence) {
    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({
        sequence_rank: item.sequence,
        updated_at: new Date().toISOString()
      })
      .eq('id', item.id);

    if (error) {
      console.log(`❌ ${item.id}: Error updating - ${error.message}`);
    } else {
      console.log(`✅ ${item.id}: Sequence set to ${item.sequence}`);
    }
  }

  console.log('\n✨ Sequence reordering complete!');
}

// Main execution
async function main() {
  const proposedSequence = await analyzeAndReorderSDs();

  if (proposedSequence) {
    console.log('\n' + '='.repeat(80));
    console.log('\n🚀 Proceeding with reordering...');
    await applyReordering(proposedSequence);
  }
}

main().catch(console.error);