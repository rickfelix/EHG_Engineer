#!/usr/bin/env node
/**
 * Verify the SD Contract System
 * Tests: tables, functions, triggers, and validation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function verify() {
    console.log('=== Contract System Verification ===\n');

    // 1. Check tables exist by querying them directly
    console.log('1. Tables created:');

    const { data: _dcCount, error: dcErr } = await supabase
        .from('sd_data_contracts')
        .select('id', { count: 'exact', head: true });
    console.log('   sd_data_contracts:', dcErr ? '❌ ' + dcErr.message : '✅');

    const { data: _ucCount, error: ucErr } = await supabase
        .from('sd_ux_contracts')
        .select('id', { count: 'exact', head: true });
    console.log('   sd_ux_contracts:', ucErr ? '❌ ' + ucErr.message : '✅');

    const { data: _vCount, error: vErr } = await supabase
        .from('sd_contract_violations')
        .select('id', { count: 'exact', head: true });
    console.log('   sd_contract_violations:', vErr ? '❌ ' + vErr.message : '✅');

    // 2. Check for existing parent SD to test contract creation
    const { data: parentSd, error: parentErr } = await supabase
        .from('strategic_directives_v2')
        .select('id, title, relationship_type')
        .eq('relationship_type', 'parent')
        .limit(1)
        .single();

    console.log('\n2. Parent SD for testing:');
    if (parentSd) {
        console.log('   ID:', parentSd.id);
        console.log('   Title:', parentSd.title);
        console.log('   Type:', parentSd.relationship_type);
    } else {
        console.log('   No parent SDs found:', parentErr?.message);
        return;
    }

    // 3. Create a test data contract
    const { data: dataContract, error: dcError } = await supabase
        .from('sd_data_contracts')
        .insert({
            parent_sd_id: parentSd.id,
            allowed_tables: ['lifecycle_stage_config', 'lifecycle_stage_artifacts', 'ventures'],
            allowed_columns: { lifecycle_stage_config: ['stage_number', 'title', 'description', 'required_artifacts'] },
            description: 'Vision Transition contract - allows stage config and venture tables',
            rationale: 'This SD family manages the venture lifecycle stages',
            created_by: 'claude-code-verification'
        })
        .select()
        .single();

    console.log('\n3. Test Data Contract:');
    if (dcError) {
        if (dcError.code === '23505') {
            console.log('   Already exists (unique constraint) - fetching existing...');
            const { data: existing } = await supabase
                .from('sd_data_contracts')
                .select('*')
                .eq('parent_sd_id', parentSd.id)
                .single();
            console.log('   Existing ID:', existing?.id);
        } else {
            console.log('   Error:', dcError.message);
        }
    } else {
        console.log('   Created:', dataContract.id);
        console.log('   Allowed tables:', dataContract.allowed_tables.join(', '));
    }

    // 4. Create a test UX contract
    const { data: uxContract, error: uxError } = await supabase
        .from('sd_ux_contracts')
        .insert({
            parent_sd_id: parentSd.id,
            component_paths: ['src/components/ventures/**', 'src/pages/ventures/**'],
            forbidden_paths: ['src/components/auth/**'],
            cultural_design_style: 'california_modern',
            max_component_loc: 600,
            min_wcag_level: 'AA',
            description: 'Vision Transition UX - California Modern style, ventures components only',
            rationale: 'Maintains consistent visual identity across all venture-related features',
            created_by: 'claude-code-verification'
        })
        .select()
        .single();

    console.log('\n4. Test UX Contract:');
    if (uxError) {
        if (uxError.code === '23505') {
            console.log('   Already exists (unique constraint) - fetching existing...');
            const { data: existing } = await supabase
                .from('sd_ux_contracts')
                .select('*')
                .eq('parent_sd_id', parentSd.id)
                .single();
            console.log('   Existing ID:', existing?.id);
            console.log('   Cultural style:', existing?.cultural_design_style);
        } else {
            console.log('   Error:', uxError.message);
        }
    } else {
        console.log('   Created:', uxContract.id);
        console.log('   Cultural style:', uxContract.cultural_design_style);
        console.log('   Component paths:', uxContract.component_paths.join(', '));
    }

    // 5. Find a child SD and check its metadata
    const { data: childSd } = await supabase
        .from('strategic_directives_v2')
        .select('id, parent_sd_id, metadata')
        .eq('parent_sd_id', parentSd.id)
        .limit(1)
        .single();

    console.log('\n5. Child SD Contract Inheritance:');
    if (childSd) {
        console.log('   Child ID:', childSd.id);
        console.log('   Contract governed:', childSd.metadata?.contract_governed || 'not yet');
        console.log('   Inherited data contract:', childSd.metadata?.inherited_data_contract_id || 'not inherited');
        console.log('   Inherited UX contract:', childSd.metadata?.inherited_ux_contract_id || 'not inherited');
        console.log('   Cultural style:', childSd.metadata?.cultural_design_style || 'not inherited');

        // Trigger inheritance by doing a dummy update
        if (!childSd.metadata?.contract_governed) {
            console.log('\n   Triggering inheritance via parent_sd_id update...');
            const { error: updateErr } = await supabase
                .from('strategic_directives_v2')
                .update({ parent_sd_id: parentSd.id })
                .eq('id', childSd.id);

            if (updateErr) {
                console.log('   Update error:', updateErr.message);
            } else {
                // Re-fetch to see inherited values
                const { data: updatedChild } = await supabase
                    .from('strategic_directives_v2')
                    .select('id, metadata')
                    .eq('id', childSd.id)
                    .single();

                console.log('\n   After trigger:');
                console.log('   Contract governed:', updatedChild?.metadata?.contract_governed);
                console.log('   Inherited data contract:', updatedChild?.metadata?.inherited_data_contract_id);
                console.log('   Inherited UX contract:', updatedChild?.metadata?.inherited_ux_contract_id);
                console.log('   Cultural style:', updatedChild?.metadata?.cultural_design_style);
                console.log('   Parent chain:', updatedChild?.metadata?.contract_parent_chain);
            }
        }
    } else {
        console.log('   No children found for this parent');
    }

    // 6. Test validation function with RPC
    console.log('\n6. Testing validation functions:');

    const testSdId = childSd?.id || parentSd.id;

    // Test get_inherited_contracts
    const { data: contracts, error: contractsErr } = await supabase
        .rpc('get_inherited_contracts', { p_sd_id: testSdId });

    console.log('   get_inherited_contracts():');
    if (contractsErr) {
        console.log('      Error:', contractsErr.message);
    } else {
        console.log('      Found', contracts?.length || 0, 'contracts in hierarchy');
    }

    // Test validate_data_contract_compliance with valid content
    const validMigration = 'ALTER TABLE lifecycle_stage_config ADD COLUMN test_col TEXT;';
    const { data: validResult, error: validErr } = await supabase
        .rpc('validate_data_contract_compliance', {
            p_sd_id: testSdId,
            p_content_type: 'migration',
            p_content: validMigration
        });

    console.log('\n   validate_data_contract_compliance (valid table):');
    if (validErr) {
        console.log('      Error:', validErr.message);
    } else {
        console.log('      Result:', validResult?.valid ? '✅ VALID' : '❌ INVALID');
    }

    // Test with invalid content (table not in allowed list)
    const invalidMigration = 'DROP TABLE users;';
    const { data: invalidResult } = await supabase
        .rpc('validate_data_contract_compliance', {
            p_sd_id: testSdId,
            p_content_type: 'migration',
            p_content: invalidMigration
        });

    console.log('\n   validate_data_contract_compliance (forbidden op):');
    console.log('      Result:', invalidResult?.valid ? '✅ VALID' : '❌ INVALID (expected)');
    if (invalidResult?.violations?.length > 0) {
        console.log('      Violations:', invalidResult.violations.length);
        console.log('      Type:', invalidResult.violations[0]?.type);
    }

    // Test UX validation
    const { data: uxResult } = await supabase
        .rpc('validate_ux_contract_compliance', {
            p_sd_id: testSdId,
            p_component_path: 'src/components/ventures/VentureCard.tsx'
        });

    console.log('\n   validate_ux_contract_compliance (valid path):');
    console.log('      Result:', uxResult?.valid ? '✅ VALID' : '❌ INVALID');
    console.log('      Cultural style:', uxResult?.cultural_design_style);

    // Test with forbidden path
    const { data: forbiddenResult } = await supabase
        .rpc('validate_ux_contract_compliance', {
            p_sd_id: testSdId,
            p_component_path: 'src/components/auth/LoginForm.tsx'
        });

    console.log('\n   validate_ux_contract_compliance (forbidden path):');
    console.log('      Result:', forbiddenResult?.valid ? '✅ VALID' : '❌ INVALID (expected)');

    // 7. Test get_contract_summary
    const { data: summary, error: summaryErr } = await supabase
        .rpc('get_contract_summary', { p_sd_id: testSdId });

    console.log('\n7. Contract Summary:');
    if (summaryErr) {
        console.log('   Error:', summaryErr.message);
    } else {
        console.log('   SD ID:', summary?.sd_id);
        console.log('   Contract governed:', summary?.contract_governed);
        console.log('   Cultural style:', summary?.cultural_design_style);
        console.log('   Contracts count:', summary?.contracts?.length || 0);
        console.log('   Violations count:', summary?.violations?.length || 0);
        console.log('   Can complete:', summary?.can_complete);
    }

    console.log('\n=== Verification Complete ===');
}

verify().catch(console.error);
