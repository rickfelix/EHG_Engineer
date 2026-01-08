import { createDatabaseClient } from './lib/supabase-connection.js';

(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    console.log('📝 Updating SD-GENESIS-RESEARCH-001 to completed status...\n');

    // Update the SD to completed
    const updateSD = await client.query(`
      UPDATE strategic_directives_v2
      SET
        status = 'completed',
        current_phase = 'COMPLETED',
        progress = 100,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'completion_notes', 'Documentation SD with relaxed workflow - research completed via triangulation synthesis',
          'completed_at', NOW()::text
        )
      WHERE id = 'SD-GENESIS-RESEARCH-001'
      RETURNING id, status, current_phase, progress, title;
    `);

    if (updateSD.rows.length > 0) {
      console.log('✅ SD-GENESIS-RESEARCH-001 updated:');
      console.log('   ID:', updateSD.rows[0].id);
      console.log('   Status:', updateSD.rows[0].status);
      console.log('   Phase:', updateSD.rows[0].current_phase);
      console.log('   Progress:', updateSD.rows[0].progress + '%');
      console.log('   Title:', updateSD.rows[0].title);
      console.log('');
    }

    // Update parent SD child progress
    console.log('📊 Updating parent SD child progress...\n');

    const updateParent = await client.query(`
      WITH child_stats AS (
        SELECT
          parent_sd_id,
          COUNT(*) as total_children,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_children
        FROM strategic_directives_v2
        WHERE parent_sd_id = 'SD-GENESIS-COMPLETE-001'
        GROUP BY parent_sd_id
      )
      UPDATE strategic_directives_v2 sd
      SET metadata = COALESCE(sd.metadata, '{}'::jsonb) || jsonb_build_object(
        'child_progress', ROUND((cs.completed_children::numeric / cs.total_children::numeric) * 100),
        'children_completed', cs.completed_children,
        'children_total', cs.total_children
      )
      FROM child_stats cs
      WHERE sd.id = cs.parent_sd_id
      RETURNING sd.id,
                (sd.metadata->>'child_progress')::int as child_progress,
                (sd.metadata->>'children_total')::int as total,
                (sd.metadata->>'children_completed')::int as completed;
    `);

    if (updateParent.rows.length > 0) {
      const p = updateParent.rows[0];
      console.log('✅ Parent SD-GENESIS-COMPLETE-001 updated:');
      console.log('   ID:', p.id);
      console.log('   Child Progress:', p.child_progress + '%');
      console.log('   Children Completed:', p.completed + '/' + p.total);
      console.log('');
    }

    // Verify updates
    console.log('🔍 Verification:\n');
    const verify = await client.query(`
      SELECT id, title, status, current_phase, progress,
             (metadata->>'child_progress')::int as child_progress
      FROM strategic_directives_v2
      WHERE id IN ('SD-GENESIS-RESEARCH-001', 'SD-GENESIS-COMPLETE-001')
      ORDER BY id;
    `);

    verify.rows.forEach(row => {
      console.log(`   ${row.id}:`);
      console.log(`     Title: ${row.title}`);
      console.log(`     Status: ${row.status}`);
      console.log(`     Phase: ${row.current_phase}`);
      console.log(`     Progress: ${row.progress}%`);
      if (row.child_progress != null) {
        console.log(`     Child Progress: ${row.child_progress}%`);
      }
      console.log('');
    });

  } finally {
    await client.end();
  }
})();
