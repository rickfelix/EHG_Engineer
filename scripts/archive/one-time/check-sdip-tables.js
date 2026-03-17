#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSDIPTables() {
    console.log('\n🔍 SDIP Database Table Analysis');
    console.log('===============================\n');

    const sdipId = 'SD-2025-0903-SDIP';

    try {
        // Check different possible table names for execution sequences
        const tablesToCheck = [
            'execution_sequences_v2',
            'execution_sequences',
            'ees_items',
            'ees_items_v2',
            'task_sequences',
            'implementation_tasks',
            'execution_tasks'
        ];

        console.log('🔍 Checking for execution sequence tables...\n');

        for (const tableName of tablesToCheck) {
            try {
                console.log(`📋 Checking table: ${tableName}`);
                
                const { data: _data, error } = await supabase
                    .from(tableName)
                    .select('*')
                    .eq('directive_id', sdipId)
                    .limit(1);

                if (error) {
                    console.log(`   ❌ Table not accessible or doesn't exist: ${error.message}`);
                } else {
                    console.log('   ✅ Table exists and accessible');
                    
                    // Get count
                    const { count } = await supabase
                        .from(tableName)
                        .select('*', { count: 'exact', head: true })
                        .eq('directive_id', sdipId);
                    
                    console.log(`   📊 Records for SDIP: ${count || 0}`);
                    
                    if (data && data.length > 0) {
                        console.log('   🔍 Sample record:', JSON.stringify(data[0], null, 4));
                    }
                }
            } catch (tableError) {
                console.log(`   ❌ Error checking ${tableName}: ${tableError.message}`);
            }
            console.log('');
        }

        // Check for any tables with SDIP references
        console.log('🔍 Searching for any SDIP references in common tables...\n');
        
        const commonTables = [
            'strategic_directives_v2',
            'product_requirements_v2',
            'handoff_documents',
            'project_tasks',
            'implementation_logs'
        ];

        for (const tableName of commonTables) {
            try {
                console.log(`📋 Checking ${tableName} for SDIP references...`);
                
                const { data, error } = await supabase
                    .from(tableName)
                    .select('*')
                    .or(`id.ilike.%sdip%,title.ilike.%sdip%,directive_id.eq.${sdipId}`)
                    .limit(5);

                if (error) {
                    console.log(`   ❌ Table not accessible: ${error.message}`);
                } else {
                    console.log(`   ✅ Found ${data.length} records`);
                    if (data.length > 0) {
                        data.forEach((record, index) => {
                            console.log(`   ${index + 1}. ${record.id} - ${record.title || record.name || 'No title'}`);
                        });
                    }
                }
            } catch (tableError) {
                console.log(`   ❌ Error checking ${tableName}: ${tableError.message}`);
            }
            console.log('');
        }

        // Check for any tasks or checklist items
        console.log('🔍 Searching for task/checklist structures...\n');
        
        const taskTables = [
            'checklist_items',
            'phase_tasks',
            'agent_tasks',
            'workflow_tasks',
            'sdip_tasks'
        ];

        for (const tableName of taskTables) {
            try {
                console.log(`📋 Checking ${tableName}...`);
                
                const { data: _data2, error } = await supabase
                    .from(tableName)
                    .select('*')
                    .limit(1);

                if (error) {
                    console.log(`   ❌ Table not accessible: ${error.message}`);
                } else {
                    console.log('   ✅ Table exists');
                    
                    // Check for SDIP-related records
                    const { data: sdipRecords } = await supabase
                        .from(tableName)
                        .select('*')
                        .or(`directive_id.eq.${sdipId},title.ilike.%sdip%,description.ilike.%sdip%`)
                        .limit(5);
                    
                    console.log(`   📊 SDIP-related records: ${sdipRecords?.length || 0}`);
                    
                    if (sdipRecords && sdipRecords.length > 0) {
                        sdipRecords.forEach((record, index) => {
                            console.log(`   ${index + 1}. ${record.id} - Status: ${record.status || 'Unknown'}`);
                        });
                    }
                }
            } catch (tableError) {
                console.log(`   ❌ Error checking ${tableName}: ${tableError.message}`);
            }
            console.log('');
        }

    } catch (error) {
        console.error('❌ Unexpected error:', error);
    }
}

// Run the analysis
checkSDIPTables().catch(console.error);