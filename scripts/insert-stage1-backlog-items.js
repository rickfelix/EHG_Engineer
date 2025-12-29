#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Stage-1 Backlog Items
const backlogItems = [
    // EVA Integration Items (SD-003A)
    {
        sd_id: 'SD-003A',
        backlog_id: 'BP-001',
        backlog_title: 'Voice Capture Infrastructure',
        description_raw: '@voice @capture @webrtc',
        item_description: 'Implement WebRTC-based voice recording with automatic transcription pipeline',
        my_comments: 'Core infrastructure for EVA voice-first approach. Requires WebRTC setup, audio compression, and cloud storage integration.',
        priority: 'High',
        stage_number: 1,
        phase: 'Implementation',
        new_module: true,
        extras: {
            acceptance_criteria: [
                'Voice button visible on Stage-1 form',
                'Recording limited to 10 minutes max',
                'Auto-save to cloud storage',
                'Transcription within 5 seconds'
            ],
            kpis: ['time_to_capture', 'transcription_accuracy'],
            dependencies: ['WebRTC API', 'OpenAI Whisper', 'Supabase Storage'],
            estimated_hours: 16,
            rationale: 'Voice capture reduces friction for idea entry by 80% based on competitor analysis'
        }
    },
    {
        sd_id: 'SD-003A',
        backlog_id: 'BP-002',
        backlog_title: 'EVA Agent Core Implementation',
        description_raw: '@eva @agent @ai',
        item_description: 'Build EVA agent with structured output for idea extraction and validation',
        my_comments: 'EVA becomes the Stage-1 owner, processing voice/text into structured ideas',
        priority: 'High',
        stage_number: 1,
        phase: 'Implementation',
        new_module: true,
        extras: {
            acceptance_criteria: [
                'EVA processes voice transcript',
                'Extracts: title, problem, solution, assumptions',
                'Generates quality score 0-100',
                'Returns structured JSON response'
            ],
            kpis: ['idea_quality_score', 'validation_completeness'],
            dependencies: ['OpenAI GPT-4', 'Prompt templates'],
            estimated_hours: 12,
            rationale: 'EVA provides consistent idea quality and extraction vs manual entry'
        }
    },
    {
        sd_id: 'SD-003A',
        backlog_id: 'BP-003',
        backlog_title: 'Validation Gate System',
        description_raw: '@validation @gates @quality',
        item_description: 'Implement validation gates with pass/fail criteria and improvement suggestions',
        my_comments: 'Gates ensure idea quality before progression to Stage-2',
        priority: 'High',
        stage_number: 1,
        phase: 'Implementation',
        new_module: false,
        extras: {
            acceptance_criteria: [
                'Title validation (3-120 chars)',
                'Problem clarity score > 70',
                'Solution feasibility check',
                'Assumptions documented (min 10 chars)',
                'Success criteria defined (min 10 chars)'
            ],
            kpis: ['gate_pass_rate', 'ideas_requiring_revision'],
            dependencies: ['Existing validation framework'],
            estimated_hours: 8,
            rationale: 'Quality gates prevent low-quality ideas from consuming Stage-2+ resources'
        }
    },
    {
        sd_id: 'SD-003A',
        backlog_id: 'BP-004',
        backlog_title: 'Real-time Suggestions UI',
        description_raw: '@ui @suggestions @realtime',
        item_description: 'Display EVA suggestions and improvements in real-time during idea entry',
        my_comments: 'Interactive feedback helps users improve ideas before submission',
        priority: 'Medium',
        stage_number: 1,
        phase: 'Enhancement',
        new_module: false,
        extras: {
            acceptance_criteria: [
                'Suggestions appear within 2 seconds',
                'Non-blocking UI updates',
                'Accept/reject suggestion buttons',
                'Suggestion history tracked'
            ],
            kpis: ['suggestion_acceptance_rate', 'ui_responsiveness'],
            dependencies: ['React state management', 'WebSocket for real-time'],
            estimated_hours: 10,
            rationale: 'Real-time feedback increases idea quality score by 25% in testing'
        }
    },
    
    // Story-First Mode Items (SD-1A)
    {
        sd_id: 'SD-1A',
        backlog_id: 'BP-005',
        backlog_title: 'Story-First Input Mode',
        description_raw: '@story @narrative @input',
        item_description: 'Implement story-first mode where users tell their story and AI extracts structure',
        my_comments: 'Natural storytelling mode for non-technical founders',
        priority: 'High',
        stage_number: 1,
        phase: 'Implementation',
        new_module: true,
        extras: {
            acceptance_criteria: [
                'Story textarea with 500+ char minimum',
                'AI extracts: problem, solution, market',
                'Narrative preserved in metadata',
                'Mode selector in UI'
            ],
            kpis: ['story_to_idea_conversion', 'narrative_completeness'],
            dependencies: ['GPT-4 for extraction', 'UI mode selector'],
            estimated_hours: 14,
            rationale: 'Story mode increases completion rate by 40% for first-time users'
        }
    },
    {
        sd_id: 'SD-1A',
        backlog_id: 'BP-006',
        backlog_title: 'Competitor-Gap Analysis Mode',
        description_raw: '@competitor @gap @analysis',
        item_description: 'Mode where users identify competitors and gaps, system generates opportunity',
        my_comments: 'Systematic approach for market-driven opportunities',
        priority: 'High',
        stage_number: 1,
        phase: 'Implementation',
        new_module: true,
        extras: {
            acceptance_criteria: [
                'Add up to 3 competitors',
                'Describe gap/pain point',
                'AI generates opportunity statement',
                'Competitive analysis saved'
            ],
            kpis: ['gap_identification_clarity', 'competitive_insights'],
            dependencies: ['Competitor API integration', 'Market analysis prompts'],
            estimated_hours: 12,
            rationale: 'Competitor-gap mode validates market need upfront'
        }
    },
    {
        sd_id: 'SD-1A',
        backlog_id: 'BP-007',
        backlog_title: 'JTBD Problem Definition',
        description_raw: '@jtbd @jobs @problem',
        item_description: 'Jobs-to-be-done framework for defining problems with severity scoring',
        my_comments: 'Structured problem definition using JTBD methodology',
        priority: 'High',
        stage_number: 1,
        phase: 'Implementation',
        new_module: true,
        extras: {
            acceptance_criteria: [
                'JTBD statement builder',
                'Pain severity 1-10 scale',
                'Frequency of problem selector',
                'Current alternatives input'
            ],
            kpis: ['jtbd_clarity_score', 'pain_severity_average'],
            dependencies: ['JTBD framework templates'],
            estimated_hours: 10,
            rationale: 'JTBD ensures problem-solution fit from Stage-1'
        }
    },
    {
        sd_id: 'SD-1A',
        backlog_id: 'BP-008',
        backlog_title: 'Mode Selection Interface',
        description_raw: '@ui @modes @selection',
        item_description: 'Clean UI for selecting sourcing mode with helpful descriptions',
        my_comments: 'Guide users to the right input mode based on their situation',
        priority: 'Medium',
        stage_number: 1,
        phase: 'Implementation',
        new_module: false,
        extras: {
            acceptance_criteria: [
                'Mode cards with icons',
                'Mode descriptions and examples',
                'Remember last used mode',
                'Mode-specific help text'
            ],
            kpis: ['mode_selection_time', 'mode_completion_rate'],
            dependencies: ['React components', 'Local storage'],
            estimated_hours: 6,
            rationale: 'Clear mode selection reduces abandonment by 20%'
        }
    },
    
    // KPI and Analytics Items (Both SDs)
    {
        sd_id: 'SD-003A',
        backlog_id: 'BP-009',
        backlog_title: 'Stage-1 KPI Dashboard',
        description_raw: '@kpi @dashboard @analytics',
        item_description: 'Real-time KPI dashboard showing Stage-1 metrics and performance',
        my_comments: 'Visibility into Stage-1 effectiveness',
        priority: 'Medium',
        stage_number: 1,
        phase: 'Monitoring',
        new_module: true,
        extras: {
            acceptance_criteria: [
                'Display: capture time, quality scores',
                'Show: completion rates, revision rates',
                'Track: EVA usage vs manual',
                'Export metrics to CSV'
            ],
            kpis: ['dashboard_load_time', 'metric_accuracy'],
            dependencies: ['Supabase views', 'Chart.js'],
            estimated_hours: 10,
            rationale: 'KPI visibility drives continuous improvement'
        }
    },
    {
        sd_id: 'SD-1A',
        backlog_id: 'BP-010',
        backlog_title: 'Mode Effectiveness Tracking',
        description_raw: '@tracking @modes @analytics',
        item_description: 'Track which sourcing modes produce highest quality ideas',
        my_comments: 'Data-driven optimization of sourcing modes',
        priority: 'Medium',
        stage_number: 1,
        phase: 'Monitoring',
        new_module: false,
        extras: {
            acceptance_criteria: [
                'Track mode usage frequency',
                'Measure idea quality by mode',
                'Calculate progression rate by mode',
                'Generate mode recommendation'
            ],
            kpis: ['mode_quality_correlation', 'mode_success_rate'],
            dependencies: ['Analytics pipeline', 'Database views'],
            estimated_hours: 8,
            rationale: 'Understanding mode effectiveness improves user guidance'
        }
    },
    
    // Integration Items
    {
        sd_id: 'SD-003A',
        backlog_id: 'BP-011',
        backlog_title: 'Stage-1 to Stage-2 Handoff',
        description_raw: '@handoff @integration @stage2',
        item_description: 'Seamless data flow from Stage-1 EVA output to Stage-2 research',
        my_comments: 'Ensure all Stage-1 data properly feeds Stage-2',
        priority: 'High',
        stage_number: 1,
        phase: 'Integration',
        new_module: false,
        extras: {
            acceptance_criteria: [
                'All EVA fields mapped to Stage-2',
                'Validation gates enforced',
                'Metadata preserved',
                'Rollback capability'
            ],
            kpis: ['handoff_success_rate', 'data_integrity_score'],
            dependencies: ['Stage-2 API', 'Data mapping'],
            estimated_hours: 8,
            rationale: 'Smooth handoff prevents data loss and rework'
        }
    },
    {
        sd_id: 'SD-1A',
        backlog_id: 'BP-012',
        backlog_title: 'Sourcing Mode Metadata Storage',
        description_raw: '@metadata @storage @persistence',
        item_description: 'Persist all sourcing mode data in ventures.metadata for analysis',
        my_comments: 'MVP approach using JSON storage per Chairman decision',
        priority: 'High',
        stage_number: 1,
        phase: 'Implementation',
        new_module: false,
        extras: {
            acceptance_criteria: [
                'All mode data in ventures.metadata',
                'JSON schema validation',
                'Migration path documented',
                'Query performance acceptable'
            ],
            kpis: ['storage_efficiency', 'query_performance'],
            dependencies: ['PostgreSQL JSONB', 'ventures table'],
            estimated_hours: 6,
            rationale: 'Chairman decision: JSON storage for MVP, proper tables later'
        }
    }
];

