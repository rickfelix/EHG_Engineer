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

async function completeSD031() {
  try {
    console.log('🎯 Completing SD-031: Stage 3 - Comprehensive Validation');

    // First find SD-031 by title
    const { data: findData, error: findError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .ilike('title', '%stage 3%validation%')
      .limit(5);

    if (findError) {
      console.error('❌ Error finding SD-031:', findError);
      return;
    }

    console.log('🔍 Found SDs matching Stage 3 validation:');
    findData?.forEach(sd => {
      console.log(`  - ${sd.title} (ID: ${sd.id}) [${sd.status}]`);
    });

    // Find the specific SD-031 entry
    const sd031 = findData?.find(sd =>
      sd.title.toLowerCase().includes('stage 3') &&
      sd.title.toLowerCase().includes('validation')
    );

    if (!sd031) {
      console.log('⚠️  SD-031 not found. Creating new entry...');
      // Could create new entry here if needed
      return;
    }

    console.log(`\n🎯 Updating SD: ${sd031.title} (ID: ${sd031.id})`);

    // Update SD-031 status to completed
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .update({
        status: 'completed',
        metadata: {
          ...sd031.metadata,
          completion_date: new Date().toISOString(),
          completion_note: 'Comprehensive validation framework implemented with enhanced rules engine, multi-type validation, and real-time dashboard',
          implementation_details: {
            framework: 'ValidationFrameworkService with 5 validation types',
            dashboard: 'Real-time ValidationDashboard with export capabilities',
            integration: 'Enhanced Stage3ComprehensiveValidation with dual-mode support',
            database: 'validation_reports table with audit trail',
            commit: 'dca6da0 - feat(SD-031): Implement comprehensive validation framework'
          },
          deliverables_completed: [
            'Comprehensive validation framework implementation',
            'Data validation rules and schemas',
            'Business rule enforcement engine',
            'Compliance checking system',
            'Quality assurance mechanisms',
            'Validation reporting dashboard',
            'Error handling and recovery processes',
            'Integration with venture workflow'
          ]
        }
      })
      .eq('id', sd031.id)
      .select();

    if (error) {
      console.error('❌ Error updating SD-031:', error);
      return;
    }

    if (!data || data.length === 0) {
      console.log('⚠️  SD-031 not found in database');
      return;
    }

    console.log('✅ SD-031 marked as completed successfully!');
    console.log('\n📋 Summary:');
    console.log('- Status: completed');
    console.log('- Framework: Comprehensive validation with 5 validation types');
    console.log('- Dashboard: Real-time reporting and analytics');
    console.log('- Integration: Enhanced Stage 3 component');
    console.log('- Database: validation_reports table ready');
    console.log('- Commit: dca6da0');

    console.log('\n🎉 SD-031 Implementation Complete!');
    console.log('✨ Comprehensive validation framework is now available in Stage 3');

  } catch (error) {
    console.error('❌ Error completing SD-031:', error);
  }
}

completeSD031();