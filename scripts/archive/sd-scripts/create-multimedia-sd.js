#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function createMultimediaSD() {
  console.log('📋 Creating Multimedia Music Creation SD...\n');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert({
        id: 'SD-MULTIMEDIA-001',
        sd_key: 'SD-MULTIMEDIA-001',
        title: 'Multimedia Music Creation Platform Integration',
        status: 'draft',
        category: 'feature',
        priority: 'high',
        description: 'Integration of AI-powered music creation platforms (Udio, Suno) to enable users to create custom music compositions within the EHG application.',
        strategic_intent: 'Enable users to generate custom music using leading AI music platforms, enhancing creative capabilities and content creation workflows.',
        rationale: 'Provide users with creative multimedia tools for music generation, enhancing the platform\'s value proposition and supporting content creation workflows.',
        scope: 'Integrate third-party music creation APIs (Udio, Suno) with user interface for music generation, preview, and management. Include authentication, API key management, usage tracking, and export functionality.',
        created_by: 'LEAD',
        target_application: 'EHG',
        sequence_rank: 1000,
        version: '1.0',
        metadata: {
          business_value: 'HIGH',
          technical_complexity: 'MEDIUM',
          user_impact: 'HIGH',
          dependencies: ['Authentication system', 'File storage', 'API integration infrastructure'],
          estimated_effort: '2-3 sprints',
          key_features: [
            'Platform selection (Udio/Suno)',
            'API integration and authentication',
            'Music generation interface',
            'Preview and playback controls',
            'Export and download functionality',
            'Usage tracking and limits',
            'History and library management'
          ]
        }
      })
      .select()
      .single();
    
    if (error) {
      console.error('❌ Database error:', error.message);
      process.exit(1);
    }
    
    console.log('✅ SD-MULTIMEDIA-001 created successfully!');
    console.log('\n📊 Strategic Directive Details:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`ID: ${data.id}`);
    console.log(`Title: ${data.title}`);
    console.log(`Status: ${data.status}`);
    console.log(`Priority: ${data.priority}`);
    console.log(`Category: ${data.category}`);
    console.log(`Target: ${data.target_application}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📝 Next Steps:');
    console.log('1. LEAD review and approval');
    console.log('2. Create LEAD→PLAN handoff');
    console.log('3. PLAN creates detailed PRD');
    console.log('4. EXEC implements features');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createMultimediaSD();
