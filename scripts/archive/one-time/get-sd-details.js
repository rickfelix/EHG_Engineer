import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function getSDDetails() {
  try {
    const sdId = process.argv[2] || 'SD-VIF-PARENT-001';

    console.log(`\n=== SD DETAILS: ${sdId} ===\n`);

    const { data: sd, error } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (error) {
      console.error('Error fetching SD:', error.message);
      return;
    }

    if (!sd) {
      console.error('SD not found');
      return;
    }

    console.log('ID:', sd.id);
    console.log('Title:', sd.title);
    console.log('Status:', sd.status);
    console.log('Priority:', sd.priority);
    console.log('Progress:', sd.progress + '%');
    console.log('Current Phase:', sd.current_phase || 'Not set');
    console.log('Target Application:', sd.targetApplication);
    console.log('Category:', sd.category);
    console.log('\nDescription:');
    console.log(sd.description || 'No description');
    console.log('\nContent:');
    console.log(sd.content || 'No content');

    if (sd.metadata) {
      console.log('\nMetadata:');
      console.log(JSON.stringify(sd.metadata, null, 2));
    }

    // Check for related PRDs
    console.log('\n=== CHECKING FOR RELATED PRDS ===\n');
    const { data: prds, error: _prdError } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('directive_id', sdId);

    if (prds && prds.length > 0) {
      console.log(`Found ${prds.length} PRD(s):`);
      prds.forEach(prd => {
        console.log(`  - ${prd.id}: ${prd.title} (${prd.status})`);
      });
    } else {
      console.log('No PRDs found for this SD');
    }

    // Check for handoffs
    console.log('\n=== CHECKING FOR HANDOFFS ===\n');
    const { data: handoffs, error: _handoffError } = await supabase
      .from('sd_phase_handoffs')
      .select('*')
      .eq('sd_id', sdId)
      .order('created_at', { ascending: false });

    if (handoffs && handoffs.length > 0) {
      console.log(`Found ${handoffs.length} handoff(s):`);
      handoffs.forEach(h => {
        console.log(`  - ${h.handoff_type}: ${h.status} (${new Date(h.created_at).toLocaleString()})`);
      });
    } else {
      console.log('No handoffs found for this SD');
    }

  } catch (err) {
    console.error('Failed to get SD details:', err.message);
  }
}

getSDDetails();
