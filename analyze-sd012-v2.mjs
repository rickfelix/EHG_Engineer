import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeSD012() {
  console.log('🔍 Searching for SD-012 and related SDs\n');
  
  // Try multiple queries
  const { data: byKey } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', 'SD-012');
    
  const { data: byTitle } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .ilike('title', '%Stage 18%');
    
  const { data: byDoc } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .ilike('title', '%Documentation%');

  console.log('Results by sd_key="SD-012":', byKey?.length || 0);
  if (byKey && byKey.length > 0) {
    byKey.forEach(sd => {
      console.log(`  - ${sd.sd_key}: ${sd.title} (${sd.status})`);
    });
  }
  
  console.log('\nResults by title LIKE "Stage 18":', byTitle?.length || 0);
  if (byTitle && byTitle.length > 0) {
    byTitle.forEach(sd => {
      console.log(`  - ${sd.sd_key}: ${sd.title} (${sd.status})`);
    });
  }
  
  console.log('\nResults by title LIKE "Documentation":', byDoc?.length || 0);
  if (byDoc && byDoc.length > 0) {
    byDoc.forEach(sd => {
      console.log(`  - ${sd.sd_key}: ${sd.title} (${sd.status})`);
      if (sd.backlog_items) {
        console.log(`    Backlog items: ${sd.backlog_items.length}`);
      }
    });
  }
}

analyzeSD012();
