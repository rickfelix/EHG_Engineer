import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

async function getSDDetails() {
    const { data: sd, error } = await supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('id', 'SD-SETTINGS-2025-10-12')
        .single();

    if (error) {
        console.error('Error:', error);
        process.exit(1);
    }

    console.log('=== STRATEGIC DIRECTIVE: SD-SETTINGS-2025-10-12 ===\n');
    console.log('Title:', sd.title);
    console.log('Status:', sd.status);
    console.log('Priority:', sd.priority);
    console.log('Target App:', sd.target_app || 'Not specified');
    console.log('Created:', new Date(sd.created_at).toLocaleDateString());
    console.log('\n--- DESCRIPTION ---');
    console.log(sd.description || 'N/A');
    console.log('\n--- SCOPE ---');
    console.log(sd.scope || 'N/A');
    console.log('\n--- OBJECTIVES ---');
    console.log(sd.objectives || 'N/A');
    console.log('\n--- SUCCESS CRITERIA ---');
    console.log(sd.success_criteria || 'N/A');
    
    // Check for PRD
    const { data: prd } = await supabase
        .from('product_requirements_v2')
        .select('id, title, status')
        .eq('strategic_directive_id', 'SD-SETTINGS-2025-10-12');
    
    console.log('\n--- EXISTING PRD ---');
    console.log('PRDs:', prd ? prd.length : 0);
    if (prd && prd.length > 0) {
        prd.forEach(p => console.log(`  - ${p.title} (${p.status})`));
    }
    
    // Check backlog
    const { data: backlog } = await supabase
        .from('sd_backlog_map')
        .select('*')
        .eq('sd_id', 'SD-SETTINGS-2025-10-12');
    
    console.log('\n--- LINKED BACKLOG ---');
    console.log('Backlog Items:', backlog ? backlog.length : 0);
}

getSDDetails();
