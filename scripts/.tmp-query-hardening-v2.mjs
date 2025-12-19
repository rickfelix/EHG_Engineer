import { createDatabaseClient } from './lib/supabase-connection.js';

const client = await createDatabaseClient('engineer', { verify: false });

console.log('=== COMPREHENSIVE SD-HARDENING-V2 STATUS ===\n');

const sds = await client.query(`
  SELECT
    id,
    title,
    description,
    status,
    current_phase,
    progress_percentage,
    parent_sd_id,
    is_working_on,
    success_criteria,
    dependencies,
    created_at,
    updated_at
  FROM strategic_directives_v2
  WHERE id LIKE 'SD-HARDENING-V2%'
  ORDER BY
    CASE
      WHEN parent_sd_id IS NULL THEN 0
      ELSE 1
    END,
    id
`);

sds.rows.forEach(sd => {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`[${sd.id}] ${sd.title}`);
  console.log(`${'='.repeat(80)}`);
  console.log(`Status: ${sd.status} | Phase: ${sd.current_phase} | Progress: ${sd.progress_percentage}%`);
  console.log(`Parent: ${sd.parent_sd_id || 'EPIC (root)'}`);
  console.log(`Working On: ${sd.is_working_on}`);
  console.log(`Updated: ${sd.updated_at}`);

  console.log(`\nDescription:`);
  console.log(sd.description || 'N/A');

  if (sd.success_criteria && sd.success_criteria.length > 0) {
    console.log(`\nSuccess Criteria (${sd.success_criteria.length}):`);
    sd.success_criteria.forEach((c, i) => {
      console.log(`  ${i + 1}. ${typeof c === 'string' ? c : JSON.stringify(c)}`);
    });
  }

  if (sd.dependencies && sd.dependencies.length > 0) {
    console.log(`\nDependencies (${sd.dependencies.length}):`);
    sd.dependencies.forEach((d, i) => {
      console.log(`  ${i + 1}. ${typeof d === 'string' ? d : JSON.stringify(d)}`);
    });
  }
});

await client.end();
