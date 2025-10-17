const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  try {
    // Get SD details
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('sd_key', 'SD-BOARD-VISUAL-BUILDER-002')
      .single();

    if (sdError) {
      console.error('Error fetching SD:', sdError);
      return;
    }

    if (!sd) {
      console.log('SD-BOARD-VISUAL-BUILDER-002 not found');
      return;
    }

    console.log('=== SD-BOARD-VISUAL-BUILDER-002 ===');
    console.log('Title:', sd.title);
    console.log('Status:', sd.status);
    console.log('Phase:', sd.current_phase);
    console.log('Progress:', sd.progress_percentage + '%');
    console.log('Priority:', sd.priority);
    console.log('\n=== Description ===');
    console.log(sd.description);
    console.log('\n=== Scope ===');
    console.log(sd.scope);

    // Get PRD
    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('id, title, status, version')
      .eq('strategic_directive_id', sd.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    console.log('\n=== PRD ===');
    if (prd) {
      console.log('Title:', prd.title);
      console.log('Status:', prd.status);
      console.log('Version:', prd.version);
    } else {
      console.log('No PRD found');
    }

    // Get handoffs
    const { data: handoffs } = await supabase
      .from('sd_phase_handoffs')
      .select('from_phase, to_phase, status, created_at')
      .eq('sd_id', 'SD-BOARD-VISUAL-BUILDER-002')
      .order('created_at', { ascending: false })
      .limit(5);

    console.log('\n=== Recent Handoffs ===');
    if (handoffs && handoffs.length > 0) {
      handoffs.forEach(h => {
        console.log(`${h.from_phase} → ${h.to_phase} (${h.status}) at ${h.created_at}`);
      });
    } else {
      console.log('No handoffs found');
    }

    // Get sub-agent results
    const { data: results } = await supabase
      .from('sub_agent_execution_results')
      .select('sub_agent_code, verdict, confidence_score, created_at')
      .eq('sd_id', 'SD-BOARD-VISUAL-BUILDER-002')
      .order('created_at', { ascending: false })
      .limit(10);

    console.log('\n=== Sub-Agent Results ===');
    if (results && results.length > 0) {
      results.forEach(r => {
        console.log(`${r.sub_agent_code}: ${r.verdict} (${r.confidence_score}%) at ${new Date(r.created_at).toLocaleString()}`);
      });
    } else {
      console.log('No sub-agent results found');
    }

  } catch (err) {
    console.error('Error:', err);
  }
})();
