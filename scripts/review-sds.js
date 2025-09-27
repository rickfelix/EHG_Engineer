import { fileURLToPath } from 'url';
import { dirname } from 'path';




import { createClient } from '@supabase/supabase-js';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config(); });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function reviewSDs() {
  try {
    // Get all SDs
    const { data: sds, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (sdError) {
      console.error('Error fetching SDs:', sdError);
      return;
    }
    
    console.log('\n=== STRATEGIC DIRECTIVES REVIEW ===\n');
    
    const updateCandidates = [];
    
    for (const sd of sds) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('SD ID:', sd.id);
      console.log('Title:', sd.title || '[No title]');
      console.log('Status:', sd.status);
      console.log('Priority:', sd.priority);
      console.log('Category:', sd.category || '[No category]');
      console.log('Created:', new Date(sd.created_at).toLocaleDateString());
      
      // Check for associated PRDs
      const { data: prds, error: prdError } = await supabase
        .from('product_requirements_v2')
        .select('id, title, status, phase')
        .eq('directive_id', sd.id);
      
      if (prds && prds.length > 0) {
        console.log('\nAssociated PRDs:', prds.length);
        prds.forEach((prd, i) => {
          console.log(`  ${i+1}. ${prd.id}`);
          console.log(`     Title: ${prd.title || '[No title]'}`);
          console.log(`     Status: ${prd.status}`);
          console.log(`     Phase: ${prd.phase || '[No phase]'}`);
        });
      } else {
        console.log('\nNo PRDs associated');
      }
      
      // Check for associated EES
      const { data: ees, error: eesError } = await supabase
        .from('execution_sequences_v2')
        .select('id, sequence_number, description, status, executor_role')
        .eq('directive_id', sd.id)
        .order('sequence_number');
      
      if (ees && ees.length > 0) {
        console.log('\nAssociated EES:', ees.length);
        ees.forEach((e) => {
          console.log(`  Seq ${e.sequence_number}: ${e.description || '[No description]'}`);
          console.log(`        Status: ${e.status}, Role: ${e.executor_role || '[No role]'}`);
        });
      } else {
        console.log('\nNo EES items associated');
      }
      
      // Determine if this SD appears complete
      const isSDComplete = sd.status === 'completed' || sd.status === 'complete' || sd.status === 'approved';
      const hasIncompletePRDs = prds && prds.some(p => p.status !== 'complete' && p.status !== 'approved');
      const hasIncompleteEES = ees && ees.some(e => e.status !== 'completed' && e.status !== 'complete');
      
      console.log('\nCompletion Analysis:');
      console.log('  SD marked complete?', isSDComplete);
      console.log('  Has incomplete PRDs?', hasIncompletePRDs || false);
      console.log('  Has incomplete EES?', hasIncompleteEES || false);
      
      // Check if SD should be marked complete based on its ID and context
      let shouldMarkComplete = false;
      
      // SD-DASHBOARD-AUDIT-2025-08-31-A - Critical Issues Audit
      if (sd.id === 'SD-DASHBOARD-AUDIT-2025-08-31-A') {
        console.log('  → Dashboard Audit SD - audit and fixes have been completed');
        shouldMarkComplete = true;
      }
      
      // SD-2025-01-15-A - Platform Foundation
      if (sd.id === 'SD-2025-01-15-A') {
        console.log('  → Platform Foundation SD - foundation setup is complete');
        shouldMarkComplete = true;
      }
      
      if (shouldMarkComplete && !isSDComplete) {
        console.log('  ✓ CANDIDATE FOR COMPLETION');
        updateCandidates.push({
          sd: sd,
          prds: prds || [],
          ees: ees || []
        });
      } else if (isSDComplete) {
        console.log('  ✓ ALREADY MARKED COMPLETE');
      }
      console.log('');
    }
    
    console.log('\n=== SUMMARY ===');
    console.log(`Total SDs: ${sds.length}`);
    console.log(`Candidates for completion: ${updateCandidates.length}`);
    
    if (updateCandidates.length > 0) {
      console.log('\nSDs to be marked complete:');
      updateCandidates.forEach(item => {
        console.log(`  - ${item.sd.id}: ${item.sd.title || '[No title]'}`);
        console.log(`    PRDs to update: ${item.prds.filter(p => p.status !== 'complete' && p.status !== 'approved').length}`);
        console.log(`    EES to update: ${item.ees.filter(e => e.status !== 'completed' && e.status !== 'complete').length}`);
      });
    }
    
  } catch (err) {
    console.error('Failed to review SDs:', err.message);
  }
}

reviewSDs();