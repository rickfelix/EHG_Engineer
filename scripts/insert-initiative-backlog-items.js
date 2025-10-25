#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Initiative data for 25 NEW_REQUIRED items
const initiatives = [
    // EHI Category (5 items)
    {
        id: 'EHI-001',
        title: 'EHG Health Index (EHI) v0.1',
        outcome: '0–100 health score per venture',
        category: 'EHI',
        wave: 1,
        effort: 'S',
        deps: ['analytics-basic', 'incidents', 'pr-velocity'],
        proposed_kpis: ['ehi_score', 'ehi_delta', 'driver_weights']
    },
    {
        id: 'EHI-002',
        title: 'Driver Explainability Panel',
        outcome: 'Top factors moving EHI weekly',
        category: 'EHI',
        wave: 1,
        effort: 'S',
        deps: ['EHI-001'],
        proposed_kpis: ['top_drivers_count', 'explanation_clarity']
    },
    {
        id: 'EHI-003',
        title: 'Scenario Builder v0 (4 levers)',
        outcome: 'What-if: price, GTM mix, reliability capacity, launch cadence',
        category: 'EHI',
        wave: 2,
        effort: 'M',
        deps: ['EHI-001', 'config-store'],
        proposed_kpis: ['scenarios_created', 'lever_sensitivity']
    },
    {
        id: 'EHI-004',
        title: 'BAU vs Scenario Compare',
        outcome: 'Side-by-side curves with deltas',
        category: 'EHI',
        wave: 2,
        effort: 'S',
        deps: ['EHI-003'],
        proposed_kpis: ['comparison_views', 'delta_accuracy']
    },
    {
        id: 'EHI-005',
        title: 'Tornado Sensitivity View',
        outcome: 'Rank levers by impact on EHI/ARR',
        category: 'EHI',
        wave: 2,
        effort: 'M',
        deps: ['EHI-003'],
        proposed_kpis: ['sensitivity_rankings', 'impact_correlation']
    },
    
    // GATES Category (2 items)
    {
        id: 'GATES-002',
        title: 'Auto-Remediation Tasks',
        outcome: 'When a sub-index falls, create targeted tasks',
        category: 'GATES',
        wave: 2,
        effort: 'S',
        deps: ['eva-task-api', 'EHI-001'],
        proposed_kpis: ['tasks_auto_created', 'remediation_success_rate']
    },
    {
        id: 'GATES-003',
        title: 'Parallel Strategy Branching',
        outcome: 'Track A/B branches as first-class ventures',
        category: 'GATES',
        wave: 3,
        effort: 'M',
        deps: ['venture-graph', 'diff-views'],
        proposed_kpis: ['branches_active', 'branch_comparison_views']
    },
    
    // CHAIR Category (3 items)
    {
        id: 'CHAIR-002',
        title: 'Stage Gate Timeline',
        outcome: 'What passed/blocked and why',
        category: 'CHAIR',
        wave: 1,
        effort: 'S',
        deps: ['workflow-events'],
        proposed_kpis: ['timeline_accuracy', 'gate_visibility']
    },
    {
        id: 'CHAIR-003',
        title: 'Decision Log & Rationale',
        outcome: 'Human decisions linked to evidence',
        category: 'CHAIR',
        wave: 3,
        effort: 'S',
        deps: ['notes', 'attachments'],
        proposed_kpis: ['decisions_logged', 'evidence_links']
    },
    {
        id: 'CHAIR-004',
        title: 'Strategy Deck Export',
        outcome: 'One-click PDF of BAU vs scenarios',
        category: 'CHAIR',
        wave: 3,
        effort: 'M',
        deps: ['report-service'],
        proposed_kpis: ['exports_generated', 'deck_completeness']
    },
    
    // DATA Category (2 items)
    {
        id: 'DATA-002',
        title: 'Lineage & Assumption Registry',
        outcome: 'Where numbers came from; versioned configs',
        category: 'DATA',
        wave: 2,
        effort: 'M',
        deps: ['metadata-store'],
        proposed_kpis: ['lineage_completeness', 'assumption_versions']
    },
    {
        id: 'DATA-003',
        title: 'Model Cards & Audit Log',
        outcome: 'Who changed weights, when, why',
        category: 'DATA',
        wave: 1,
        effort: 'S',
        deps: ['change-log-tables'],
        proposed_kpis: ['audit_coverage', 'model_card_completeness']
    },
    
    // QSC Category (4 items)
    {
        id: 'QSC-001',
        title: 'SLO Tracker & Error Budget',
        outcome: 'Reliability rollups per venture',
        category: 'QSC',
        wave: 1,
        effort: 'S',
        deps: ['observability-hooks'],
        proposed_kpis: ['slo_compliance', 'error_budget_usage']
    },
    {
        id: 'QSC-002',
        title: 'Incident Review Automation',
        outcome: 'Templated postmortems, MTTR stats',
        category: 'QSC',
        wave: 3,
        effort: 'S',
        deps: ['incident-webhooks'],
        proposed_kpis: ['mttr', 'postmortem_completeness']
    },
    {
        id: 'QSC-003',
        title: 'Security Posture Tile',
        outcome: 'Vuln backlog age, patch cadence',
        category: 'QSC',
        wave: 2,
        effort: 'S',
        deps: ['scanner-integrations'],
        proposed_kpis: ['vuln_age_avg', 'patch_velocity']
    },
    {
        id: 'QSC-004',
        title: 'Compliance Checklist Engine',
        outcome: 'Stage-gated attestations w/ evidence',
        category: 'QSC',
        wave: 3,
        effort: 'M',
        deps: ['file-links', 'sign-offs'],
        proposed_kpis: ['compliance_score', 'attestation_rate']
    },
    
    // GTM Category (2 items)
    {
        id: 'GTM-003',
        title: 'Pricing & Packaging Catalog',
        outcome: 'Versioned plans for scenarios',
        category: 'GTM',
        wave: 4,
        effort: 'S',
        deps: ['billing-config'],
        proposed_kpis: ['pricing_versions', 'package_combinations']
    },
    {
        id: 'GTM-005',
        title: 'CS Playbooks',
        outcome: 'Triggered saves when EHI drops',
        category: 'GTM',
        wave: 4,
        effort: 'S',
        deps: ['crm', 'helpdesk'],
        proposed_kpis: ['playbook_triggers', 'save_rate']
    },
    
    // DEVEX Category (3 items)
    {
        id: 'DEVEX-002',
        title: 'Playwright Smoke Pack',
        outcome: 'Minimal cross-venture flows in CI',
        category: 'DEVEX',
        wave: 4,
        effort: 'S',
        deps: ['test-harness'],
        proposed_kpis: ['test_coverage', 'smoke_pass_rate']
    },
    {
        id: 'DEVEX-003',
        title: 'Quality Gates in CI',
        outcome: 'Block on failing SLO/coverage',
        category: 'DEVEX',
        wave: 4,
        effort: 'M',
        deps: ['ci-rules', 'metrics'],
        proposed_kpis: ['gate_blocks', 'quality_improvement']
    },
    {
        id: 'DEVEX-004',
        title: 'Changelog Autogen',
        outcome: 'Human-readable weekly changes',
        category: 'DEVEX',
        wave: 4,
        effort: 'S',
        deps: ['git-log', 'labels'],
        proposed_kpis: ['changelog_accuracy', 'update_frequency']
    },
    
    // AGENTS Category (2 items)
    {
        id: 'AGENTS-001',
        title: 'Strategy Critic Agent',
        outcome: 'Sanity-check scenarios/assumptions',
        category: 'AGENTS',
        wave: 4,
        effort: 'S',
        deps: ['prompt-pack', 'guardrails'],
        proposed_kpis: ['critique_quality', 'false_positive_rate']
    },
    {
        id: 'AGENTS-002',
        title: 'Risk Sentinel',
        outcome: 'Flags compliance/PR risks from scenarios',
        category: 'AGENTS',
        wave: 4,
        effort: 'M',
        deps: ['rules', 'keywords'],
        proposed_kpis: ['risks_flagged', 'risk_accuracy']
    }
];

