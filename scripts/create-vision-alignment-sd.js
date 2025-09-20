#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createVisionAlignmentSD() {
    console.log('\n🚀 Creating SD-VISION-ALIGN-001 and VIS-001\n');
    
    // First check for sequence/rank columns (skip RPC, we know sequence_rank exists)
    console.log('Using sequence_rank column for ordering');
    
    // 1. Create/Update the SD
    const sdPayload = {
        id: 'SD-VISION-ALIGN-001',
        title: 'Scenario-Driven Vision Alignment System (EHG_Engineering)',
        description: `Turn chairman day-in-the-life stories into structured Scenario Cards that map to SDs/backlog, surface gaps, and auto-generate PRD addenda—without touching the EHG app code yet.

Objective: End-to-end traceability from Vision → Scenario → Signal → SD/backlog.

Outcomes:
- Coverage proof across sidebar nav and 40 venture stages
- Russian judge feasibility scoring to prevent scope creep
- Automated PRD addendum generation from scenarios

Acceptance Criteria:
1. Tables exist and documented (scenarios, story_beats, signals, feedback)
2. One Chairman Dashboard scenario captured end-to-end
3. Coverage matrix shows ≥1 nav item and Stages 1-10 cluster coverage
4. Russian judge function returns 0-10 score based on rubric
5. PRD addendum generated from scenario (markdown)`,
        rationale: 'Ensures chairman vision directly drives implementation through structured scenarios that map to SDs/backlog, preventing vision drift and scope creep via Russian judge scoring.',
        scope: 'EHG_Engineering governance layer only - DB schema, scenario templates, coverage matrices, scoring rubrics, and PRD addendum generation. No EHG app code changes.',
        status: 'draft',
        priority: 'high',  // Text priority value
        category: 'Governance',
        sequence_rank: 1,  // Top of sequence
        metadata: {
            top_priority: true,
            kpi_names: ['vision_alignment_score', 'scenario_coverage_percent', 'gap_to_sd_latency_days', 'russian_judge_avg_score'],
            acceptance_checklist: [
                'DDL authored and documented',
                '1 Chairman Dashboard scenario captured',
                'Coverage matrix shows nav + Stages 1-10',
                'Russian judge scorer returns 0-10',
                'PRD addendum generated'
            ],
            risks: ['scenario sprawl', 'false precision', 'feedback fatigue'],
            artifacts: ['DDL', 'Scenario Card template', 'Coverage Matrix', 'Scoring rubric', 'PRD addendum template']
        }
    };
    
    // Check if SD exists
    const { data: existingSD } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('id', 'SD-VISION-ALIGN-001')
        .single();
    
    let sdResult;
    if (existingSD) {
        // Update existing
        const { data, error } = await supabase
            .from('strategic_directives_v2')
            .update(sdPayload)
            .eq('id', 'SD-VISION-ALIGN-001')
            .select();
        sdResult = { data, error, action: 'updated' };
    } else {
        // Insert new
        const { data, error } = await supabase
            .from('strategic_directives_v2')
            .insert(sdPayload)
            .select();
        sdResult = { data, error, action: 'inserted' };
    }
    
    if (sdResult.error) {
        console.log('❌ SD operation failed:', sdResult.error.message);
        return;
    }
    
    console.log(`✅ SD ${sdResult.action}: SD-VISION-ALIGN-001`);
    
    // 2. Create/Update the backlog item
    const backlogPayload = {
        sd_id: 'SD-VISION-ALIGN-001',  // Map directly to the new SD, not umbrella
        backlog_id: 'VIS-001',
        backlog_title: 'Week-1 Pilot: Bootstrap Scenario System (DB + first scenario)',
        priority: 'P1',
        description_raw: '@vision @governance @scenarios',
        item_description: 'Establish the minimal rails so future scenarios cleanly flow into SDs/backlog and PRDs',
        my_comments: 'Docs-only DB scaffolding + first Chairman Dashboard scenario, scoring, and PRD addendum',
        stage_number: 1,
        phase: 'Planning',
        new_module: true,
        extras: {
            category: 'VISION',
            wave: 1,
            outcome: 'Traceable scenarios powering PRD addenda and backlog links',
            effort: 'S',
            deps: ['engineering-db-access', 'sd_backlog_map-metadata'],
            proposed_kpis: ['vision_alignment_score', 'scenario_coverage_percent', 'gap_to_sd_latency_days', 'russian_judge_avg_score'],
            scenario_templates: ['Scenario Card', 'Coverage Matrix', 'PRD Addendum'],
            status: 'docs-only v1',
            suggested_sd: 'SD-VISION-ALIGN-001'
        }
    };
    
    // Upsert backlog item
    const { data: backlogData, error: backlogError } = await supabase
        .from('sd_backlog_map')
        .upsert(backlogPayload, {
            onConflict: 'sd_id,backlog_id',
            ignoreDuplicates: false
        })
        .select();
    
    if (backlogError) {
        console.log('❌ Backlog operation failed:', backlogError.message);
    } else {
        console.log('✅ Backlog item upserted: VIS-001');
    }
    
    // 3. Post-apply audit
    console.log('\n📊 AUDIT RESULTS\n');
    
    // SD check
    const { data: sdCheck } = await supabase
        .from('strategic_directives_v2')
        .select('id, title, status, priority, sequence_rank, metadata')
        .eq('id', 'SD-VISION-ALIGN-001')
        .single();
    
    if (sdCheck) {
        console.log('Strategic Directive:');
        console.log(`  ID: ${sdCheck.id}`);
        console.log(`  Title: ${sdCheck.title}`);
        console.log(`  Status: ${sdCheck.status}`);
        console.log(`  Priority: ${sdCheck.priority}`);
        console.log(`  Sequence Rank: ${sdCheck.sequence_rank || 'Not set'}`);
        console.log(`  Top Priority: ${sdCheck.metadata?.top_priority ? 'Yes' : 'No'}`);
    }
    
    // Backlog check
    const { data: backlogCheck } = await supabase
        .from('sd_backlog_map')
        .select('sd_id, backlog_id, backlog_title, priority, extras')
        .eq('sd_id', 'SD-VISION-ALIGN-001')
        .eq('backlog_id', 'VIS-001')
        .single();
    
    if (backlogCheck) {
        console.log('\nBacklog Item:');
        console.log(`  SD: ${backlogCheck.sd_id}`);
        console.log(`  ID: ${backlogCheck.backlog_id}`);
        console.log(`  Title: ${backlogCheck.backlog_title}`);
        console.log(`  Priority: ${backlogCheck.priority}`);
        console.log('\nMetadata:');
        console.log(JSON.stringify(backlogCheck.extras, null, 2));
    }
    
    // Check top ranking
    const { data: topSDs } = await supabase
        .from('strategic_directives_v2')
        .select('id, sequence_rank, priority')
        .order('sequence_rank', { ascending: true, nullsFirst: false })
        .order('priority', { ascending: false })
        .limit(5);
    
    console.log('\nTop 5 SDs by sequence/priority:');
    topSDs?.forEach((sd, i) => {
        console.log(`  ${i+1}. ${sd.id} (rank: ${sd.sequence_rank || 'null'}, priority: ${sd.priority})`);
    });
    
    console.log('\n✅ SD-VISION-ALIGN-001 successfully created as top priority!');
}

createVisionAlignmentSD();