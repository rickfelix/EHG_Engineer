#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

async function queryActiveStrategicDirectives() {
    console.log('\n🎯 LEAD Agent - Strategic Directive Review');
    console.log('==========================================\n');

    try {
        // Query active strategic directives
        const { data: activeSDs, error } = await supabase
            .from('strategic_directives_v2')
            .select('*')
            .in('status', ['active', 'draft', 'in_progress', 'pending_approval'])
            .order('priority', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error querying strategic directives:', error.message);
            return;
        }

        if (!activeSDs || activeSDs.length === 0) {
            console.log('📋 No active strategic directives found.\n');
            console.log('As LEAD, I recommend creating new strategic directives for:');
            console.log('  • System optimization and performance improvements');
            console.log('  • Feature enhancements based on user feedback');
            console.log('  • Technical debt reduction initiatives');
            return;
        }

        console.log(`📊 Found ${activeSDs.length} Strategic Directive(s) requiring attention:\n`);

        // Group by status
        const grouped = activeSDs.reduce((acc, sd) => {
            if (!acc[sd.status]) acc[sd.status] = [];
            acc[sd.status].push(sd);
            return acc;
        }, {});

        // Display by status priority
        const statusOrder = ['active', 'in_progress', 'pending_approval', 'draft'];
        
        for (const status of statusOrder) {
            if (!grouped[status]) continue;
            
            console.log(`\n${getStatusEmoji(status)} ${status.toUpperCase().replace('_', ' ')} (${grouped[status].length}):`);
            console.log('─'.repeat(50));
            
            for (const sd of grouped[status]) {
                console.log(`\n📌 ${sd.sd_id || sd.id}`);
                console.log(`   Title: ${sd.title || 'Untitled'}`);
                console.log(`   Priority: ${getPriorityLabel(sd.priority)}`);
                console.log(`   Created: ${new Date(sd.created_at).toLocaleDateString()}`);
                
                if (sd.objectives) {
                    console.log(`   Objectives: ${sd.objectives.substring(0, 100)}...`);
                }
                
                if (sd.progress_percentage !== null && sd.progress_percentage !== undefined) {
                    console.log(`   Progress: ${getProgressBar(sd.progress_percentage)} ${sd.progress_percentage}%`);
                }

                // Check for associated PRDs
                const { data: prds } = await supabase
                    .from('prd_documents')
                    .select('prd_id, status')
                    .eq('sd_id', sd.sd_id || sd.id);
                
                if (prds && prds.length > 0) {
                    console.log(`   Associated PRDs: ${prds.length}`);
                    prds.forEach(prd => {
                        console.log(`     • ${prd.prd_id} (${prd.status})`);
                    });
                }
            }
        }

        // LEAD recommendations
        console.log('\n\n🎯 LEAD Strategic Recommendations:');
        console.log('═'.repeat(50));
        
        if (grouped['draft'] && grouped['draft'].length > 0) {
            console.log('\n1. DRAFT SDs requiring immediate attention:');
            grouped['draft'].forEach(sd => {
                console.log(`   → Review and approve: ${sd.sd_id || sd.id}`);
            });
        }

        if (grouped['pending_approval'] && grouped['pending_approval'].length > 0) {
            console.log('\n2. SDs awaiting LEAD approval:');
            grouped['pending_approval'].forEach(sd => {
                console.log(`   → Final review needed: ${sd.sd_id || sd.id}`);
            });
        }

        if (grouped['in_progress'] && grouped['in_progress'].length > 0) {
            console.log('\n3. SDs currently being executed:');
            grouped['in_progress'].forEach(sd => {
                console.log(`   → Monitor progress: ${sd.sd_id || sd.id} (${sd.progress_percentage || 0}% complete)`);
            });
        }

        if (grouped['active'] && grouped['active'].length > 0) {
            console.log('\n4. Active SDs ready for handoff to PLAN:');
            grouped['active'].forEach(sd => {
                console.log(`   → Initiate LEAD→PLAN handoff: ${sd.sd_id || sd.id}`);
            });
        }

        console.log('\n\n📋 Next Actions as LEAD:');
        console.log('1. Review and prioritize draft SDs');
        console.log('2. Approve pending SDs or request revisions');
        console.log('3. Monitor in-progress SD execution');
        console.log('4. Create LEAD→PLAN handoffs for active SDs');

    } catch (error) {
        console.error('Unexpected error:', error);
    }
}

function getStatusEmoji(status) {
    const emojis = {
        'draft': '📝',
        'active': '🟢',
        'in_progress': '🔄',
        'pending_approval': '⏳',
        'completed': '✅',
        'cancelled': '❌'
    };
    return emojis[status] || '📋';
}

function getPriorityLabel(priority) {
    if (priority >= 90) return '🔴 CRITICAL';
    if (priority >= 70) return '🟠 HIGH';
    if (priority >= 50) return '🟡 MEDIUM';
    if (priority >= 30) return '🔵 LOW';
    return '⚪ MINIMAL';
}

function getProgressBar(percentage) {
    const filled = Math.floor(percentage / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

// Execute
queryActiveStrategicDirectives();