// Convert initiatives to backlog items
function buildBacklogItems() {
    return initiatives.map(init => {
        // Determine priority based on wave
        let priority = 'P3';
        if (init.wave === 1) priority = 'P1';
        else if (init.wave === 2 || init.wave === 3) priority = 'P2';
        
        return {
            sd_id: 'SD-VENTURE-WORKFLOW',  // Umbrella SD
            backlog_id: init.id,  // external_id
            backlog_title: init.title,
            priority: priority,
            description_raw: `@${init.category.toLowerCase()} @wave${init.wave}`,
            item_description: init.outcome,
            my_comments: 'Initiative from portfolio health system design',
            stage_number: init.wave,
            phase: 'Planning',
            new_module: init.category === 'EHI' || init.category === 'GATES',
            extras: {
                category: init.category,
                wave: init.wave,
                outcome: init.outcome,
                effort: init.effort,
                deps: init.deps,
                proposed_kpis: init.proposed_kpis || [],
                suggested_sd: `SD-${init.category}`,
                source: 'initiative-pack-2025-09-12'
            }
        };
    });
}

async function executeInsert() {
    console.log('\n🚀 APPLYING INSERT - TRANSACTION STARTED\n');
    
    const items = buildBacklogItems();
    let insertedCount = 0;
    let updatedCount = 0;
    const errors = [];
    
    // Process all items
    for (const item of items) {
        try {
            // Check if exists first
            const { data: existing } = await supabase
                .from('sd_backlog_map')
                .select('backlog_id')
                .eq('sd_id', item.sd_id)
                .eq('backlog_id', item.backlog_id)
                .single();
            
            // Upsert with conflict handling
            const { data, error } = await supabase
                .from('sd_backlog_map')
                .upsert(item, {
                    onConflict: 'sd_id,backlog_id',
                    ignoreDuplicates: false
                })
                .select();
            
            if (error) {
                errors.push({ id: item.backlog_id, error: error.message });
                console.log(`❌ Failed: ${item.backlog_id} - ${error.message}`);
            } else {
                if (existing) {
                    updatedCount++;
                    console.log(`📝 Updated: ${item.backlog_id}`);
                } else {
                    insertedCount++;
                    console.log(`✅ Inserted: ${item.backlog_id}`);
                }
            }
        } catch (e) {
            errors.push({ id: item.backlog_id, error: e.message });
            console.log(`❌ Error: ${item.backlog_id} - ${e.message}`);
        }
    }
    
    console.log('\n📊 AUDIT REPORT');
    console.log('================');
    console.log(`• Inserted: ${insertedCount}`);
    console.log(`• Updated: ${updatedCount}`);
    console.log(`• Failed: ${errors.length}`);
    console.log(`• Total processed: ${items.length}`);
    
    // Count by sd_code
    console.log('\n📁 Count by SD:');
    console.log('• SD-VENTURE-WORKFLOW: ' + items.length);
    
    // Count by category
    console.log('\n📂 Count by Category:');
    const byCategory = {};
    items.forEach(item => {
        const cat = item.extras.category;
        byCategory[cat] = (byCategory[cat] || 0) + 1;
    });
    Object.entries(byCategory).forEach(([cat, count]) => {
        console.log(`• ${cat}: ${count}`);
    });
    
    // Sample rows
    console.log('\n📋 Sample Rows (first 5):');
    const { data: samples } = await supabase
        .from('sd_backlog_map')
        .select('sd_id, backlog_id, backlog_title, priority')
        .in('backlog_id', initiatives.slice(0, 5).map(i => i.id))
        .order('backlog_id');
    
    samples?.forEach(row => {
        console.log(`• [${row.sd_id}] ${row.backlog_id}: ${row.backlog_title} (${row.priority})`);
    });
    
    // Full metadata samples
    console.log('\n🔍 Full Metadata Samples (2):');
    const { data: metaSamples } = await supabase
        .from('sd_backlog_map')
        .select('backlog_id, extras')
        .in('backlog_id', ['EHI-001', 'GATES-002'])
        .order('backlog_id');
    
    metaSamples?.forEach(row => {
        console.log(`\n${row.backlog_id} metadata:`);
        console.log(JSON.stringify(row.extras, null, 2));
    });
    
    if (errors.length > 0) {
        console.log('\n⚠️ ERRORS ENCOUNTERED:');
        errors.forEach(e => console.log(`• ${e.id}: ${e.error}`));
    }
    
    console.log('\n✅ TRANSACTION COMPLETE');
}

executeInsert();