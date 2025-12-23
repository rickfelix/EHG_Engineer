#!/usr/bin/env node

/**
 * Verify E2E Schema Migrations
 * Tests that system_events.details and brand_variants table work correctly
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verify() {
  console.log('=== MIGRATION VERIFICATION ===\n');

  let success = true;

  // Test 1: Can we insert into system_events with details column?
  console.log('Test 1: system_events.details column');
  const { data: eventData, error: eventError } = await supabase
    .from('system_events')
    .insert({
      event_type: 'migration_test',
      correlation_id: crypto.randomUUID(),
      idempotency_key: 'test-' + Date.now(),
      details: { test: 'migration_verification', timestamp: new Date().toISOString() }
    })
    .select()
    .single();

  if (eventError) {
    console.log('  ❌ FAILED:', eventError.message);
    success = false;
  } else {
    console.log('  ✅ SUCCESS: Insert with details column worked');
    console.log('     Details:', JSON.stringify(eventData.details));
    // Clean up test record
    await supabase.from('system_events').delete().eq('id', eventData.id);
  }

  // Test 2: Can we insert into brand_variants table?
  console.log('\nTest 2: brand_variants table');

  // First get a venture_id
  let { data: venture } = await supabase
    .from('ventures')
    .select('id')
    .limit(1)
    .single();

  if (!venture) {
    console.log('  ⚠️  No ventures found, creating test venture first');
    // Create a test venture
    const { data: newVenture, error: ventureError } = await supabase
      .from('ventures')
      .insert({
        name: 'Migration Test Venture',
        current_lifecycle_stage: 1
      })
      .select()
      .single();

    if (ventureError) {
      console.log('  ❌ Could not create test venture:', ventureError.message);
      success = false;
    } else {
      venture = newVenture;
    }
  }

  if (venture) {
    const { data: brandData, error: brandError } = await supabase
      .from('brand_variants')
      .insert({
        venture_id: venture.id,
        variant_name: 'Test Brand Variant',
        visual_assets: { logo: 'test.png' },
        tone_of_voice: 'Professional',
        messaging_pillars: ['Innovation', 'Trust']
      })
      .select()
      .single();

    if (brandError) {
      console.log('  ❌ FAILED:', brandError.message);
      success = false;
    } else {
      console.log('  ✅ SUCCESS: Insert into brand_variants worked');
      console.log('     Variant ID:', brandData.id);
      // Clean up test record
      await supabase.from('brand_variants').delete().eq('id', brandData.id);
    }
  }

  // Test 3: Query system_events with details
  console.log('\nTest 3: Query system_events.details');
  const { data: events, error: queryError } = await supabase
    .from('system_events')
    .select('id, event_type, details')
    .not('details', 'is', null)
    .limit(5);

  if (queryError) {
    console.log('  ❌ FAILED:', queryError.message);
    success = false;
  } else {
    console.log('  ✅ SUCCESS: Query with details column worked');
    console.log('     Events with details:', events.length);
  }

  // Test 4: Query brand_variants
  console.log('\nTest 4: Query brand_variants');
  const { data: brands, error: brandQueryError } = await supabase
    .from('brand_variants')
    .select('*')
    .limit(5);

  if (brandQueryError) {
    console.log('  ❌ FAILED:', brandQueryError.message);
    success = false;
  } else {
    console.log('  ✅ SUCCESS: Query brand_variants worked');
    console.log('     Brand variants count:', brands.length);
  }

  console.log('\n=== VERIFICATION COMPLETE ===');
  console.log(success ? '\n✅ ALL MIGRATIONS VERIFIED SUCCESSFULLY' : '\n❌ SOME TESTS FAILED');

  return success;
}

verify()
  .then(success => process.exit(success ? 0 : 1))
  .catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
  });
