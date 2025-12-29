#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// === Change Preview (Dry Run) ===
const changePreview = {
    sds_to_update: [],
    sds_to_create: [],
    backlog_to_create: [],
    mappings_to_create: []
};

async function updateSDs() {
    console.log('\n🔄 Updating Strategic Directives for Stage-1...\n');
    
    try {
        // 1. Update SD-003 to constrain scope
        console.log('📝 Updating SD-003 to constrain scope...');
        const sd003Update = {
            title: 'EVA Assistant: UI Cleanup Only [CONSTRAINED]',
            description: 'UI cleanup only - Remove Savings/Latency Box and Session Status Box. EVA behavioral features moved to SD-003A.',
            metadata: {
                ...{},
                constrained_scope: true,
                original_items: ['[336] UI Cleanup: Remove Savings/Latency Box', '[337] Remove Session Status Box'],
                excludes: 'Voice capture, validation logic, quality scoring, chairman feedback - see SD-003A'
            },
            updated_at: new Date().toISOString(),
            updated_by: 'stage1-update-script'
        };
        
        const { error: update003Error } = await supabase
            .from('strategic_directives_v2')
            .update(sd003Update)
            .eq('id', 'SD-003');
            
        if (update003Error) {
            console.error('❌ Error updating SD-003:', update003Error.message);
        } else {
            console.log('✅ SD-003 constrained to UI cleanup only');
            changePreview.sds_to_update.push('SD-003');
        }
        
        // 2. Create SD-003A for EVA Integration
        console.log('📝 Creating SD-003A for EVA Stage-1 Integration...');
        const sd003A = {
            id: 'SD-003A',
            title: 'EVA Assistant — Stage-1 Integration',
            version: '1.0',
            status: 'draft',
            category: 'AI & Automation',
            priority: 'high',
            description: 'Integrate EVA as Stage-1 owner with voice capture, validation assist, quality scoring, chairman feedback.',
            strategic_intent: 'Enable AI-assisted ideation with voice-first capture and intelligent validation',
            rationale: 'Stage-1 requires EVA ownership per PRD specifications. Voice capture and quality scoring are critical for efficient ideation.',
            scope: 'Voice capture (≤10min via Whisper), EVA validation assistance, quality scoring (0-100), chairman feedback capture',
            key_changes: [
                'Add voice recording UI to VentureCreationDialog',
                'Integrate OpenAI Whisper for transcription',
                'Implement EVA suggestion engine',
                'Add quality scoring algorithm',
                'Enable chairman feedback capture'
            ],
            strategic_objectives: [
                'Reduce idea capture time by 50%',
                'Improve idea quality scores to average >70',
                'Enable voice-first ideation workflow',
                'Provide real-time validation assistance'
            ],
            success_criteria: [
                'Voice capture works for 10-minute recordings',
                'Real-time transcription displays correctly',
                'Quality scores calculate accurately',
                'EVA suggestions improve field completion',
                'Chairman feedback links to ventures'
            ],
            dependencies: [
                'OpenAI API key configuration',
                'Browser microphone permissions',
                'ventures.metadata storage schema'
            ],
            risks: [
                'API rate limiting on Whisper',
                'Browser compatibility for voice',
                'Portfolio support deferred to post-MVP'
            ],
            success_metrics: [
                'idea_quality_score',
                'time_to_capture',
                'validation_completeness',
                'voice_usage_rate',
                'eva_suggestion_acceptance_rate'
            ],
            created_at: new Date().toISOString(),
            created_by: 'stage1-update-script',
            metadata: {
                stage_refs: ['1'],
                owner_role: 'EVA',
                artifacts_schema: {
                    voice_transcript: 'string',
                    idea_quality_score: 'number(0-100)',
                    validation_completeness: 'number(0-100)',
                    time_to_capture: 'number(seconds)',
                    eva_suggestions: 'string[]',
                    chairman_feedback_id: 'uuid'
                },
                evidence_refs: [
                    {path: 'EHG_Engineer/docs/02_api/01a_draft_idea.md:3', note: 'Owner: EVA Agent'},
                    {path: 'EHG_Engineer/docs/02_api/01a_draft_idea.md:149-154', note: 'Voice spec, maxDuration 600'},
                    {path: 'ehg/src/components/ventures/VentureCreationDialog.tsx', note: 'No voice/EVA present'}
                ]
            }
        };
        
        const { error: create003AError } = await supabase
            .from('strategic_directives_v2')
            .insert(sd003A);
            
        if (create003AError) {
            console.error('❌ Error creating SD-003A:', create003AError.message);
        } else {
            console.log('✅ SD-003A created for EVA Stage-1 Integration');
            changePreview.sds_to_create.push('SD-003A');
        }
        
        // 3. Create SD-1A for Sourcing Modes
        console.log('📝 Creating SD-1A for Opportunity Sourcing Modes...');
        const sd1A = {
            id: 'SD-1A',
            title: 'Stage-1 Opportunity Sourcing Modes',
            version: '1.0',
            status: 'draft',
            category: 'Ideation',
            priority: 'high',
            description: 'Enable multiple ideation pathways: Story-First, Competitor-Gap, JTBD (P1); Distribution, Tech-Enabler, Vertical (P2).',
            strategic_intent: 'Provide comprehensive opportunity capture methods aligned with different ideation strategies',
            rationale: 'Single ideation path limits opportunity discovery. Multiple modes increase idea quality and coverage.',
            scope: 'P1: Story-First narrative capture, Competitor-Gap analysis, JTBD statements. P2: Distribution channels, Tech enablers, Vertical niches.',
            key_changes: [
                'Add mode selector to idea form',
                'Implement Story-First with 500+ char narrative',
                'Add competitor analysis fields',
                'Create explicit JTBD capture',
                'Store mode-specific artifacts'
            ],
            strategic_objectives: [
                'Increase ideation coverage by 3x',
                'Improve idea-market fit through targeted modes',
                'Enable data-driven opportunity analysis',
                'Support diverse founder backgrounds'
            ],
            success_criteria: [
                'Mode selector functional',
                'Story narratives ≥500 chars',
                'Competitor gaps identified',
                'JTBD statements validated',
                'Mode usage tracked'
            ],
            dependencies: [
                'VentureCreationDialog refactor',
                'ventures.metadata expansion',
                'Mode-specific validation rules'
            ],
            risks: [
                'UI complexity increase',
                'User confusion with multiple modes',
                'P2 modes delay MVP'
            ],
            success_metrics: [
                'sourcing_mode_distribution',
                'narrative_completeness_score',
                'competitor_gaps_identified',
                'jtbd_clarity_score',
                'mode_success_correlation'
            ],
            created_at: new Date().toISOString(),
            created_by: 'stage1-update-script',
            metadata: {
                stage_refs: ['1'],
                p1_modes: ['story-first', 'competitor-gap', 'jtbd'],
                p2_modes: ['distribution', 'tech-enabler', 'vertical'],
                artifacts_by_mode: {
                    story_first: ['narrative_brief', 'tribe_definition', 'pain_indicator'],
                    competitor_gap: ['competitor_list', 'gap_analysis', 'advantage_hypothesis'],
                    jtbd: ['jtbd_statement', 'pain_severity', 'solution_gap']
                },
                evidence_refs: [
                    {path: 'Lovable article', note: 'Story-first requirement'},
                    {path: 'EHG_Engineer/docs/04_features/01b_idea_generation_intelligence.md:130', note: 'Competitor gap analysis'},
                    {path: 'ehg/src/components/ventures/VentureCreationDialog.tsx:42', note: 'Assumptions field only'}
                ]
            }
        };
        
        const { error: create1AError } = await supabase
            .from('strategic_directives_v2')
            .insert(sd1A);
            
        if (create1AError) {
            console.error('❌ Error creating SD-1A:', create1AError.message);
        } else {
            console.log('✅ SD-1A created for Opportunity Sourcing Modes');
            changePreview.sds_to_create.push('SD-1A');
        }
        
        return true;
        
    } catch (_error) {
        console.error('❌ SD update failed:', error);
        return false;
    }
}

