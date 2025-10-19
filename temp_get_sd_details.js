#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

async function getSDDetails() {
    console.log('Querying SD-SETTINGS-2025-10-12...\n');

    try {
        const { data: sd, error } = await supabase
            .from('strategic_directives_v2')
            .select('*')
            .eq('sd_id', 'SD-SETTINGS-2025-10-12')
            .single();

        if (error) {
            console.error('Error:', error.message);

            // Try without .single()
            const { data: allData, error: allError } = await supabase
                .from('strategic_directives_v2')
                .select('*')
                .eq('sd_id', 'SD-SETTINGS-2025-10-12');

            if (allError) {
                console.error('Second query error:', allError.message);
            } else {
                console.log('Found records:', allData?.length || 0);
                if (allData && allData.length > 0) {
                    console.log(JSON.stringify(allData[0], null, 2));
                }
            }
            return;
        }

        console.log('=== FULL SD DETAILS ===\n');
        console.log(JSON.stringify(sd, null, 2));

        console.log('\n=== KEY FIELDS ===\n');
        console.log('SD ID:', sd.sd_id);
        console.log('Title:', sd.title);
        console.log('Status:', sd.status);
        console.log('Priority:', sd.priority);
        console.log('Target App:', sd.target_app);
        console.log('Description:', sd.description || 'N/A');
        console.log('Scope:', sd.scope || 'N/A');
        console.log('Objectives:', sd.objectives || 'N/A');

    } catch (error) {
        console.error('Unexpected error:', error.message);
    }
}

getSDDetails();
