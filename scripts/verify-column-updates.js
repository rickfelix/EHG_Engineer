import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const sectionIds = [269, 311, 312];

for (const id of sectionIds) {
  const { data, error: _error } = await supabase
    .from('leo_protocol_sections')
    .select('id, title, content')
    .eq('id', id)
    .single();

  if (data) {
    console.log('\n' + '='.repeat(80));
    console.log(`Section ${id}: ${data.title}`);
    console.log('='.repeat(80));

    // Show examples of the changes
    const lines = data.content.split('\n');
    const relevantLines = lines.filter(line =>
      line.includes('sd_id') ||
      line.includes('strategic_directives_v2.id') ||
      line.includes('product_requirements_v2') ||
      line.includes('<SD_ID>')
    );

    if (relevantLines.length > 0) {
      console.log('\nUpdated references found:');
      relevantLines.slice(0, 5).forEach(line => {
        console.log(`  ${line.trim()}`);
      });
      if (relevantLines.length > 5) {
        console.log(`  ... and ${relevantLines.length - 5} more lines`);
      }
    }
  }
}