async function createBacklogItems() {
    console.log('\n📋 Creating Backlog Items...\n');
    
    const backlogItems = [
        {
            sd_id: 'BP-001',
            sequence_rank: 1001,
            sd_title: 'Wire ventures service to Supabase',
            page_category: 'Infrastructure',
            page_title: 'Stage-1 Implementation',
            rolled_triage: 'High',
            must_have_count: 1,
            must_have_pct: 100,
            extras: {
                priority: 'P1',
                rationale: 'Unblocks all features - mock data prevents progress',
                acceptance_criteria: [
                    'Remove mock data functions',
                    'Connect Supabase client',
                    'CRUD operations functional'
                ],
                kpi_names: ['All KPIs blocked without this'],
                dependencies: ['Supabase credentials'],
                effort: 'M',
                evidence: 'ehg/src/services/ventures.ts:16 TODO: wire to backend'
            }
        },
        {
            sd_id: 'BP-002',
            sequence_rank: 1002,
            sd_title: 'Runtime gates (documentation)',
            page_category: 'Documentation',
            page_title: 'Stage-1 Gates',
            rolled_triage: 'High',
            must_have_count: 1,
            must_have_pct: 100,
            extras: {
                priority: 'P1',
                rationale: 'Define gate logic for MVP progression',
                acceptance_criteria: [
                    'Document gate conditions',
                    'Specify trigger points',
                    'Define bypass rules'
                ],
                kpi_names: ['validation_completeness'],
                effort: 'S'
            }
        },
        {
            sd_id: 'BP-003',
            sequence_rank: 1003,
            sd_title: 'KPI tracking scaffold',
            page_category: 'Metrics',
            page_title: 'Stage-1 KPIs',
            rolled_triage: 'High',
            must_have_count: 1,
            must_have_pct: 100,
            extras: {
                priority: 'P1',
                rationale: 'Enable measurement of Stage-1 success',
                acceptance_criteria: [
                    'Define KPI names',
                    'Add to ventures.metadata',
                    'Document calculation methods'
                ],
                kpi_names: ['idea_quality_score', 'time_to_capture', 'validation_completeness'],
                effort: 'S'
            }
        },
        {
            sd_id: 'BP-004',
            sequence_rank: 1004,
            sd_title: 'Voice capture UI/API',
            page_category: 'Features',
            page_title: 'EVA Voice Integration',
            rolled_triage: 'High',
            must_have_count: 1,
            must_have_pct: 100,
            extras: {
                priority: 'P1',
                rationale: 'Core EVA requirement for Stage-1 ownership',
                acceptance_criteria: [
                    'Add mic button to form',
                    'Connect to Whisper API',
                    'Store transcript in metadata',
                    'Fallback to text input'
                ],
                kpi_names: ['time_to_capture', 'voice_usage_rate'],
                dependencies: ['OpenAI API key'],
                effort: 'L'
            }
        },
        {
            sd_id: 'BP-005',
            sequence_rank: 1005,
            sd_title: 'EVA validation assistance',
            page_category: 'Features',
            page_title: 'EVA Agent Features',
            rolled_triage: 'High',
            must_have_count: 1,
            must_have_pct: 100,
            extras: {
                priority: 'P1',
                rationale: 'EVA must own Stage-1 per PRD',
                acceptance_criteria: [
                    'Real-time suggestions',
                    'Quality scoring display',
                    'Field validation hints'
                ],
                kpi_names: ['idea_quality_score', 'eva_suggestion_acceptance_rate'],
                dependencies: ['Voice capture'],
                effort: 'M'
            }
        },
        {
            sd_id: 'BP-006',
            sequence_rank: 1006,
            sd_title: 'Story-first narrative field',
            page_category: 'Features',
            page_title: 'Sourcing Modes',
            rolled_triage: 'High',
            must_have_count: 1,
            must_have_pct: 100,
            extras: {
                priority: 'P1',
                rationale: 'Lovable article core requirement',
                acceptance_criteria: [
                    '500+ char narrative field',
                    'Tribe/audience definition',
                    'Pain point indicator'
                ],
                kpi_names: ['narrative_completeness_score'],
                effort: 'S'
            }
        },
        {
            sd_id: 'BP-007',
            sequence_rank: 1007,
            sd_title: 'Competitor-gap capture',
            page_category: 'Features',
            page_title: 'Sourcing Modes',
            rolled_triage: 'High',
            must_have_count: 1,
            must_have_pct: 100,
            extras: {
                priority: 'P1',
                rationale: 'Market intelligence integration needed',
                acceptance_criteria: [
                    'Competitor name fields (3 max)',
                    'Gap description field',
                    'Link to intelligence docs'
                ],
                kpi_names: ['competitor_gaps_identified'],
                effort: 'S'
            }
        },
        {
            sd_id: 'BP-008',
            sequence_rank: 1008,
            sd_title: 'Explicit JTBD field',
            page_category: 'Features',
            page_title: 'Sourcing Modes',
            rolled_triage: 'High',
            must_have_count: 1,
            must_have_pct: 100,
            extras: {
                priority: 'P1',
                rationale: 'Replace vague assumptions field',
                acceptance_criteria: [
                    'JTBD statement field',
                    'Template/examples provided',
                    'Validation rules'
                ],
                kpi_names: ['jtbd_clarity_score'],
                effort: 'S'
            }
        },
        {
            sd_id: 'BP-009',
            sequence_rank: 1009,
            sd_title: 'Chairman feedback UI',
            page_category: 'Features',
            page_title: 'Executive Features',
            rolled_triage: 'Medium',
            must_have_count: 0,
            must_have_pct: 0,
            extras: {
                priority: 'P2',
                rationale: 'Executive oversight enhancement',
                acceptance_criteria: [
                    'Feedback button in UI',
                    'Voice/text input options',
                    'Store in feedback_intelligence'
                ],
                kpi_names: ['chairman_feedback_rate'],
                dependencies: ['Voice capture'],
                effort: 'M'
            }
        },
        {
            sd_id: 'BP-010',
            sequence_rank: 1010,
            sd_title: 'Stage-1 to Stage-2 handoff',
            page_category: 'Integration',
            page_title: 'Stage Transitions',
            rolled_triage: 'Medium',
            must_have_count: 0,
            must_have_pct: 0,
            extras: {
                priority: 'P2',
                rationale: 'Automation preparation',
                acceptance_criteria: [
                    'Event emission logic',
                    'Artifact passing',
                    'Transition logging'
                ],
                kpi_names: ['transition_success_rate'],
                dependencies: ['Runtime gates'],
                effort: 'S'
            }
        },
        {
            sd_id: 'BP-011',
            sequence_rank: 1011,
            sd_title: 'Ideas table migration decision',
            page_category: 'Documentation',
            page_title: 'Data Architecture',
            rolled_triage: 'Low',
            must_have_count: 0,
            must_have_pct: 0,
            extras: {
                priority: 'P3',
                rationale: 'Clarify data contract for future',
                acceptance_criteria: [
                    'Document deprecation decision',
                    'Migration plan if needed',
                    'Update schema docs'
                ],
                effort: 'S'
            }
        },
        {
            sd_id: 'BP-012',
            sequence_rank: 1012,
            sd_title: 'Portfolio support (future)',
            page_category: 'Features',
            page_title: 'Multi-Company',
            rolled_triage: 'Future',
            must_have_count: 0,
            must_have_pct: 0,
            extras: {
                priority: 'P3',
                rationale: 'Multi-company deferred to post-MVP',
                acceptance_criteria: [
                    'Document requirements',
                    'Impact analysis',
                    'Architecture planning'
                ],
                kpi_names: ['portfolio_metrics'],
                dependencies: ['Major refactor'],
                effort: 'L'
            }
        }
    ];
    
    try {
        for (const item of backlogItems) {
            const { error } = await supabase
                .from('strategic_directives_backlog')
                .insert(item);
                
            if (error) {
                console.error(`❌ Error creating ${item.sd_id}:`, error.message);
            } else {
                console.log(`✅ Created backlog item ${item.sd_id}: ${item.sd_title}`);
                changePreview.backlog_to_create.push(item.sd_id);
            }
        }
        
        return true;
        
    } catch (_error) {
        console.error('❌ Backlog creation failed:', error);
        return false;
    }
}

async function createMappings() {
    console.log('\n🔗 Creating SD-Backlog Mappings...\n');
    
    const mappings = [
        // SD-003A mappings (EVA features)
        { sd_id: 'SD-003A', backlog_id: 'BP-004', backlog_title: 'Voice capture UI/API' },
        { sd_id: 'SD-003A', backlog_id: 'BP-005', backlog_title: 'EVA validation assistance' },
        { sd_id: 'SD-003A', backlog_id: 'BP-003', backlog_title: 'KPI tracking scaffold' },
        { sd_id: 'SD-003A', backlog_id: 'BP-009', backlog_title: 'Chairman feedback UI' },
        
        // SD-1A mappings (Sourcing modes)
        { sd_id: 'SD-1A', backlog_id: 'BP-006', backlog_title: 'Story-first narrative field' },
        { sd_id: 'SD-1A', backlog_id: 'BP-007', backlog_title: 'Competitor-gap capture' },
        { sd_id: 'SD-1A', backlog_id: 'BP-008', backlog_title: 'Explicit JTBD field' },
        
        // Infrastructure items (map to both)
        { sd_id: 'SD-003A', backlog_id: 'BP-001', backlog_title: 'Wire ventures service' },
        { sd_id: 'SD-1A', backlog_id: 'BP-001', backlog_title: 'Wire ventures service' },
        { sd_id: 'SD-003A', backlog_id: 'BP-002', backlog_title: 'Runtime gates' },
        { sd_id: 'SD-1A', backlog_id: 'BP-002', backlog_title: 'Runtime gates' }
    ];
    
    try {
        for (const mapping of mappings) {
            const mapItem = {
                sd_id: mapping.sd_id,
                backlog_id: mapping.backlog_id,
                backlog_title: mapping.backlog_title,
                priority: 'High',
                stage_number: 1,
                phase: 'Ideation',
                import_run_id: null,
                present_in_latest_import: true
            };
            
            const { error } = await supabase
                .from('sd_backlog_map')
                .insert(mapItem);
                
            if (error) {
                console.error(`❌ Error mapping ${mapping.sd_id}-${mapping.backlog_id}:`, error.message);
            } else {
                console.log(`✅ Mapped ${mapping.backlog_id} to ${mapping.sd_id}`);
                changePreview.mappings_to_create.push(`${mapping.sd_id}-${mapping.backlog_id}`);
            }
        }
        
        return true;
        
    } catch (_error) {
        console.error('❌ Mapping creation failed:', error);
        return false;
    }
}

async function createDataContractPRD() {
    console.log('\n📄 Creating MVP Data Contract PRD...\n');
    
    const contractContent = `# MVP Stage-1 Data Contract

## Storage Decision
- **Primary Storage**: \`ventures.metadata\` JSON field
- **Deprecated**: \`ideas\` table (exists but unused for MVP)
- **Future Migration**: When scaling, migrate metadata fields to proper tables

## Field Specifications

\`\`\`typescript
interface Stage1Metadata {
  // Core fields (VentureCreationDialog)
  assumptions: string;              // Min 10 chars
  successCriteria: string;          // Min 10 chars
  stage1_complete: boolean;
  
  // EVA Integration (SD-003A)
  voice_transcript?: string;
  idea_quality_score?: number;      // 0-100
  validation_completeness?: number; // 0-100
  time_to_capture?: number;         // Seconds
  eva_suggestions?: string[];
  
  // Sourcing Modes (SD-1A)
  sourcing_mode?: 'story' | 'competitor' | 'jtbd';
  narrative_brief?: string;         // Story-first (500+ chars)
  competitor_list?: string[];       // Max 3
  gap_analysis?: string;
  jtbd_statement?: string;
  pain_severity?: number;           // 1-10
  
  // References
  chairman_feedback_ids?: string[];
}
\`\`\`

## Evidence
- Ideas table defined: /mnt/c/_EHG/EHG/db/migrations/001_initial_schema.sql:53-67
- Current storage: /mnt/c/_EHG/EHG/src/components/ventures/VentureCreationDialog.tsx:107-112
- Decision rationale: Avoid migration complexity for MVP; ventures.metadata sufficient

## Related SDs
- SD-003A: EVA Stage-1 Integration
- SD-1A: Opportunity Sourcing Modes
`;
    
    const filename = 'docs/02_api/stage1_data_contract.md';
    try {
        fs.writeFileSync(filename, contractContent);
        console.log(`✅ Created data contract PRD at ${filename}`);
        return true;
    } catch (_error) {
        console.error('❌ Failed to create data contract PRD:', error);
        return false;
    }
}

