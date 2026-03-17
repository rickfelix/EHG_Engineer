import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkSDIP() {
  try {
    // Get SDIP Strategic Directive details
    const { data: sdipSD, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .ilike('title', '%SDIP%');

    if (sdError) throw sdError;

    if (sdipSD && sdipSD.length > 0) {
      console.log('=== SDIP STRATEGIC DIRECTIVE ===');
      sdipSD.forEach(sd => {
        console.log('ID:', sd.id);
        console.log('Title:', sd.title);
        console.log('Status:', sd.status);
        console.log('Priority:', sd.priority);
        console.log('Created:', sd.created_at);
        console.log('Updated:', sd.updated_at);
        console.log('');
        console.log('Description:', sd.description?.substring(0, 500));
        console.log('');
        if (sd.metadata) {
          console.log('Metadata:', JSON.stringify(sd.metadata, null, 2));
        }
        console.log('---');
      });
    }

    // Check for associated PRDs
    const { data: prds, error: prdError } = await supabase
      .from('product_requirements')
      .select('*')
      .ilike('title', '%SDIP%')
      .order('created_at', { ascending: false });

    if (prdError) console.error('PRD Error:', prdError);

    if (prds && prds.length > 0) {
      console.log('');
      console.log('=== ASSOCIATED PRDs ===');
      prds.forEach(prd => {
        console.log('PRD ID:', prd.prd_id);
        console.log('Title:', prd.title);
        console.log('Status:', prd.status);
        console.log('SD ID:', prd.sd_id);
        if (prd.metadata?.target_app) {
          console.log('Target App:', prd.metadata.target_app);
        }
        if (prd.content) {
          const contentPreview = typeof prd.content === 'string'
            ? prd.content.substring(0, 200)
            : JSON.stringify(prd.content).substring(0, 200);
          console.log('Content Preview:', contentPreview);
        }
        console.log('---');
      });
    }

    // Check directive submissions
    const { data: submissions, error: _subError } = await supabase
      .from('directive_submissions')
      .select('*')
      .ilike('intent_summary', '%SDIP%')
      .order('created_at', { ascending: false })
      .limit(5);

    if (submissions && submissions.length > 0) {
      console.log('');
      console.log('=== SDIP-RELATED SUBMISSIONS ===');
      submissions.forEach(sub => {
        console.log('Submission ID:', sub.id);
        console.log('Status:', sub.status);
        console.log('Chairman Input:', sub.chairman_input?.substring(0, 200));
        console.log('Intent:', sub.intent_summary?.substring(0, 200));
        console.log('---');
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkSDIP();