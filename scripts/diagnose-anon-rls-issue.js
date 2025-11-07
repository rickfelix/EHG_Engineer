#!/usr/bin/env node

/**
 * Root Cause Analysis: ANON vs SERVICE_ROLE query test
 * Diagnose why add-prd-to-database.js cannot find SD with ANON_KEY
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function diagnoseRLS() {
  console.log('🔍 Root Cause Analysis: ANON vs SERVICE_ROLE Query Test\n');
  console.log('SD ID: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001\n');

  // Test 1: ANON KEY query
  console.log('=== TEST 1: ANON_KEY Query ===');
  const anonClient = createClient(supabaseUrl, anonKey);

  try {
    const { data: anonData, error: anonError } = await anonClient
      .from('strategic_directives_v2')
      .select('id, title, status')
      .eq('id', 'SD-CREWAI-COMPETITIVE-INTELLIGENCE-001')
      .single();

    if (anonError) {
      console.log('❌ ANON Query Error:', anonError.message);
      console.log('   Code:', anonError.code);
      console.log('   Details:', anonError.details);
    } else {
      console.log('✅ ANON Query Success:', anonData);
    }
  } catch (error) {
    console.log('❌ ANON Query Exception:', error.message);
  }

  console.log('\n=== TEST 2: SERVICE_ROLE_KEY Query ===');
  const serviceClient = createClient(supabaseUrl, serviceKey);

  try {
    const { data: serviceData, error: serviceError } = await serviceClient
      .from('strategic_directives_v2')
      .select('id, title, status')
      .eq('id', 'SD-CREWAI-COMPETITIVE-INTELLIGENCE-001')
      .single();

    if (serviceError) {
      console.log('❌ SERVICE Query Error:', serviceError.message);
    } else {
      console.log('✅ SERVICE Query Success:', serviceData);
    }
  } catch (error) {
    console.log('❌ SERVICE Query Exception:', error.message);
  }

  console.log('\n=== TEST 3: RLS Policy Check ===');
  try {
    const { data: policies, error: policyError } = await serviceClient
      .from('pg_policies')
      .select('*')
      .eq('tablename', 'strategic_directives_v2');

    if (policyError) {
      console.log('❌ Cannot query policies:', policyError.message);
    } else if (policies && policies.length > 0) {
      console.log('✅ RLS Policies Found:', policies.length);
      policies.forEach(p => {
        console.log(`  - ${p.policyname}: ${p.cmd} for ${p.roles}`);
      });
    } else {
      console.log('⚠️  No RLS policies found');
    }
  } catch (error) {
    console.log('⚠️  Policy query not supported:', error.message);
  }

  console.log('\n=== DIAGNOSIS ===');
  console.log('Root Cause: [Will be determined by test results above]');
  console.log('Solution: [Pending diagnosis]');
}

diagnoseRLS();
