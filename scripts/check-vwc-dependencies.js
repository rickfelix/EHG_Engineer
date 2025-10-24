const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRelatedSDs() {
  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, progress_percentage, dependencies, phase, created_at')
      .in('id', ['SD-VWC-PARENT-001', 'SD-VWC-PHASE1-001', 'SD-VWC-PHASE2-001'])
      .order('created_at', { ascending: true });

    if (error) throw error;

    console.log('=== Related SDs Status ===\n');

    data.forEach(sd => {
      console.log(`SD ID: ${sd.id}`);
      console.log(`Title: ${sd.title}`);
      console.log(`Status: ${sd.status}`);
      console.log(`Progress: ${sd.progress_percentage}%`);
      console.log(`Phase: ${sd.phase || 'N/A'}`);
      console.log(`Dependencies: ${sd.dependencies ? JSON.stringify(sd.dependencies) : 'None'}`);
      console.log(`Created: ${sd.created_at}`);
      console.log('---\n');
    });

    console.log('\n=== Validation Checks ===\n');

    const parent = data.find(sd => sd.id === 'SD-VWC-PARENT-001');
    const phase1 = data.find(sd => sd.id === 'SD-VWC-PHASE1-001');
    const phase2 = data.find(sd => sd.id === 'SD-VWC-PHASE2-001');

    if (!parent) {
      console.log('❌ BLOCKER: Parent SD (SD-VWC-PARENT-001) not found');
    } else {
      console.log(`Parent SD Status: ${parent.status}`);
      const parentActive = ['PLAN', 'EXEC', 'QA'].includes(parent.status);
      console.log(`Parent SD Active: ${parentActive ? '✅ YES' : '❌ NO'}`);
    }

    if (!phase1) {
      console.log('❌ BLOCKER: Phase 1 SD (SD-VWC-PHASE1-001) not found');
    } else {
      console.log(`\nPhase 1 Status: ${phase1.status}`);
      console.log(`Phase 1 Progress: ${phase1.progress_percentage}%`);
      const phase1Complete = phase1.status === 'COMPLETED' && phase1.progress_percentage === 100;
      console.log(`Phase 1 Completed: ${phase1Complete ? '✅ YES' : '❌ NO'}`);
    }

    if (phase2) {
      console.log(`\nPhase 2 Dependencies: ${phase2.dependencies ? JSON.stringify(phase2.dependencies) : 'None'}`);
      const hasPhase1Dep = phase2.dependencies && phase2.dependencies.includes('SD-VWC-PHASE1-001');
      console.log(`Phase 2 Has Phase 1 Dependency: ${hasPhase1Dep ? '✅ YES' : '❌ NO - SHOULD BE ADDED'}`);
    }

    console.log('\n=== Recommendation ===\n');
    if (phase1 && phase1.status === 'COMPLETED' && phase2) {
      const hasPhase1Dep = phase2.dependencies && phase2.dependencies.includes('SD-VWC-PHASE1-001');
      if (!hasPhase1Dep) {
        console.log('📝 Action Required: Add SD-VWC-PHASE1-001 to SD-VWC-PHASE2-001 dependencies array');
        console.log('   This ensures proper sequencing and validation in LEAD approval process');
      } else {
        console.log('✅ Dependencies properly configured');
      }
    }

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkRelatedSDs();
