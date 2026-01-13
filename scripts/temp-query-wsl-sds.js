import { createDatabaseClient } from './lib/supabase-connection.js';

(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    // Search for WSL/Windows migration related SDs
    const result = await client.query(`
      SELECT
        id,
        title,
        description,
        acceptance_criteria,
        status,
        priority,
        current_phase,
        completion_date,
        created_at,
        updated_at,
        notes,
        parent_sd_id,
        related_sd_ids,
        scope
      FROM strategic_directives_v2
      WHERE
        (LOWER(title) LIKE '%wsl%'
         OR LOWER(title) LIKE '%windows%'
         OR LOWER(title) LIKE '%migration%'
         OR LOWER(title) LIKE '%copy%'
         OR LOWER(description) LIKE '%wsl%'
         OR LOWER(description) LIKE '%windows%'
         OR LOWER(description) LIKE '%migration%')
        AND status IN ('completed', 'archived')
      ORDER BY
        COALESCE(completion_date, updated_at) DESC
      LIMIT 5
    `);

    console.log('=== Recently Completed WSL/Windows Migration SDs ===\n');

    if (result.rows.length === 0) {
      console.log('No completed SDs found with WSL/Windows/migration keywords.');
    } else {
      result.rows.forEach((sd, index) => {
        console.log(`\n[${index + 1}] SD: ${sd.id}`);
        console.log(`Title: ${sd.title}`);
        console.log(`Status: ${sd.status}`);
        console.log(`Priority: ${sd.priority || 'N/A'}`);
        console.log(`Current Phase: ${sd.current_phase || 'N/A'}`);
        console.log(`Completion Date: ${sd.completion_date || 'N/A'}`);
        console.log(`Created: ${sd.created_at}`);
        console.log(`Updated: ${sd.updated_at}`);
        console.log(`\nDescription:`);
        console.log(sd.description || 'N/A');
        console.log(`\nScope:`);
        console.log(sd.scope || 'N/A');
        console.log(`\nAcceptance Criteria:`);
        console.log(sd.acceptance_criteria || 'N/A');
        console.log(`\nNotes:`);
        console.log(sd.notes || 'N/A');
        console.log(`\nParent SD: ${sd.parent_sd_id || 'None'}`);
        console.log(`Related SDs: ${sd.related_sd_ids ? JSON.stringify(sd.related_sd_ids) : 'None'}`);
        console.log('\n' + '='.repeat(80));
      });
    }

  } catch (error) {
    console.error('Error querying database:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
