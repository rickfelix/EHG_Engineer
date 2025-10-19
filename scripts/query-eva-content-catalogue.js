#!/usr/bin/env node

/**
 * Query EVA Content Catalogue
 * Utility script to query and display content catalogue items, versions, and metadata
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function queryCatalogue(options = {}) {
  const { catalogueId, userId, contentType, limit = 10 } = options;

  console.log('🔍 Querying EVA Content Catalogue');
  console.log('=================================\n');

  try {
    // Query content catalogue
    let query = supabase
      .from('content_catalogue')
      .select(`
        id,
        title,
        description,
        current_version,
        data,
        metadata,
        created_at,
        updated_at,
        content_type:content_types(name, display_name),
        created_by
      `);

    if (catalogueId) {
      query = query.eq('id', catalogueId);
    }

    if (userId) {
      query = query.eq('created_by', userId);
    }

    if (contentType) {
      query = query.eq('content_type_id', contentType);
    }

    query = query.order('updated_at', { ascending: false }).limit(limit);

    const { data: items, error } = await query;

    if (error) throw error;

    console.log(`📦 Found ${items?.length || 0} catalogue items\n`);

    if (!items || items.length === 0) {
      console.log('No items found.');
      return;
    }

    for (const item of items) {
      console.log(`📄 ${item.title}`);
      console.log(`   ID: ${item.id}`);
      console.log(`   Type: ${item.content_type?.display_name || 'Unknown'}`);
      console.log(`   Version: ${item.current_version}`);
      console.log(`   Created: ${new Date(item.created_at).toLocaleString()}`);
      console.log(`   Updated: ${new Date(item.updated_at).toLocaleString()}`);

      if (item.metadata && Object.keys(item.metadata).length > 0) {
        console.log(`   Metadata: ${JSON.stringify(item.metadata, null, 2)}`);
      }

      // Query version history
      const { data: versions } = await supabase
        .from('content_versions')
        .select('version_number, change_description, created_at')
        .eq('catalogue_id', item.id)
        .order('version_number', { ascending: false })
        .limit(3);

      if (versions && versions.length > 0) {
        console.log(`   Recent versions:`);
        for (const v of versions) {
          console.log(`     v${v.version_number}: ${v.change_description || 'No description'} (${new Date(v.created_at).toLocaleString()})`);
        }
      }

      // Query conversations
      const { data: conversations } = await supabase
        .from('conversation_content_links')
        .select(`
          link_type,
          reference_context,
          conversation:eva_conversations(title, created_at)
        `)
        .eq('catalogue_id', item.id);

      if (conversations && conversations.length > 0) {
        console.log(`   Linked conversations: ${conversations.length}`);
        for (const conv of conversations) {
          console.log(`     ${conv.link_type}: ${conv.reference_context || 'No context'}`);
        }
      }

      console.log('');
    }

    // Summary statistics
    console.log('📊 Summary Statistics:');

    const { count: totalItems } = await supabase
      .from('content_catalogue')
      .select('*', { count: 'exact', head: true });

    const { count: totalVersions } = await supabase
      .from('content_versions')
      .select('*', { count: 'exact', head: true });

    const { count: totalConversations } = await supabase
      .from('eva_conversations')
      .select('*', { count: 'exact', head: true });

    console.log(`   Total catalogue items: ${totalItems || 0}`);
    console.log(`   Total versions: ${totalVersions || 0}`);
    console.log(`   Total conversations: ${totalConversations || 0}`);

    if (totalItems > 0 && totalVersions > 0) {
      const avgVersions = (totalVersions / totalItems).toFixed(1);
      console.log(`   Average versions per item: ${avgVersions}`);
    }

  } catch (error) {
    console.error('❌ Error querying catalogue:', error.message);
    if (error.details) console.error('Details:', error.details);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--id') {
    options.catalogueId = args[i + 1];
    i++;
  } else if (args[i] === '--user') {
    options.userId = args[i + 1];
    i++;
  } else if (args[i] === '--type') {
    options.contentType = args[i + 1];
    i++;
  } else if (args[i] === '--limit') {
    options.limit = parseInt(args[i + 1], 10);
    i++;
  }
}

// Export for use in other scripts
export { queryCatalogue };

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  queryCatalogue(options);
}
