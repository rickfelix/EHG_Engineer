#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sdId = process.argv[2] || 'SD-VISION-ALIGN-001';

async function analyzeSD() {
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sdId)
    .single();

  if (!sd) {
    console.log('SD not found:', sdId);
    return;
  }

  console.log('═'.repeat(70));
  console.log(`${sdId} ANALYSIS`);
  console.log('═'.repeat(70));

  console.log('\n📋 BASIC INFO');
  console.log('─'.repeat(70));
  console.log('Title:', sd.title);
  console.log('Status:', sd.status);
  console.log('Progress:', sd.progress_percentage + '%');
  console.log('Priority:', sd.priority);
  console.log('SD Type:', sd.sd_type || 'not set');
  console.log('Category:', sd.category);
  console.log('Current Phase:', sd.current_phase);

  console.log('\n📝 DESCRIPTION');
  console.log('─'.repeat(70));
  console.log((sd.description || 'No description').substring(0, 500));

  console.log('\n🔗 HIERARCHY');
  console.log('─'.repeat(70));

  // Check parent
  if (sd.parent_sd_id) {
    const { data: parent } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status')
      .eq('id', sd.parent_sd_id)
      .single();

    console.log('Parent SD:', sd.parent_sd_id);
    if (parent) {
      console.log('  Title:', parent.title);
      console.log('  Status:', parent.status);
    }
  } else {
    console.log('Parent SD: None (ROOT SD)');
  }

  // Check for children
  const { data: children } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, progress_percentage')
    .eq('parent_sd_id', sdId)
    .order('id');

  console.log('\nChildren:', children?.length || 0);
  if (children && children.length > 0) {
    for (const c of children) {
      const icon = c.status === 'completed' ? '✅' : c.status === 'active' ? '🔄' : '⏸️';
      console.log('  ' + icon, c.id, '-', (c.title || '').substring(0, 40), '[' + c.status + ']', c.progress_percentage + '%');

      // Check grandchildren
      const { data: grandchildren } = await supabase
        .from('strategic_directives_v2')
        .select('id, title, status')
        .eq('parent_sd_id', c.id);

      if (grandchildren && grandchildren.length > 0) {
        console.log('    Grandchildren:');
        grandchildren.forEach(gc => {
          const gcIcon = gc.status === 'completed' ? '✅' : '🔄';
          console.log('      ' + gcIcon, gc.id, '-', (gc.title || '').substring(0, 35), '[' + gc.status + ']');
        });
      }
    }
  }

  // Determine SD role
  const isOrchestrator = children && children.length > 0;
  const isChild = !!sd.parent_sd_id;

  console.log('\n🏷️  SD ROLE');
  console.log('─'.repeat(70));
  if (isOrchestrator && isChild) {
    console.log('Role: INTERMEDIATE ORCHESTRATOR (has parent and children)');
  } else if (isOrchestrator) {
    console.log('Role: ROOT ORCHESTRATOR (no parent, has children)');
  } else if (isChild) {
    console.log('Role: LEAF CHILD (has parent, no children)');
  } else {
    console.log('Role: STANDALONE (no parent, no children)');
  }

  // Check PRD
  console.log('\n📄 PRD STATUS');
  console.log('─'.repeat(70));
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('id, title, status, phase')
    .eq('directive_id', sdId)
    .limit(1);

  if (prd && prd.length > 0) {
    console.log('PRD:', prd[0].title);
    console.log('Status:', prd[0].status);
    console.log('Phase:', prd[0].phase);
  } else {
    console.log('No PRD found');
  }

  // Check handoffs
  console.log('\n🔄 HANDOFFS');
  console.log('─'.repeat(70));
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('handoff_type, status, created_at')
    .eq('sd_id', sdId)
    .order('created_at');

  if (handoffs && handoffs.length > 0) {
    const accepted = handoffs.filter(h => h.status === 'accepted');
    const rejected = handoffs.filter(h => h.status === 'rejected');
    console.log(`Total: ${handoffs.length} (${accepted.length} accepted, ${rejected.length} rejected)`);
    accepted.forEach(h => {
      console.log('  ✅', h.handoff_type);
    });
  } else {
    console.log('No handoffs recorded');
  }

  // Check retrospective
  console.log('\n📊 RETROSPECTIVE');
  console.log('─'.repeat(70));
  const { data: retro } = await supabase
    .from('retrospectives')
    .select('id, status, quality_score')
    .eq('sd_id', sdId);

  if (retro && retro.length > 0) {
    console.log('Exists:', retro[0].status, '- Score:', retro[0].quality_score + '/100');
  } else {
    console.log('No retrospective yet');
  }

  // What's needed to complete
  console.log('\n⏳ COMPLETION REQUIREMENTS');
  console.log('─'.repeat(70));

  if (sd.status === 'completed') {
    console.log('✅ Already completed');
  } else if (isOrchestrator) {
    const incompleteChildren = children.filter(c => c.status !== 'completed');
    if (incompleteChildren.length > 0) {
      console.log('Incomplete children:', incompleteChildren.length);
      incompleteChildren.forEach(c => console.log('  ❌', c.id, '-', c.status));
    } else {
      console.log('✅ All children complete');
      console.log('Needs: PLAN-TO-LEAD handoff to mark as completed');
    }
  } else {
    const acceptedHandoffs = (handoffs || []).filter(h => h.status === 'accepted').map(h => h.handoff_type);
    const needed = [];
    if (!acceptedHandoffs.includes('LEAD-TO-PLAN')) needed.push('LEAD-TO-PLAN');
    if (!acceptedHandoffs.includes('PLAN-TO-EXEC')) needed.push('PLAN-TO-EXEC');
    if (!acceptedHandoffs.includes('EXEC-TO-PLAN')) needed.push('EXEC-TO-PLAN');
    if (!acceptedHandoffs.includes('PLAN-TO-LEAD')) needed.push('PLAN-TO-LEAD');
    if (!retro || retro.length === 0) needed.push('Retrospective');

    if (needed.length > 0) {
      console.log('Missing:', needed.join(', '));
    } else {
      console.log('All requirements met - ready for completion');
    }
  }
}

analyzeSD().catch(console.error);
