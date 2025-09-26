#!/usr/bin/env node

/**
 * Fix Strategic Directive Execution Order
 *
 * This script fixes duplicate execution_order values by assigning unique
 * sequential numbers while preserving the current display order.
 *
 * The current sorting logic from loadStrategicDirectives:
 * 1. execution_order (ascending, nullsFirst: false)
 * 2. priority (fallback)
 * 3. created_at (descending, fallback)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

async function fixExecutionOrder() {
    console.log('\n🔧 Fixing Strategic Directive Execution Order');
    console.log('============================================\n');

    try {
        // Step 1: Get all SDs in their current display order
        // Using the EXACT same ordering as loadStrategicDirectives
        const { data: sds, error } = await supabase
            .from('strategic_directives_v2')
            .select('id, sd_key, title, execution_order, priority, created_at')
            .order('execution_order', { ascending: true, nullsFirst: false })
            .order('priority')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Error loading SDs:', error.message);
            return;
        }

        console.log(`📊 Found ${sds.length} Strategic Directives\n`);

        // Step 2: Check for duplicates
        const orderCounts = {};
        sds.forEach(sd => {
            const order = sd.execution_order;
            if (order !== null) {
                if (!orderCounts[order]) orderCounts[order] = 0;
                orderCounts[order]++;
            }
        });

        const duplicates = Object.entries(orderCounts)
            .filter(([order, count]) => count > 1)
            .map(([order, count]) => ({ order: parseInt(order), count }));

        if (duplicates.length > 0) {
            console.log('⚠️  Found duplicate execution_order values:');
            duplicates.forEach(({ order, count }) => {
                console.log(`   Order ${order}: ${count} SDs`);
            });
            console.log('');
        } else {
            console.log('✅ No duplicates found in execution_order values\n');
        }

        // Step 3: Show current order (first 10)
        console.log('Current order (first 10):');
        console.log('-------------------------');
        sds.slice(0, 10).forEach((sd, index) => {
            const title = sd.title.length > 40 ? sd.title.substring(0, 40) + '...' : sd.title;
            console.log(`${(index + 1).toString().padStart(2)}. ${title} | Current: ${sd.execution_order}`);
        });

        // Step 4: Assign new sequential values
        console.log('\n🔄 Assigning new sequential execution_order values...\n');

        const updates = [];
        for (let i = 0; i < sds.length; i++) {
            const newOrder = i + 1; // Start from 1
            const sd = sds[i];

            // Only update if the value is different
            if (sd.execution_order !== newOrder) {
                updates.push({
                    id: sd.id,
                    oldOrder: sd.execution_order,
                    newOrder: newOrder,
                    title: sd.title
                });
            }
        }

        if (updates.length === 0) {
            console.log('✅ All SDs already have correct sequential values!');
            return;
        }

        console.log(`📝 Need to update ${updates.length} SDs\n`);

        // Step 5: Apply updates
        console.log('Applying updates...');

        let successCount = 0;
        let errorCount = 0;

        for (const update of updates) {
            const { data, error } = await supabase
                .from('strategic_directives_v2')
                .update({ execution_order: update.newOrder })
                .eq('id', update.id);

            if (error) {
                console.error(`❌ Failed to update ${update.title}: ${error.message}`);
                errorCount++;
            } else {
                successCount++;
                // Show progress for first few updates
                if (successCount <= 5) {
                    const title = update.title.length > 30 ? update.title.substring(0, 30) + '...' : update.title;
                    console.log(`   ✓ Updated "${title}" from ${update.oldOrder} to ${update.newOrder}`);
                } else if (successCount === 6) {
                    console.log(`   ... updating remaining ${updates.length - 5} SDs ...`);
                }
            }
        }

        console.log(`\n✅ Successfully updated ${successCount} SDs`);
        if (errorCount > 0) {
            console.log(`⚠️  Failed to update ${errorCount} SDs`);
        }

        // Step 6: Verify the fix
        console.log('\n🔍 Verifying the fix...\n');

        const { data: verifyData, error: verifyError } = await supabase
            .from('strategic_directives_v2')
            .select('id, title, execution_order')
            .order('execution_order', { ascending: true });

        if (verifyError) {
            console.error('❌ Error verifying:', verifyError.message);
            return;
        }

        // Check for any remaining duplicates
        const newOrderCounts = {};
        verifyData.forEach(sd => {
            const order = sd.execution_order;
            if (!newOrderCounts[order]) newOrderCounts[order] = 0;
            newOrderCounts[order]++;
        });

        const remainingDuplicates = Object.entries(newOrderCounts)
            .filter(([order, count]) => count > 1);

        if (remainingDuplicates.length === 0) {
            console.log('✅ SUCCESS! All execution_order values are now unique and sequential');
            console.log(`   - Total SDs: ${verifyData.length}`);
            console.log(`   - Order range: 1 to ${verifyData.length}`);
        } else {
            console.log('⚠️  WARNING: Some duplicates remain:');
            remainingDuplicates.forEach(([order, count]) => {
                console.log(`   Order ${order}: ${count} SDs`);
            });
        }

        // Show new order (first 10)
        console.log('\nNew order (first 10):');
        console.log('---------------------');
        verifyData.slice(0, 10).forEach((sd, index) => {
            const title = sd.title.length > 40 ? sd.title.substring(0, 40) + '...' : sd.title;
            console.log(`${(index + 1).toString().padStart(2)}. ${title} | Order: ${sd.execution_order}`);
        });

        console.log('\n✅ Execution order fix complete!');
        console.log('   Strategic Directives can now be reordered properly.\n');

    } catch (error) {
        console.error('❌ Unexpected error:', error.message);
        process.exit(1);
    }
}

// Run the fix
fixExecutionOrder().catch(console.error);