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

async function querySDIPStatus() {
    console.log('\n🔍 SDIP Strategic Directive Analysis');
    console.log('=====================================\n');

    try {
        // 1. Query Strategic Directive
        console.log('1. STRATEGIC DIRECTIVE DETAILS');
        console.log('-------------------------------');
        
        const { data: sdData, error: sdError } = await supabase
            .from('strategic_directives_v2')
            .select('*')
            .ilike('id', '%sdip%')
            .single();

        if (sdError) {
            console.error('❌ Error querying strategic directive:', sdError);
            return;
        }

        if (sdData) {
            console.log(`✅ SD ID: ${sdData.id}`);
            console.log(`📋 Title: ${sdData.title}`);
            console.log(`🟢 Status: ${sdData.status}`);
            console.log(`⭐ Priority: ${sdData.priority}`);
            console.log(`📂 Category: ${sdData.category}`);
            console.log(`📅 Created: ${new Date(sdData.created_at).toISOString()}`);
            console.log(`📝 Description: ${sdData.description || 'N/A'}`);
            
            if (sdData.metadata) {
                console.log('🔧 Metadata:', JSON.stringify(sdData.metadata, null, 2));
            }
        }

        // 2. Query associated PRD
        console.log('\n2. ASSOCIATED PRD DETAILS');
        console.log('---------------------------');
        
        const { data: prdData, error: prdError } = await supabase
            .from('product_requirements_v2')
            .select('*')
            .eq('directive_id', sdData.id);

        if (prdError) {
            console.error('❌ Error querying PRD:', prdError);
        } else if (prdData && prdData.length > 0) {
            const prd = prdData[0];
            console.log(`✅ PRD ID: ${prd.id}`);
            console.log(`📋 Title: ${prd.title}`);
            console.log(`🟢 Status: ${prd.status}`);
            console.log(`📊 Phase: ${prd.phase}`);
            console.log(`📈 Progress: ${prd.progress}%`);
            console.log(`📅 Created: ${new Date(prd.created_at).toISOString()}`);
            
            if (prd.phase_progress) {
                console.log('🔍 Phase Progress:', JSON.stringify(prd.phase_progress, null, 2));
            }
            
            if (prd.requirements) {
                console.log(`📋 Requirements: ${JSON.stringify(prd.requirements, null, 2)}`);
            }
        } else {
            console.log('❌ No PRD found for this directive');
        }

        // 3. Query execution sequences
        console.log('\n3. EXECUTION SEQUENCE DETAILS');
        console.log('------------------------------');
        
        const { data: eesData, error: eesError } = await supabase
            .from('execution_sequences_v2')
            .select('*')
            .eq('directive_id', sdData.id)
            .order('sequence_number', { ascending: true });

        if (eesError) {
            console.error('❌ Error querying execution sequences:', eesError);
        } else if (eesData && eesData.length > 0) {
            console.log(`✅ Found ${eesData.length} execution sequence items:`);
            eesData.forEach((ees, index) => {
                console.log(`\n   ${index + 1}. ${ees.id}`);
                console.log(`      📋 Task: ${ees.task_description}`);
                console.log(`      🟢 Status: ${ees.status}`);
                console.log(`      👤 Assigned: ${ees.assigned_agent}`);
                console.log(`      📊 Progress: ${ees.progress}%`);
                if (ees.metadata) {
                    console.log(`      🔧 Metadata: ${JSON.stringify(ees.metadata, null, 2)}`);
                }
            });
        } else {
            console.log('❌ No execution sequences found for this directive');
        }

        // 4. Check for handoff documents (if any exist in database)
        console.log('\n4. HANDOFF STATUS');
        console.log('------------------');
        
        const { data: handoffData, error: handoffError } = await supabase
            .from('handoff_documents')
            .select('*')
            .eq('directive_id', sdData.id);

        if (handoffError) {
            console.log('ℹ️  No handoff_documents table found or accessible');
        } else if (handoffData && handoffData.length > 0) {
            console.log(`✅ Found ${handoffData.length} handoff documents:`);
            handoffData.forEach((handoff, index) => {
                console.log(`   ${index + 1}. ${handoff.id}`);
                console.log(`      🔄 Type: ${handoff.handoff_type}`);
                console.log(`      🟢 Status: ${handoff.status}`);
                console.log(`      📅 Created: ${new Date(handoff.created_at).toISOString()}`);
            });
        } else {
            console.log('ℹ️  No handoff documents found in database');
        }

        // 5. Overall completion analysis
        console.log('\n5. COMPLETION ANALYSIS');
        console.log('------------------------');
        
        let overallProgress = 0;
        let completedItems = 0;
        let totalItems = 0;
        
        if (eesData && eesData.length > 0) {
            totalItems = eesData.length;
            completedItems = eesData.filter(ees => ees.status === 'completed').length;
            overallProgress = Math.round((completedItems / totalItems) * 100);
        }
        
        console.log(`📊 Overall Progress: ${overallProgress}% (${completedItems}/${totalItems} items completed)`);
        
        const isComplete = sdData.status === 'archived' && 
                          (prdData && prdData[0] && prdData[0].status === 'approved') &&
                          overallProgress === 100;
        
        console.log(`🎯 Implementation Complete: ${isComplete ? '✅ YES' : '❌ NO'}`);
        
        if (!isComplete) {
            console.log('\n📋 NEXT STEPS NEEDED:');
            if (sdData.status !== 'archived') {
                console.log('   • Strategic Directive needs to be completed/archived');
            }
            if (!prdData || prdData[0]?.status !== 'approved') {
                console.log('   • PRD needs to be approved');
            }
            if (overallProgress < 100) {
                console.log(`   • ${totalItems - completedItems} execution sequence items need completion`);
            }
        }

    } catch (error) {
        console.error('❌ Unexpected error:', error);
    }
}

// Run the query
querySDIPStatus().catch(console.error);