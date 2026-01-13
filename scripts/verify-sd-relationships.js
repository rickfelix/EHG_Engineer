#!/usr/bin/env node

import { createDatabaseClient } from './lib/supabase-connection.js';

async function verifyAndFixSDRelationships() {
  const sdIds = [
    'SD-WIN-MIG-PARENT',
    'SD-WIN-MIG-001',
    'SD-WIN-MIG-002-NPM',
    'SD-WIN-MIG-003',
    'SD-WIN-MIG-004-DOCS'
  ];

  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    // Query all 5 SDs - using strategic_directives_v2 table
    const result = await client.query(`
      SELECT
        id as sd_id,
        parent_sd_id,
        relationship_type,
        title,
        status,
        priority,
        created_at
      FROM strategic_directives_v2
      WHERE id = ANY($1::text[])
      ORDER BY
        CASE
          WHEN id = 'SD-WIN-MIG-PARENT' THEN 1
          ELSE 2
        END,
        id
    `, [sdIds]);

    console.log('Current SD Status:');
    console.log('==================\n');

    if (result.rows.length === 0) {
      console.log('⚠️  No SDs found in database!');
      return;
    }

    result.rows.forEach(sd => {
      console.log(`SD: ${sd.sd_id}`);
      console.log(`  Title: ${sd.title}`);
      console.log(`  Status: ${sd.status}`);
      console.log(`  Priority: ${sd.priority}`);
      console.log(`  Parent SD: ${sd.parent_sd_id || '(none)'}`);
      console.log(`  Relationship: ${sd.relationship_type || '(none)'}`);
      console.log('');
    });

    // Identify which need updates
    const needsUpdate = result.rows.filter(sd =>
      sd.sd_id !== 'SD-WIN-MIG-PARENT' &&
      (sd.parent_sd_id !== 'SD-WIN-MIG-PARENT' || sd.relationship_type !== 'child')
    );

    if (needsUpdate.length > 0) {
      console.log('\n🔧 SDs needing parent-child relationship updates:');
      needsUpdate.forEach(sd => console.log(`  - ${sd.sd_id}`));

      console.log('\n📝 Updating relationships...');

      for (const sd of needsUpdate) {
        await client.query(`
          UPDATE strategic_directives_v2
          SET
            parent_sd_id = 'SD-WIN-MIG-PARENT',
            relationship_type = 'child',
            updated_at = NOW()
          WHERE id = $1
        `, [sd.sd_id]);

        console.log(`  ✅ Updated ${sd.sd_id}`);
      }

      console.log('\n✅ All relationships updated!');

      // Verify updates
      const verifyResult = await client.query(`
        SELECT id as sd_id, parent_sd_id, relationship_type
        FROM strategic_directives_v2
        WHERE id = ANY($1::text[])
        ORDER BY
          CASE
            WHEN id = 'SD-WIN-MIG-PARENT' THEN 1
            ELSE 2
          END,
          id
      `, [sdIds]);

      console.log('\n📊 Final Parent-Child Relationships:');
      console.log('====================================\n');

      const parent = verifyResult.rows.find(s => s.sd_id === 'SD-WIN-MIG-PARENT');
      if (parent) {
        console.log(`🎯 PARENT: ${parent.sd_id}`);
        console.log(`   Relationship: ${parent.relationship_type || 'root'}\n`);
      }

      const children = verifyResult.rows.filter(s => s.sd_id !== 'SD-WIN-MIG-PARENT');
      console.log(`📦 CHILDREN (${children.length}):`);
      children.forEach(child => {
        console.log(`   - ${child.sd_id}`);
        console.log(`     Parent: ${child.parent_sd_id}`);
        console.log(`     Type: ${child.relationship_type}`);
      });

    } else {
      console.log('\n✅ All parent-child relationships are correctly configured!');

      console.log('\n📊 Parent-Child Hierarchy:');
      console.log('==========================\n');

      const parent = result.rows.find(s => s.sd_id === 'SD-WIN-MIG-PARENT');
      if (parent) {
        console.log(`🎯 PARENT: ${parent.sd_id}`);
        console.log(`   ${parent.title}`);
        console.log(`   Status: ${parent.status}\n`);
      }

      const children = result.rows.filter(s => s.sd_id !== 'SD-WIN-MIG-PARENT');
      console.log(`📦 CHILDREN (${children.length}):`);
      children.forEach(child => {
        console.log(`   - ${child.sd_id} (${child.status})`);
        console.log(`     ${child.title}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

verifyAndFixSDRelationships().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
