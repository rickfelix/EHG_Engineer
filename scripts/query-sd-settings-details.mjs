import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

async function getSDDetails() {
    // First, let's find the SD by title or id
    const { data: sds, error: listError } = await supabase
        .from('strategic_directives_v2')
        .select('*')
        .ilike('title', '%Settings%');

    if (listError) {
        console.error('Error:', listError);
        process.exit(1);
    }

    console.log('Found', sds.length, 'SDs with "Settings" in title:\n');
    
    sds.forEach(sd => {
        console.log('=== STRATEGIC DIRECTIVE ===');
        console.log('ID:', sd.id);
        console.log('SD_ID field:', sd.sd_id || 'N/A');
        console.log('Title:', sd.title);
        console.log('Status:', sd.status);
        console.log('Priority:', sd.priority);
        console.log('Target App:', sd.target_app || 'Not specified');
        console.log('\nDescription:', sd.description ? sd.description.substring(0, 200) : 'N/A');
        console.log('\nScope:', sd.scope ? sd.scope.substring(0, 200) : 'N/A');
        console.log('\n' + '='.repeat(50) + '\n');
    });
}

getSDDetails();