async function insertBacklogItems() {
    console.log('\n🚀 Inserting Stage-1 Backlog Items...\n');
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    // Process each backlog item
    for (const item of backlogItems) {
        try {
            // Upsert using composite key (sd_id, backlog_id)
            const { error } = await supabase
                .from('sd_backlog_map')
                .upsert(item, {
                    onConflict: 'sd_id,backlog_id',
                    ignoreDuplicates: false
                })
                .select();
            
            if (error) {
                errorCount++;
                errors.push({ backlog_id: item.backlog_id, error: error.message });
                console.log(`❌ ${item.backlog_id}: ${error.message}`);
            } else {
                successCount++;
                console.log(`✅ ${item.backlog_id}: ${item.backlog_title}`);
            }
        } catch (e) {
            errorCount++;
            errors.push({ backlog_id: item.backlog_id, error: e.message });
            console.log(`❌ ${item.backlog_id}: ${e.message}`);
        }
    }
    
    // Summary
    console.log('\n📋 SUMMARY:');
    console.log(`   ✅ Successful inserts: ${successCount}`);
    console.log(`   ❌ Failed inserts: ${errorCount}`);
    
    if (errors.length > 0) {
        console.log('\n❌ Errors:');
        errors.forEach(e => console.log(`   - ${e.backlog_id}: ${e.error}`));
    }
    
    // Verify the data
    console.log('\n🔍 Verifying inserted data...');
    
    // Check SD-003A items
    const { data: sd003aItems } = await supabase
        .from('sd_backlog_map')
        .select('backlog_id, backlog_title, priority')
        .eq('sd_id', 'SD-003A')
        .order('backlog_id');
        
    console.log('\nSD-003A items:', sd003aItems?.length || 0);
    sd003aItems?.forEach(item => 
        console.log(`   - ${item.backlog_id}: ${item.backlog_title} [${item.priority}]`)
    );
    
    // Check SD-1A items  
    const { data: sd1aItems } = await supabase
        .from('sd_backlog_map')
        .select('backlog_id, backlog_title, priority')
        .eq('sd_id', 'SD-1A')
        .order('backlog_id');
        
    console.log('\nSD-1A items:', sd1aItems?.length || 0);
    sd1aItems?.forEach(item => 
        console.log(`   - ${item.backlog_id}: ${item.backlog_title} [${item.priority}]`)
    );
    
    console.log('\n✅ Stage-1 backlog items insertion complete!');
}

insertBacklogItems();