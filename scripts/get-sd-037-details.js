#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function getSD037Details() {
  try {
    console.log('🔍 Fetching SD-037 Details...\n');

    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', 'SD-037')
      .single();

    if (error) {
      console.error('❌ Error fetching SD-037:', error);
      return;
    }

    if (!data) {
      console.log('⚠️  SD-037 not found');
      return;
    }

    console.log('📋 SD-037: Stage 35 - GTM Timing Intelligence');
    console.log('=' + '='.repeat(50));
    console.log(`Title: ${data.title}`);
    console.log(`Status: ${data.status}`);
    console.log(`Priority: ${data.priority}`);
    console.log(`Created: ${data.created_at}`);
    console.log('\nDescription:');
    console.log(data.description || 'No description available');

    if (data.strategic_intent) {
      console.log('\nStrategic Intent:');
      console.log(data.strategic_intent);
    }

    if (data.rationale) {
      console.log('\nRationale:');
      console.log(data.rationale);
    }

    if (data.scope_details) {
      console.log('\nScope Details:');
      console.log(data.scope_details);
    }

    if (data.success_criteria) {
      console.log('\nSuccess Criteria:');
      console.log(data.success_criteria);
    }

    if (data.acceptance_criteria) {
      console.log('\nAcceptance Criteria:');
      console.log(data.acceptance_criteria);
    }

    if (data.metadata) {
      console.log('\nMetadata:');
      console.log(JSON.stringify(data.metadata, null, 2));
    }

    return data;

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

getSD037Details();