#!/usr/bin/env node

/**
 * Test EVA Content Creation
 * Tests the full workflow: create content, version it, link to conversation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testContentCreation() {
  console.log('🧪 Testing EVA Content Creation Workflow');
  console.log('=========================================\n');

  try {
    // Get a test user (first user in auth.users)
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
    if (usersError) throw usersError;

    if (!users || users.users.length === 0) {
      console.error('❌ No users found. Create a user first.');
      process.exit(1);
    }

    const testUser = users.users[0];
    console.log(`✅ Using test user: ${testUser.email}\n`);

    // Get content type ID for text_block
    const { data: contentType, error: typeError } = await supabase
      .from('content_types')
      .select('id, name')
      .eq('name', 'text_block')
      .single();

    if (typeError) throw typeError;
    console.log(`✅ Found content type: ${contentType.name}\n`);

    // TEST 1: Create content item
    console.log('📝 TEST 1: Creating content item...');
    const { data: catalogueItem, error: createError } = await supabase
      .from('content_catalogue')
      .insert({
        content_type_id: contentType.id,
        title: 'Test Presentation: Q4 Ventures',
        description: 'Auto-generated test presentation',
        data: {
          markdown: '# Q4 Ventures Overview\n\nTest content created by automation.\n\n## Key Metrics\n- Total ventures: 12\n- Active stages: 5',
          plaintext: 'Q4 Ventures Overview'
        },
        metadata: { tags: ['test', 'q4', 'ventures'] },
        created_by: testUser.id,
        current_version: 1
      })
      .select()
      .single();

    if (createError) throw createError;
    console.log(`✅ Created: ${catalogueItem.title} (ID: ${catalogueItem.id})\n`);

    // TEST 2: Create initial version
    console.log('📝 TEST 2: Creating initial version...');
    const { data: version1, error: version1Error } = await supabase
      .from('content_versions')
      .insert({
        catalogue_id: catalogueItem.id,
        version_number: 1,
        data_snapshot: catalogueItem.data,
        metadata_snapshot: catalogueItem.metadata,
        changed_by: testUser.id,
        change_type: 'create',
        change_description: 'Initial version'
      })
      .select()
      .single();

    if (version1Error) throw version1Error;
    console.log(`✅ Created version 1\n`);

    // TEST 3: Update content (create version 2)
    console.log('📝 TEST 3: Updating content (version 2)...');
    const updatedData = {
      markdown: '# Q4 Ventures Overview\n\nUpdated content with more details.\n\n## Key Metrics\n- Total ventures: 15 (updated)\n- Active stages: 7',
      plaintext: 'Q4 Ventures Overview (Updated)'
    };

    const { error: updateError } = await supabase
      .from('content_catalogue')
      .update({
        data: updatedData,
        current_version: 2,
        updated_at: new Date().toISOString()
      })
      .eq('id', catalogueItem.id);

    if (updateError) throw updateError;

    const { data: version2, error: version2Error } = await supabase
      .from('content_versions')
      .insert({
        catalogue_id: catalogueItem.id,
        version_number: 2,
        data_snapshot: updatedData,
        metadata_snapshot: catalogueItem.metadata,
        changed_by: testUser.id,
        change_type: 'update',
        change_description: 'Updated metrics'
      })
      .select()
      .single();

    if (version2Error) throw version2Error;
    console.log(`✅ Created version 2\n`);

    // TEST 4: Create EVA conversation
    console.log('📝 TEST 4: Creating EVA conversation...');
    const { data: conversation, error: convError } = await supabase
      .from('eva_conversations')
      .insert({
        user_id: testUser.id,
        title: 'Test Conversation: Create Q4 Presentation',
        conversation_data: {
          messages: [
            { role: 'user', content: 'EVA, create a presentation for Q4 ventures' },
            { role: 'assistant', content: 'I\'ve created a Q4 Ventures presentation with key metrics.' }
          ],
          turns: 2
        },
        context: {
          intent: 'create_presentation',
          entities: ['q4', 'ventures', 'presentation']
        }
      })
      .select()
      .single();

    if (convError) throw convError;
    console.log(`✅ Created conversation: ${conversation.title}\n`);

    // TEST 5: Link conversation to content
    console.log('📝 TEST 5: Linking conversation to content...');
    const { data: link, error: linkError } = await supabase
      .from('conversation_content_links')
      .insert({
        conversation_id: conversation.id,
        catalogue_id: catalogueItem.id,
        link_type: 'created',
        reference_context: 'Created during conversation about Q4 venture presentation',
        message_index: 1
      })
      .select()
      .single();

    if (linkError) throw linkError;
    console.log(`✅ Linked conversation to content\n`);

    // TEST 6: Create layout assignment
    console.log('📝 TEST 6: Creating layout assignment...');
    const { data: presentationLayout, error: layoutError } = await supabase
      .from('screen_layouts')
      .select('id')
      .eq('name', 'presentation')
      .single();

    if (layoutError) throw layoutError;

    const { data: assignment, error: assignmentError } = await supabase
      .from('content_layout_assignments')
      .insert({
        catalogue_id: catalogueItem.id,
        layout_id: presentationLayout.id,
        display_settings: {
          position: { x: 0, y: 0 },
          zoom: 1.0
        },
        is_default: true
      })
      .select()
      .single();

    if (assignmentError) throw assignmentError;
    console.log(`✅ Assigned presentation layout\n`);

    // TEST 7: Create metadata entry
    console.log('📝 TEST 7: Creating metadata entry...');
    const { data: metadata, error: metadataError } = await supabase
      .from('content_item_metadata')
      .insert({
        catalogue_id: catalogueItem.id,
        tags: ['test', 'q4', 'ventures', 'presentation'],
        relationships: { linked_items: [] },
        access_control: { public: false },
        usage_analytics: { views: 0, edits: 2, shares: 0 },
        custom_properties: { project: 'Q4 Planning', status: 'draft' }
      })
      .select()
      .single();

    if (metadataError) throw metadataError;
    console.log(`✅ Created metadata entry\n`);

    // VERIFICATION: Query everything back
    console.log('🔍 VERIFICATION: Querying created items...\n');

    const { data: verifyItem } = await supabase
      .from('content_catalogue')
      .select(`
        *,
        content_type:content_types(name, display_name),
        versions:content_versions(version_number, change_description),
        conversations:conversation_content_links(
          link_type,
          conversation:eva_conversations(title)
        ),
        layouts:content_layout_assignments(
          is_default,
          layout:screen_layouts(name, display_name)
        ),
        metadata:content_item_metadata(tags, custom_properties)
      `)
      .eq('id', catalogueItem.id)
      .single();

    console.log('📦 Complete Item Structure:');
    console.log(JSON.stringify(verifyItem, null, 2));

    console.log('\n=========================================');
    console.log('✅ ALL TESTS PASSED!');
    console.log('\n📊 Summary:');
    console.log('   ✅ Content item created');
    console.log('   ✅ 2 versions created');
    console.log('   ✅ Conversation created and linked');
    console.log('   ✅ Layout assigned');
    console.log('   ✅ Metadata created');
    console.log('\n🎯 Full workflow validated successfully!');

    // Cleanup option
    console.log('\n🧹 Cleanup: To remove test data, run:');
    console.log(`   DELETE FROM content_catalogue WHERE id = '${catalogueItem.id}';`);

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

// Export for use in other scripts
export { testContentCreation };

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testContentCreation();
}