async function main() {
    console.log('\n🚀 Starting Stage-1 Requirements Update...\n');
    console.log('================================\n');
    
    // Execute updates
    const sdSuccess = await updateSDs();
    const backlogSuccess = await createBacklogItems();
    const mappingSuccess = await createMappings();
    const contractSuccess = await createDataContractPRD();
    
    // Generate report
    console.log('\n================================');
    console.log('📊 CHANGE REPORT');
    console.log('================================\n');
    
    console.log('✅ Strategic Directives:');
    console.log(`   - Updated: ${changePreview.sds_to_update.join(', ')}`);
    console.log(`   - Created: ${changePreview.sds_to_create.join(', ')}`);
    
    console.log('\n✅ Backlog Items:');
    console.log(`   - Created: ${changePreview.backlog_to_create.length} items`);
    console.log(`   - IDs: ${changePreview.backlog_to_create.join(', ')}`);
    
    console.log('\n✅ Mappings:');
    console.log(`   - Created: ${changePreview.mappings_to_create.length} mappings`);
    
    console.log('\n✅ Documentation:');
    console.log('   - Created: docs/02_api/stage1_data_contract.md');
    
    console.log('\n📁 Backup Location:');
    console.log('   - backup-*.json (check timestamps)');
    
    console.log('\n🔄 Revert Plan:');
    console.log('   1. Load backup JSON file');
    console.log('   2. Delete created SDs: SD-003A, SD-1A');
    console.log('   3. Delete created backlog items: BP-001 through BP-012');
    console.log('   4. Restore SD-003 from backup');
    console.log('   5. Remove created mappings');
    
    if (sdSuccess && backlogSuccess && mappingSuccess && contractSuccess) {
        console.log('\n✅ ALL UPDATES COMPLETED SUCCESSFULLY\n');
    } else {
        console.log('\n⚠️ SOME UPDATES FAILED - Review errors above\n');
    }
}

main();