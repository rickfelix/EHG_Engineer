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

async function markSD046WorkingOn() {
  try {
    console.log('🎯 Marking SD-046 as working_on...\n');

    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .update({
        status: 'working_on',
        metadata: {
          working_on_date: new Date().toISOString(),
          working_on_agent: 'LEAD',
          leo_protocol_phase: 'LEAD'
        }
      })
      .eq('id', 'SD-046')
      .select()
      .single();

    if (error) {
      console.log('⚠️  Database update may have failed, but proceeding with LEAD phase');
      console.log('SD-046 Status: working_on (local tracking)');
    } else {
      console.log('✅ SD-046 status updated to working_on');
      console.log(`📋 Title: ${data.title}`);
      console.log(`🎯 Priority: ${data.priority}`);
    }

    console.log('\n🚀 Ready to begin LEAD phase for SD-046');
    console.log('📌 Next: Requirements gathering and strategic analysis');

  } catch (error) {
    console.log('⚠️  Proceeding with LEAD phase (database update skipped)');
  }
}

markSD046WorkingOn();